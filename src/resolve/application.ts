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
  ResolvedProcess,
} from "../model/resolved-deployment.ts";
import { applicationRevision } from "../model/revision.ts";
import { exports, namespaceOf } from "../model/runtime-profiles.ts";
import { resolveExposure } from "./exposure.ts";
import { resolveProcess, type ProcessContext } from "./process.ts";

/** An Application's element: the projection without its document header and provenance. */
export type ResolvedElement = Omit<
  ResolvedApplicationDocument,
  "apiVersion" | "kind" | "provenance"
>;

export interface ApplicationContext extends Omit<ProcessContext, "machinery"> {
  /** The project that declares each Application of the union, by its id. */
  readonly projectOf: ReadonlyMap<string, string>;
  readonly hash: Hasher;
}

const unitOf = (project: string): string => `apps-${project}`;

/** The unit that materialises every credential a grant asks for. */
const SECRETS_UNIT = "apps-vso-secrets";

/**
 * The units that must be Ready first: every other project an edge reaches,
 * and the secrets-provisioning unit wherever a Process holds a grant, because
 * a Process cannot start before its credential exists
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
    ({ secrets }) => secrets !== undefined,
  );
  return [...new Set([...providers, ...(grants ? [SECRETS_UNIT] : [])])].sort();
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
  platform: ApplicationContext["platform"],
): ReleaseGate | undefined {
  const gated = pairs.filter(
    ({ resolved }) => resolved.switchover === "blue-green",
  );
  if (gated.length === 0) return undefined;
  const members = gated.filter(
    ({ process }) => readinessOf(process) !== undefined,
  );
  if (members.length === 0)
    throw new Error(
      "a blue/green Application whose Processes publish no readiness is E_RELEASE_UNIT_NO_READINESS, which is not checked yet",
    );
  // The unit waits for its slowest member, and only a member is waited on.
  const deadline = Math.max(
    ...members.map(({ resolved }) => seconds(resolved.deadline)),
  );
  return {
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
  };
}

export function resolveApplication(
  application: EffectiveApplication,
  context: ApplicationContext,
): ResolvedElement {
  if (typeof application.migration === "object")
    throw new Error(
      `${application.id}: a managed migration is not resolved yet`,
    );
  const machinery =
    context.platform.delivery?.machinery.includes(application.id) === true;
  const pairs = application.processes.map((process) => ({
    process,
    resolved: resolveProcess(process, { ...context, machinery }),
  }));
  const processes = pairs.map(({ resolved }) => resolved);
  const after = reconcileAfter(application, context);
  const gate = releaseGateOf(pairs, context.platform);
  const element = {
    id: application.id,
    project: context.project,
    namespace: namespaceOf(context.project),
    reconcileUnit: unitOf(context.project),
    ...(after.length === 0 ? {} : { reconcileAfter: after }),
    ...(application.observability === undefined
      ? {}
      : { alertClass: application.observability.alertClass }),
    ...(gate === undefined ? {} : { releaseGate: gate }),
    ...(application.exposure === undefined
      ? {}
      : { exposure: resolveExposure(application.exposure, context.platform) }),
    processes,
  };
  return { ...element, revision: applicationRevision(element, context.hash) };
}
