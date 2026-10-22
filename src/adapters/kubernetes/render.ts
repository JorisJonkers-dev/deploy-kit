// The `kubernetes` adapter (spec/v1/30-deliverables.md#adapters): per project
// its Namespace and the volume and claim of each library it mounts, per Process
// its controller, ServiceAccount, claims and Asset ConfigMaps, the backup each backed-up volume derives, the Canary of each
// blue-green Process (#flagger-ready-objects), the ClusterRole and binding of
// each Process that holds Kubernetes API access, and the kustomize
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
  AliasService,
  ClusterRole,
  ClusterRoleBinding,
  ConfigMap,
  Container,
  CronJob,
  Deployment,
  EnvVar,
  Kustomization,
  Labels,
  NodeAffinity,
  PersistentVolumeClaim,
  PodSpec,
  Probe,
  Service,
  ServiceAccount,
  Volume,
  VolumeMount,
  VpnContainer,
} from "../../objects/kubernetes.ts";
import {
  autoscaled,
  autoscalerOf,
  blueGreen,
  budgetOf,
  scaled,
} from "./capacity.ts";
import { migrationOf } from "./migration.ts";
import { wholeSeconds } from "../shared/durations.ts";
import { isSynced, type Grant, type KvGrant } from "../shared/holders.ts";
import {
  applicationLabels,
  consumerLabelsOf,
  instanceOf,
  labelsOf,
  managedOnly,
  podMetadataOf,
} from "../shared/labels.ts";
import { applicationDirectory, projectDirectory } from "../shared/paths.ts";
import { nodeAffinityOf } from "../shared/placement.ts";
import { notSupported } from "../../model/internal-failure.ts";
import { clusterNameOf } from "../../model/runtime-profiles.ts";
import { VPN_DIRECTORY } from "../../model/vpn.ts";

export const ADAPTER = "kubernetes";

/** The three questions a Canary asks the Release Gate (spec/v1/55-delivery.md#the-release-gate). */
const WEBHOOKS = [
  ["may-start", "confirm-rollout"],
  ["checks", "rollout"],
  ["may-promote", "confirm-promotion"],
] as const;

/** The mark that keeps the applier from ever deleting a claim (spec/v1/30-deliverables.md#flagger-ready-objects). */
export const NEVER_PRUNED = { "kustomize.toolkit.fluxcd.io/prune": "disabled" };

/** Where a backup's method reads the volume, and where it writes its copies. */
const BACKUP_SOURCE = "/data";
export const BACKUP_TARGET = "/backup";

/** A family this adapter does not spell yet stops the render rather than leaving it out. */
function notYet(process: ResolvedProcess): void {
  if (process.lifecycle !== "application" || process.switchover === undefined)
    throw notSupported(
      `${process.name}: a ${process.lifecycle} Process that switches ${process.switchover ?? "nothing"} is not rendered yet`,
    );
  if (process.switchover === "blue-green" && process.surfaces === undefined)
    throw notSupported(
      `${process.name}: a blue-green Process that serves no surface is not rendered yet`,
    );
  // A file grant is one file: of several keys, which would land in it is not
  // decided, and neither is a file with no mode, or no absolute directory to
  // mount: `/` itself would be covered entirely.
  if (
    filesOf(process)
      .filter(isKv)
      .some(
        ({ keys, fileMode, mountAt }) =>
          keys?.length !== 1 ||
          fileMode === undefined ||
          mountAt === undefined ||
          !directoryOf(mountAt).startsWith("/"),
      )
  )
    throw notSupported(
      `${process.name}: a file grant other than one key at a mode, below a directory, is not rendered yet`,
    );
}

type FileGrant = Grant & { readonly destination: string };

/** A kv grant's file is one key; a credential's files are its username and password. */
const isKv = (grant: FileGrant): grant is KvGrant & FileGrant =>
  "path" in grant;

/** The keys a credential an edge derives is issued with, each one file. */
const CREDENTIAL_FILES = ["username", "password"] as const;

/** The Process's grants delivered as files. */
const filesOf = (process: ResolvedProcess): FileGrant[] =>
  // A missing list and an empty one hold no grant alike.
  // Stryker disable next-line ArrayDeclaration
  (process.secrets ?? []).filter(
    (grant): grant is FileGrant => isSynced(grant) && grant.delivery === "file",
  );

/** Where a file grant's files land; notYet and ruleDiagnostics refused one without it. */
const placeOf = (grant: FileGrant): string => grant.mountAt as string;

/** The directory a file lands in, empty for a file directly in `/`. */
const directoryOf = (place: string): string =>
  place.slice(0, place.lastIndexOf("/"));

/** A file grant's volume, named for the Secret it projects. */
const secretVolumeOf = (grant: FileGrant): string =>
  `secret-${grant.destination}`;

/**
 * Where a file grant's file lands, and the volume that projects it there: the
 * directory of `mountAt`, so a rotated value reaches the file, which a mount of
 * the one file would never see again.
 */
function fileMountsOf(process: ResolvedProcess): VolumeMount[] {
  return filesOf(process).map((grant) => ({
    name: secretVolumeOf(grant),
    // A credential's directory is its own; a kv grant's file lands below its directory.
    mountPath: isKv(grant) ? directoryOf(placeOf(grant)) : placeOf(grant),
    readOnly: true as const,
  }));
}

type Library = NonNullable<ResolvedProcess["libraries"]>[number];

export type Backed = NonNullable<ResolvedProcess["volumes"]>[number] & {
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

/** The libraries a Process mounts. */
const librariesOf = (process: ResolvedProcess): Library[] =>
  // A missing list and an empty one mount no library alike.
  // Stryker disable next-line ArrayDeclaration
  process.libraries ?? [];

/** Every library's group, once each, in numeric order. */
const groupsOf = (process: ResolvedProcess): number[] =>
  [...new Set(librariesOf(process).map(({ gid }) => gid))].sort(
    (a, b) => a - b,
  );

/** The file an Asset arrives as: the last segment of the path it is read from. */
const fileOf = (from: string): string => from.split("/").pop() as string;

/** A writable path's volume, named for the path. */
const writableOf = (path: string): string =>
  `writable${path.replaceAll(/[^a-z0-9]+/g, "-")}`;

/** How many pods a RollingUpdate may add beyond the count, and how many it may take away. */
const rolling = (maxSurge: number, maxUnavailable: number) => ({
  type: "RollingUpdate" as const,
  rollingUpdate: { maxSurge, maxUnavailable },
});

/**
 * How the Deployment replaces its pods
 * (spec/v1/30-deliverables.md#flagger-ready-objects). Flagger scales and
 * promotes a blue-green one, so it carries no replica count and its new
 * version starts beside the old one. A rolling one is the delivery
 * machinery's: pod by pod under its own count and never a pod more, because a
 * proxy on a host port and a controller with no leader election cannot run
 * two copies. A stop-start one stops before it starts again.
 */
function strategyOf(
  process: ResolvedProcess,
): Pick<Deployment["spec"], "replicas" | "strategy"> {
  if (blueGreen(process)) return { strategy: rolling(1, 0) };
  return {
    replicas: process.replicas,
    strategy:
      process.switchover === "rolling"
        ? rolling(0, 1)
        : { type: "Recreate" as const },
  };
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
      (held) =>
        isSynced(held) &&
        ("path" in held
          ? held.path
          : held.paths.map(({ path }) => path).join()) === entry.secret.path,
    ) as Grant & { destination: string };
    return {
      name: entry.name,
      valueFrom: {
        secretKeyRef: {
          name: grant.destination,
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

/** A Process that requires a GPU asks for one share of its vendor's resource. */
const gpuShareOf = (
  process: ResolvedProcess,
  resources: NonNullable<Container["resources"]>,
): NonNullable<Container["resources"]> =>
  process.gpu === undefined
    ? resources
    : {
        ...resources,
        limits: { ...resources.limits, [process.gpu.resource]: "1" },
      };

export const RESTRICTED: Container["securityContext"] = {
  allowPrivilegeEscalation: false,
  readOnlyRootFilesystem: true,
  capabilities: { drop: ["ALL"] },
};

/** The volume the VPN writes the forwarded port to, and how much it may hold. */
const VPN_VOLUME = "vpn";
const VPN_VOLUME_SIZE = "1Mi";

/** How long the VPN may take to come up: the tunnel is up before the Process starts. */
const VPN_STARTUP = {
  periodSeconds: 5,
  timeoutSeconds: 5,
  failureThreshold: 60,
};

/**
 * The VPN beside an attached Process (spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection):
 * a native sidecar that runs before the Process and for as long as it does, as
 * root with the two network capabilities and nothing else added, reading its
 * credential from the Secret only it is given.
 */
const VPN_CONTAINER = "vpn";
export const BACKUP_CONTAINER = "backup";

const vpnContainerOf = (
  vpn: NonNullable<ResolvedProcess["vpn"]>,
): VpnContainer => ({
  name: VPN_CONTAINER,
  image: vpn.image,
  restartPolicy: "Always",
  env: vpn.environment,
  envFrom: [{ secretRef: { name: vpn.credential.destination as string } }],
  resources: resourcesOf(vpn.memory, vpn.cpu),
  securityContext: {
    runAsNonRoot: false,
    runAsUser: 0,
    runAsGroup: 0,
    capabilities: { add: ["NET_ADMIN", "NET_RAW"] },
  },
  startupProbe: {
    exec: { command: ["/gluetun-entrypoint", "healthcheck"] },
    ...VPN_STARTUP,
  },
  volumeMounts: [{ name: VPN_VOLUME, mountPath: VPN_DIRECTORY }],
});

/** The Process's writable paths, which every container of its pod mounts. */
const writableMountsOf = (process: ResolvedProcess): VolumeMount[] =>
  // A missing list and an empty one mount nothing alike.
  // Stryker disable next-line ArrayDeclaration
  (process.writablePaths ?? []).map(({ path }) => ({
    name: writableOf(path),
    mountPath: path,
  }));

/** Where the Process's claims, libraries, Assets and writable paths arrive in its container. */
function mountsOf(process: ResolvedProcess): VolumeMount[] {
  return [
    // A missing list and an empty one mount nothing alike.
    // Stryker disable next-line ArrayDeclaration
    ...(process.volumes ?? []).map(({ claim, mountAt }) => ({
      name: claim,
      mountPath: mountAt,
    })),
    // Stryker disable next-line ArrayDeclaration
    ...(process.libraries ?? []).map(({ claim, mountAt, subPath, access }) => ({
      name: claim,
      mountPath: mountAt,
      ...(subPath === undefined ? {} : { subPath }),
      ...(access === "read" ? { readOnly: true as const } : {}),
    })),
    // Stryker disable next-line ArrayDeclaration
    ...(process.assets ?? []).map(({ name, from, mountAt }) => ({
      name,
      mountPath: mountAt,
      subPath: fileOf(from),
      readOnly: true as const,
    })),
    ...writableMountsOf(process),
    ...fileMountsOf(process),
    // The forwarded port, for a Process that receives one, written by the VPN.
    ...(process.vpn?.forwardedPort === true
      ? [
          {
            name: VPN_VOLUME,
            mountPath: VPN_DIRECTORY,
            readOnly: true as const,
          },
        ]
      : []),
  ];
}

/** The pod's volumes: each claim, each library's, each Asset's ConfigMap, each writable path. */
function volumesOf(process: ResolvedProcess): Volume[] {
  return [
    // Stryker disable next-line ArrayDeclaration
    ...(process.volumes ?? []).map(({ claim }) => ({
      name: claim,
      persistentVolumeClaim: { claimName: claim },
    })),
    // Two mounts of one library below two directories share its one claim.
    ...[...new Set(librariesOf(process).map(({ claim }) => claim))].map(
      (claim) => ({ name: claim, persistentVolumeClaim: { claimName: claim } }),
    ),
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
    ...filesOf(process).map((grant) => ({
      name: secretVolumeOf(grant),
      secret: {
        secretName: grant.destination,
        items: isKv(grant)
          ? [
              {
                // notYet refused a file grant of other than one key, or no mode.
                key: (grant.keys as readonly string[])[0] as string,
                path: placeOf(grant).slice(placeOf(grant).lastIndexOf("/") + 1),
              },
            ]
          : CREDENTIAL_FILES.map((key) => ({ key, path: key })),
        defaultMode: Number.parseInt(grant.fileMode as string, 8),
      },
    })),
    ...(process.vpn === undefined
      ? []
      : [{ name: VPN_VOLUME, emptyDir: { sizeLimit: VPN_VOLUME_SIZE } }]),
  ];
}

/**
 * A container beside the Process, under the same posture, the same variables
 * and the same file grants: a grant is the Process's, and every container of
 * its pod is the Process.
 */
function sidecarOf(
  sidecar: NonNullable<ResolvedProcess["sidecars"]>[number],
  env: readonly EnvVar[],
  files: readonly VolumeMount[],
): Container {
  return {
    name: sidecar.name,
    image: sidecar.image,
    ...(env.length === 0 ? {} : { env }),
    resources: resourcesOf(sidecar.memory, sidecar.cpu),
    securityContext: RESTRICTED,
    ...(files.length === 0 ? {} : { volumeMounts: files }),
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
    resources: gpuShareOf(process, resourcesOf(process.memory, process.cpu)),
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

/**
 * Where a Process's pods may be scheduled
 * (spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection): the
 * node its volume is bound to, where it has one, and otherwise every node
 * eligible for it, each by name. Layer 2 resolved the set from the pinned node
 * contract, so the render names it whole, even where it is every node.
 */
const affinityOf = ({ placement }: ResolvedProcess): NodeAffinity =>
  nodeAffinityOf(
    placement.boundTo === undefined
      ? placement.eligibleNodes
      : [placement.boundTo],
  );

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
      ...strategyOf(process),
      progressDeadlineSeconds: wholeSeconds(process.deadline),
      selector: {
        matchLabels: {
          "app.kubernetes.io/name": process.name,
          ...instanceOf(process.name),
        },
      },
      template: {
        metadata: podMetadataOf(
          {
            ...labels,
            // A missing list and an empty one carry no label alike.
            // Stryker disable next-line ArrayDeclaration
            ...consumerLabelsOf(process.consumes ?? []),
          },
          [
            [process.name, process.imageVersion],
            // Stryker disable next-line ArrayDeclaration
            ...(process.sidecars ?? []).map(
              ({ name, imageVersion }) => [name, imageVersion] as const,
            ),
            ...(process.vpn === undefined
              ? []
              : [[VPN_CONTAINER, process.vpn.imageVersion] as const]),
          ],
        ),
        spec: {
          serviceAccountName: process.identity,
          automountServiceAccountToken: process.identityToken,
          ...(process.gpu === undefined
            ? {}
            : { runtimeClassName: process.gpu.runtimeClass }),
          securityContext: {
            runAsNonRoot: true,
            runAsUser: process.uid,
            runAsGroup: process.gid,
            // A volume is written as the image's group, and only a volume is.
            // A library's group is its own, and an `fsGroup` would re-own the
            // whole library (spec/v1/10-project-intent.md#libraries).
            ...(process.volumes === undefined || process.libraries !== undefined
              ? {}
              : { fsGroup: process.gid }),
            ...(process.libraries === undefined
              ? {}
              : { supplementalGroups: groupsOf(process) }),
            seccompProfile: { type: "RuntimeDefault" },
          },
          affinity: affinityOf(process),
          ...(process.vpn === undefined
            ? {}
            : { initContainers: [vpnContainerOf(process.vpn)] }),
          containers: [
            containerOf(process),
            // Stryker disable next-line ArrayDeclaration
            ...(process.sidecars ?? []).map((sidecar) =>
              sidecarOf(sidecar, envOf(process), [
                ...writableMountsOf(process),
                ...fileMountsOf(process),
              ]),
            ),
          ],
          ...(volumes.length === 0 ? {} : { volumes }),
        },
      },
    },
  };
}

/** The Service a Process Flagger does not switch is reached by; Flagger generates a blue-green one's. */
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

/** The one key of a gate ConfigMap: the Application's `releaseGate` element, as JSON. */
const GATE_KEY = "releaseGate.json";

/**
 * What the Release Gate reads of a gated Application
 * (spec/v1/20-resolved-deployment.md#the-release-gate): its `releaseGate`
 * element, in a ConfigMap named for the Application. The name stays across
 * releases, so the object is not immutable.
 */
const gateConfigMapOf = (
  application: ResolvedApplicationDocument,
): ConfigMap[] =>
  application.releaseGate === undefined
    ? []
    : [
        {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: `${application.id}-release-gate`,
            namespace: application.namespace,
            labels: applicationLabels(application.id),
          },
          data: { [GATE_KEY]: { json: application.releaseGate } },
        },
      ];

/** The labels of a backup's own identity: never the Process's, which a Service selects. */
const backupLabels = (
  backup: Backed["backup"],
  application: ResolvedApplicationDocument,
) => labelsOf({ name: backup.identity, runtime: "none" }, application.id);

/**
 * The pod one backed-up volume's method runs in: the engine's method image, as
 * the backup identity, reading the volume at `/data` and writing its copies to
 * the backup claim at `/backup`.
 */
function backupPodOf({ claim, backup }: Backed): PodSpec {
  const env: EnvVar[] = [
    { name: "BACKUP_RETAIN", value: String(backup.retain) },
    ...(backup.offCluster === undefined
      ? []
      : [{ name: "BACKUP_OFF_CLUSTER", value: backup.offCluster }]),
    ...(backup.peer === undefined
      ? []
      : [
          { name: "BACKUP_HOST", value: backup.peer.host },
          { name: "BACKUP_PORT", value: String(backup.peer.port) },
        ]),
  ];
  // Each credential's keys reach the method as variables: the off-cluster
  // destination's, and the peer's.
  const credentials = [backup.credential, backup.peer?.credential].flatMap(
    (grant) =>
      grant === undefined
        ? []
        : [{ secretRef: { name: grant.destination as string } }],
  );
  return {
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
        name: BACKUP_CONTAINER,
        image: backup.method,
        env,
        ...(credentials.length === 0 ? {} : { envFrom: credentials }),
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
}

/** A backup pod's metadata: its labels, and its method's version. */
export const backupMetadataOf = (labels: Labels, { backup }: Backed) =>
  podMetadataOf(labels, [[BACKUP_CONTAINER, backup.methodVersion]]);

/**
 * A backup CronJob per backed-up volume, at its class's schedule, pruned to
 * `retain`.
 */
function backupsOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): CronJob[] {
  return backedUp(process).map((volume) => {
    const labels = backupLabels(volume.backup, application);
    return {
      apiVersion: "batch/v1",
      kind: "CronJob",
      metadata: {
        name: volume.backup.claim,
        namespace: application.namespace,
        labels,
      },
      spec: {
        schedule: volume.backup.schedule,
        concurrencyPolicy: "Forbid",
        jobTemplate: {
          spec: {
            template: {
              metadata: backupMetadataOf(labels, volume),
              spec: backupPodOf(volume),
            },
          },
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

/** The API's core group, which Kubernetes itself spells as no name at all. */
const CORE = "core";

/**
 * What a Process that holds Kubernetes API access may ask of it
 * (spec/v1/16-dependencies.md#kubernetes-api-access-is-declared-and-admitted):
 * a ClusterRole of its declared rules, bound to its one ServiceAccount, both
 * under the name its namespace and identity make.
 */
function rbacOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): (ClusterRole | ClusterRoleBinding)[] {
  if (process.api === undefined) return [];
  const metadata = {
    name: clusterNameOf(application.namespace, process.identity),
    labels: labelsOf(process, application.id),
  };
  return [
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRole",
      metadata,
      rules: process.api.rules.map(({ group, objects, verbs }) => ({
        apiGroups: [group === CORE ? "" : group],
        resources: objects,
        verbs,
      })),
    },
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRoleBinding",
      metadata,
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "ClusterRole",
        name: metadata.name,
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: process.identity,
          namespace: application.namespace,
        },
      ],
    },
  ];
}

/** The audiences the internet reaches: the ones a warmup through the public hostname can ask as. */
const PUBLIC_AUDIENCES: readonly string[] = ["anonymous", "authenticated"];

// The values are distinct, so `<=` would order the same list.
// Stryker disable next-line EqualityOperator
const byText = (a: string, b: string): number => (a < b ? -1 : 1);

/**
 * A webhook's metadata is text alone, so a list is its distinct values in
 * order, separated by a space, which no path or hostname holds. An empty list
 * is no key at all.
 */
const listed = (
  key: string,
  values: readonly string[],
): Record<string, string> =>
  values.length === 0
    ? {}
    : { [key]: [...new Set(values)].sort(byText).join(" ") };

function canaryOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): Canary {
  // A blue-green Process is a gate member, and serves on its first surface.
  const gate = application.releaseGate as NonNullable<
    ResolvedApplicationDocument["releaseGate"]
  >;
  const [served] = process.surfaces as NonNullable<ResolvedProcess["surfaces"]>;
  const { interval, iterations, threshold, errorRate, latency } = gate.analysis;
  // Every Route to the Process, with the host it is served on.
  const routes = (application.exposure ?? []).flatMap(({ host, routes: all }) =>
    all
      .filter((route) => route.process === process.name)
      .map((route) => ({ host, ...route })),
  );
  // A member's readiness is asked over HTTP or by opening a port, and only
  // the first has a path to request.
  const probe = gate.members.find(
    (member) => member.process === process.name,
  )?.readiness;
  const readiness =
    probe !== undefined && "path" in probe ? probe.path : undefined;
  const webhooks: Webhook[] = WEBHOOKS.map(([name, type]) => ({
    name,
    type,
    url: `${gate.endpoint}/${name}`,
    metadata: {
      application: application.id,
      process: process.name,
      revision: application.revision,
      // What the gate's checks request and what they must stay under
      // (spec/v1/55-delivery.md#the-release-gate): nothing about a Project is
      // configured on the gate itself.
      ...listed(
        "paths",
        routes.map(({ path }) => path),
      ),
      ...(readiness === undefined ? {} : { readiness }),
      ...listed(
        "hostnames",
        routes
          .filter(({ audience }) => PUBLIC_AUDIENCES.includes(audience))
          .map(({ host }) => host),
      ),
      errorRate,
      latency,
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
      ...(autoscaled(process)
        ? {
            autoscalerRef: {
              apiVersion: "autoscaling/v2" as const,
              kind: "HorizontalPodAutoscaler" as const,
              name: process.name,
            },
          }
        : {}),
      progressDeadlineSeconds: wholeSeconds(process.deadline),
      service: {
        port: (served as { port: number }).port,
        targetPort: (served as { name: string }).name,
        portName: (served as { name: string }).name,
      },
      analysis: { interval, iterations, threshold, webhooks },
    },
  };
}

/** A library's volume and claim must be the same size; the size binds nothing. */
const LIBRARY_SIZE = "1Gi";

/**
 * Per library the project mounts, the local volume onto its directory, held to
 * its node, and the claim bound to it, which every Process of the project that
 * mounts the library shares. Neither is ever pruned: the directory holds data
 * no render owns (spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection).
 */
function libraryObjectsOf(
  project: ResolvedProject,
  namespace: string,
): RenderedObject[] {
  const mounted = new Map<string, Library>();
  for (const application of project.applications)
    for (const process of application.processes)
      for (const mount of librariesOf(process))
        mounted.set(mount.library, mount);
  return [...mounted.keys()].sort(byText).flatMap((name) => {
    const { volume, claim, node, path } = mounted.get(name) as Library;
    const metadata = { labels: managedOnly(), annotations: NEVER_PRUNED };
    return [
      {
        apiVersion: "v1",
        kind: "PersistentVolume",
        metadata: { name: volume, ...metadata },
        spec: {
          capacity: { storage: LIBRARY_SIZE },
          volumeMode: "Filesystem",
          accessModes: ["ReadWriteOnce"],
          persistentVolumeReclaimPolicy: "Retain",
          storageClassName: "",
          claimRef: { namespace, name: claim },
          local: { path },
          nodeAffinity: {
            required: {
              nodeSelectorTerms: [
                {
                  matchExpressions: [
                    {
                      key: "kubernetes.io/hostname",
                      operator: "In",
                      values: [node],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "PersistentVolumeClaim",
        metadata: { name: claim, namespace, ...metadata },
        spec: {
          storageClassName: "",
          volumeName: volume,
          accessModes: ["ReadWriteOnce"],
          resources: { requests: { storage: LIBRARY_SIZE } },
        },
      },
    ];
  });
}

/**
 * One alias per name the project's edges dial a provider outside its
 * namespace by (spec/v1/16-dependencies.md#the-alias): an `ExternalName`
 * Service, shared by every Process that holds an edge to it.
 */
function aliasesOf(
  project: ResolvedProject,
  namespace: string,
): AliasService[] {
  const targets = new Map<string, string>();
  for (const application of project.applications)
    for (const process of application.processes)
      // Stryker disable next-line ArrayDeclaration: no edge and an edge with no alias render alike.
      for (const { address, target } of process.dependencies ?? [])
        if (target !== undefined)
          targets.set(address.slice(0, address.lastIndexOf(":")), target);
  return [...targets.keys()].sort(byText).map((name) => ({
    apiVersion: "v1",
    kind: "Service",
    metadata: { name, namespace, labels: managedOnly() },
    spec: {
      type: "ExternalName",
      externalName: targets.get(name) as string,
    },
  }));
}

/** Every Deliverable of one project this adapter owns, kustomizations aside. */
export function renderKubernetes(project: ResolvedProject): Deliverable[] {
  const [first] = project.applications;
  const namespace = (first as ResolvedApplicationDocument).namespace;
  const libraries = libraryObjectsOf(project, namespace);
  const aliases = aliasesOf(project, namespace);
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
    ...(libraries.length === 0
      ? []
      : [
          {
            path: `${projectDirectory(project.project)}/libraries.yaml`,
            adapter: ADAPTER,
            objects: libraries,
          },
        ]),
    ...(aliases.length === 0
      ? []
      : [
          {
            path: `${projectDirectory(project.project)}/aliases.yaml`,
            adapter: ADAPTER,
            objects: aliases,
          },
        ]),
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
          processes
            .filter(blueGreen)
            .flatMap((p) => [
              canaryOf(p, application),
              ...(autoscaled(p) ? [autoscalerOf(p, application)] : []),
            ]),
        ],
        [
          "pdb.yaml",
          processes.filter(scaled).map((p) => budgetOf(p, application)),
        ],
        ["migration.yaml", migrationOf(application)],
        [
          "service.yaml",
          processes
            .filter((p) => !blueGreen(p) && p.surfaces !== undefined)
            .map((p) => serviceOf(p, application)),
        ],
        ["pvc.yaml", processes.flatMap((p) => claimsOf(p, application))],
        [
          "configmap.yaml",
          [
            ...gateConfigMapOf(application),
            ...processes.flatMap((p) => configMapsOf(p, application)),
          ],
        ],
        ["backup.yaml", processes.flatMap((p) => backupsOf(p, application))],
        ["rbac.yaml", processes.flatMap((p) => rbacOf(p, application))],
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
  file.endsWith("networkpolicy.yaml") || file.endsWith(".json");

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
    if (/^apps\/[^/]+$/.test(parent))
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
