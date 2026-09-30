// The lowering (spec/v1/10-project-intent.md#the-effective-intent,
// docs/adr/model/0012-shared-intent-descends-and-is-lowered.md): Project Intent
// and the env files beside it in, the Effective Intent out. Total: every
// refusal it depends on fires before it, in check/project.ts. The mappings are
// named as the model-driven implementation's `lower.qvto` names them.
import type {
  CompletePlacement,
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import type { ScopedEnv } from "../model/env.ts";
import type {
  ApplicationDocument,
  EnvFile,
  EnvVariable,
  Placement,
  ProcessDocument,
  ProjectIntentDocument,
  SharedIntent,
} from "../model/project-intent.ts";
import {
  assetIdentity,
  dependencyIdentity,
  derivedReadPath,
  lowest,
  NODE_DIMENSIONS,
  withoutShared,
} from "../model/project-intent-queries.ts";

/** One level of the project file, with the env files its scope directory holds. */
interface Level extends SharedIntent {
  readonly env: readonly EnvFile[];
}

/** Lowest first: every merge reads the levels in this order and no other. */
type Levels = readonly [Level, ...Level[]];

/** The first item of each identity, in order: lowest level first, so the lower
 * declaration holds, and an item a level names twice is held once. */
function distinct<T>(items: readonly T[], identity: (item: T) => string): T[] {
  const held = new Set<string>();
  return items.filter((item) => {
    const key = identity(item);
    if (held.has(key)) return false;
    held.add(key);
    return true;
  });
}

/** A family's lists, merged lowest first; absent where no level declares one. */
function mergeEntries<T>(
  lists: readonly (readonly T[] | undefined)[],
  identity: (item: T) => string,
): T[] | undefined {
  const merged = distinct(
    lists.flatMap((list) => list ?? []),
    identity,
  );
  return merged.length === 0 ? undefined : merged;
}

/** A variable is one declaration within one Cluster Target, and not across two. */
const entryIdentity =
  (cluster: string | undefined) =>
  (entry: EnvVariable): string =>
    JSON.stringify([cluster, entry.name]);

/**
 * One file per Cluster Target, its entries extended by every scope above. Base
 * and overlay stay apart: which of them holds is a question only a render for a
 * named cluster can answer.
 */
function envFor(levels: Levels): readonly EnvFile[] {
  const clusters = [
    ...new Set(
      levels.flatMap((level) => level.env.map(({ cluster }) => cluster)),
    ),
  ];
  return clusters.map((cluster) => ({
    ...(cluster === undefined ? {} : { cluster }),
    entries: distinct(
      levels.flatMap((level) =>
        level.env
          .filter((file) => file.cluster === cluster)
          .flatMap(({ entries }) => entries),
      ),
      entryIdentity(cluster),
    ),
  }));
}

/** Each node dimension from the lowest level that set it; the quantities from
 * the Process, because a quantity is shared by nothing. */
function lowerPlacement(levels: Levels): CompletePlacement {
  const dimension = <K extends keyof Placement>(
    key: K,
  ): Placement[K] | undefined =>
    lowest(levels.map((level) => level.placement?.[key]));
  const placement: Placement = {};
  for (const key of NODE_DIMENSIONS) {
    const value = dimension(key);
    if (value !== undefined) Object.assign(placement, { [key]: value });
  }
  const { memory, cpu } = levels[0].placement ?? {};
  // Both quantities are checked on the Process itself before the lowering runs.
  return {
    ...placement,
    ...(memory === undefined ? {} : { memory }),
    ...(cpu === undefined ? {} : { cpu }),
  } as CompletePlacement;
}

/** Every shared family a Process holds, whichever level declared it. */
function lowerShared(
  levels: Levels,
  serves: boolean,
): Omit<EffectiveProcess, keyof Omit<ProcessDocument, keyof SharedIntent>> {
  const secrets = mergeEntries(
    levels.map((level) => level.secrets),
    derivedReadPath,
  );
  const dependsOn = mergeEntries(
    levels.map((level) => level.dependsOn),
    dependencyIdentity,
  );
  const assets = mergeEntries(
    levels.map((level) => level.assets),
    assetIdentity,
  );
  // A path is its own whole value, so the union is the merge.
  const writablePaths = mergeEntries(
    levels.map((level) => level.writablePaths),
    (path) => path,
  );
  const env = envFor(levels);
  const startupBudget = lowest(levels.map((level) => level.startupBudget));
  // A prepare Process cuts over nothing, so a shared answer does not reach it.
  const cutover = serves
    ? lowest(levels.map((level) => level.cutover))
    : undefined;
  return {
    ...(secrets === undefined ? {} : { secrets }),
    ...(dependsOn === undefined ? {} : { dependsOn }),
    ...(assets === undefined ? {} : { assets }),
    ...(writablePaths === undefined ? {} : { writablePaths }),
    ...(env.length === 0 ? {} : { env }),
    placement: lowerPlacement(levels),
    ...(startupBudget === undefined ? {} : { startupBudget }),
    ...(cutover === undefined ? {} : { cutover }),
  };
}

/** One level of the file, with the env files its scope directory holds. */
const levelOf = (level: SharedIntent, env: readonly EnvFile[]): Level => ({
  ...level,
  env,
});

/** The env files a scope directory holds, by the level it names. */
const filesAt = (
  env: readonly ScopedEnv[],
  names: (scope: ScopedEnv["scope"]) => boolean,
): readonly EnvFile[] =>
  env.filter(({ scope }) => names(scope)).map(({ file }) => file);

function lowerProcess(
  process: ProcessDocument,
  above: readonly [Level, Level],
  env: readonly ScopedEnv[],
): EffectiveProcess {
  const level = levelOf(
    process,
    filesAt(
      env,
      // Stryker disable next-line ConditionalExpression: only a Process scope
      // has a name, so the level test narrows the type and decides nothing.
      (scope) => scope.level === "process" && scope.name === process.name,
    ),
  );
  return {
    ...withoutShared(process),
    ...lowerShared([level, ...above], process.lifecycle !== "prepare"),
  };
}

function lowerApplication(
  application: ApplicationDocument,
  project: Level,
  env: readonly ScopedEnv[],
): EffectiveApplication {
  const { processes, ...own } = application;
  const level = levelOf(
    application,
    filesAt(
      env,
      // Stryker disable next-line ConditionalExpression: only an Application
      // scope has an id, so the level test narrows the type and decides nothing.
      (scope) => scope.level === "application" && scope.id === application.id,
    ),
  );
  return {
    ...withoutShared(own),
    processes: processes.map((process) =>
      lowerProcess(process, [level, project], env),
    ),
  };
}

/** Project Intent, with every shared declaration on the Process that holds it. */
export function lowerProject(
  document: ProjectIntentDocument,
  env: readonly ScopedEnv[],
): EffectiveProject {
  const project = levelOf(
    document,
    filesAt(env, (scope) => scope.level === "project"),
  );
  return {
    project: document.project,
    owner: document.owner,
    applications: document.applications.map((application) =>
      lowerApplication(application, project, env),
    ),
  };
}
