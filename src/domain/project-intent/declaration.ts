// What makes two declarations of a Shared Intent family the same one, and what
// makes a second declaration a duplicate rather than a replacement
// (spec/v1/10-project-intent.md#sharing-merges-and-a-duplicate-is-refused).
import type { Asset, Dependency, Grant } from "./model.ts";

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
export const dependencyIdentity = (edge: Dependency): string =>
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
