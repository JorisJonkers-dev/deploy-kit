// The `kubernetes` adapter (spec/v1/30-deliverables.md#adapters): per project
// its Namespace, per Process its controller, ServiceAccount, claims and Asset
// ConfigMaps, the backup each backed-up volume derives, the Canary of each
// blue-green Process (#flagger-ready-objects), and the kustomize Kustomization
// of every directory the render writes. It spells what layer 2
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
  ConfigMap,
  Container,
  CronJob,
  Deployment,
  EnvVar,
  Kustomization,
  PersistentVolumeClaim,
  PodSpec,
  Probe,
  Service,
  ServiceAccount,
  Volume,
  VolumeMount,
} from "../../objects/kubernetes.ts";
import { wholeSeconds } from "../shared/durations.ts";
import { isSynced, type KvGrant } from "../shared/holders.ts";
import { instanceOf, labelsOf, managedOnly } from "../shared/labels.ts";
import { applicationDirectory, projectDirectory } from "../shared/paths.ts";
import { notSupported } from "../../model/internal-failure.ts";

export const ADAPTER = "kubernetes";

/** The three questions a Canary asks the Release Gate (spec/v1/55-delivery.md#the-release-gate). */
const WEBHOOKS = [
  ["may-start", "confirm-rollout"],
  ["checks", "rollout"],
  ["may-promote", "confirm-promotion"],
] as const;

/** The mark that keeps the applier from ever deleting a claim (spec/v1/30-deliverables.md#flagger-ready-objects). */
const NEVER_PRUNED = { "kustomize.toolkit.fluxcd.io/prune": "disabled" };

/** Where a backup's method reads the volume, and where it writes its copies. */
const BACKUP_SOURCE = "/data";
const BACKUP_TARGET = "/backup";

/** A family this adapter does not spell yet stops the render rather than leaving it out. */
function notYet(process: ResolvedProcess): void {
  const switched =
    process.switchover === "blue-green" || process.switchover === "stop-start";
  if (process.lifecycle !== "application" || !switched)
    throw notSupported(
      `${process.name}: a ${process.lifecycle} Process that switches ${process.switchover ?? "nothing"} is not rendered yet`,
    );
  if (process.switchover === "blue-green" && process.surfaces === undefined)
    throw notSupported(
      `${process.name}: a blue-green Process that serves no surface is not rendered yet`,
    );
  if (process.secrets?.some(({ delivery }) => delivery === "file") === true)
    throw notSupported(`${process.name}: a file grant is not rendered yet`);
}

type Backed = NonNullable<ResolvedProcess["volumes"]>[number] & {
  readonly backup: NonNullable<
    NonNullable<ResolvedProcess["volumes"]>[number]["backup"]
  >;
};

/** The volumes whose class derives a backup. */
const backedUp = (process: ResolvedProcess): Backed[] =>
  // A missing list and an empty one hold no backup alike.
  // Stryker disable next-line ArrayDeclaration
  (process.volumes ?? []).filter(
    (volume): volume is Backed => volume.backup !== undefined,
  );

/** The file an Asset arrives as: the last segment of the path it is read from. */
const fileOf = (from: string): string => from.split("/").pop() as string;

/** A writable path's volume, named for the path. */
const writableOf = (path: string): string =>
  `writable${path.replaceAll(/[^a-z0-9]+/g, "-")}`;

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

/**
 * The Process's variables, every container of its pod alike: a value as
 * written, a secret reference as one key of the Secret its grant syncs to.
 */
function envOf(process: ResolvedProcess): EnvVar[] {
  // A missing list and an empty one hold no variable alike.
  // Stryker disable next-line ArrayDeclaration
  return (process.environment ?? []).map((entry) => {
    if ("value" in entry) return { name: entry.name, value: entry.value };
    // A reference names an env grant the Process holds, or resolution stopped.
    const grant = process.secrets?.find(
      (held) => isSynced(held) && held.path === entry.secret.path,
    ) as KvGrant;
    return {
      name: entry.name,
      valueFrom: {
        secretKeyRef: {
          name: grant.destination as string,
          key: entry.secret.key,
        },
      },
    };
  });
}

/** Memory request equals its limit; cpu is a request with no limit. */
const resourcesOf = (
  memory: string,
  cpu: string,
): NonNullable<Container["resources"]> => ({
  requests: { memory, cpu },
  limits: { memory },
});

const RESTRICTED: Container["securityContext"] = {
  readOnlyRootFilesystem: true,
  capabilities: { drop: ["ALL"] },
};

/** Where the Process's claims, Assets and writable paths arrive in its container. */
function mountsOf(process: ResolvedProcess): VolumeMount[] {
  return [
    // A missing list and an empty one mount nothing alike.
    // Stryker disable next-line ArrayDeclaration
    ...(process.volumes ?? []).map(({ claim, mountAt }) => ({
      name: claim,
      mountPath: mountAt,
    })),
    // Stryker disable next-line ArrayDeclaration
    ...(process.assets ?? []).map(({ name, from, mountAt }) => ({
      name,
      mountPath: mountAt,
      subPath: fileOf(from),
      readOnly: true as const,
    })),
    // Stryker disable next-line ArrayDeclaration
    ...(process.writablePaths ?? []).map(({ path }) => ({
      name: writableOf(path),
      mountPath: path,
    })),
  ];
}

/** The pod's volumes: each claim, each Asset's ConfigMap, each writable path. */
function volumesOf(process: ResolvedProcess): Volume[] {
  return [
    // Stryker disable next-line ArrayDeclaration
    ...(process.volumes ?? []).map(({ claim }) => ({
      name: claim,
      persistentVolumeClaim: { claimName: claim },
    })),
    // Stryker disable next-line ArrayDeclaration
    ...(process.assets ?? []).map(({ name, from }) => ({
      name,
      configMap: { name, items: [{ key: fileOf(from), path: fileOf(from) }] },
    })),
    // Stryker disable next-line ArrayDeclaration
    ...(process.writablePaths ?? []).map(({ path, size }) => ({
      name: writableOf(path),
      emptyDir: { sizeLimit: size },
    })),
  ];
}

/** A container beside the Process, under the same posture and the same variables. */
function sidecarOf(
  sidecar: NonNullable<ResolvedProcess["sidecars"]>[number],
  env: readonly EnvVar[],
): Container {
  return {
    name: sidecar.name,
    image: sidecar.image,
    ...(env.length === 0 ? {} : { env }),
    resources: resourcesOf(sidecar.memory, sidecar.cpu),
    securityContext: RESTRICTED,
  };
}

function containerOf(process: ResolvedProcess): Container {
  const env = envOf(process);
  const mounts = mountsOf(process);
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
    ...(env.length === 0 ? {} : { env }),
    resources: resourcesOf(process.memory, process.cpu),
    securityContext: RESTRICTED,
    ...(mounts.length === 0 ? {} : { volumeMounts: mounts }),
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
  const volumes = volumesOf(process);
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
          containers: [
            containerOf(process),
            // Stryker disable next-line ArrayDeclaration
            ...(process.sidecars ?? []).map((sidecar) =>
              sidecarOf(sidecar, envOf(process)),
            ),
          ],
          ...(volumes.length === 0 ? {} : { volumes }),
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
 * A claim for each volume, `ReadWriteOnce` as `local-path` provides, and for
 * each backed-up one the claim its copies land on, at the same size. A claim
 * whose class derives a backup is never pruned, and neither is its copies'.
 */
function claimsOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): PersistentVolumeClaim[] {
  const claim = (
    name: string,
    size: string,
    kept: boolean,
  ): PersistentVolumeClaim => ({
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name,
      namespace: application.namespace,
      labels: labelsOf(process, application.id),
      ...(kept ? { annotations: NEVER_PRUNED } : {}),
    },
    spec: {
      accessModes: ["ReadWriteOnce"],
      resources: { requests: { storage: size } },
    },
  });
  // A missing list and an empty one hold no claim alike.
  // Stryker disable next-line ArrayDeclaration
  return (process.volumes ?? []).flatMap(({ claim: name, size, backup }) =>
    backup === undefined
      ? [claim(name, size, false)]
      : [claim(name, size, true), claim(backup.claim, size, true)],
  );
}

/** An immutable ConfigMap per Asset, under the content-hashed name an edit changes. */
const configMapsOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): ConfigMap[] =>
  // A missing list and an empty one hold no Asset alike.
  // Stryker disable next-line ArrayDeclaration
  (process.assets ?? []).map(({ name, from, content }) => ({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name,
      namespace: application.namespace,
      labels: labelsOf(process, application.id),
    },
    immutable: true,
    data: { [fileOf(from)]: content },
  }));

/** The labels of a backup's own identity: never the Process's, which a Service selects. */
const backupLabels = (
  backup: Backed["backup"],
  application: ResolvedApplicationDocument,
) => labelsOf({ name: backup.identity, runtime: "none" }, application.id);

/**
 * A backup CronJob per backed-up volume, at its class's schedule: the engine's
 * method image, run as the backup identity, reading the volume at `/data` and
 * writing its copies to the backup claim at `/backup`, pruned to `retain`.
 */
function backupsOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): CronJob[] {
  return backedUp(process).map(({ claim, backup }) => {
    const labels = backupLabels(backup, application);
    const env: EnvVar[] = [
      { name: "BACKUP_RETAIN", value: String(backup.retain) },
      ...(backup.offCluster === undefined
        ? []
        : [{ name: "BACKUP_OFF_CLUSTER", value: backup.offCluster }]),
    ];
    const pod: PodSpec = {
      serviceAccountName: backup.identity,
      automountServiceAccountToken: false,
      restartPolicy: "OnFailure",
      securityContext: {
        runAsNonRoot: true,
        runAsUser: backup.uid,
        runAsGroup: backup.gid,
        fsGroup: backup.gid,
        seccompProfile: { type: "RuntimeDefault" },
      },
      containers: [
        {
          name: "backup",
          image: backup.method,
          env,
          ...(backup.credential === undefined
            ? {}
            : {
                envFrom: [
                  {
                    secretRef: {
                      name: backup.credential.destination as string,
                    },
                  },
                ],
              }),
          securityContext: RESTRICTED,
          volumeMounts: [
            { name: "data", mountPath: BACKUP_SOURCE, readOnly: true },
            { name: "backup", mountPath: BACKUP_TARGET },
          ],
        },
      ],
      volumes: [
        {
          name: "data",
          persistentVolumeClaim: { claimName: claim, readOnly: true },
        },
        { name: "backup", persistentVolumeClaim: { claimName: backup.claim } },
      ],
    };
    return {
      apiVersion: "batch/v1",
      kind: "CronJob",
      metadata: {
        name: backup.claim,
        namespace: application.namespace,
        labels,
      },
      spec: {
        schedule: backup.schedule,
        concurrencyPolicy: "Forbid",
        jobTemplate: {
          spec: { template: { metadata: { labels }, spec: pod } },
        },
      },
    };
  });
}

/** The Process's own ServiceAccount, and one per backup identity it derives. */
const serviceAccountsOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): ServiceAccount[] => [
  {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: {
      name: process.identity,
      namespace: application.namespace,
      labels: labelsOf(process, application.id),
    },
  },
  // Every backup of one Process runs as its one backup identity.
  ...backedUp(process)
    .slice(0, 1)
    .map(({ backup }): ServiceAccount => ({
      apiVersion: "v1",
      kind: "ServiceAccount",
      metadata: {
        name: backup.identity,
        namespace: application.namespace,
        labels: backupLabels(backup, application),
      },
    })),
];

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
          processes.flatMap((p) => serviceAccountsOf(p, application)),
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
        [
          "configmap.yaml",
          processes.flatMap((p) => configMapsOf(p, application)),
        ],
        ["backup.yaml", processes.flatMap((p) => backupsOf(p, application))],
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

/**
 * What no kustomization applies: the network policy set, rendered and applied
 * by nothing (spec/v1/16-dependencies.md#audit-before-enforce), and a Vault
 * document, which is no Kubernetes object
 * (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied).
 */
const unapplied = (file: string): boolean =>
  file === "networkpolicy.yaml" || file.endsWith(".json");

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
