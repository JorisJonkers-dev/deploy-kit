// A set of authored files read together: every file parsed on its own, and,
// where one Platform document is among them, the rules the documents answer
// together. A file is a Platform document, a project file or an env file by its
// name, and an env file reaches the project its `env/` directory sits beside.
import type { Diagnostic, Result } from "../domain/diagnostic.ts";
import type { Platform } from "../domain/platform-intent/model.ts";
import type { Project } from "../domain/project-intent/model.ts";
import { setDiagnostics } from "../wire/intent-set/rules.ts";
import type { EnvSource } from "../wire/project-intent/env.ts";
import { parsePlatformIntent } from "./parse-platform-intent.ts";
import { parseProjectIntent } from "./parse-project-intent.ts";

export interface AuthoredFile {
  readonly name: string;
  readonly text: string;
}

export interface IntentSet {
  readonly platform?: Platform;
  readonly projects: readonly Project[];
}

type Parsed<R> = Extract<R, { readonly ok: true }>;

const PLATFORM = "platform.intent.yml";
const PROJECT = ".project.yml";
const ENV = ".env";

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

export function checkIntentSet(
  files: readonly AuthoredFile[],
): Result<IntentSet> {
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
    .filter(({ name }) => name.endsWith(PROJECT))
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

  const [platform] = parsedPlatforms;
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

  return {
    ok: true,
    value: {
      ...(platform === undefined ? {} : { platform: platform.value.platform }),
      projects: parsedProjects.map(({ value }) => value.project),
    },
  };
}
