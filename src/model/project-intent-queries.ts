// Queries over Project Intent, shared by the checks and the lowering: what makes
// two declarations of a Shared Intent family the same one, what makes a second
// declaration a duplicate rather than a replacement
// (spec/v1/10-project-intent.md#sharing-merges-and-a-duplicate-is-refused), the
// lowest level's answer to a question, and what a migration derives
// (spec/v1/10-project-intent.md#migration). Pure: nothing here builds a target.
import {
  SHARED_INTENT_KEYS,
  type Asset,
  type DependencyEdge,
  type Grant,
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

/** The role that may change a project's schema, which only its migration holds. */
export const ownerRole = (project: string): string => `${project}-owner`;
