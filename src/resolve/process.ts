// One lowered Process to its element of the Resolved Deployment
// (spec/v1/20-resolved-deployment.md#derived-mechanics): what the Application
// declared, carried through, and every mechanic derived from it and from the
// pinned platform facts. Nothing here is authored and nothing may be.
import { ACME_MOUNT } from "../model/tier-proxy.ts";
import { foundationOf, type AcmePolicy } from "../model/platform-intent.ts";
import type { L4Hold } from "../model/l4-addresses.ts";
import type { ClusterStateDocument } from "../model/cluster-state.ts";
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import { inSeconds, seconds } from "../model/durations.ts";
import { eligibleNodes, gpuVendors } from "../model/eligibility.ts";
import { FORWARDED_PORT_FILE } from "../model/vpn.ts";
import {
  type ImagesLockDocument,
  type LockedImage,
  versionOf,
} from "../model/images-lock.ts";
import type { NodeContractDocument } from "../model/node-contract.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type {
  ApplicationDocument,
  DependencyEdge,
  EnvFile,
  EnvVariable,
} from "../model/project-intent.ts";

type Exposure = NonNullable<ApplicationDocument["exposure"]>[number];
import type {
  EnvEntry,
  ResolvedProbe,
  ResolvedProcess,
  StartupProbe,
} from "../model/resolved-deployment.ts";
import {
  exports,
  namespaceOf,
  vaultNameOf,
} from "../model/runtime-profiles.ts";
import type { Hasher } from "../model/hasher.ts";
import {
  credentialPathOf,
  credentialRoleOf,
  resolveCredentials,
} from "./credentials.ts";
import { consumedOf } from "../model/consumer-label.ts";
import { clientSecretPath } from "./client.ts";
import { resolveEdge } from "./dependencies.ts";
import { resolveLibraries } from "./libraries.ts";
import {
  destinationOf,
  resolveAssets,
  resolveGrants,
  resolveSidecars,
} from "./secrets.ts";
import { resolveVolumes } from "./volumes.ts";

/**
 * The priority class a Process runs at (spec/v1/14-platform-intent.md#priority):
 * the data class for a datastore, whose engine derives a backup; the critical
 * class for the foundation and the Applications the platform names; none
 * otherwise. Nothing is authored on a Process.
 */
function priorityOf(
  process: EffectiveProcess,
  context: ProcessContext,
): { readonly priorityClass?: string } {
  const policy = context.platform.priority;
  if (policy === undefined) return {};
  if (process.engine !== undefined) return { priorityClass: policy.data.name };
  const holder = `${context.project}/${context.application}`;
  return foundationOf(context.platform).has(holder) ||
    // A missing list and an empty one name no Application alike.
    // Stryker disable next-line ArrayDeclaration
    (policy.criticalApplications ?? []).includes(holder)
    ? { priorityClass: policy.critical.name }
    : {};
}

/**
 * The tier a Process is the proxy of (spec/v1/30-deliverables.md#the-edge-proxy):
 * the Process of a tier's `traefik` Application that serves `web`. A proxy
 * named by two tiers carries one class, or E_TIER_CLASS_UNFILTERED refused the
 * set, and every tier an exposure is on names one, or
 * E_TIER_WITHOUT_INGRESS_CLASS did.
 */
function edgeProxyOf(
  process: EffectiveProcess,
  context: ProcessContext,
): Pick<ResolvedProcess, "edgeProxy"> {
  const tier = context.platform.tiers.find(
    ({ traefik, ingressClass }) =>
      traefik === `${context.project}/${context.application}` &&
      ingressClass !== undefined,
  );
  return tier === undefined || process.provides?.["web"] === undefined
    ? {}
    : {
        edgeProxy: {
          ingressClass: tier.ingressClass as string,
          tls: tier.listener === "tls",
          // An acme tier issues through a resolver named for it, with the
          // platform's account, or E_NO_ACME_POLICY refused it.
          ...(tier.certificates === "acme"
            ? {
                resolver: {
                  name: tier.name,
                  email: (context.platform.acme as AcmePolicy).email,
                  dnsProvider: (context.platform.acme as AcmePolicy)
                    .dnsProvider,
                  storage: `${ACME_MOUNT}/${tier.name}.json`,
                },
              }
            : {}),
        },
      };
}

/** What resolving one Process reads beyond the Process itself. */
export interface ProcessContext {
  readonly platform: PlatformIntentDocument;
  readonly contract: NodeContractDocument;
  readonly lock: ImagesLockDocument;
  readonly clusterState: ClusterStateDocument;
  readonly project: string;
  /** Every project of the composed union, lowered. */
  readonly union: readonly EffectiveProject[];
  /** Whether the Process's Application is delivery machinery, which switches rolling. */
  readonly machinery: boolean;
  /** The collector's endpoint, where the platform names one. */
  readonly collector: string | undefined;
  /** The project's Asset files, by the `from` path it names them by. */
  readonly assets: ReadonlyMap<string, string>;
  readonly hash: Hasher;
  /** Whether the Process's Application migrates its own schema. */
  readonly migratesItself: boolean;
  /** The Id of the Process's Application, which is its Client's id. */
  readonly application: string;
  /** The grants its Application's Client, or the provider's role, derives on the Process. */
  readonly clientGrants: readonly ResolvedGrant[];
  /** Where the L4 Addresses the Process is exposed on hold it. */
  readonly held: L4Hold;
}

type ResolvedGrant = NonNullable<ResolvedProcess["secrets"]>[number];

/** A startup probe polls this often; its threshold covers the budget. */
const STARTUP_PERIOD = 5;
/** The deadline of a Process that declares no startup budget: the substrate's own. */
const UNBUDGETED_DEADLINE = 600;

type Target = NonNullable<
  Exclude<EffectiveProcess["probes"], "none" | undefined>["liveness"]
>;

function switchoverOf(
  process: EffectiveProcess,
  machinery: boolean,
): ResolvedProcess["switchover"] {
  // Every serving Process declares a cutover, or E_CUTOVER_MISSING refused it.
  if (process.lifecycle !== "application") return undefined;
  // A parked Process runs no pod, so it has no release to gate: it stops
  // and starts like an interrupted one.
  if (process.cutover === "interrupted" || process.parked !== undefined)
    return "stop-start";
  return machinery ? "rolling" : "blue-green";
}

/**
 * How late a scheduled run may start before it is skipped
 * (spec/v1/10-project-intent.md#scheduled-processes): long enough to ride out
 * a control-plane restart, short enough that a run never starts long after
 * the slot it was for. Nothing authors it.
 */
export const START_DEADLINE = 300;

/** A scheduled Process's cron, and the start deadline it derives. */
const scheduleOf = (
  process: EffectiveProcess,
): Pick<ResolvedProcess, "schedule" | "startDeadline"> =>
  process.schedule === undefined
    ? {}
    : { schedule: process.schedule, startDeadline: inSeconds(START_DEADLINE) };

/**
 * `progressDeadlineSeconds`: three budgets, floored to a whole second, or for
 * a prepare Process the budget itself, rounded up so it is never cut short;
 * either way with the substrate's image pull on top, since the deadline runs
 * from before the image is on the node.
 */
function deadlineOf(
  process: EffectiveProcess,
  platform: PlatformIntentDocument,
): number {
  const pull =
    platform.substrate.imagePull === undefined
      ? 0
      : Math.ceil(seconds(platform.substrate.imagePull));
  if (process.startupBudget === undefined) return UNBUDGETED_DEADLINE + pull;
  const budget = seconds(process.startupBudget);
  return (
    (process.lifecycle === "prepare"
      ? Math.ceil(budget)
      : Math.floor(budget * 3)) + pull
  );
}

function probesOf(
  process: EffectiveProcess,
  platform: PlatformIntentDocument,
): Pick<ResolvedProcess, "readiness" | "liveness" | "startup"> {
  const declared = typeof process.probes === "object" ? process.probes : {};
  const cadence = platform.probes;
  const probe = (target: Target): ResolvedProbe => ({ ...target, ...cadence });
  const startup = (target: Target, budget: string): StartupProbe => ({
    ...target,
    period: inSeconds(STARTUP_PERIOD),
    timeout: cadence.timeout,
    failures: Math.ceil(seconds(budget) / STARTUP_PERIOD),
  });
  return {
    ...(declared.readiness === undefined
      ? {}
      : { readiness: probe(declared.readiness) }),
    ...(declared.liveness === undefined
      ? {}
      : { liveness: probe(declared.liveness) }),
    // The startup probe polls liveness, so readiness alone derives none.
    ...(declared.liveness === undefined || process.startupBudget === undefined
      ? {}
      : { startup: startup(declared.liveness, process.startupBudget) }),
  };
}

/** The variables of the Process's one env file, or none where it has none. */
const entriesFor = (
  files: readonly EnvFile[] | undefined,
): readonly EnvVariable[] => files?.[0]?.entries ?? [];

/** `${secret:<path>#<key>}`: one key of a grant the Process holds, delivered `env`. */
function secretOf(variable: EnvVariable, source: string): EnvEntry {
  // An env grant of the Process holds the key, or
  // E_UNAUTHORISED_SECRET_REFERENCE refused the placeholder.
  const cut = source.lastIndexOf("#");
  return {
    name: variable.name,
    secret: { path: source.slice(0, cut), key: source.slice(cut + 1) },
  };
}

/** `${dependency:<application>.<coordinate>}`: one coordinate of the Process's own edge. */
function dependencyOf(
  source: string,
  process: EffectiveProcess,
  context: ProcessContext,
): string {
  // The Process holds one edge to the Application and the coordinate is
  // `host` or `port`, or E_UNRESOLVED_PLACEHOLDER refused the placeholder.
  const cut = source.lastIndexOf(".");
  const application = source.slice(0, cut);
  const edge = (process.dependsOn as readonly DependencyEdge[]).find(
    (candidate) => candidate.application === application,
  ) as DependencyEdge;
  const { address } = resolveEdge(
    edge,
    context.union,
    context.platform,
    context.project,
  );
  const port = address.lastIndexOf(":");
  return source.slice(cut + 1) === "host"
    ? address.slice(0, port)
    : address.slice(port + 1);
}

/** `${exposure:<application>.<name>#<field>}`: one field of an exposure the union declares. */
function exposureOf(source: string, context: ProcessContext): string {
  const hash = source.lastIndexOf("#");
  const dot = source.lastIndexOf(".", hash);
  const [application, name, field] = [
    source.slice(0, dot),
    source.slice(dot + 1, hash),
    source.slice(hash + 1),
  ];
  // The union declares the exposure and the field is one it hands out, or
  // E_UNRESOLVED_APPLICATION or E_UNRESOLVED_PLACEHOLDER refused it.
  const exposure = (
    context.union
      .flatMap(({ applications }) => applications)
      .find(({ id }) => id === application) as EffectiveApplication
  ).exposure?.find((candidate) => candidate.name === name) as Exposure;
  // A tier carries the exposure's audience, or E_NO_TIER_FOR_AUDIENCE refused it.
  const tier = context.platform.tiers.find(({ audiences }) =>
    audiences.includes(exposure.audience),
  ) as PlatformIntentDocument["tiers"][number];
  const scheme = tier.listener === "tls" ? "https" : "http";
  if (field === "host") return exposure.host;
  return field === "scheme" ? scheme : `${scheme}://${exposure.host}`;
}

function entryOf(
  variable: EnvVariable,
  process: EffectiveProcess,
  context: ProcessContext,
): EnvEntry {
  const { name, value } = variable;
  if ("text" in value) return { name, value: value.text };
  if (value.kind === "secret") return secretOf(variable, value.source);
  const suffix = value.suffix ?? "";
  if (value.kind === "dependency") {
    const coordinate = value.source.slice(value.source.lastIndexOf(".") + 1);
    // A credential coordinate is a whole value read from the edge's synced
    // credential, or E_UNRESOLVED_PLACEHOLDER refused it.
    if (coordinate === "username" || coordinate === "password")
      return {
        name,
        secret: {
          path: credentialPathOf(credentialRoleOf(context)),
          key: coordinate,
        },
      };
    return {
      name,
      value: dependencyOf(value.source, process, context) + suffix,
    };
  }
  if (value.kind === "exposure")
    return {
      name,
      value: exposureOf(value.source, context) + suffix,
    };
  if (value.kind === "client") {
    // A Client is declared beside a sign-in provider, or E_NO_SIGN_IN_PROVIDER
    // refused it, and the field is one it hands out, or
    // E_UNRESOLVED_PLACEHOLDER did (spec/v1/17-sign-in.md#credentials-and-placeholders).
    // The secret is a whole value, read from the Client's derived credential
    // as a `${secret:…}` reference is, under the grant its reference derives.
    if (value.source === "secret")
      return {
        name,
        secret: {
          path: clientSecretPath(context.project, context.application),
          key: "secret",
        },
      };
    return {
      name,
      value:
        (value.source === "issuer"
          ? (
              context.platform.signIn as NonNullable<
                PlatformIntentDocument["signIn"]
              >
            ).issuer
          : context.application) + suffix,
    };
  }
  // What the platform derived about this Process
  // (spec/v1/10-project-intent.md#configuration): its namespace, its
  // ServiceAccount, which is its own name, and its Vault role, which is both.
  const namespace = namespaceOf(context.project);
  if (value.source === "namespace") return { name, value: namespace + suffix };
  return {
    name,
    value:
      (value.source === "vaultRole"
        ? vaultNameOf(namespace, process.name)
        : process.name) + suffix,
  };
}

/** The Runtime Profile's values (spec/v1/10-project-intent.md#runtime-profiles). */
function profileOf(
  process: EffectiveProcess,
  context: ProcessContext,
): EnvEntry[] {
  if (!exports(process.runtime)) return [];
  const surfaces = Object.values(process.provides ?? {});
  return [
    {
      name: "DEPLOYMENT_ENVIRONMENT",
      value: context.platform.metadata.cluster,
    },
    ...(context.collector === undefined
      ? []
      : [{ name: "OTEL_EXPORTER_OTLP_ENDPOINT", value: context.collector }]),
    { name: "OTEL_SERVICE_NAME", value: process.name },
    ...(surfaces.length === 1
      ? [{ name: "PORT", value: String(surfaces[0]) }]
      : []),
  ];
}

function environmentOf(
  process: EffectiveProcess,
  context: ProcessContext,
): EnvEntry[] {
  // The Process's env files, which a lint reading `process.env` as the ambient
  // environment would mistake for it.
  const { env: files } = process;
  const authored = entriesFor(files).map((variable) =>
    entryOf(variable, process, context),
  );
  // No env file writes a key the profile injects, or E_PROFILE_KEY_AUTHORED
  // refused it.
  const entries = [...authored, ...profileOf(process, context)];
  // No two entries share a name, so `<=` would order the same list.
  // Stryker disable next-line EqualityOperator
  return entries.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * Where a Process may land, and where its data already is: a claim the
 * ClusterState snapshot records as bound holds the Process to that node
 * (spec/v1/20-resolved-deployment.md#cluster-state).
 */
function placementOf(
  process: EffectiveProcess,
  context: ProcessContext,
): ResolvedProcess["placement"] {
  // A missing list and an empty one hold the Process to no node alike.
  // Stryker disable next-line ArrayDeclaration
  const claims = new Set((process.volumes ?? []).map(({ claim }) => claim));
  const binding = context.clusterState.bindings.find(({ claim }) =>
    claims.has(claim),
  );
  return {
    eligibleNodes: eligibleNodes(
      process,
      context.contract,
      context.platform,
      context.held,
    ),
    ...(binding === undefined
      ? {}
      : { boundTo: binding.node, from: "cluster-state" as const }),
  };
}

/**
 * The GPU share a Process that requires a GPU requests, named by the Platform
 * for the one vendor its cards share: E_GPU_VENDOR_AMBIGUOUS and
 * E_NO_GPU_POLICY refused anything else.
 */
function gpuOf(
  process: EffectiveProcess,
  context: ProcessContext,
): { readonly gpu?: { resource: string; runtimeClass: string } } {
  if (process.placement.gpu === undefined) return {};
  const [vendor] = gpuVendors(
    process,
    context.contract,
    context.platform,
    context.held,
  );
  const policy = context.platform.gpus?.[vendor as string] as NonNullable<
    PlatformIntentDocument["gpus"]
  >[string];
  return { gpu: { ...policy } };
}

/** Why an attached Process reaches public addresses it declared no egress to. */
const TUNNEL_REASON = "the VPN's tunnel reaches its provider's servers";

/**
 * The VPN container beside an attached Process, from the Platform's `vpn`
 * (E_NO_VPN_POLICY refused an attachment without one, and E_UNLOCKED_IMAGE an
 * image the lock does not hold). Its firewall admits the Process's surfaces,
 * and only a Process that receives the forwarded port asks for one.
 */
function vpnOf(
  process: EffectiveProcess,
  context: ProcessContext,
): { readonly vpn?: NonNullable<ResolvedProcess["vpn"]> } {
  if (process.vpn === undefined) return {};
  const vpn = context.platform.vpn as NonNullable<
    PlatformIntentDocument["vpn"]
  >;
  const image = context.lock.images[vpn.image] as LockedImage;
  const ports = [...new Set(Object.values(process.provides ?? {}))].sort(
    (a, b) => a - b,
  );
  const { forwardedPort } = process.vpn;
  const derived: Record<string, string> = {
    ...(ports.length === 0 ? {} : { FIREWALL_INPUT_PORTS: ports.join(",") }),
    VPN_PORT_FORWARDING: forwardedPort ? "on" : "off",
    ...(forwardedPort
      ? {
          VPN_PORT_FORWARDING_UP_COMMAND: `/bin/sh -c 'echo {{PORT}} > ${FORWARDED_PORT_FILE}'`,
        }
      : {}),
  };
  const environment: Record<string, string> = { ...vpn.settings, ...derived };
  // One key per Process: a provider takes a key for one device, so two tunnels
  // on one key knock each other off.
  const credential = `${vpn.credential}/${context.project}-${process.name}`;
  return {
    vpn: {
      image: `${image.repository}@${image.digest}`,
      ...versionOf("imageVersion", image),
      memory: vpn.memory,
      cpu: vpn.cpu,
      forwardedPort,
      // Sorted by name, in code-point order.
      environment: Object.keys(environment)
        .sort()
        .map((name) => ({ name, value: environment[name] as string })),
      credential: {
        path: credential,
        access: "read",
        delivery: "env",
        destination: destinationOf(`${process.name}-vpn`, credential),
      },
    },
  };
}

export function resolveProcess(
  process: EffectiveProcess,
  context: ProcessContext,
): ResolvedProcess {
  // Every alias is checked against the lock before resolution runs:
  // E_UNLOCKED_IMAGE.
  const image = context.lock.images[process.image] as LockedImage;
  const switchover = switchoverOf(process, context.machinery);
  const environment = environmentOf(process, context);
  const dependencies = (process.dependsOn ?? []).map((edge) =>
    resolveEdge(edge, context.union, context.platform, context.project),
  );
  const volumes = resolveVolumes(
    process,
    context.platform,
    context.lock,
    context.project,
  );
  const secrets = [
    ...resolveGrants(process),
    ...resolveCredentials(process, context),
    ...context.clientGrants,
  ];
  const libraries = resolveLibraries(
    process,
    context.platform,
    context.project,
  );
  const assets = resolveAssets(process, context.assets, context.hash);
  const sidecars = resolveSidecars(process, context.lock);
  const surfaces = Object.entries(process.provides ?? {}).map(
    ([name, port]) => ({ name, port }),
  );
  // An edge to an Application's surface reaches a pod, which admits the
  // label; one to a Registered Unmanaged Surface reaches an address.
  const consumes = dependencies
    .filter(({ peers }) => peers !== undefined)
    .map(({ application, surface }) => consumedOf(application, surface));
  return {
    name: process.name,
    lifecycle: process.lifecycle,
    runtime: process.runtime,
    identity: process.name,
    image: `${image.repository}@${image.digest}`,
    ...versionOf("imageVersion", image),
    uid: image.uid,
    gid: image.gid,
    ...(process.cutover === undefined ? {} : { cutover: process.cutover }),
    ...(switchover === undefined ? {} : { switchover }),
    ...scheduleOf(process),
    deadline: inSeconds(deadlineOf(process, context.platform)),
    replicas: process.parked === undefined ? (process.replicas?.count ?? 1) : 0,
    ...(process.parked === undefined ? {} : { parked: true as const }),
    ...priorityOf(process, context),
    ...(process.replicas?.across === undefined
      ? {}
      : { spreadAcross: process.replicas.across }),
    ...edgeProxyOf(process, context),
    memory: process.placement.memory,
    cpu: process.placement.cpu,
    ...gpuOf(process, context),
    ...vpnOf(process, context),
    hardening: context.platform.hardening,
    // The pod authenticates only where a grant is delivered `self`, or where
    // it holds Kubernetes API access.
    identityToken:
      process.api !== undefined ||
      secrets.some(({ delivery }) => delivery === "self"),
    ...(process.api === undefined
      ? {}
      : {
          api: {
            ...process.api,
            // A rule that names no scope reaches the cluster.
            rules: process.api.rules.map((rule) => ({
              ...rule,
              scope: rule.scope ?? "cluster",
            })),
            // The platform admits the holder, or E_PROCESS_RBAC_GRANT refused
            // it, so the block that says where the API answers is there.
            server: (
              context.platform.apiAccess as NonNullable<
                PlatformIntentDocument["apiAccess"]
              >
            ).server,
          },
        }),
    ...(process.egress === undefined
      ? process.vpn === undefined
        ? {}
        : { internetEgress: { reason: TUNNEL_REASON } }
      : { internetEgress: { reason: process.egress.reason } }),
    ...probesOf(process, context.platform),
    placement: placementOf(process, context),
    ...(volumes.length === 0 ? {} : { volumes }),
    ...(libraries.length === 0 ? {} : { libraries }),
    ...(secrets.length === 0 ? {} : { secrets }),
    ...(assets.length === 0 ? {} : { assets }),
    ...(sidecars.length === 0 ? {} : { sidecars }),
    ...(dependencies.length === 0 ? {} : { dependencies }),
    ...(consumes.length === 0 ? {} : { consumes }),
    ...(process.writablePaths === undefined
      ? {}
      : {
          writablePaths: process.writablePaths.map((path) => ({
            path,
            size: context.platform.ephemeral.size,
          })),
        }),
    ...(environment.length === 0 ? {} : { environment }),
    ...(surfaces.length === 0 ? {} : { surfaces }),
  };
}
