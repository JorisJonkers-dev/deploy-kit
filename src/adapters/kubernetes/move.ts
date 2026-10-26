// A Move as the cluster runs it (spec/v1/55-delivery.md#moves): the Instances
// a Process renders while one is open, its step Jobs, and the move identity
// that runs them. Every value is read off the Process's layer-2 element.
import type {
  ResolvedApplicationDocument,
  ResolvedProcess,
} from "../../model/resolved-deployment.ts";
import { tagOf } from "../../model/revision.ts";
import { vaultNameOf } from "../../model/runtime-profiles.ts";
import { STABLE_NAMESPACE } from "../../model/stable-address.ts";
import type { RenderedObject } from "../../objects/deliverable.ts";
import type {
  Job,
  Labels,
  Role,
  RoleBinding,
  ServiceAccount,
} from "../../objects/kubernetes.ts";
import { CREATED_ONCE, labelsOf, podMetadataOf } from "../shared/labels.ts";

type Move = NonNullable<ResolvedProcess["move"]>;
type Method = NonNullable<Move["method"]>;

/** One Instance of a Process as the render writes it. */
export interface Instance {
  /** The Instance's name, which its workload and Service are named by. */
  readonly name: string;
  /** The Process as the Instance runs it: its claims and where it lands. */
  readonly process: ResolvedProcess;
  /** A source a Move is carrying data out of: created once, never rewritten. */
  readonly frozen: boolean;
}

const CLUSTER_DOMAIN = "svc.cluster.local";

/**
 * The name of a claim of an Instance other than the one named as its Process:
 * the claim's with the Instance's suffix, so the two Instances of one Move
 * never share a volume.
 */
const claimOf = (claim: string, instance: string, process: string): string =>
  `${claim}-${instance.slice(process.length + 1)}`;

/**
 * The Process holding the claims of the Instance named `instance`, in its
 * volumes and in the sidecars that mount them: its own,
 * for the Instance named as the Process.
 */
function claimed(process: ResolvedProcess, instance: string): ResolvedProcess {
  if (instance === process.name) return process;
  return {
    ...process,
    ...(process.volumes === undefined
      ? {}
      : {
          volumes: process.volumes.map((volume) => ({
            ...volume,
            claim: claimOf(volume.claim, instance, process.name),
            ...(volume.backup === undefined
              ? {}
              : {
                  backup: {
                    ...volume.backup,
                    claim: claimOf(volume.backup.claim, instance, process.name),
                  },
                }),
          })),
        }),
    ...(process.sidecars === undefined
      ? {}
      : {
          sidecars: process.sidecars.map((sidecar) =>
            sidecar.volumes === undefined
              ? sidecar
              : {
                  ...sidecar,
                  volumes: sidecar.volumes.map((volume) => ({
                    ...volume,
                    claim: claimOf(volume.claim, instance, process.name),
                  })),
                },
          ),
        }),
  };
}

/** The name the target of an open Move is rendered under. */
export const targetOf = (
  process: ResolvedProcess,
  move: Move,
  application: ResolvedApplicationDocument,
): string =>
  move.target.instance ?? `${process.name}-${tagOf(application.revision)}`;

/**
 * Every Instance a Process renders: the one that serves it, and while a Move
 * is open, its source beside its target. A source in another namespace is its
 * old Project's to render.
 */
export function instancesOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): Instance[] {
  const { move } = process;
  if (move === undefined) {
    const name = process.instance ?? process.name;
    return [{ name, process: claimed(process, name), frozen: false }];
  }
  const { source } = move;
  const target = targetOf(process, move, application);
  return [
    ...(source.namespace === application.namespace
      ? [
          {
            name: source.instance,
            process: claimed(
              {
                ...process,
                placement: { ...process.placement, boundTo: source.node },
              },
              source.instance,
            ),
            frozen: true,
          },
        ]
      : []),
    {
      name: target,
      // The target has a volume of its own, bound to no node yet.
      process: claimed(
        { ...process, placement: { eligibleNodes: move.target.nodes } },
        target,
      ),
      frozen: false,
    },
  ];
}

/** The label that tells one Instance of a Process from another. */
const NAME_LABEL = "app.kubernetes.io/name";

/**
 * An object rendered for a Process, relabelled for one of its Instances: its
 * name label names the Instance, which tells the Instances apart, while the
 * instance label still names the Process, which every policy selects.
 */
export function relabelled<T>(object: T, instance: string): T {
  if (Array.isArray(object))
    return object.map((item: unknown) => relabelled(item, instance)) as T;
  // No rendered object holds a null, so an object here is a map or a list.
  // Stryker disable next-line ConditionalExpression
  if (object === null || typeof object !== "object") return object;
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [
      key,
      key === NAME_LABEL ? instance : relabelled(value, instance),
    ]),
  ) as T;
}

/** An Instance's own object: relabelled for it, and named by it. */
export function asInstance<T extends { readonly metadata: object }>(
  object: T,
  instance: string,
): T {
  const relabel = relabelled(object, instance);
  return { ...relabel, metadata: { ...relabel.metadata, name: instance } };
}

/** What tells one Instance's pods from another's: its name, and its Process. */
export const instanceSelectorOf = (
  instance: Instance,
  process: string,
): Labels => ({
  [NAME_LABEL]: instance.name,
  "app.kubernetes.io/instance": process,
});

/** The Service name an Instance answers at, as a host. */
const hostOf = (instance: string, namespace: string): string =>
  `${instance}.${namespace}.${CLUSTER_DOMAIN}`;

/**
 * Each step a Job runs, with the step the method is handed: the last lag is a
 * second lag, run once the source accepts no write.
 */
const STEPS: readonly (readonly [string, string])[] = [
  ["start", "start"],
  ["sync", "sync"],
  ["lag", "lag"],
  ["fence", "fence"],
  ["final-lag", "lag"],
  ["flip", "flip"],
  ["unfence", "unfence"],
];

/** The labels of the move identity, which runs no Runtime Profile. */
const identityLabels = (move: Move, application: string): Labels =>
  labelsOf({ name: move.identity, runtime: "none" }, application);

/** One step of a Move, as the suspended Job the Release Gate starts. */
function stepOf(
  [step, handed]: readonly [string, string],
  process: ResolvedProcess,
  move: Move,
  method: Method,
  application: ResolvedApplicationDocument,
): Job {
  const labels = identityLabels(move, application.id);
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: `${move.identity}-${step}-${tagOf(application.revision)}`,
      namespace: application.namespace,
      labels,
      annotations: CREATED_ONCE,
    },
    spec: {
      suspend: true,
      backoffLimit: 0,
      template: {
        metadata: podMetadataOf(labels, [["move", method.imageVersion]]),
        spec: {
          serviceAccountName: move.identity,
          // The method logs in to the Secret Store, and the flip writes the
          // Stable Addresses, with the identity's own token.
          automountServiceAccountToken: true,
          restartPolicy: "Never",
          securityContext: {
            runAsNonRoot: true,
            runAsUser: method.uid,
            runAsGroup: method.gid,
            seccompProfile: { type: "RuntimeDefault" },
          },
          containers: [
            {
              name: "move",
              image: method.image,
              env: [
                { name: "MOVE_STEP", value: handed },
                {
                  name: "MOVE_SOURCE_HOST",
                  value: hostOf(move.source.instance, move.source.namespace),
                },
                {
                  name: "MOVE_TARGET_HOST",
                  value: hostOf(
                    targetOf(process, move, application),
                    move.target.namespace,
                  ),
                },
                { name: "MOVE_PORT", value: String(method.port) },
                { name: "MOVE_FLIPS", value: move.flips.join(",") },
                { name: "MOVE_FLIP_NAMESPACE", value: STABLE_NAMESPACE },
                // A method holds a credential, so its Application names a store.
                {
                  name: "VAULT_ADDR",
                  value: application.secretStore as string,
                },
                {
                  name: "VAULT_ROLE",
                  value: vaultNameOf(application.namespace, move.identity),
                },
                {
                  name: "VAULT_CREDENTIALS_PATH",
                  value: method.credential.path,
                },
              ],
              resources: {
                requests: { memory: move.bounds.memory, cpu: move.bounds.cpu },
                limits: { memory: move.bounds.memory },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ["ALL"] },
              },
            },
          ],
        },
      },
    },
  };
}

/**
 * The move identity and its one Kubernetes permission: to update the Stable
 * Addresses that name the source, in their own namespace, and no other.
 */
function identityOf(
  move: Move,
  application: ResolvedApplicationDocument,
): (ServiceAccount | Role | RoleBinding)[] {
  const labels = identityLabels(move, application.id);
  const account: ServiceAccount = {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name: move.identity, namespace: application.namespace, labels },
  };
  if (move.flips.length === 0) return [account];
  // Named for the identity and where it runs, as a cluster-wide name is: the
  // Stable Addresses' namespace holds every Project's.
  const name = vaultNameOf(application.namespace, move.identity);
  const metadata = { name, namespace: STABLE_NAMESPACE, labels };
  return [
    account,
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "Role",
      metadata,
      rules: [
        {
          apiGroups: [""],
          resources: ["services"],
          resourceNames: [...move.flips],
          verbs: ["get", "update", "patch"],
        },
      ],
    },
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "RoleBinding",
      metadata,
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "Role",
        name,
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: move.identity,
          namespace: application.namespace,
        },
      ],
    },
  ];
}

/**
 * What an open Move of a Process renders beside its Instances: the move
 * identity, and one Job per step, the reverse step only where the Move can be
 * rolled back. A Move with no method carries no data, and has no step a
 * method runs.
 */
export function moveOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): RenderedObject[] {
  const { move } = process;
  if (move?.method === undefined) return [];
  const method = move.method;
  const steps = [
    ...STEPS,
    ...(move.reversible ? [["reverse", "reverse"] as const] : []),
  ];
  return [
    ...identityOf(move, application),
    ...steps.map((step) => stepOf(step, process, move, method, application)),
  ];
}
