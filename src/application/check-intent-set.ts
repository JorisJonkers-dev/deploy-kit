// A set of authored files read together: every file parsed on its own, and,
// where one Platform document is among them, the rules the documents answer
// together. A file is a Platform document, a project file or an env file by its
// name; a set handed to the checker directly also reads a YAML file whose
// document says `kind: Project` as a project file. An env file reaches the
// project its `env/` directory sits beside.
import {
  dashboardDiagnostics,
  duplicateUidDiagnostics,
  type Placed,
} from "../check/dashboards.ts";
import { alertRuleDiagnostics } from "../check/alert-rules.ts";
import { assetDiagnostics } from "../check/assets.ts";
import { setDiagnostics } from "../check/composition.ts";
import {
  departuresOf,
  moveOpenDiagnostics,
  restored,
  type Departing,
} from "../check/departures.ts";
import { unionDiagnostics } from "../check/union.ts";
import type { ClusterStateDocument } from "../model/cluster-state.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { EnvSource } from "../model/env.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import { nodeAgentPolicyRefusals } from "../check/pinned-inputs.ts";
import { readClusterState, readNodeContract } from "../read/pinned-inputs.ts";
import { readYaml } from "../read/yaml.ts";
import {
  parsePlatformIntent,
  type ParsedPlatformIntent,
} from "./parse-platform-intent.ts";
import {
  parseProjectIntent,
  type ParsedProjectIntent,
} from "./parse-project-intent.ts";

export interface AuthoredFile {
  readonly name: string;
  readonly text: string;
}

/** The Platform document, and every project lowered to its Effective Intent. */
export interface IntentSet {
  readonly platform?: PlatformIntentDocument;
  readonly projects: readonly EffectiveProject[];
}

type Parsed<R> = Extract<R, { readonly ok: true }>;

const PLATFORM = "platform.intent.yml";
const PROJECT = ".project.yml";
const YAML = ".yml";
const ENV = ".env";
const CLUSTER_STATE = "cluster-state.yml";
const NODE_CONTRACT = "node-contract.yml";

/**
 * Whether a file is a project file: named one, or, where `byKind`, any other
 * YAML file whose document says it is one, as a composition fixture standing
 * in for a published fragment does (spec/v1/10-project-intent.md#two-artefacts).
 * A published fragment's project file is named by the step that packed it, so
 * an Asset that happens to be YAML is never read as a second one.
 */
function isProject({ name, text }: AuthoredFile, byKind: boolean): boolean {
  if (name.endsWith(PROJECT)) return true;
  if (!byKind || !name.endsWith(YAML)) return false;
  const read = readYaml(text);
  // A scalar or a list says no kind, exactly as a mapping without one does.
  return (
    read.ok && (read.value as { kind?: unknown } | null)?.kind === "Project"
  );
}

/** Everything before a path's last segment, or nothing where it has one. */
const directoryOf = (path: string): string =>
  path.slice(0, path.lastIndexOf("/") + 1);

/**
 * The env files that belong to `project`: the ones under the `env/` directory
 * beside it, which is where a `platform/` tree puts them.
 */
function envBeside(
  project: string,
  files: readonly AuthoredFile[],
): EnvSource[] {
  const beside = `${directoryOf(project)}env/`;
  return files
    .filter(({ name }) => name.endsWith(ENV) && name.startsWith(beside))
    .map(({ name, text }) => ({ path: name, text }));
}

/** One authored file's parsed form, by the name it was read under. */
export interface Named<T> {
  readonly name: string;
  readonly value: T;
}

/** Every file of a set parsed, and the rules the set answers together, answered. */
export interface ComposedSet {
  readonly platform: Named<ParsedPlatformIntent> | undefined;
  /** Every Project, holding each Application moving between two of them once. */
  readonly projects: readonly Named<ParsedProjectIntent>[];
  /**
   * Each declaration an Application is moving out of, with its Project as
   * written, which renders the source until the Move retires it.
   */
  readonly departing: readonly (Departing & {
    readonly value: ParsedProjectIntent;
  })[];
}

/**
 * The pinned ClusterState, where the set holds one that reads: one that does
 * not is refused where the pinned inputs are read.
 */
function clusterStateOf(
  files: readonly AuthoredFile[],
): ClusterStateDocument | undefined {
  const file = files.find(({ name }) => name.endsWith(CLUSTER_STATE));
  const yaml = file === undefined ? undefined : readYaml(file.text);
  const read = yaml?.ok === true ? readClusterState(yaml.value) : undefined;
  return read?.ok === true ? read.value : undefined;
}

/** A Project as written, without the declarations composition set aside. */
function without(
  value: ParsedProjectIntent,
  name: string,
  departing: readonly Departing[],
): ParsedProjectIntent {
  const aside = departing.filter((each) => each.name === name);
  // Setting nothing aside filters nothing, so the copy below equals the value.
  // Stryker disable next-line ConditionalExpression
  if (aside.length === 0) return value;
  const ids = new Set(aside.map(({ application }) => application));
  return {
    ...value,
    document: {
      ...value.document,
      applications: value.document.applications.filter(
        ({ id }) => !ids.has(id),
      ),
    },
    effective: {
      ...value.effective,
      applications: value.effective.applications.filter(
        ({ id }) => !ids.has(id),
      ),
    },
  };
}

export function composeIntentSet(
  files: readonly AuthoredFile[],
  byKind = false,
): Result<ComposedSet> {
  const refusals: Diagnostic[] = [];
  const tagged = (name: string, diagnostics: readonly Diagnostic[]): void => {
    refusals.push(
      ...diagnostics.map((diagnostic) => ({ ...diagnostic, document: name })),
    );
  };

  const platforms = files
    .filter(({ name }) => name.endsWith(PLATFORM))
    .map(({ name, text }) => ({ name, result: parsePlatformIntent(text) }));
  const projects = files
    .filter((file) => isProject(file, byKind))
    .map(({ name, text }) => ({
      name,
      result: parseProjectIntent(text, envBeside(name, files)),
    }));

  for (const { name, result } of [...platforms, ...projects])
    if (!result.ok) tagged(name, result.diagnostics);
  if (refusals.length > 0) return { ok: false, diagnostics: refusals };

  // With no refusal left, every file parsed.
  const parsedPlatforms = platforms.map(({ name, result }) => ({
    name,
    value: (result as Parsed<typeof result>).value,
  }));
  const written = projects.map(({ name, result }) => ({
    name,
    value: (result as Parsed<typeof result>).value,
  }));
  // An Application two Projects declare while it moves between them is held
  // once, and every rule below reads the union that holds it once.
  const state = clusterStateOf(files);
  const declaring = written.map(({ name, value }) => ({
    name,
    project: value.document.project,
    applications: value.document.applications.map(({ id }) => id),
  }));
  const settled = parsedPlatforms[0]?.value.document;
  const departing =
    state === undefined || settled === undefined
      ? []
      : departuresOf(declaring, state, settled);
  const parsedProjects = written.map(({ name, value }) => ({
    name,
    value: without(value, name, departing),
  }));
  if (state !== undefined && settled !== undefined)
    refusals.push(...moveOpenDiagnostics(declaring, state, settled));

  // An Asset mounts a file the set holds beside its project file.
  for (const { name, value } of parsedProjects)
    tagged(
      name,
      assetDiagnostics(value.document, (from) =>
        files.some((file) => file.name === directoryOf(name) + from),
      ),
    );
  // A dashboard ships a file the set holds beside its project file, which
  // names a uid no other dashboard of the estate carries.
  const placed: Placed[] = [];
  for (const { name, value } of parsedProjects) {
    const shipped = dashboardDiagnostics(
      value.document,
      (from) =>
        files.find((file) => file.name === directoryOf(name) + from)?.text,
    );
    tagged(name, shipped.refusals);
    placed.push(...shipped.placed.map((each) => ({ ...each, document: name })));
  }
  refusals.push(...duplicateUidDiagnostics(placed));
  // A rule-group file is read beside its project file, and holds groups.
  for (const { name, value } of parsedProjects)
    tagged(
      name,
      alertRuleDiagnostics(
        value.document,
        (from) =>
          files.find((file) => file.name === directoryOf(name) + from)?.text,
      ),
    );
  const [platform] = parsedPlatforms;
  // Dashboards ship to the Grafana the Platform document names.
  if (platform?.value.document.telemetry?.dashboards === undefined)
    for (const { document, path } of platform === undefined ? [] : placed)
      refusals.push({
        code: "E_NO_DASHBOARD_POLICY",
        document,
        path,
        message: "the platform names no Grafana for a dashboard to ship to",
        hint: "Declare the Platform document's `telemetry.dashboards`: the Grafana instance's labels and its data source.",
      });
  refusals.push(
    ...unionDiagnostics(
      parsedProjects.map(({ name, value }) => ({
        name,
        document: value.document,
        effective: value.effective,
      })),
      platform?.value.document,
    ),
  );
  if (platform !== undefined)
    refusals.push(
      ...setDiagnostics(
        { name: platform.name, document: platform.value.document },
        parsedProjects.map(({ name, value }) => ({
          name,
          document: value.document,
        })),
      ),
    );
  if (refusals.length > 0)
    return {
      ok: false,
      diagnostics: refusals.map((diagnostic) =>
        restored(diagnostic, departing),
      ),
    };

  return {
    ok: true,
    value: {
      platform,
      projects: parsedProjects,
      departing: departing.map((each) => ({
        ...each,
        value: (
          written.find(
            ({ name }) => name === each.name,
          ) as Named<ParsedProjectIntent>
        ).value,
      })),
    },
  };
}

/**
 * What the Platform document and the node contract decide together, where the
 * set holds both (spec/v1/14-platform-intent.md#node-agents): a node contract
 * that does not read, or a Node Agent the two derive with no catalog entry.
 * Composition refuses the same, so a set `validate` accepts composes.
 */
function nodeContractDiagnostics(
  files: readonly AuthoredFile[],
  platform: Named<ParsedPlatformIntent>,
): readonly Diagnostic[] {
  const file = files.find(({ name }) => name.endsWith(NODE_CONTRACT));
  if (file === undefined) return [];
  const yaml = readYaml(file.text);
  const read = yaml.ok ? readNodeContract(yaml.value) : yaml;
  if (!read.ok)
    return read.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      document: file.name,
    }));
  return nodeAgentPolicyRefusals(
    platform.value.document,
    read.value,
    platform.name,
  );
}

export function checkIntentSet(
  files: readonly AuthoredFile[],
): Result<IntentSet> {
  const composed = composeIntentSet(files, true);
  if (!composed.ok) return composed;
  const { platform, projects } = composed.value;
  const refusals =
    platform === undefined ? [] : nodeContractDiagnostics(files, platform);
  if (refusals.length > 0) return { ok: false, diagnostics: refusals };
  return {
    ok: true,
    value: {
      ...(platform === undefined ? {} : { platform: platform.value.document }),
      projects: projects.map(({ value }) => value.effective),
    },
  };
}
