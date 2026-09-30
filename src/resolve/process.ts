// One lowered Process to its element of the Resolved Deployment
// (spec/v1/20-resolved-deployment.md#derived-mechanics): what the Application
// declared, carried through, and every mechanic derived from it and from the
// pinned platform facts. Nothing here is authored and nothing may be.
import type {
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import { inSeconds, seconds } from "../model/durations.ts";
import { eligibleNodes } from "../model/eligibility.ts";
import type { ImagesLockDocument, LockedImage } from "../model/images-lock.ts";
import type { NodeContractDocument } from "../model/node-contract.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { EnvFile, EnvVariable } from "../model/project-intent.ts";
import type {
  EnvEntry,
  ResolvedProbe,
  ResolvedProcess,
  StartupProbe,
} from "../model/resolved-deployment.ts";
import { exports, namespaceOf } from "../model/runtime-profiles.ts";
import { resolveEdge } from "./dependencies.ts";

/** What resolving one Process reads beyond the Process itself. */
export interface ProcessContext {
  readonly platform: PlatformIntentDocument;
  readonly contract: NodeContractDocument;
  readonly lock: ImagesLockDocument;
  readonly project: string;
  /** Every project of the composed union, lowered. */
  readonly union: readonly EffectiveProject[];
  /** Whether the Process's Application is delivery machinery, which switches rolling. */
  readonly machinery: boolean;
  /** The collector's endpoint, where the platform names one. */
  readonly collector: string | undefined;
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

function valueOf(
  variable: EnvVariable,
  process: EffectiveProcess,
  project: string,
): string {
  const { value } = variable;
  if ("text" in value) return value.text;
  if (value.kind !== "identity")
    throw new Error(
      `${variable.name}: a ${value.kind} placeholder is not resolved yet`,
    );
  // The Vault role and the ServiceAccount are both the Process's own name.
  return value.source === "namespace" ? namespaceOf(project) : process.name;
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
    (variable) => ({
      name: variable.name,
      value: valueOf(variable, process, context.project),
    }),
  );
  const profile = profileOf(process, context);
  const injected = new Set(profile.map(({ name }) => name));
  const written = authored.find(({ name }) => injected.has(name));
  if (written !== undefined)
    throw new Error(
      `${written.name}: a Runtime Profile key written in an env file is a build error, which is not checked yet`,
    );
  const entries = [...authored, ...profile];
  // No two entries share a name, so `<=` would order the same list.
  // Stryker disable next-line EqualityOperator
  return entries.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** A family whose derivation lands in a later slice stops the resolution rather than leaving it out. */
function notYet(process: EffectiveProcess): void {
  const pending = [
    ["a volume", process.volumes],
    // A grant's policy peer is the Secret Store, which no pinned input names yet.
    ["a grant", process.secrets],
    ["an Asset", process.assets],
  ] as const;
  for (const [what, held] of pending)
    if ((held ?? []).length > 0)
      throw new Error(`${process.name}: ${what} is not resolved yet`);
}

export function resolveProcess(
  process: EffectiveProcess,
  context: ProcessContext,
): ResolvedProcess {
  notYet(process);
  // Every alias is checked against the lock before resolution runs:
  // E_UNLOCKED_IMAGE.
  const image = context.lock.images[process.image] as LockedImage;
  const switchover = switchoverOf(process, context.machinery);
  const environment = environmentOf(process, context);
  const dependencies = (process.dependsOn ?? []).map((edge) =>
    resolveEdge(edge, context.union, context.platform),
  );
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
    // The token is mounted only where a grant is delivered `self`, and every
    // grant stops above until the Secret Store is a pinned fact.
    identityToken: false,
    ...probesOf(process, context.platform),
    placement: { eligibleNodes: eligibleNodes(process, context.contract) },
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
