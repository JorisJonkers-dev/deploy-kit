// A set of authored files read together: every file parsed on its own, and,
// where one Platform document is among them, the rules the documents answer
// together. A file is a Platform document, a project file or an env file by its
// name; a set handed to the checker directly also reads a YAML file whose
// document says `kind: Project` as a project file. An env file reaches the
// project its `env/` directory sits beside.
import { assetDiagnostics } from "../check/assets.ts";
import { setDiagnostics } from "../check/composition.ts";
import { unionDiagnostics } from "../check/union.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { EnvSource } from "../model/env.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
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
  readonly projects: readonly Named<ParsedProjectIntent>[];
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
  const parsedProjects = projects.map(({ name, result }) => ({
    name,
    value: (result as Parsed<typeof result>).value,
  }));

  // An Asset mounts a file the set holds beside its project file.
  for (const { name, value } of parsedProjects)
    tagged(
      name,
      assetDiagnostics(value.document, (from) =>
        files.some((file) => file.name === directoryOf(name) + from),
      ),
    );
  const [platform] = parsedPlatforms;
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
  if (refusals.length > 0) return { ok: false, diagnostics: refusals };

  return { ok: true, value: { platform, projects: parsedProjects } };
}

export function checkIntentSet(
  files: readonly AuthoredFile[],
): Result<IntentSet> {
  const composed = composeIntentSet(files, true);
  if (!composed.ok) return composed;
  const { platform, projects } = composed.value;
  return {
    ok: true,
    value: {
      ...(platform === undefined ? {} : { platform: platform.value.document }),
      projects: projects.map(({ value }) => value.effective),
    },
  };
}
