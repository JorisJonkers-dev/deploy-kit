// The lowering (spec/v1/10-project-intent.md#the-effective-intent,
// docs/adr/model/0125). Total: every refusal it depends on fires before it.
import type {
  Application,
  Asset,
  CompletePlacement,
  Dependency,
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
  Grant,
  Placement,
  Process,
  Project,
  SharedIntent,
} from "./model.ts";

/** The derived read path, so a `kv` grant and a `database` grant never collide. */
function grantIdentity(grant: Grant): string {
  if ("path" in grant) return `secret/data/${grant.path}`;
  if (grant.engine === "database") return `database/creds/${grant.role}`;
  return `transit/${grant.key}`;
}

/** `required` is excluded: the same edge declared twice is one declaration. */
const dependencyIdentity = (edge: Dependency): string =>
  `${edge.application}#${edge.surface}`;

const assetIdentity = (asset: Asset): string => asset.mountAt;

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
function lowerPlacement(
  levels: readonly SharedIntent[],
): Placement | undefined {
  const own = levels[0]?.placement;
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
    ...(own?.memory === undefined ? {} : { memory: own.memory }),
    ...(own?.cpu === undefined ? {} : { cpu: own.cpu }),
    arch: blocks.find((block) => block.arch.length > 0)?.arch ?? [],
    capabilities:
      blocks.find((block) => block.capabilities.length > 0)?.capabilities ?? [],
    ...(site === undefined ? {} : { site }),
    ...(disk === undefined ? {} : { disk }),
    ...(gpu === undefined ? {} : { gpu }),
  };
}

/** `levels` is lowest first, which is what decides every merge below. */
function merge(levels: readonly SharedIntent[]): SharedIntent {
  const placement = lowerPlacement(levels);
  const startupBudget = lowest(levels.map((level) => level.startupBudget));
  const cutover = lowest(levels.map((level) => level.cutover));
  return {
    grants: levels
      .map((level) => level.grants)
      .reduce((lower, upper) => extend(lower, upper, grantIdentity)),
    dependencies: levels
      .map((level) => level.dependencies)
      .reduce((lower, upper) => extend(lower, upper, dependencyIdentity)),
    assets: levels
      .map((level) => level.assets)
      .reduce((lower, upper) => extend(lower, upper, assetIdentity)),
    // A path is its own whole value, so the union is the merge.
    writablePaths: [...new Set(levels.flatMap((level) => level.writablePaths))],
    ...(placement === undefined ? {} : { placement }),
    ...(startupBudget === undefined ? {} : { startupBudget }),
    ...(cutover === undefined ? {} : { cutover }),
  };
}

function lowerProcess(
  process: Process,
  application: Application,
  project: Project,
): EffectiveProcess {
  const merged = merge([process, application, project]);
  return {
    ...process,
    ...merged,
    // Both are checked on the authored document, so by here they are present.
    placement: merged.placement as CompletePlacement,
    cutover: merged.cutover as EffectiveProcess["cutover"],
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
