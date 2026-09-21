import type { Diagnostic, Result } from "../../domain/diagnostic.ts";
import type {
  Application,
  Dependency,
  EnvVariable,
  EnvFile,
  Exposure,
  Observability,
  Placement,
  Process,
  Project,
  SharedIntent,
} from "../../domain/project-intent/model.ts";
import type { EnvScope, ScopedEnv } from "./env.ts";
import { link, type Linked } from "./link.ts";
import { schemaDiagnostics } from "../schema-diagnostics.ts";
import { ruleDiagnostics } from "./rules.ts";
import { projectIntent, type ProjectIntentDocument } from "./schema.ts";

type WireApplication = ProjectIntentDocument["applications"][number];
type WireProcess = WireApplication["processes"][number];
type WirePlacement = NonNullable<WireProcess["placement"]>;
type WireDependency = NonNullable<WireProcess["dependsOn"]>[number];
/** The keys any of the three levels may carry, in the authored spelling. */
type WireShared = Pick<
  WireProcess,
  | "secrets"
  | "dependsOn"
  | "assets"
  | "writablePaths"
  | "placement"
  | "startupBudget"
  | "cutover"
>;

/** A dependency is required unless the document says it is not. */
function toDependency(edge: WireDependency): Dependency {
  const { required, ...rest } = edge;
  return { ...rest, required: required ?? true };
}

function toPlacement(placement: WirePlacement): Placement {
  const { arch, capabilities, ...rest } = placement;
  return { ...rest, arch: arch ?? [], capabilities: capabilities ?? [] };
}

/** The env files each scope directory holds, by the level it names. */
interface ScopedEnvFiles {
  readonly project: readonly EnvFile[];
  readonly applications: ReadonlyMap<string, readonly EnvFile[]>;
  readonly processes: ReadonlyMap<string, readonly EnvFile[]>;
}

function byScope(env: readonly ScopedEnv[]): ScopedEnvFiles {
  const applications = new Map<string, EnvFile[]>();
  const processes = new Map<string, EnvFile[]>();
  const project: EnvFile[] = [];
  for (const { scope, file } of env) {
    if (scope.level === "project") project.push(file);
    else {
      const at = scope.level === "application" ? applications : processes;
      const key = scope.level === "application" ? scope.id : scope.name;
      at.set(key, [...(at.get(key) ?? []), file]);
    }
  }
  return { project, applications, processes };
}

/** A variable is one declaration within one Cluster Target, so this is what a
 * scope below restates rather than replaces. */
const entryTerms = (cluster: string | undefined, entry: EnvVariable): string =>
  JSON.stringify([cluster ?? null, entry.name, entry.value]);

/**
 * Every variable a narrower scope restates unchanged from a wider one. The
 * refusal sits on the lower file, which is the one an author deletes a line
 * from, and names the variable, which is the declaration.
 */
function envDuplicates(
  env: readonly ScopedEnv[],
  document: ProjectIntentDocument,
): readonly Diagnostic[] {
  const of = (level: EnvScope["level"], key?: string) =>
    env.filter(
      ({ scope }) =>
        scope.level === level &&
        (key === undefined ||
          (scope.level === "application" && scope.id === key) ||
          (scope.level === "process" && scope.name === key)),
    );
  const refusals: Diagnostic[] = [];
  for (const application of document.applications)
    for (const process of application.processes) {
      const above = [
        ...of("application", application.id),
        ...of("project"),
      ].flatMap(({ file }) =>
        file.entries.map((entry) => entryTerms(file.cluster, entry)),
      );
      const wider = new Set(above);
      for (const { path, file } of of("process", process.name))
        for (const entry of file.entries)
          if (wider.has(entryTerms(file.cluster, entry)))
            refusals.push(duplicateEnv(path, entry.name));
    }
  // An Application scope against the project header, the same way.
  const project = new Set(
    of("project").flatMap(({ file }) =>
      file.entries.map((entry) => entryTerms(file.cluster, entry)),
    ),
  );
  for (const { path, file } of of("application"))
    for (const entry of file.entries)
      if (project.has(entryTerms(file.cluster, entry)))
        refusals.push(duplicateEnv(path, entry.name));
  return refusals;
}

const duplicateEnv = (path: string, name: string): Diagnostic => ({
  code: "E_SHARED_DECLARATION_DUPLICATED",
  path,
  message: `${name} is set again, to the same value, by a scope above this one`,
  hint: "Delete this line, or change it: a narrower scope replaces a wider one, and a restatement does nothing.",
});

/** Every scope directory that names no Application and no Process. */
export function unknownScopes(
  env: readonly ScopedEnv[],
  document: ProjectIntentDocument,
): readonly ScopedEnv[] {
  const applications = new Set(document.applications.map(({ id }) => id));
  const processes = new Set(
    document.applications.flatMap(({ processes }) =>
      processes.map(({ name }) => name),
    ),
  );
  return env.filter(
    ({ scope }) =>
      (scope.level === "application" && !applications.has(scope.id)) ||
      (scope.level === "process" && !processes.has(scope.name)),
  );
}

/** What one level declares. Nothing is merged here; the lowering does that. */
function toSharedIntent(
  level: WireShared,
  env: readonly EnvFile[],
): SharedIntent {
  const {
    secrets,
    dependsOn,
    assets,
    writablePaths,
    placement,
    startupBudget,
    cutover,
  } = level;
  return {
    grants: secrets ?? [],
    dependencies: (dependsOn ?? []).map(toDependency),
    assets: assets ?? [],
    writablePaths: writablePaths ?? [],
    env,
    ...(placement === undefined ? {} : { placement: toPlacement(placement) }),
    ...(startupBudget === undefined ? {} : { startupBudget }),
    ...(cutover === undefined ? {} : { cutover }),
  };
}

function toProcess(process: WireProcess, env: ScopedEnvFiles): Process {
  const {
    provides,
    probes,
    sidecars,
    volumes,
    secrets: _secrets,
    dependsOn: _dependsOn,
    assets: _assets,
    writablePaths: _writablePaths,
    placement: _placement,
    startupBudget: _startupBudget,
    cutover: _cutover,
    ...rest
  } = process;
  return {
    ...rest,
    ...toSharedIntent(process, env.processes.get(process.name) ?? []),
    surfaces: Object.entries(provides ?? {}).map(([name, port]) => ({
      name,
      port,
    })),
    sidecars: sidecars ?? [],
    probes: probes ?? {},
    volumes: volumes ?? [],
  };
}

type Resolved = Extract<Linked, { readonly ok: true }>;

/** An Application with its routes and scrape linked to its own Processes, or the refusals of what did not link. */
function toApplication(
  application: WireApplication,
  at: string,
  env: ScopedEnvFiles,
):
  | { readonly application: Application; readonly refusals: readonly [] }
  | { readonly refusals: readonly Diagnostic[] } {
  const {
    exposure,
    processes,
    observability,
    secrets: _secrets,
    dependsOn: _dependsOn,
    assets: _assets,
    writablePaths: _writablePaths,
    placement: _placement,
    startupBudget: _startupBudget,
    cutover: _cutover,
    ...rest
  } = application;
  const linked = processes.map((process) => toProcess(process, env));
  const exposures = exposure ?? [];

  const linkedExposures = exposures.map((wire, index) => ({
    wire,
    routes: wire.routes.map(({ process, surface, ...fields }, position) => ({
      fields,
      result: link(
        { process, surface },
        linked,
        `${at}/exposure/${index}/routes/${position}`,
      ),
    })),
  }));
  const scrape = observability?.scrape;
  const scrapeLinks =
    scrape === undefined
      ? []
      : [link(scrape, linked, `${at}/observability/scrape`)];
  const refusals = [
    ...linkedExposures.flatMap(({ routes }) =>
      routes.map(({ result }) => result),
    ),
    ...scrapeLinks,
  ].flatMap((result) => (result.ok ? [] : [result.diagnostic]));
  if (refusals.length > 0) return { refusals };

  const resolved = (result: Linked | undefined): Resolved["value"] =>
    (result as Resolved).value;
  let monitoring: Observability | undefined;
  if (observability !== undefined) {
    const { scrape: _written, ...fields } = observability;
    monitoring =
      scrape === undefined
        ? fields
        : {
            ...fields,
            scrape: { ...resolved(scrapeLinks[0]), path: scrape.path },
          };
  }

  return {
    application: {
      ...rest,
      ...toSharedIntent(
        application,
        env.applications.get(application.id) ?? [],
      ),
      ...(monitoring === undefined ? {} : { observability: monitoring }),
      exposures: linkedExposures.map(({ wire, routes }): Exposure => ({
        ...wire,
        routes: routes.map(({ fields, result }) => ({
          ...fields,
          ...resolved(result),
        })),
      })),
      processes: linked,
    },
    refusals: [],
  };
}

export interface ValidatedProjectIntent {
  readonly document: ProjectIntentDocument;
  readonly project: Project;
}

export function validateProjectIntent(
  value: unknown,
  env: readonly ScopedEnv[] = [],
): Result<ValidatedProjectIntent> {
  const parsed = projectIntent.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      diagnostics: schemaDiagnostics(
        parsed.error,
        "spec/v1/10-project-intent.md",
      ),
    };
  const { project, owner, applications } = parsed.data;
  const scoped = byScope(env);
  const mapped = applications.map((application, index) =>
    toApplication(application, `/applications/${index}`, scoped),
  );
  const refusals = [
    ...ruleDiagnostics(parsed.data),
    ...mapped.flatMap(({ refusals: unlinked }) => unlinked),
    ...envDuplicates(env, parsed.data),
    ...unknownScopes(env, parsed.data).map(({ path }) => ({
      code: "E_UNKNOWN_ENV_SCOPE",
      path,
      message: "this scope directory names nothing the project file declares",
      hint: "A directory is how a variable reaches a level: name an Application or a Process the project file declares.",
    })),
  ];
  if (refusals.length > 0) return { ok: false, diagnostics: refusals };
  return {
    ok: true,
    value: {
      document: parsed.data,
      project: {
        name: project,
        owner,
        ...toSharedIntent(parsed.data, scoped.project),
        // With no refusal left, every Application linked.
        applications: mapped.map(
          (result) =>
            (result as { readonly application: Application }).application,
        ),
      },
    },
  };
}
