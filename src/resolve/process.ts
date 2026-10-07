// One lowered Process to its element of the Resolved Deployment
// (spec/v1/20-resolved-deployment.md#derived-mechanics): what the Application
// declared, carried through, and every mechanic derived from it and from the
// pinned platform facts. Nothing here is authored and nothing may be.
import type { ClusterStateDocument } from "../model/cluster-state.ts";
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import { inSeconds, seconds } from "../model/durations.ts";
import { eligibleNodes } from "../model/eligibility.ts";
import type { ImagesLockDocument, LockedImage } from "../model/images-lock.ts";
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
import { resolveEdge } from "./dependencies.ts";
import { resolveAssets, resolveGrants, resolveSidecars } from "./secrets.ts";
import { resolveVolumes } from "./volumes.ts";

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
}

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
  if (process.cutover === "interrupted") return "stop-start";
  return machinery ? "rolling" : "blue-green";
}

/**
 * `progressDeadlineSeconds`: three budgets, floored to a whole second, or for
 * a prepare Process the budget itself, rounded up so it is never cut short.
 */
function deadlineOf(process: EffectiveProcess): number {
  if (process.startupBudget === undefined) return UNBUDGETED_DEADLINE;
  const budget = seconds(process.startupBudget);
  return process.lifecycle === "prepare"
    ? Math.ceil(budget)
    : Math.floor(budget * 3);
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

/** The env file a render for `cluster` reads: the base, overlaid by that cluster's file. */
function entriesFor(
  files: readonly EnvFile[] | undefined,
  cluster: string,
): readonly EnvVariable[] {
  const base = files?.find((file) => file.cluster === undefined)?.entries ?? [];
  const overlay =
    files?.find((file) => file.cluster === cluster)?.entries ?? [];
  const overlaid = new Set(overlay.map(({ name }) => name));
  return [...base.filter(({ name }) => !overlaid.has(name)), ...overlay];
}

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
  const { address } = resolveEdge(edge, context.union, context.platform);
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
  if (value.kind === "dependency")
    return {
      name,
      value: dependencyOf(value.source, process, context) + suffix,
    };
  if (value.kind === "exposure")
    return {
      name,
      value: exposureOf(value.source, context) + suffix,
    };
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
  const authored = entriesFor(files, context.platform.metadata.cluster).map(
    (variable) => entryOf(variable, process, context),
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
    eligibleNodes: eligibleNodes(process, context.contract),
    ...(binding === undefined
      ? {}
      : { boundTo: binding.node, from: "cluster-state" as const }),
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
    resolveEdge(edge, context.union, context.platform),
  );
  const volumes = resolveVolumes(
    process,
    context.platform,
    context.lock,
    context.project,
  );
  const secrets = resolveGrants(process);
  const assets = resolveAssets(process, context.assets, context.hash);
  const sidecars = resolveSidecars(process, context.lock);
  const surfaces = Object.entries(process.provides ?? {}).map(
    ([name, port]) => ({ name, port }),
  );
  return {
    name: process.name,
    lifecycle: process.lifecycle,
    runtime: process.runtime,
    identity: process.name,
    image: `${image.repository}@${image.digest}`,
    uid: image.uid,
    gid: image.gid,
    ...(process.cutover === undefined ? {} : { cutover: process.cutover }),
    ...(switchover === undefined ? {} : { switchover }),
    deadline: inSeconds(deadlineOf(process)),
    replicas: process.replicas?.count ?? 1,
    memory: process.placement.memory,
    cpu: process.placement.cpu,
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
            // The platform admits the holder, or E_PROCESS_RBAC_GRANT refused
            // it, so the block that says where the API answers is there.
            server: (
              context.platform.apiAccess as NonNullable<
                PlatformIntentDocument["apiAccess"]
              >
            ).server,
          },
        }),
    ...probesOf(process, context.platform),
    placement: placementOf(process, context),
    ...(volumes.length === 0 ? {} : { volumes }),
    ...(secrets.length === 0 ? {} : { secrets }),
    ...(assets.length === 0 ? {} : { assets }),
    ...(sidecars.length === 0 ? {} : { sidecars }),
    ...(dependencies.length === 0 ? {} : { dependencies }),
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
