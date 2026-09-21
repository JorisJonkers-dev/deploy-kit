// The lowering (spec/v1/10-project-intent.md#the-effective-intent,
// docs/adr/model/0125). Total: every refusal it depends on fires before it.
import {
  assetIdentity,
  dependencyIdentity,
  derivedReadPath,
} from "./declaration.ts";
import type {
  Application,
  CompletePlacement,
  EnvVariable,
  EnvFile,
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
  Placement,
  Process,
  Project,
  SharedIntent,
} from "./model.ts";

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
function mergeEnv(levels: readonly SharedIntent[]): readonly EnvFile[] {
  const clusters = [
    ...new Set(
      levels.flatMap((level) => level.env.map(({ cluster }) => cluster)),
    ),
  ];
  return clusters.map((cluster) => ({
    ...(cluster === undefined ? {} : { cluster }),
    entries: levels
      .map((level): readonly EnvVariable[] =>
        level.env
          .filter((file) => file.cluster === cluster)
          .flatMap(({ entries }) => entries),
      )
      .reduce((lower, upper) => extend(lower, upper, entryIdentity(cluster))),
  }));
}

/** The lower list, extended by what the upper one names and it does not. */
function extend<T>(
  lower: readonly T[],
  upper: readonly T[],
  identity: (item: T) => string,
): readonly T[] {
  const held = new Set(lower.map(identity));
  return [...lower, ...upper.filter((item) => !held.has(identity(item)))];
}

function lowest<T>(levels: readonly (T | undefined)[]): T | undefined {
  return levels.find((value) => value !== undefined);
}

/** Each node dimension from the lowest level that set it; the quantities from
 * the Process, because a quantity is shared by nothing. */
function lowerPlacement(levels: Levels): Placement | undefined {
  const [own] = levels;
  const blocks = levels.flatMap((level) =>
    level.placement === undefined ? [] : [level.placement],
  );
  if (blocks.length === 0) return undefined;
  const lowestWith = <K extends "site" | "disk" | "gpu">(
    key: K,
  ): Placement[K] | undefined =>
    blocks.find((block) => block[key] !== undefined)?.[key];
  const site = lowestWith("site");
  const disk = lowestWith("disk");
  const gpu = lowestWith("gpu");
  return {
    ...(own.placement?.memory === undefined
      ? {}
      : { memory: own.placement.memory }),
    ...(own.placement?.cpu === undefined ? {} : { cpu: own.placement.cpu }),
    arch: blocks.find((block) => block.arch.length > 0)?.arch ?? [],
    capabilities:
      blocks.find((block) => block.capabilities.length > 0)?.capabilities ?? [],
    ...(site === undefined ? {} : { site }),
    ...(disk === undefined ? {} : { disk }),
    ...(gpu === undefined ? {} : { gpu }),
  };
}

/** Lowest first: a merge reads the levels in this order and no other. */
type Levels = readonly [SharedIntent, ...SharedIntent[]];

/** Everything a Process holds, whichever level declared it. `placement` and
 * `cutover` are keys of every Process, so they are keys here too. */
interface Merged extends Omit<SharedIntent, "placement" | "cutover"> {
  readonly placement: Placement | undefined;
  readonly cutover: SharedIntent["cutover"];
}

/** `levels` is lowest first, which is what decides every merge below. */
function merge(levels: Levels): Merged {
  const placement = lowerPlacement(levels);
  const startupBudget = lowest(levels.map((level) => level.startupBudget));
  const cutover = lowest(levels.map((level) => level.cutover));
  return {
    grants: levels
      .map((level) => level.grants)
      .reduce((lower, upper) => extend(lower, upper, derivedReadPath)),
    dependencies: levels
      .map((level) => level.dependencies)
      .reduce((lower, upper) => extend(lower, upper, dependencyIdentity)),
    assets: levels
      .map((level) => level.assets)
      .reduce((lower, upper) => extend(lower, upper, assetIdentity)),
    // A path is its own whole value, so the union is the merge.
    writablePaths: [...new Set(levels.flatMap((level) => level.writablePaths))],
    env: mergeEnv(levels),
    placement,
    cutover,
    ...(startupBudget === undefined ? {} : { startupBudget }),
  };
}

function lowerProcess(
  process: Process,
  application: Application,
  project: Project,
): EffectiveProcess {
  const { placement, cutover, ...merged } = merge([
    process,
    application,
    project,
  ]);
  return {
    ...process,
    ...merged,
    // Both are checked on the authored document, so by here they are present.
    placement: placement as CompletePlacement,
    cutover: cutover as EffectiveProcess["cutover"],
  };
}

function lowerApplication(
  application: Application,
  project: Project,
): EffectiveApplication {
  return {
    id: application.id,
    ...(application.observability === undefined
      ? {}
      : { observability: application.observability }),
    exposures: application.exposures,
    processes: application.processes.map((process) =>
      lowerProcess(process, application, project),
    ),
  };
}

/** Project Intent, with every shared declaration on the Process that holds it. */
export function lowerProject(project: Project): EffectiveProject {
  return {
    name: project.name,
    owner: project.owner,
    applications: project.applications.map((application) =>
      lowerApplication(application, project),
    ),
  };
}
