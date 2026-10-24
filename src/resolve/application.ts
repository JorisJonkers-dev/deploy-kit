// One lowered Application to its element of the Resolved Deployment
// (spec/v1/20-resolved-deployment.md#the-model): its Processes, its exposure,
// its Reconcile Unit, the release-gate inputs a blue/green switch reads, and
// the revision that names this release of it.
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import { inSeconds, seconds } from "../model/durations.ts";
import type { Hasher } from "../model/hasher.ts";
import type {
  ReleaseGate,
  ResolvedApplicationDocument,
  ResolvedExposure,
  ResolvedMigration,
  ResolvedProcess,
} from "../model/resolved-deployment.ts";
import type { MigrationProofDocument } from "../model/migration-proof.ts";
import { applicationRevision } from "../model/revision.ts";
import {
  ownsDatabases,
  reachesDatabase,
} from "../model/project-intent-queries.ts";
import { unitOf } from "../model/reconcile-units.ts";
import {
  holds,
  type PlatformIntentDocument,
} from "../model/platform-intent.ts";

type Tier = PlatformIntentDocument["tiers"][number];
import { exports, namespaceOf } from "../model/runtime-profiles.ts";
import { resolveExposure } from "./exposure.ts";
import { clientGrantsOf, resolveClient } from "./client.ts";
import { resolveMesh } from "./mesh.ts";
import { managed } from "./database.ts";
import { resolveMigration } from "./migration.ts";
import { egressOf, ingressOf } from "./policy.ts";
import { resolveProcess, type ProcessContext } from "./process.ts";

/** An Application's element: the projection without its document header and provenance. */
export type ResolvedElement = Omit<
  ResolvedApplicationDocument,
  "apiVersion" | "kind" | "provenance"
>;

export interface ApplicationContext extends Omit<
  ProcessContext,
  "machinery" | "migratesItself" | "application" | "clientGrants"
> {
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
 * or a credential one's backup holds, for its off-cluster copy or its peer.
 * Each is read from the Secret Store the platform names, or the set was
 * refused before resolution.
 */
function storeFor({ store }: ApplicationContext): string {
  // A platform with no Secret Store holds nothing that reads one, or
  // E_NO_SECRET_STORE refused it.
  return store as string;
}

const synced = (processes: readonly ResolvedProcess[]): boolean =>
  processes.some(
    ({ secrets, vpn, volumes }) =>
      secrets !== undefined ||
      vpn !== undefined ||
      volumes?.some(
        ({ backup }) =>
          backup?.credential !== undefined || backup?.peer !== undefined,
      ) === true,
  );

/**
 * The units that must be Ready first: every other project a required edge
 * reaches, the Secret Store's Project wherever a Process holds a grant, and
 * the Project that declares each proxy an exposure's tier names
 * (spec/v1/20-resolved-deployment.md#the-reconcile-unit). An optional edge
 * orders nothing (spec/v1/55-delivery.md#release-order), so two projects that
 * name each other optionally never wait on each other.
 */
function reconcileAfter(
  application: EffectiveApplication,
  context: ApplicationContext,
  exposure: readonly ResolvedExposure[],
): string[] {
  const providers = application.processes.flatMap(({ dependsOn }) =>
    // A missing list and any fallback resolve no provider alike.
    // Stryker disable next-line ArrayDeclaration
    (dependsOn ?? [])
      .filter(({ required }) => required !== false)
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
    (process) =>
      (process.secrets ?? []).length > 0 ||
      // A Client's credential is read, or written by the provider, through a
      // role of the Process's own.
      clientGrantsOf(process, application, context).length > 0 ||
      // The VPN's credential is held by the Process's own role.
      process.vpn !== undefined ||
      // An edge to a database derives a credential, whose role is written first.
      // Stryker disable next-line ArrayDeclaration
      (process.dependsOn ?? []).some((edge) =>
        reachesDatabase(edge, context.union),
      ),
  );
  // A datastore that applies its own catalog runs a method whose role is
  // written first (spec/v1/16-dependencies.md#applying-the-catalog).
  const catalog =
    context.platform.policyJob !== undefined &&
    application.processes.some(
      (process) =>
        ownsDatabases(process) &&
        // E_NO_ENGINE_POLICY refused an engine the platform has no entry for.
        (
          context.platform.engines[
            process.engine as NonNullable<typeof process.engine>
          ] as NonNullable<
            (typeof context.platform.engines)[NonNullable<
              typeof process.engine
            >]
          >
        ).catalog !== undefined,
    );
  // A migration holds the owner credential, so its role is written first too.
  const held = grants || catalog || managed(application);
  // Each Project writes its own roles; what it waits on is the Secret Store
  // they are written into, which its Platform Project's unit brings up.
  // E_NO_SECRET_STORE refuses a holder under a platform that names no store,
  // and a catalog is derived only beside one, so a held Application always
  // finds it.
  // The worked Secret Store's Project holds that one Application, so `every`
  // finds the same Project.
  // Stryker disable MethodExpression
  const store = context.union.find(({ project, applications }) =>
    applications.some(({ id }) =>
      holds(context.platform.secretStore, project, id),
    ),
  )?.project;
  // Stryker restore MethodExpression
  const secrets =
    // Stryker disable next-line ConditionalExpression: as above.
    held && store !== undefined && store !== context.project
      ? [unitOf(store)]
      : [];
  // A route needs its tier's proxy, which the Project that declares it brings
  // up; the route is in this Project's own unit
  // (spec/v1/20-resolved-deployment.md#the-reconcile-unit).
  const proxies = exposure.flatMap(({ tier }) => {
    // E_NO_TIER_FOR_AUDIENCE refused an exposure no tier carries.
    const proxy = (
      context.platform.tiers.find(({ name }) => name === tier) as Tier
    ).traefik;
    // E_UNKNOWN_TIER_PROXY refused a proxy no project file declares.
    const edge = (
      context.union.find(({ project, applications }) =>
        applications.some(({ id }) => holds(proxy, project, id)),
      ) as EffectiveProject
    ).project;
    return edge === context.project ? [] : [unitOf(edge)];
  });
  return [...new Set([...providers, ...secrets, ...proxies])].sort();
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

type Provider = NonNullable<ReleaseGate["members"][number]["waitsFor"]>[number];

/** Whether a Process switches stop-start: it serves, and its owner accepted the gap. */
const stopsToStart = ({ lifecycle, cutover }: EffectiveProcess): boolean =>
  lifecycle === "application" && cutover === "interrupted";

/**
 * What a member waits for before its new version starts
 * (spec/v1/55-delivery.md#release-order): every Process of another Application
 * of its own Project that one of its required edges reaches and that switches
 * stop-start. A provider in another Project is its Reconcile Unit's to order,
 * and a blue-green one keeps its old version serving.
 */
function waitsForOf(
  process: EffectiveProcess,
  { union, project }: ApplicationContext,
): Provider[] {
  // The member's own Application is among them, and holds no stop-start
  // Process: an Application switches as one, or E_RELEASE_UNIT_MIXED_CUTOVER
  // refused it.
  const siblings = union
    .filter((candidate) => candidate.project === project)
    .flatMap(({ applications }) => applications);
  // A missing list and any fallback reach no provider alike.
  // Stryker disable next-line ArrayDeclaration
  const providers = (process.dependsOn ?? [])
    .filter(({ required }) => required !== false)
    .flatMap((edge) =>
      siblings
        .filter(({ id }) => id === edge.application)
        .flatMap(({ id, processes }) =>
          processes
            .filter(
              (provider) =>
                provider.provides?.[edge.surface] !== undefined &&
                stopsToStart(provider),
            )
            .map((provider) => ({ application: id, process: provider.name })),
        ),
    );
  // Two edges to one provider, on two of its surfaces, wait for it once. The
  // key sorts by Application, then Process: a space sorts before any character
  // a name may hold.
  const unique = new Map(
    providers.map((provider) => [
      `${provider.application} ${provider.process}`,
      provider,
    ]),
  );
  return [...unique.keys()].sort().map((key) => unique.get(key) as Provider);
}

/**
 * The release-gate inputs a blue/green switch reads
 * (spec/v1/20-resolved-deployment.md#the-release-gate): one member per
 * blue/green Process that publishes readiness, with what it waits for, the
 * platform's analysis cadence, and the slowest member's deadline.
 */
function releaseGateOf(
  pairs: readonly Resolved[],
  context: ApplicationContext,
  plan: ResolvedMigration | undefined,
  client: EffectiveApplication["client"],
): ReleaseGate | undefined {
  const { platform, gate } = context;
  const gated = pairs.filter(
    ({ resolved }) => resolved.switchover === "blue-green",
  );
  if (gated.length === 0) return undefined;
  const members = gated.filter(
    ({ process }) => readinessOf(process) !== undefined,
  );
  // A member publishes readiness, or E_RELEASE_UNIT_NO_READINESS refused the
  // Application.
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
    members: members.map(({ process }) => {
      const waitsFor = waitsForOf(process, context);
      return {
        process: process.name,
        readiness: readinessOf(process) as Probe,
        ...(exports(process.runtime)
          ? { checks: ["error-rate" as const, "latency" as const] }
          : {}),
        ...(waitsFor.length === 0 ? {} : { waitsFor }),
      };
    }),
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
    // What the gate asks anonymously before it switches a native Client, which
    // signs people in itself (spec/v1/17-sign-in.md#what-is-checked). A native
    // Client names the path, or E_CLIENT_FIELD_FOR_MODE refused it.
    ...(client?.signIn === "native"
      ? { protectedPath: client.protectedPath as string }
      : {}),
  };
}

export function resolveApplication(
  application: EffectiveApplication,
  context: ApplicationContext,
): ResolvedElement {
  const machinery =
    context.platform.delivery?.machinery.includes(
      `${context.projectOf.get(application.id) as string}/${application.id}`,
    ) === true;
  const pairs = application.processes.map((process) => {
    const ingress = ingressOf(process, application, context);
    const clientGrants = clientGrantsOf(process, application, context);
    return {
      process,
      resolved: {
        ...resolveProcess(process, {
          ...context,
          machinery,
          migratesItself: application.migration === "self",
          application: application.id,
          clientGrants,
        }),
        ...(ingress.length === 0 ? {} : { ingress }),
        egress: egressOf(process, context, clientGrants.length > 0),
      },
    };
  });
  const processes = pairs.map(({ resolved }) => resolved);
  const exposure =
    application.exposure === undefined
      ? undefined
      : resolveExposure(application, context.platform, context.union);
  const client = resolveClient(application, context.project);
  const mesh = resolveMesh(context.platform, context.project);
  const after = reconcileAfter(application, context, exposure ?? []);
  const plan = managed(application)
    ? resolveMigration(application, context)
    : undefined;
  const gate = releaseGateOf(pairs, context, plan, application.client);
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
    ...(exposure === undefined ? {} : { exposure }),
    ...(client === undefined ? {} : { client }),
    ...(mesh === undefined ? {} : { mesh }),
    processes,
  };
  return { ...element, revision: applicationRevision(element, context.hash) };
}
