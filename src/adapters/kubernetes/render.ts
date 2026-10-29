// The `kubernetes` adapter (spec/v1/30-deliverables.md#adapters): per project
// its Namespace and the volume and claim of each library it mounts, per Process
// its controller, ServiceAccount, claims and Asset ConfigMaps, the Service of
// each L4 Address it is exposed on, the backup each backed-up volume derives, the Canary of each
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
import type { Canary, Client, Webhook } from "../../objects/custom.ts";
import type { Deliverable, RenderedObject } from "../../objects/deliverable.ts";
import type {
  AliasService,
  ClusterRole,
  ClusterRoleBinding,
  Role,
  RoleBinding,
  ConfigMap,
  Container,
  CronJob,
  Deployment,
  EnvVar,
  Kustomization,
  Labels,
  ContainerPort,
  LoadBalancerService,
  NodeAffinity,
  PodAntiAffinity,
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
import {
  asInstance,
  instanceSelectorOf,
  instancesOf,
  moveOf,
  relabelled,
  type Instance,
} from "./move.ts";
import { wholeSeconds } from "../shared/durations.ts";
import {
  isSynced,
  type EngineGrant,
  type Grant,
  type KvGrant,
} from "../shared/holders.ts";
import {
  CREATED_ONCE,
  applicationLabels,
  consumerLabelsOf,
  MEMBER_LABEL,
  instanceOf,
  labelsOf,
  managedOnly,
  podMetadataOf,
} from "../shared/labels.ts";
import { applicationDirectory, projectDirectory } from "../shared/paths.ts";
import { nodeAffinityOf } from "../shared/placement.ts";
import { notSupported } from "../../model/internal-failure.ts";
import { clusterNameOf, namespaceOf } from "../../model/runtime-profiles.ts";
import { CLIENT_API_VERSION } from "../../model/platform-intent.ts";
import { VPN_DIRECTORY } from "../../model/vpn.ts";
import { below } from "../../model/project-intent-queries.ts";

export const ADAPTER = "kubernetes";

/** The four questions a Canary asks the Release Gate (spec/v1/55-delivery.md#the-release-gate). */
const WEBHOOKS = [
  ["may-start", "confirm-rollout"],
  ["checks", "rollout"],
  ["may-promote", "confirm-promotion"],
  ["rollback", "rollback"],
] as const;

/** The mark that keeps the applier from ever deleting a claim (spec/v1/30-deliverables.md#flagger-ready-objects). */
export const NEVER_PRUNED = { "kustomize.toolkit.fluxcd.io/prune": "disabled" };

/** Where a backup's method reads the volume, and where it writes its copies. */
const BACKUP_SOURCE = "/data";
export const BACKUP_TARGET = "/backup";

/** A family this adapter does not spell yet stops the render rather than leaving it out. */
function notYet(process: ResolvedProcess): void {
  if (
    process.lifecycle !== "scheduled" &&
    (process.lifecycle !== "application" || process.switchover === undefined)
  )
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

type FileGrant = (KvGrant | EngineGrant) & { readonly destination: string };

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

/** A kv file grant's one key; notYet refused a file grant of other than one key. */
const fileKeyOf = (grant: KvGrant): string =>
  (grant.keys as readonly string[])[0] as string;

/**
 * A reference to a key the Process starts without is optional
 * (spec/v1/10-project-intent.md#optional-keys); required is unsaid.
 */
const optionalOf = (grant: Grant, key: string): { readonly optional?: true } =>
  "path" in grant && grant.optional?.includes(key) === true
    ? { optional: true }
    : {};

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
          ...optionalOf(grant, entry.secret.key),
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

type ResolvedAsset = NonNullable<ResolvedProcess["assets"]>[number];
type SeededAsset = Extract<ResolvedAsset, { readonly seedAt: string }>;

/** The Assets the Process reads where they are mounted. */
const mountedOf = (process: ResolvedProcess) =>
  // A missing list and an empty one hold no Asset alike.
  // Stryker disable next-line ArrayDeclaration
  (process.assets ?? []).filter(
    (asset): asset is Exclude<ResolvedAsset, SeededAsset> => "mountAt" in asset,
  );

/** The Assets the seeder copies onto the Process's volumes. */
const seededOf = (process: ResolvedProcess): SeededAsset[] =>
  // Stryker disable next-line ArrayDeclaration
  (process.assets ?? []).filter(
    (asset): asset is SeededAsset => "seedAt" in asset,
  );

/** The step that seeds a Process's Assets, and where it reads each Asset's file. */
const SEEDER_CONTAINER = "seed";
const SEED_SOURCE = "/seed";

/** A word the shell reads as itself, whatever it holds. */
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

/**
 * The script that seeds one Asset: its directory made, the copy it replaces
 * kept beside it, and the file written beside its place at 0600 and moved in,
 * so the Process never reads half a file.
 */
const seedScriptOf = ({ name, from, seedAt }: SeededAsset): string[] => {
  const place = quoted(seedAt);
  const staged = quoted(`${seedAt}.seeding`);
  return [
    `mkdir -p ${quoted(seedAt.slice(0, seedAt.lastIndexOf("/")))}`,
    `if [ -e ${place} ]; then cp -p ${place} ${quoted(`${seedAt}.superseded`)}; fi`,
    `cp ${quoted(`${SEED_SOURCE}/${name}/${fileOf(from)}`)} ${staged}`,
    `chmod 0600 ${staged}`,
    `mv ${staged} ${place}`,
  ];
};

/**
 * The step that seeds a Process's Assets onto its volumes before every start
 * (spec/v1/10-project-intent.md#seeded-assets): the first init step, on the
 * platform's seeder image, under the posture and as the Process's own user. It
 * mounts each seeded Asset's file, and the volumes and writable paths the
 * Assets land on.
 */
const seederContainerOf = (
  seeder: NonNullable<ResolvedProcess["seeder"]>,
  process: ResolvedProcess,
): Container => {
  const seeded = seededOf(process);
  const landsBelow = (directory: string): boolean =>
    seeded.some(({ seedAt }) => below(seedAt, directory));
  return {
    name: SEEDER_CONTAINER,
    image: seeder.image,
    command: [
      "/bin/sh",
      "-c",
      ["set -eu", "umask 077", ...seeded.flatMap(seedScriptOf)].join("\n"),
    ],
    resources: resourcesOf(seeder.memory, seeder.cpu),
    securityContext: RESTRICTED,
    volumeMounts: [
      ...seeded.map(({ name }) => ({
        name,
        mountPath: `${SEED_SOURCE}/${name}`,
        readOnly: true as const,
      })),
      // Each Asset lands below a volume or a writable path: E_SEED_OUTSIDE_VOLUME.
      // Stryker disable next-line ArrayDeclaration
      ...(process.volumes ?? [])
        .filter(({ mountAt }) => landsBelow(mountAt))
        .map(({ claim, mountAt }) => ({ name: claim, mountPath: mountAt })),
      // Stryker disable next-line ArrayDeclaration
      ...(process.writablePaths ?? [])
        .filter(({ path }) => landsBelow(path))
        .map(({ path }) => ({ name: writableOf(path), mountPath: path })),
    ],
  };
};

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
    // A seeded Asset is the seeder's to read, never the Process's.
    ...mountedOf(process).map(({ name, from, mountAt }) => ({
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
    ...(process.writablePaths ?? []).map(({ path, size, medium }) => ({
      name: writableOf(path),
      emptyDir: {
        ...(medium === undefined ? {} : { medium: "Memory" as const }),
        sizeLimit: size,
      },
    })),
    ...filesOf(process).map((grant) => ({
      name: secretVolumeOf(grant),
      secret: {
        secretName: grant.destination,
        items: isKv(grant)
          ? [
              {
                key: fileKeyOf(grant),
                path: placeOf(grant).slice(placeOf(grant).lastIndexOf("/") + 1),
              },
            ]
          : CREDENTIAL_FILES.map((key) => ({ key, path: key })),
        defaultMode: Number.parseInt(grant.fileMode as string, 8),
        ...(isKv(grant) ? optionalOf(grant, fileKeyOf(grant)) : {}),
      },
    })),
    ...(process.vpn === undefined
      ? []
      : [{ name: VPN_VOLUME, emptyDir: { sizeLimit: VPN_VOLUME_SIZE } }]),
  ];
}

/**
 * A container beside the Process, or before it, under the same posture, the
 * same variables and the same file grants: a grant is the Process's, and every
 * container of its pod is the Process. It mounts the Process's volumes it
 * names, each where it says, and the Process's writable paths.
 */
function sidecarOf(
  sidecar: NonNullable<ResolvedProcess["sidecars"]>[number],
  process: ResolvedProcess,
): Container {
  const env = envOf(process);
  const mounts = [
    // A sidecar that names no volume and one with an empty list mount none alike.
    // Stryker disable next-line ArrayDeclaration
    ...(sidecar.volumes ?? []).map(({ claim, mountAt }) => ({
      name: claim,
      mountPath: mountAt,
    })),
    ...writableMountsOf(process),
    ...fileMountsOf(process),
  ];
  return {
    name: sidecar.name,
    image: sidecar.image,
    ...(sidecar.command === undefined ? {} : { command: sidecar.command }),
    ...(sidecar.args === undefined ? {} : { args: sidecar.args }),
    ...(env.length === 0 ? {} : { env }),
    resources: resourcesOf(sidecar.memory, sidecar.cpu),
    securityContext: RESTRICTED,
    ...(mounts.length === 0 ? {} : { volumeMounts: mounts }),
  };
}

/**
 * The ports a container listens on, one per surface, and a host port for each
 * port a client dials on a node's own address
 * (spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection): on the
 * surface's own entry where the client dials the surface's port over TCP, and
 * on one of its own, named as the resolved port is, where it does not.
 */
function portsOf(
  surfaces: NonNullable<ResolvedProcess["surfaces"]>,
  l4Exposure: ResolvedProcess["l4Exposure"],
): ContainerPort[] {
  // A missing list and an empty one expose nothing alike.
  // Stryker disable next-line ArrayDeclaration
  const onNode = (l4Exposure ?? []).flatMap((exposure) =>
    exposure.kind === "node" ? exposure.ports : [],
  );
  // A port's target is its surface's own port, so a TCP port the client
  // dials at that same number is the surface's entry with a host port.
  const merges = ({
    port,
    protocol,
    targetPort,
  }: (typeof onNode)[number]): boolean =>
    protocol === "tcp" && port === targetPort;
  return [
    ...surfaces.map(({ name, port }) => {
      const dialled = onNode.find(
        (entry) => entry.surface === name && merges(entry),
      );
      return {
        name,
        containerPort: port,
        ...(dialled === undefined ? {} : { hostPort: dialled.port }),
      };
    }),
    ...onNode
      .filter((entry) => !merges(entry))
      .map(({ name, port, protocol, targetPort }) => ({
        name,
        containerPort: targetPort,
        hostPort: port,
        protocol: protocol === "udp" ? ("UDP" as const) : ("TCP" as const),
      })),
  ];
}

/**
 * A tier proxy's static configuration, as Traefik's arguments
 * (spec/v1/30-deliverables.md#the-edge-proxy): an entry point per surface it
 * provides, `web`, `websecure` and `admin`, the CRD provider admitting only
 * the routes of its tier's class across namespaces, ping and metrics on
 * `admin`, and logs as JSON.
 */
function edgeProxyArgsOf({ edgeProxy, surfaces }: ResolvedProcess): string[] {
  if (edgeProxy === undefined) return [];
  // A proxy provides `web`, or it is no tier's proxy.
  const provided = surfaces as NonNullable<typeof surfaces>;
  const port = (name: string) =>
    provided.find((surface) => surface.name === name)?.port;
  const web = port("web");
  const websecure = port("websecure");
  const admin = port("admin");
  return [
    `--entryPoints.web.address=:${String(web)}/tcp`,
    ...(websecure === undefined
      ? []
      : [`--entryPoints.websecure.address=:${String(websecure)}/tcp`]),
    ...(edgeProxy.tls && websecure !== undefined
      ? ["--entryPoints.websecure.http.tls=true"]
      : []),
    ...(admin === undefined
      ? []
      : [
          `--entryPoints.traefik.address=:${String(admin)}/tcp`,
          "--ping=true",
          "--ping.entryPoint=traefik",
          "--metrics.prometheus=true",
          "--metrics.prometheus.entryPoint=traefik",
        ]),
    "--providers.kubernetescrd=true",
    `--providers.kubernetescrd.ingressClass=${edgeProxy.ingressClass}`,
    "--providers.kubernetescrd.allowCrossNamespace=true",
    "--providers.kubernetescrd.allowEmptyServices=true",
    // An acme tier's resolver, named for the tier, keeping its state on the
    // claim the tier derives and answering the DNS challenge with its token.
    ...(edgeProxy.resolver === undefined
      ? []
      : [
          `--certificatesresolvers.${edgeProxy.resolver.name}.acme.email=${edgeProxy.resolver.email}`,
          `--certificatesresolvers.${edgeProxy.resolver.name}.acme.storage=${edgeProxy.resolver.storage}`,
          `--certificatesresolvers.${edgeProxy.resolver.name}.acme.dnschallenge.provider=${edgeProxy.resolver.dnsProvider}`,
        ]),
    "--log.format=json",
    "--accesslog=true",
    "--accesslog.format=json",
  ];
}

function containerOf(process: ResolvedProcess): Container {
  const env = envOf(process);
  const mounts = mountsOf(process);
  // The authored arguments, then those a tier's proxy derives.
  const args = [...(process.args ?? []), ...edgeProxyArgsOf(process)];
  return {
    name: process.name,
    image: process.image,
    ...(process.command === undefined ? {} : { command: process.command }),
    ...(args.length === 0 ? {} : { args }),
    ...(process.surfaces === undefined
      ? {}
      : { ports: portsOf(process.surfaces, process.l4Exposure) }),
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
const affinityOf = ({
  name,
  placement,
  spreadAcross,
}: ResolvedProcess): NodeAffinity & Partial<PodAntiAffinity> => ({
  ...nodeAffinityOf(
    placement.boundTo === undefined
      ? placement.eligibleNodes
      : [placement.boundTo],
  ),
  // Replicas spread across nodes repel each other within one revision alone:
  // a rollout's old and new pod may share a node, so the rollout completes
  // where replicas equal eligible nodes.
  ...(spreadAcross === undefined
    ? {}
    : {
        podAntiAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: [
            {
              labelSelector: { matchLabels: instanceOf(name) },
              matchLabelKeys: ["pod-template-hash"] as const,
              topologyKey: "kubernetes.io/hostname" as const,
            },
          ],
        },
      }),
});

type PodTemplate = Deployment["spec"]["template"];

/**
 * The pod a Process runs in, whatever controller starts it: a run to
 * completion restarts in place on a failure.
 */
/** Whether the Process is a member of its Application's release gate. */
const memberOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): boolean =>
  application.releaseGate?.members.some(
    (member) => member.process === process.name,
  ) === true;

function podTemplateOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
  restartPolicy?: PodSpec["restartPolicy"],
): PodTemplate {
  const labels = labelsOf(process, application.id);
  const volumes = volumesOf(process);
  // A missing list and an empty one hold no sidecar alike.
  // Stryker disable next-line ArrayDeclaration
  const sidecars = process.sidecars ?? [];
  const initContainers = [
    ...(process.seeder === undefined
      ? []
      : [seederContainerOf(process.seeder, process)]),
    ...(process.vpn === undefined ? [] : [vpnContainerOf(process.vpn)]),
    ...sidecars
      .filter(({ init }) => init === true)
      .map((sidecar) => sidecarOf(sidecar, process)),
  ];
  return {
    metadata: podMetadataOf(
      {
        ...labels,
        // A missing list and an empty one carry no label alike.
        // Stryker disable next-line ArrayDeclaration
        ...consumerLabelsOf(process.consumes ?? []),
        ...(memberOf(process, application) ? MEMBER_LABEL : {}),
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
        ...(process.seeder === undefined
          ? []
          : [[SEEDER_CONTAINER, process.seeder.imageVersion] as const]),
      ],
    ),
    spec: {
      serviceAccountName: process.identity,
      // No class and an undefined one render alike: YAML drops the key.
      // Stryker disable next-line ConditionalExpression
      ...(process.priorityClass === undefined
        ? {}
        : { priorityClassName: process.priorityClass }),
      automountServiceAccountToken: process.identityToken,
      // A Process that serves DNS resolves through the nameservers it is
      // handed, never the cluster's DNS it must keep working without.
      ...(process.nameservers === undefined
        ? {}
        : {
            dnsPolicy: "None" as const,
            dnsConfig: { nameservers: [...process.nameservers] },
          }),
      // An absent policy and an undefined one render alike: YAML drops the key.
      // Stryker disable next-line ConditionalExpression
      ...(restartPolicy === undefined ? {} : { restartPolicy }),
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
      // The seeder runs first, so every later step reads the seeded files;
      // then the VPN starts and stays, so a step before the Process already
      // reaches out through it.
      ...(initContainers.length === 0 ? {} : { initContainers }),
      containers: [
        containerOf(process),
        ...sidecars
          .filter(({ init }) => init === undefined)
          .map((sidecar) => sidecarOf(sidecar, process)),
      ],
      ...(volumes.length === 0 ? {} : { volumes }),
    },
  };
}

function deploymentOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): Deployment {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: process.name,
      namespace: application.namespace,
      labels: labelsOf(process, application.id),
    },
    spec: {
      ...strategyOf(process),
      progressDeadlineSeconds: wholeSeconds(process.deadline),
      selector: {
        matchLabels: {
          "app.kubernetes.io/name": process.name,
          ...instanceOf(process.name),
        },
      },
      template: podTemplateOf(process, application),
    },
  };
}

/**
 * A scheduled Process's CronJob
 * (spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection): at its
 * own schedule, never two runs at once, and a run that cannot start within its
 * start deadline is skipped. A failed run is retried in its pod.
 */
function cronJobOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): CronJob {
  return {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: {
      name: process.name,
      namespace: application.namespace,
      labels: labelsOf(process, application.id),
    },
    spec: {
      schedule: process.schedule as string,
      // A parked schedule starts no run; one in flight finishes.
      ...(process.parked === true ? { suspend: true } : {}),
      concurrencyPolicy: "Forbid",
      startingDeadlineSeconds: wholeSeconds(process.startDeadline as string),
      jobTemplate: {
        spec: { template: podTemplateOf(process, application, "OnFailure") },
      },
    },
  };
}

/** The controller that runs a Process, by its lifecycle. */
const workloadOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): Deployment | CronJob =>
  process.lifecycle === "scheduled"
    ? cronJobOf(process, application)
    : deploymentOf(process, application);

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
 * The pool an L4 Address's Service asks its address from. MetalLB holds one
 * pool per pool-kind L4 Address, under the address's name.
 */
export const ADDRESS_POOL = "metallb.io/address-pool";

/**
 * The Service of each L4 Address a Process is exposed on
 * (spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection): a load
 * balancer whose `Local` traffic policy keeps the client's address, and so
 * sends a connection only to a pod on the node that announces it.
 */
const l4ServicesOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): LoadBalancerService[] =>
  // A missing list and an empty one expose nothing alike.
  // Stryker disable next-line ArrayDeclaration
  (process.l4Exposure ?? [])
    .flatMap((exposure) => (exposure.kind === "pool" ? [exposure] : []))
    .map(({ address, service, ports }) => ({
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: service,
        namespace: application.namespace,
        labels: labelsOf(process, application.id),
        annotations: { [ADDRESS_POOL]: address },
      },
      spec: {
        type: "LoadBalancer",
        externalTrafficPolicy: "Local",
        selector: instanceOf(process.name),
        ports: ports.map(({ name, port, protocol, targetPort }) => ({
          name,
          port,
          protocol: protocol === "udp" ? "UDP" : "TCP",
          targetPort,
        })),
      },
    }));

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

/**
 * The Client an Application declares (spec/v1/17-sign-in.md#the-client):
 * cluster-scoped, so it names no namespace, and named by the Application Id,
 * which is its Client id.
 */
const clientOf = (application: ResolvedApplicationDocument): Client[] =>
  application.client === undefined
    ? []
    : [
        {
          apiVersion: CLIENT_API_VERSION,
          kind: "Client",
          metadata: {
            name: application.id,
            labels: applicationLabels(application.id),
          },
          spec: {
            signIn: application.client.signIn,
            host: application.client.host,
            ...pick(application.client, "launchUrl"),
            ...pick(application.client, "iconUrl"),
            ...pick(application.client, "redirectUris"),
            ...pick(application.client, "credential"),
            ...pick(application.client, "secretPath"),
            roles: application.client.roles,
            ...pick(application.client, "label"),
            ...pick(application.client, "description"),
          },
        },
      ];

/** One optional field, where the value holds it, so the object's keys keep their order. */
const pick = <T extends object, K extends keyof T>(
  value: T,
  key: K,
): Partial<Pick<T, K>> =>
  value[key] === undefined ? {} : ({ [key]: value[key] } as Pick<T, K>);

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
      : [
          { name: "BACKUP_OFF_CLUSTER", value: backup.offCluster.destination },
          { name: "BACKUP_OFF_CLUSTER_PATH", value: backup.offCluster.path },
          {
            name: "BACKUP_OFF_CLUSTER_RECIPIENT",
            value: backup.offCluster.recipient,
          },
        ]),
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
 * its namespace-scoped rules as a Role in its own namespace, and its
 * cluster-scoped rules as a ClusterRole under the name its namespace and
 * identity make, each bound to its one ServiceAccount. A scope with no rule
 * renders nothing.
 */
function rbacOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): (Role | RoleBinding | ClusterRole | ClusterRoleBinding)[] {
  if (process.api === undefined) return [];
  const labels = labelsOf(process, application.id);
  const subjects = [
    {
      kind: "ServiceAccount" as const,
      name: process.identity,
      namespace: application.namespace,
    },
  ];
  const rulesIn = (scope: "namespace" | "cluster") =>
    (process.api as NonNullable<ResolvedProcess["api"]>).rules
      .filter((rule) => rule.scope === scope)
      .map(({ group, objects, verbs }) => ({
        apiGroups: [group === CORE ? "" : group],
        resources: objects,
        verbs,
      }));
  const namespaced = rulesIn("namespace");
  const clusterWide = rulesIn("cluster");
  const local = {
    name: process.identity,
    namespace: application.namespace,
    labels,
  };
  const cluster = {
    name: clusterNameOf(application.namespace, process.identity),
    labels,
  };
  return [
    ...(namespaced.length === 0
      ? []
      : [
          {
            apiVersion: "rbac.authorization.k8s.io/v1" as const,
            kind: "Role" as const,
            metadata: local,
            rules: namespaced,
          },
          {
            apiVersion: "rbac.authorization.k8s.io/v1" as const,
            kind: "RoleBinding" as const,
            metadata: local,
            roleRef: {
              apiGroup: "rbac.authorization.k8s.io" as const,
              kind: "Role" as const,
              name: local.name,
            },
            subjects,
          },
        ]),
    ...(clusterWide.length === 0
      ? []
      : [
          {
            apiVersion: "rbac.authorization.k8s.io/v1" as const,
            kind: "ClusterRole" as const,
            metadata: cluster,
            rules: clusterWide,
          },
          {
            apiVersion: "rbac.authorization.k8s.io/v1" as const,
            kind: "ClusterRoleBinding" as const,
            metadata: cluster,
            roleRef: {
              apiGroup: "rbac.authorization.k8s.io" as const,
              kind: "ClusterRole" as const,
              name: cluster.name,
            },
            subjects,
          },
        ]),
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
    // The Gate's own route is no Process's.
    all
      .filter((route) => "process" in route && route.process === process.name)
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

/** The label that enrols a namespace in the ambient mesh, where its Project is enrolled. */
const meshLabelOf = ({
  mesh,
}: ResolvedApplicationDocument): Record<string, string> =>
  mesh === undefined ? {} : { "istio.io/dataplane-mode": mesh.dataplane };

/** Every Deliverable of one project this adapter owns, kustomizations aside. */
/** Whether an Instance renders as its Process always has: the one that serves it, under its name. */
const plain = (instance: Instance, process: ResolvedProcess): boolean =>
  instance.name === process.name && process.move === undefined;

/**
 * Each Instance's workload. An Instance other than the Process's own carries
 * its Process's instance label; a source a Move is carrying data out of is
 * created once, so the render never rewrites what still serves.
 */
function instanceWorkloadsOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): (Deployment | CronJob)[] {
  return instancesOf(process, application).map((instance) => {
    const workload = asInstance(
      workloadOf(instance.process, application),
      instance.name,
    );
    // An Application moving to another Project serves from here, untouched,
    // until its Move retires it.
    return instance.frozen || application.departing === true
      ? {
          ...workload,
          metadata: { ...workload.metadata, annotations: CREATED_ONCE },
        }
      : workload;
  });
}

/** Each Instance's Service, which selects that Instance's pods alone. */
function instanceServicesOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): Service[] {
  return instancesOf(process, application).map((instance) => {
    if (plain(instance, process)) return serviceOf(process, application);
    const service = asInstance(
      serviceOf(instance.process, application),
      instance.name,
    );
    return {
      ...service,
      spec: {
        ...service.spec,
        selector: instanceSelectorOf(instance, process.name),
      },
    };
  });
}

/**
 * The Process as the Instance that serves it runs: the source of an open Move
 * it renders, or else the one Instance it has, whose claims its backups copy.
 */
const servingOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): ResolvedProcess =>
  (instancesOf(process, application) as [Instance])[0].process;

export function renderKubernetes(project: ResolvedProject): Deliverable[] {
  const [first] = project.applications;
  // A Project whose one Application has moved out of it keeps its namespace,
  // where the retired source's claim stays bound until it is deleted by hand.
  const namespace = namespaceOf(project.project);
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
          metadata: {
            name: namespace,
            labels: {
              ...managedOnly(),
              ...(first === undefined ? {} : meshLabelOf(first)),
            },
          },
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
        [
          "workload.yaml",
          processes.flatMap((p) => instanceWorkloadsOf(p, application)),
        ],
        ["client.yaml", clientOf(application)],
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
        ["move.yaml", processes.flatMap((p) => moveOf(p, application))],
        [
          "service.yaml",
          [
            ...processes
              .filter((p) => !blueGreen(p) && p.surfaces !== undefined)
              .flatMap((p) => instanceServicesOf(p, application)),
            ...processes.flatMap((p) => l4ServicesOf(p, application)),
          ],
        ],
        [
          "pvc.yaml",
          processes.flatMap((p) =>
            instancesOf(p, application).flatMap((instance) =>
              relabelled(
                claimsOf(instance.process, application),
                instance.name,
              ),
            ),
          ),
        ],
        [
          "configmap.yaml",
          [
            ...gateConfigMapOf(application),
            ...processes.flatMap((p) => configMapsOf(p, application)),
          ],
        ],
        [
          "backup.yaml",
          processes.flatMap((p) =>
            backupsOf(servingOf(p, application), application),
          ),
        ],
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
