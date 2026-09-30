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
import type { Deliverable } from "../../objects/deliverable.ts";
import type {
  Container,
  Deployment,
  Kustomization,
  Probe,
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
  if (
    process.lifecycle !== "application" ||
    process.switchover !== "blue-green"
  )
    throw new Error(
      `${process.name}: a ${process.lifecycle} Process that switches ${process.switchover ?? "nothing"} is not rendered yet`,
    );
  if (process.writablePaths !== undefined)
    throw new Error(`${process.name}: a writable path is not rendered yet`);
  if (process.surfaces === undefined)
    throw new Error(
      `${process.name}: a blue-green Process that serves no surface is not rendered yet`,
    );
}

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
    // A rendered Process serves a surface: it stopped above otherwise.
    ports: (process.surfaces as NonNullable<ResolvedProcess["surfaces"]>).map(
      ({ name, port }) => ({ name, containerPort: port }),
    ),
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
      // replica count, and a new version starts beside the old one.
      strategy: {
        type: "RollingUpdate",
        rollingUpdate: { maxSurge: 1, maxUnavailable: 0 },
      },
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
            seccompProfile: { type: "RuntimeDefault" },
          },
          containers: [containerOf(process)],
        },
      },
    },
  };
}

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
      return [
        {
          path: `${directory}/workload.yaml`,
          adapter: ADAPTER,
          objects: application.processes.map((process) =>
            deploymentOf(process, application),
          ),
        },
        {
          path: `${directory}/serviceaccount.yaml`,
          adapter: ADAPTER,
          objects: application.processes.map((process) =>
            serviceAccountOf(process, application),
          ),
        },
        {
          path: `${directory}/canary.yaml`,
          adapter: ADAPTER,
          objects: application.processes.map((process) =>
            canaryOf(process, application),
          ),
        },
      ];
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
