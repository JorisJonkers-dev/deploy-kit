// The `kubernetes` adapter (spec/v1/30-deliverables.md#adapters): per project
// its Namespace, per Process its controller and ServiceAccount, the Canary of
// each blue-green Process (#flagger-ready-objects), and the kustomize
// Kustomization of every directory the render writes. It spells what layer 2
// decided and decides nothing: every value below is read off the projection.
import type { ResolvedProject } from "../../model/resolution.ts";
import type {
  ResolvedApplicationDocument,
  ResolvedProbe,
  ResolvedProcess,
  StartupProbe,
} from "../../model/resolved-deployment.ts";
import type { Canary, Webhook } from "../../objects/custom.ts";
import type { Deliverable, RenderedObject } from "../../objects/deliverable.ts";
import type {
  Container,
  Deployment,
  Kustomization,
  PersistentVolumeClaim,
  Probe,
  Service,
  ServiceAccount,
} from "../../objects/kubernetes.ts";
import { wholeSeconds } from "../shared/durations.ts";
import { instanceOf, labelsOf, managedOnly } from "../shared/labels.ts";
import { applicationDirectory, projectDirectory } from "../shared/paths.ts";

export const ADAPTER = "kubernetes";

/** The three questions a Canary asks the Release Gate (spec/v1/55-delivery.md#the-release-gate). */
const WEBHOOKS = [
  ["may-start", "confirm-rollout"],
  ["checks", "rollout"],
  ["may-promote", "confirm-promotion"],
] as const;

/** A family this adapter does not spell yet stops the render rather than leaving it out. */
function notYet(process: ResolvedProcess): void {
  const switched =
    process.switchover === "blue-green" || process.switchover === "stop-start";
  if (process.lifecycle !== "application" || !switched)
    throw new Error(
      `${process.name}: a ${process.lifecycle} Process that switches ${process.switchover ?? "nothing"} is not rendered yet`,
    );
  if (process.writablePaths !== undefined)
    throw new Error(`${process.name}: a writable path is not rendered yet`);
  if (process.switchover === "blue-green" && process.surfaces === undefined)
    throw new Error(
      `${process.name}: a blue-green Process that serves no surface is not rendered yet`,
    );
  // A missing list and an empty one hold no backup alike.
  // Stryker disable next-line ArrayDeclaration
  if ((process.volumes ?? []).some(({ backup }) => backup !== undefined))
    throw new Error(`${process.name}: a backup is not rendered yet`);
}

/** Flagger switches a blue-green Process; a stop-start one is replaced in place. */
const blueGreen = (process: ResolvedProcess): boolean =>
  process.switchover === "blue-green";

const probeOf = (
  probe: ResolvedProbe | StartupProbe,
  delay: boolean,
): Probe => ({
  ...("tcp" in probe
    ? { tcpSocket: { port: probe.tcp } }
    : { httpGet: { path: probe.path, port: probe.port } }),
  periodSeconds: wholeSeconds(probe.period),
  timeoutSeconds: wholeSeconds(probe.timeout),
  failureThreshold: probe.failures,
  // The startup probe already gates readiness and liveness, so neither waits.
  ...(delay ? { initialDelaySeconds: 0 } : {}),
});

function containerOf(process: ResolvedProcess): Container {
  return {
    name: process.name,
    image: process.image,
    ...(process.surfaces === undefined
      ? {}
      : {
          ports: process.surfaces.map(({ name, port }) => ({
            name,
            containerPort: port,
          })),
        }),
    ...(process.environment === undefined
      ? {}
      : {
          env: process.environment.map(({ name, value }) => ({ name, value })),
        }),
    // Memory request equals its limit; cpu is a request with no limit.
    resources: {
      requests: { memory: process.memory, cpu: process.cpu },
      limits: { memory: process.memory },
    },
    securityContext: {
      readOnlyRootFilesystem: true,
      capabilities: { drop: ["ALL"] },
    },
    ...(process.volumes === undefined
      ? {}
      : {
          volumeMounts: process.volumes.map(({ claim, mountAt }) => ({
            name: claim,
            mountPath: mountAt,
          })),
        }),
    ...(process.readiness === undefined
      ? {}
      : { readinessProbe: probeOf(process.readiness, true) }),
    ...(process.liveness === undefined
      ? {}
      : { livenessProbe: probeOf(process.liveness, true) }),
    ...(process.startup === undefined
      ? {}
      : { startupProbe: probeOf(process.startup, false) }),
  };
}

function deploymentOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): Deployment {
  const labels = labelsOf(process, application.id);
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: process.name, namespace: application.namespace, labels },
    spec: {
      // Flagger scales and promotes a blue-green Deployment, so it carries no
      // replica count and its new version starts beside the old one; a
      // stop-start one keeps its count and stops before it starts again.
      ...(blueGreen(process)
        ? {
            strategy: {
              type: "RollingUpdate" as const,
              rollingUpdate: { maxSurge: 1, maxUnavailable: 0 },
            },
          }
        : {
            replicas: process.replicas,
            strategy: { type: "Recreate" as const },
          }),
      progressDeadlineSeconds: wholeSeconds(process.deadline),
      selector: {
        matchLabels: {
          "app.kubernetes.io/name": process.name,
          ...instanceOf(process.name),
        },
      },
      template: {
        metadata: { labels },
        spec: {
          serviceAccountName: process.identity,
          automountServiceAccountToken: process.identityToken,
          securityContext: {
            runAsNonRoot: true,
            runAsUser: process.uid,
            runAsGroup: process.gid,
            // A volume is written as the image's group, and only a volume is.
            ...(process.volumes === undefined ? {} : { fsGroup: process.gid }),
            seccompProfile: { type: "RuntimeDefault" },
          },
          containers: [containerOf(process)],
          ...(process.volumes === undefined
            ? {}
            : {
                volumes: process.volumes.map(({ claim }) => ({
                  name: claim,
                  persistentVolumeClaim: { claimName: claim },
                })),
              }),
        },
      },
    },
  };
}

/** The Service a stop-start Process is reached by; Flagger generates a blue-green one's. */
const serviceOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): Service => ({
  apiVersion: "v1",
  kind: "Service",
  metadata: {
    name: process.name,
    namespace: application.namespace,
    labels: labelsOf(process, application.id),
  },
  spec: {
    selector: instanceOf(process.name),
    ports: (process.surfaces as NonNullable<ResolvedProcess["surfaces"]>).map(
      ({ name, port }) => ({ name, port, targetPort: name }),
    ),
  },
});

/**
 * A claim for each volume, `ReadWriteOnce` as `local-path` provides. A claim
 * whose class derives a backup is never pruned, which lands with the backup it
 * guards: until then a backed-up volume stops the render above.
 */
const claimsOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): PersistentVolumeClaim[] =>
  (process.volumes ?? []).map((volume) => ({
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name: volume.claim,
      namespace: application.namespace,
      labels: labelsOf(process, application.id),
    },
    spec: {
      accessModes: ["ReadWriteOnce"],
      resources: { requests: { storage: volume.size } },
    },
  }));

const serviceAccountOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): ServiceAccount => ({
  apiVersion: "v1",
  kind: "ServiceAccount",
  metadata: {
    name: process.identity,
    namespace: application.namespace,
    labels: labelsOf(process, application.id),
  },
});

function canaryOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): Canary {
  // A blue-green Process is a gate member, and serves on its first surface.
  const gate = application.releaseGate as NonNullable<
    ResolvedApplicationDocument["releaseGate"]
  >;
  const [served] = process.surfaces as NonNullable<ResolvedProcess["surfaces"]>;
  const webhooks: Webhook[] = WEBHOOKS.map(([name, type]) => ({
    name,
    type,
    url: `${gate.endpoint}/${name}`,
    metadata: {
      application: application.id,
      process: process.name,
      revision: application.revision,
    },
  }));
  return {
    apiVersion: "flagger.app/v1beta1",
    kind: "Canary",
    metadata: {
      name: process.name,
      namespace: application.namespace,
      labels: labelsOf(process, application.id),
    },
    spec: {
      provider: "kubernetes",
      targetRef: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        name: process.name,
      },
      progressDeadlineSeconds: wholeSeconds(process.deadline),
      service: {
        port: (served as { port: number }).port,
        targetPort: (served as { name: string }).name,
        portName: (served as { name: string }).name,
      },
      analysis: { ...gate.analysis, webhooks },
    },
  };
}

/** Every Deliverable of one project this adapter owns, kustomizations aside. */
export function renderKubernetes(project: ResolvedProject): Deliverable[] {
  const [first] = project.applications;
  const namespace = (first as ResolvedApplicationDocument).namespace;
  return [
    {
      path: `${projectDirectory(project.project)}/namespace.yaml`,
      adapter: ADAPTER,
      objects: [
        {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: { name: namespace, labels: managedOnly() },
        },
      ],
    },
    ...project.applications.flatMap((application) => {
      const directory = applicationDirectory(project.project, application.id);
      application.processes.forEach(notYet);
      const { processes } = application;
      const files: [string, RenderedObject[]][] = [
        ["workload.yaml", processes.map((p) => deploymentOf(p, application))],
        [
          "serviceaccount.yaml",
          processes.map((p) => serviceAccountOf(p, application)),
        ],
        [
          "canary.yaml",
          processes.filter(blueGreen).map((p) => canaryOf(p, application)),
        ],
        [
          "service.yaml",
          processes
            .filter((p) => !blueGreen(p) && p.surfaces !== undefined)
            .map((p) => serviceOf(p, application)),
        ],
        ["pvc.yaml", processes.flatMap((p) => claimsOf(p, application))],
      ];
      // A file holds at least one object, or it is not written.
      return files
        .filter(([, objects]) => objects.length > 0)
        .map(([file, objects]) => ({
          path: `${directory}/${file}`,
          adapter: ADAPTER,
          objects,
        }));
    }),
  ];
}

/** The network policy set is rendered and applied by nothing (spec/v1/16-dependencies.md#audit-before-enforce). */
const unapplied = (file: string): boolean => file === "networkpolicy.yaml";

/**
 * One Kustomization per directory the render writes, listing what that
 * directory applies: its files, and the directories below it, sorted. A
 * policy file is listed nowhere while the policy stage is render-only.
 */
export function kustomizationsFor(paths: readonly string[]): Deliverable[] {
  const listed = new Map<string, Set<string>>();
  const list = (directory: string, entry: string): void => {
    const entries = listed.get(directory) ?? new Set<string>();
    entries.add(entry);
    listed.set(directory, entries);
  };
  for (const path of paths) {
    const cut = path.lastIndexOf("/");
    const directory = path.slice(0, cut);
    const file = path.slice(cut + 1);
    if (!unapplied(file)) list(directory, file);
  }
  // An Application's directory is applied by its project's.
  for (const directory of [...listed.keys()]) {
    const parent = directory.slice(0, directory.lastIndexOf("/"));
    if (/^apps\/[^/]+$/.test(parent) && parent !== "apps/edge")
      list(parent, directory.slice(parent.length + 1));
  }
  // The render sorts every artifact's files, so the order here decides nothing.
  return [...listed.entries()].map(([directory, entries]): Deliverable => {
    const kustomization: Kustomization = {
      apiVersion: "kustomize.config.k8s.io/v1beta1",
      kind: "Kustomization",
      resources: [...entries].sort(),
    };
    return {
      path: `${directory}/kustomization.yaml`,
      adapter: ADAPTER,
      objects: [kustomization],
    };
  });
}
