// Queries over Project Intent, shared by the checks and the lowering: what makes
// two declarations of a Shared Intent family the same one, what makes a second
// declaration a duplicate rather than a replacement
// (spec/v1/10-project-intent.md#sharing-merges-and-a-duplicate-is-refused), the
// lowest level's answer to a question, and what a migration derives
// (spec/v1/10-project-intent.md#migration). Pure: nothing here builds a target.
import {
  SHARED_INTENT_KEYS,
  type Asset,
  type ApplicationDocument,
  type DependencyEdge,
  type Grant,
  type KvKey,
  type SharedIntent,
  type SharedIntentKey,
} from "./project-intent.ts";
import type { Engine } from "./vocabularies.ts";

/**
 * The path a grant is read from, which is its identity: a `kv` grant and a
 * `database` grant naming one string never collide
 * (spec/v1/10-project-intent.md#secrets).
 */
export function derivedReadPath(grant: Grant): string {
  if ("path" in grant) return `secret/data/${grant.path}`;
  if (grant.engine === "database") return `database/creds/${grant.role}`;
  return `transit/${grant.key}`;
}

type Exposure = NonNullable<ApplicationDocument["exposure"]>[number];

/**
 * The exposure an Application's Client names, or the only one it declares
 * (spec/v1/17-sign-in.md#the-client-block): authored or lowered alike.
 */
export function clientExposure(
  application: Pick<ApplicationDocument, "exposure">,
  client: Pick<NonNullable<ApplicationDocument["client"]>, "exposure">,
): Exposure | undefined {
  const exposures = application.exposure ?? [];
  const named = client.exposure;
  if (named !== undefined) return exposures.find(({ name }) => name === named);
  return exposures.length === 1 ? exposures[0] : undefined;
}

/**
 * The Route of an exposure a request for `path` takes: of the Routes that
 * reach a Process, the longest whose path opens it under `prefix` or is it
 * under `exact`, the first declared on a tie
 * (spec/v1/17-sign-in.md#what-is-checked). A redirect Route reaches none.
 */
export function routeFor(
  exposure: Pick<Exposure, "routes">,
  path: string,
): Exposure["routes"][number] | undefined {
  let found: Exposure["routes"][number] | undefined;
  for (const route of exposure.routes) {
    const reaches =
      route.redirectTo === undefined &&
      (route.match === "exact"
        ? path === route.path
        : path.startsWith(route.path));
    if (
      reaches &&
      (found === undefined || route.path.length > found.path.length)
    )
      found = route;
  }
  return found;
}

/** A key's name, whether or not it is generated. */
export const keyName = (key: KvKey): string =>
  typeof key === "string" ? key : key.name;

/** What a generated key is when its `generate` leaves a field unsaid. */
export const GENERATED_DEFAULTS = { bytes: 32, encoding: "hex" } as const;

/** `required` is excluded: the same edge declared twice is one declaration. */
export const dependencyIdentity = (edge: DependencyEdge): string =>
  `${edge.application}#${edge.surface}`;

/** Two files cannot arrive at one path. */
export const assetIdentity = (asset: Asset): string => asset.mountAt;

/**
 * What a level declared of a many-valued family: a level that left it out
 * declared none of it, which is what makes a merge total.
 */
export const declared = <T>(value: readonly T[] | undefined): readonly T[] =>
  value ?? [];

/** A value with its object keys in a fixed order, so two of them compare. */
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (typeof value !== "object" || value === null) return value;
  // A term set to nothing needs no filter: JSON.stringify drops it.
  return Object.fromEntries(
    Object.entries(value)
      .sort(([one], [other]) => one.localeCompare(other))
      .map(([key, held]) => [key, ordered(held)]),
  );
}

/**
 * Whether two declarations state the same thing, term for term. Every term
 * counts, so a grant on one path with a different `access` or `rotation` is a
 * replacement and only an identical restatement is a duplicate.
 */
export const sameDeclaration = (one: unknown, other: unknown): boolean =>
  JSON.stringify(ordered(one)) === JSON.stringify(ordered(other));

/** The node dimensions, which is what a level above a Process may share. */
export const NODE_DIMENSIONS = [
  "arch",
  "site",
  "disk",
  "gpu",
  "capabilities",
] as const;

/** A level with the shared families taken off, which is what defines it. */
export const withoutShared = <T extends SharedIntent>(
  level: T,
): Omit<T, SharedIntentKey> =>
  Object.fromEntries(
    Object.entries(level).filter(
      ([key]) => !(SHARED_INTENT_KEYS as readonly string[]).includes(key),
    ),
  ) as Omit<T, SharedIntentKey>;

/** The value the lowest level states, or none if no level states one. */
export const lowest = <T>(levels: readonly (T | undefined)[]): T | undefined =>
  levels.find((value) => value !== undefined);

/** The lowest level's answer to the cutover question, levels lowest first. */
export const effectiveCutover = (
  levels: readonly SharedIntent[],
): SharedIntent["cutover"] => lowest(levels.map(({ cutover }) => cutover));

const DATABASE_OWNING_ENGINES: ReadonlySet<Engine | undefined> = new Set([
  "postgres",
]);

/** Whether a Process's inbound edges derive a database (spec/v1/16-dependencies.md#the-database-catalog). */
export const ownsDatabases = (process: {
  readonly engine?: Engine | undefined;
}): boolean => DATABASE_OWNING_ENGINES.has(process.engine);

/** Whether a Process's inbound edges derive buckets (spec/v1/16-dependencies.md#the-bucket-catalog). */
export const ownsBuckets = (process: {
  readonly engine?: Engine | undefined;
}): boolean => process.engine === "s3";

/** The name of the Process whose engine owns buckets that an edge reaches, where it reaches one. */
export const bucketStoreOf = (
  edge: DependencyEdge,
  union: readonly {
    readonly applications: readonly {
      readonly id: string;
      readonly processes: readonly {
        readonly name: string;
        readonly engine?: Engine | undefined;
        readonly provides?: Readonly<Record<string, number>> | undefined;
      }[];
    }[];
  }[],
): string | undefined =>
  union
    .flatMap(({ applications }) => applications)
    .filter(({ id }) => id === edge.application)
    .flatMap(({ processes }) => processes)
    .find(
      (provider) =>
        ownsBuckets(provider) &&
        provider.provides?.[edge.surface] !== undefined,
    )?.name;

/** The bucket a project's edge names, as the object store holds it. */
export const bucketOf = (project: string, name: string): string =>
  `${project}-${name}`;

/** The role that may change a project's schema, which only its migration holds. */
export const ownerRole = (project: string): string => `${project}-owner`;

/** The role that reads and writes a project's data. */
export const dataRole = (project: string): string => `${project}-data`;

/** Whether an edge reaches a surface of a Process whose engine owns databases. */
export const reachesDatabase = (
  edge: DependencyEdge,
  union: readonly {
    readonly applications: readonly {
      readonly id: string;
      readonly processes: readonly {
        readonly engine?: Engine | undefined;
        readonly provides?: Readonly<Record<string, number>> | undefined;
      }[];
    }[];
  }[],
): boolean =>
  union.some(({ applications }) =>
    applications.some(
      ({ id, processes }) =>
        id === edge.application &&
        processes.some(
          (provider) =>
            ownsDatabases(provider) &&
            provider.provides?.[edge.surface] !== undefined,
        ),
    ),
  );
