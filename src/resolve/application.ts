// One lowered Application to its element of the Resolved Deployment
// (spec/v1/20-resolved-deployment.md#the-model): its Processes, its exposure,
// its Reconcile Unit, the release-gate inputs a blue/green switch reads, and
// the revision that names this release of it.
import type {
  EffectiveApplication,
  EffectiveProcess,
} from "../model/effective-intent.ts";
import { inSeconds, seconds } from "../model/durations.ts";
import type { Hasher } from "../model/hasher.ts";
import type {
  ReleaseGate,
  ResolvedApplicationDocument,
  ResolvedMigration,
  ResolvedProcess,
} from "../model/resolved-deployment.ts";
import type { MigrationProofDocument } from "../model/migration-proof.ts";
import { applicationRevision } from "../model/revision.ts";
import { SECRETS_UNIT, unitOf } from "../model/reconcile-units.ts";
import { exports, namespaceOf } from "../model/runtime-profiles.ts";
import { resolveExposure } from "./exposure.ts";
import { managed } from "./database.ts";
import { resolveMigration } from "./migration.ts";
import { egressOf, ingressOf } from "./policy.ts";
import { resolveProcess, type ProcessContext } from "./process.ts";
import { notChecked } from "../model/internal-failure.ts";

/** An Application's element: the projection without its document header and provenance. */
export type ResolvedElement = Omit<
  ResolvedApplicationDocument,
  "apiVersion" | "kind" | "provenance"
>;

export interface ApplicationContext extends Omit<ProcessContext, "machinery"> {
  /** The project that declares each Application of the union, by its id. */
  readonly projectOf: ReadonlyMap<string, string>;
  readonly hash: Hasher;
  /** The Release Gate's endpoint, where the platform names one. */
  readonly gate: string | undefined;
  /** The Secret Store's endpoint, where the platform names one. */
  readonly store: string | undefined;
  /** The migration proof beside the project file, where CI wrote one. */
  readonly proof: MigrationProofDocument | undefined;
}

/**
 * Whether the operator syncs anything for these Processes: a grant one holds,
 * or the off-cluster credential one's backup holds. Either is read from the
 * Secret Store the platform names, or the set was refused before resolution.
 */
function storeFor({ store }: ApplicationContext): string {
  if (store === undefined)
    throw notChecked(
      "a grant under a platform that names no Secret Store is not checked yet",
    );
  return store;
}

const synced = (processes: readonly ResolvedProcess[]): boolean =>
  processes.some(
    ({ secrets, volumes }) =>
      secrets !== undefined ||
      volumes?.some(({ backup }) => backup?.credential !== undefined) === true,
  );

/**
 * The units that must be Ready first: every other project an edge reaches, and
 * the secrets-provisioning unit wherever a Process holds a grant
 * (spec/v1/20-resolved-deployment.md#the-reconcile-unit).
 */
function reconcileAfter(
  application: EffectiveApplication,
  context: ApplicationContext,
): string[] {
  const providers = application.processes.flatMap(({ dependsOn }) =>
    // A missing list and any fallback resolve no provider alike.
    // Stryker disable next-line ArrayDeclaration
    (dependsOn ?? [])
      .map(({ application: provider }) => context.projectOf.get(provider))
      .flatMap((project) =>
        project === undefined || project === context.project
          ? []
          : [unitOf(project)],
      ),
  );
  const grants = application.processes.some(
    // A missing list and an empty one hold no grant alike.
    // Stryker disable next-line ArrayDeclaration
    ({ secrets }) => (secrets ?? []).length > 0,
  );
  // A migration holds the owner credential, so its role is written first too.
  const held = grants || managed(application);
  return [...new Set([...providers, ...(held ? [SECRETS_UNIT] : [])])].sort();
}

type Probe = NonNullable<
  Exclude<EffectiveProcess["probes"], "none" | undefined>["readiness"]
>;

/** A Process's readiness declaration, which is what makes it a gate member. */
const readinessOf = (process: EffectiveProcess): Probe | undefined =>
  typeof process.probes === "object" ? process.probes.readiness : undefined;

interface Resolved {
  readonly process: EffectiveProcess;
  readonly resolved: ResolvedProcess;
}

/**
 * The release-gate inputs a blue/green switch reads
 * (spec/v1/20-resolved-deployment.md#the-release-gate): one member per
 * blue/green Process that publishes readiness, the platform's analysis
 * cadence, and the slowest member's deadline.
 */
function releaseGateOf(
  pairs: readonly Resolved[],
  { platform, gate }: ApplicationContext,
  plan: ResolvedMigration | undefined,
): ReleaseGate | undefined {
  const gated = pairs.filter(
    ({ resolved }) => resolved.switchover === "blue-green",
  );
  if (gated.length === 0) return undefined;
  const members = gated.filter(
    ({ process }) => readinessOf(process) !== undefined,
  );
  if (members.length === 0)
    throw notChecked(
      "a blue/green Application whose Processes publish no readiness is E_RELEASE_UNIT_NO_READINESS, which is not checked yet",
    );
  // The unit waits for its slowest member, and only a member is waited on.
  const deadline = Math.max(
    ...members.map(({ resolved }) => seconds(resolved.deadline)),
  );
  return {
    // A blue/green Process asks a gate the platform names, or
    // E_UNKNOWN_RELEASE_GATE refused the set.
    endpoint: gate as string,
    deadline: inSeconds(deadline),
    // A blue/green Process under a platform with no delivery policy is
    // E_NO_DELIVERY_POLICY.
    analysis: platform.delivery?.analysis as ReleaseGate["analysis"],
    members: members.map(({ process }) => ({
      process: process.name,
      readiness: readinessOf(process) as Probe,
      ...(exports(process.runtime)
        ? { checks: ["error-rate" as const, "latency" as const] }
        : {}),
    })),
    // What the gate starts and undoes, where the Application has a migration.
    ...(plan === undefined
      ? {}
      : {
          migration: {
            identity: plan.identity,
            ...(plan.testedAgainst === undefined
              ? {}
              : { testedAgainst: plan.testedAgainst }),
            nonTransactional: plan.nonTransactional,
          },
        }),
  };
}

export function resolveApplication(
  application: EffectiveApplication,
  context: ApplicationContext,
): ResolvedElement {
  const machinery =
    context.platform.delivery?.machinery.includes(application.id) === true;
  const pairs = application.processes.map((process) => {
    const ingress = ingressOf(process, application, context);
    return {
      process,
      resolved: {
        ...resolveProcess(process, { ...context, machinery }),
        ...(ingress.length === 0 ? {} : { ingress }),
        egress: egressOf(process, context),
      },
    };
  });
  const processes = pairs.map(({ resolved }) => resolved);
  const after = reconcileAfter(application, context);
  const plan = managed(application)
    ? resolveMigration(application, context)
    : undefined;
  const gate = releaseGateOf(pairs, context, plan);
  const scrape = application.observability?.scrape;
  const element = {
    id: application.id,
    project: context.project,
    namespace: namespaceOf(context.project),
    reconcileUnit: unitOf(context.project),
    ...(after.length === 0 ? {} : { reconcileAfter: after }),
    ...(application.observability === undefined
      ? {}
      : { alertClass: application.observability.alertClass }),
    ...(scrape === undefined
      ? {}
      : {
          scrape: {
            process: scrape.process,
            surface: scrape.surface,
            path: scrape.path,
            interval: context.platform.monitors.interval,
            timeout: context.platform.monitors.timeout,
          },
        }),
    ...(gate === undefined ? {} : { releaseGate: gate }),
    ...(plan === undefined ? {} : { migration: plan }),
    // A migration reads its owner credential from the store itself.
    ...(synced(processes) || managed(application)
      ? { secretStore: storeFor(context) }
      : {}),
    ...(application.exposure === undefined
      ? {}
      : {
          exposure: resolveExposure(
            application.exposure,
            context.platform,
            context.union,
          ),
        }),
    processes,
  };
  return { ...element, revision: applicationRevision(element, context.hash) };
}
