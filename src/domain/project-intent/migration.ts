// What a project's migration derives (spec/v1/10-project-intent.md#migration):
// the names the database catalog gives a project's roles, and which engines
// own databases whose consumers derive one.
import type { Engine } from "./vocabularies.ts";

const DATABASE_OWNING_ENGINES: ReadonlySet<Engine | undefined> = new Set([
  "postgres",
]);

/** Whether a Process's inbound edges derive a database (spec/v1/16-dependencies.md#the-database-catalog). */
export const ownsDatabases = (process: {
  readonly engine?: Engine | undefined;
}): boolean => DATABASE_OWNING_ENGINES.has(process.engine);

/** The role that may change a project's schema, which only its migration holds. */
export const ownerRole = (project: string): string => `${project}-owner`;
