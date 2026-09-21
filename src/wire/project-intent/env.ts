// The dotenv subset chapter 10 fixes, read into the model
// (spec/v1/10-project-intent.md#the-dotenv-subset-that-is-read). A reader
// rather than a grammar, for the reason docs/adr/emf/0126 records.
import type { Diagnostic, Result } from "../../domain/diagnostic.ts";
import type {
  EnvVariable,
  EnvFile,
  EnvValue,
} from "../../domain/project-intent/model.ts";
import { PLACEHOLDER_KINDS } from "../../domain/project-intent/vocabularies.ts";

/** An authored env file, by the path that says which level it reaches. */
export interface EnvSource {
  readonly path: string;
  readonly text: string;
}

/** Which level a scope directory names. */
export type EnvScope =
  | { readonly level: "project" }
  | { readonly level: "application"; readonly id: string }
  | { readonly level: "process"; readonly name: string };

export interface ScopedEnv {
  readonly path: string;
  readonly scope: EnvScope;
  readonly file: EnvFile;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPENS = "${";
const SUFFIX = ".env";
const PROJECT_SCOPE = "_project";
const APPLICATION_SCOPE = "_applications";

const refusal = (path: string, line: number, message: string): Diagnostic => ({
  code: "schema",
  path: `${path}:${String(line)}`,
  message,
  hint: "Write NAME=value, one per line, where a value is a literal or one ${kind:source} placeholder.",
});

function readValue(raw: string): EnvValue | undefined {
  if (raw.startsWith(OPENS) && raw.endsWith("}")) {
    // Split once: a source may hold colons, and a kind holds none.
    const inner = raw.slice(OPENS.length, -1);
    const [named, ...rest] = inner.split(":");
    const source = rest.join(":");
    const kind = PLACEHOLDER_KINDS.find((one) => one === named);
    if (kind === undefined || source.length === 0 || source.includes("}"))
      return undefined;
    return { kind, source };
  }
  if (raw.length === 0 || raw.includes("#") || raw.includes(OPENS))
    return undefined;
  return { text: raw };
}

/** The entries of one file, or every line it breaks the subset on. */
export function readEnvFile(source: EnvSource): Result<EnvFile> {
  const entries: EnvVariable[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  source.text.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const content = raw.trim();
    if (content.length === 0 || content.startsWith("#")) return;
    const equals = content.indexOf("=");
    const name = content.slice(0, equals);
    if (equals < 1 || !NAME.test(name)) {
      diagnostics.push(
        refusal(source.path, line, "a line is not a NAME=value assignment"),
      );
      return;
    }
    const value = readValue(content.slice(equals + 1));
    if (value === undefined) {
      diagnostics.push(
        refusal(
          source.path,
          line,
          `the value of ${name} is outside the subset`,
        ),
      );
      return;
    }
    if (seen.has(name))
      diagnostics.push({
        code: "E_SHARED_DECLARATION_DUPLICATED",
        path: `${source.path}:${String(line)}`,
        message: `${name} is set twice in one file`,
        hint: "Delete one: which line holds would take evaluating the file.",
      });
    seen.add(name);
    entries.push({ name, value });
  });

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const cluster = clusterOf(source.path);
  return {
    ok: true,
    value: { ...(cluster === undefined ? {} : { cluster }), entries },
  };
}

/** `base.env` does not vary, so it names no Cluster Target. */
function clusterOf(path: string): string | undefined {
  const file = path.slice(path.lastIndexOf("/") + 1, -SUFFIX.length);
  return file === "base" ? undefined : file;
}

/** Every env file among `sources`, read and scoped, or every line they break. */
export function readEnv(
  sources: readonly EnvSource[],
): Result<readonly ScopedEnv[]> {
  const diagnostics: Diagnostic[] = [];
  const scoped: ScopedEnv[] = [];
  for (const source of sources) {
    const scope = scopeOf(source.path);
    if (scope === undefined) {
      diagnostics.push(
        refusal(source.path, 0, "this path names no env scope directory"),
      );
      continue;
    }
    const file = readEnvFile(source);
    if (file.ok) scoped.push({ path: source.path, scope, file: file.value });
    else diagnostics.push(...file.diagnostics);
  }
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : { ok: true, value: scoped };
}

/** The level a file's scope directory names, or nothing where it names none. */
export function scopeOf(path: string): EnvScope | undefined {
  const segments = path.split("/");
  const env = segments.lastIndexOf("env");
  if (env < 0 || !path.endsWith(SUFFIX)) return undefined;
  // A scope is the directories between `env/` and the file itself: one of
  // them, except the Application scope, which names which Application.
  const scope = segments.slice(env + 1, -1).join("/");
  if (scope === PROJECT_SCOPE) return { level: "project" };
  if (scope.length === 0) return undefined;
  const [first, ...deeper] = scope.split("/");
  const [id, deeperStill] = deeper;
  if (first === APPLICATION_SCOPE)
    return id === undefined || deeperStill !== undefined
      ? undefined
      : { level: "application", id };
  return deeper.length === 0 ? { level: "process", name: scope } : undefined;
}
