// The baseline an incremental mutation run reads, with every test that did not
// change kept as itself.
//
// Stryker reuses a killed mutant's result while the test that killed it is
// unchanged, and tells a changed test by its place in its file. Vitest's
// runner reports no place, so Stryker gives every test the whole file: one
// edit anywhere in a test file reads as every test in it changed, and every
// mutant one of them killed runs again. One end-to-end suite kills thousands.
//
// This rewrites the downloaded report before a shard reads it. A test file
// whose source changed is read as scopes (the file, and every `describe`
// named by a literal, nested) and each scope's statements as one of three
// kinds, compared token by token, so a change of layout or comment is none:
//
// - a placed test: an `it` or `test` named by a literal, once under its full
//   name in the file;
// - a declaration: an import, a variable, a function, a class or a type,
//   under the names it binds;
// - anything else: a hook, a loop, an `it.each`, and every test it could not
//   place, which is the scope's own code.
//
// A declaration changed when it is new, gone, or its tokens differ, and so
// did every declaration that names one that changed. A scope is dirty when
// its own code changed or names a declaration that changed, and so is every
// scope inside it. A placed test is kept when its tokens are the same, it
// names no declaration that changed, and no scope around it is dirty; a test
// it could not place is kept only when no scope in the file is dirty, since
// nothing says which scope wrote it. Names are compared as text, never
// resolved, so a shadowed name over-counts a change and never hides one.
//
// A kept test keeps its identity, a dropped one leaves the report, and the
// file takes its current source, so Stryker sees no diff of its own. A
// mutant whose killer was dropped has none left, and is tested again; a new
// test is new either way, and Stryker re-tests every surviving mutant it
// covers. Whatever cannot be read this way leaves the file whole, and every
// test in it then counts as changed, as it would without this.
//
// A library first: tests call rebased() and run() in-process. The command is
// `node scripts/mutation-baseline.ts <report>`, which rewrites the report in
// place; a report that does not exist is not a failure, since a run without
// one tests every mutant.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { isEntrypoint } from "./lib/entrypoint.ts";
import type { Report, Test } from "./lib/mutation-report.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** One statement of a test file, as the comparison reads it. */
interface Unit {
  readonly tokens: string;
  /** Every identifier the statement holds, as text. */
  readonly names: ReadonlySet<string>;
}

/** A test file, read as its scopes. */
export interface Layout {
  /** Every placed test by its full name, with the scopes it sits in, outermost first. */
  readonly tests: ReadonlyMap<
    string,
    Unit & { readonly scopes: readonly string[] }
  >;
  /** Every declaration by its scope and the names it binds, with those names. */
  readonly declarations: ReadonlyMap<
    string,
    Unit & { readonly binds: readonly string[] }
  >;
  /** Every scope's own code, by its path. */
  readonly scopes: ReadonlyMap<string, Unit>;
}

const TESTS = new Set(["it", "test"]);
const SUITES = new Set(["describe", "suite"]);
// The modifiers that leave a test or a suite one call named by its first argument.
const MODIFIERS = new Set(["only", "skip", "concurrent", "sequential", "todo"]);
const SEPARATOR = "\u0000";

/** `it`, `it.only` and the like, as the base name, or undefined for anything else (`it.each(...)`). */
function calleeOf(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    MODIFIERS.has(expression.name.text)
  )
    return expression.expression.text;
  return undefined;
}

/** The literal a call is named by, or undefined where its name is computed. */
function literalName(call: ts.CallExpression): string | undefined {
  const [first] = call.arguments;
  return first !== undefined &&
    (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
    ? first.text
    : undefined;
}

/** The block a describe call's own callback runs, or undefined where it has none to read. */
function suiteBody(call: ts.CallExpression): ts.Block | undefined {
  const callback = call.arguments.at(-1);
  return callback !== undefined &&
    (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
    ts.isBlock(callback.body)
    ? callback.body
    : undefined;
}

/** The names a declaration statement binds, or undefined where the statement declares nothing. */
function bindings(statement: ts.Statement): string[] | undefined {
  const named = (name: ts.BindingName): string[] =>
    ts.isIdentifier(name)
      ? [name.text]
      : name.elements.flatMap((element) =>
          ts.isOmittedExpression(element) ? [] : named(element.name),
        );
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.flatMap(({ name }) =>
      named(name),
    );
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name !== undefined
  )
    return [statement.name.text];
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (clause === undefined) return undefined;
    const bound = clause.name === undefined ? [] : [clause.name.text];
    const { namedBindings } = clause;
    if (namedBindings === undefined) return bound;
    return ts.isNamespaceImport(namedBindings)
      ? [...bound, namedBindings.name.text]
      : [...bound, ...namedBindings.elements.map(({ name }) => name.text)];
  }
  return undefined;
}

/** Every token under `node` and every identifier among them, leaving out the nodes in `skip`. */
function read(
  node: ts.Node,
  file: ts.SourceFile,
  skip: ReadonlySet<ts.Node> = new Set(),
): { tokens: string[]; names: string[] } {
  const tokens: string[] = [];
  const names: string[] = [];
  const visit = (current: ts.Node): void => {
    if (skip.has(current)) return;
    if (ts.isIdentifier(current)) names.push(current.text);
    const children = current.getChildren(file);
    if (children.length === 0) {
      tokens.push(current.getText(file));
      return;
    }
    children.forEach(visit);
  };
  visit(node);
  return { tokens, names };
}

const unit = (
  parts: readonly { tokens: string[]; names: string[] }[],
): Unit => ({
  tokens: parts
    .map(({ tokens }) => tokens.join(SEPARATOR))
    .join(SEPARATOR + SEPARATOR),
  names: new Set(parts.flatMap(({ names }) => names)),
});

/** The test file `source`, read as its scopes. */
export function layout(source: string): Layout {
  const file = ts.createSourceFile(
    "layout.test.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const found: { name: string; statement: ts.Statement; scopes: string[] }[] =
    [];
  const declared = new Map<
    string,
    { parts: ReturnType<typeof read>[]; binds: string[] }
  >();
  const own = new Map<string, ReturnType<typeof read>[]>();
  const visit = (
    statements: readonly ts.Statement[],
    scopes: readonly string[],
  ): void => {
    const path = scopes.join(SEPARATOR);
    const mine = own.get(path) ?? [];
    own.set(path, mine);
    for (const statement of statements) {
      const call =
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression)
          ? statement.expression
          : undefined;
      const callee = call === undefined ? undefined : calleeOf(call.expression);
      const name = call === undefined ? undefined : literalName(call);
      if (call !== undefined && callee !== undefined && name !== undefined) {
        if (TESTS.has(callee)) {
          found.push({
            name: [...scopes, name].join(" ").trim(),
            statement,
            scopes: [...scopes],
          });
          continue;
        }
        const body = SUITES.has(callee) ? suiteBody(call) : undefined;
        if (body !== undefined) {
          const inner = [...scopes, name];
          // What the describe call says beside its body is its scope's own code.
          own.set(inner.join(SEPARATOR), [
            read(statement, file, new Set(body.statements)),
          ]);
          visit(body.statements, inner);
          continue;
        }
      }
      const binds = bindings(statement);
      if (binds === undefined || binds.length === 0) {
        mine.push(read(statement, file));
        continue;
      }
      // An import binds each name on its own, so adding one to it changes no other.
      const parts = ts.isImportDeclaration(statement)
        ? binds.map((bound) => [bound])
        : [binds];
      for (const names of parts) {
        const key = [path, ...[...names].sort()].join(SEPARATOR + SEPARATOR);
        const entry = declared.get(key) ?? { parts: [], binds: names };
        entry.parts.push(
          ts.isImportDeclaration(statement)
            ? {
                tokens: [statement.moduleSpecifier.getText(file), ...names],
                names: [...names],
              }
            : read(statement, file),
        );
        declared.set(key, entry);
      }
    }
  };
  visit(file.statements, []);
  // Two tests under one name are one key to Stryker: neither is placed, and
  // both are their scope's own code.
  const counts = new Map<string, number>();
  for (const { name } of found) counts.set(name, (counts.get(name) ?? 0) + 1);
  const tests = new Map<string, Unit & { scopes: readonly string[] }>();
  for (const { name, statement, scopes } of found) {
    const scopePath = scopes.join(SEPARATOR);
    if (counts.get(name) === 1)
      tests.set(name, { ...unit([read(statement, file)]), scopes });
    else own.get(scopePath)?.push(read(statement, file));
  }
  return {
    tests,
    declarations: new Map(
      [...declared].map(([key, { parts, binds }]) => [
        key,
        { ...unit(parts), binds },
      ]),
    ),
    scopes: new Map([...own].map(([path, parts]) => [path, unit(parts)])),
  };
}

const meets = (
  names: ReadonlySet<string>,
  changed: ReadonlySet<string>,
): boolean => [...names].some((name) => changed.has(name));

/** Every name whose declaration changed between `then` and `now`, and every name declared from one. */
function changedNames(then: Layout, now: Layout): Set<string> {
  const changed = new Set<string>();
  for (const key of new Set([
    ...then.declarations.keys(),
    ...now.declarations.keys(),
  ])) {
    const before = then.declarations.get(key);
    const after = now.declarations.get(key);
    if (before?.tokens !== after?.tokens)
      for (const name of [...(before?.binds ?? []), ...(after?.binds ?? [])])
        changed.add(name);
  }
  // A declaration naming a changed one changed too, on either side.
  const all = [...then.declarations.values(), ...now.declarations.values()];
  for (let grew = true; grew;) {
    grew = false;
    for (const { names, binds } of all)
      if (binds.some((name) => !changed.has(name)) && meets(names, changed)) {
        binds.forEach((name) => changed.add(name));
        grew = true;
      }
  }
  return changed;
}

/** Every scope present on both sides whose own code changed or names a changed declaration. */
function dirtyScopes(
  then: Layout,
  now: Layout,
  changed: ReadonlySet<string>,
): Set<string> {
  const dirty = new Set<string>();
  for (const [path, after] of now.scopes) {
    const before = then.scopes.get(path);
    if (before === undefined) continue;
    if (
      before.tokens !== after.tokens ||
      meets(after.names, changed) ||
      meets(before.names, changed)
    )
      dirty.add(path);
  }
  return dirty;
}

/** What happened to one test file of the report. */
export interface Outcome {
  readonly file: string;
  readonly kept: number;
  readonly dropped: number;
  /** Why the file was left whole, where it was. */
  readonly whole?: string;
}

/**
 * The tests of one file the report holds that are still themselves under
 * `current`, or the reason the file has to be left whole.
 */
export function kept(
  tests: readonly Test[],
  before: string,
  current: string,
): readonly Test[] | string {
  const then = layout(before);
  const now = layout(current);
  const runtime = new Map<string, number>();
  for (const { name } of tests) runtime.set(name, (runtime.get(name) ?? 0) + 1);
  // A placed name that is not one test Stryker ran means the placing is
  // wrong for this file, so nothing it says about the file can be trusted.
  for (const name of then.tests.keys())
    if (runtime.get(name) !== 1)
      return `it places ${JSON.stringify(name)}, which is not one test the report holds`;
  const changed = changedNames(then, now);
  const dirty = dirtyScopes(then, now, changed);
  const within = (scopes: readonly string[]): boolean =>
    scopes.some((_, depth) =>
      dirty.has(scopes.slice(0, depth + 1).join(SEPARATOR)),
    ) || dirty.has("");
  return tests.filter(({ name }) => {
    const before = then.tests.get(name);
    const after = now.tests.get(name);
    // Not placed: its scope is unknown, so any dirty scope may have written it.
    if (before === undefined) return after === undefined && dirty.size === 0;
    return (
      after !== undefined &&
      before.tokens === after.tokens &&
      !meets(after.names, changed) &&
      !within(after.scopes) &&
      !within(before.scopes)
    );
  });
}

/**
 * `report` with every test file that changed under `read` rebased onto its
 * current source, keeping the tests that did not change, and what happened
 * to each such file.
 */
export function rebased(
  report: Report,
  readFile: (path: string) => string | undefined,
): { report: Report; outcomes: Outcome[] } {
  const outcomes: Outcome[] = [];
  const testFiles = Object.fromEntries(
    Object.entries(report.testFiles ?? {}).map(([path, file]) => {
      const current = readFile(path);
      if (
        current === undefined ||
        file.source === undefined ||
        file.source === current
      )
        return [path, file];
      const result = kept(file.tests, file.source, current);
      if (typeof result === "string") {
        outcomes.push({
          file: path,
          kept: 0,
          dropped: file.tests.length,
          whole: result,
        });
        return [path, file];
      }
      outcomes.push({
        file: path,
        kept: result.length,
        dropped: file.tests.length - result.length,
      });
      return [path, { ...file, source: current, tests: result }];
    }),
  );
  return { report: { ...report, testFiles }, outcomes };
}

/** One outcome as a line of the command's log. */
export const described = ({
  file,
  kept: held,
  dropped,
  whole,
}: Outcome): string =>
  whole === undefined
    ? `${file}: ${String(held)} test(s) kept, ${String(dropped)} changed`
    : `${file}: every test changed, since ${whole}`;

/** What the command prints, and the code it exits with. */
export interface Result {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * A file's text, or undefined where none is there: read rather than checked
 * first, so the file cannot change between a check and a read.
 */
function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function run(argv: readonly string[], root: string): Result {
  const [path] = argv;
  if (argv.length !== 1 || path === undefined)
    return {
      code: 2,
      stdout: "",
      stderr: "usage: node scripts/mutation-baseline.ts <report>\n",
    };
  const text = readIfPresent(path);
  if (text === undefined)
    return {
      code: 0,
      stdout: `No report at ${path}: nothing to rebase.\n`,
      stderr: "",
    };
  const { report, outcomes } = rebased(JSON.parse(text) as Report, (file) =>
    readIfPresent(join(root, file)),
  );
  writeFileSync(path, JSON.stringify(report));
  return {
    code: 0,
    stdout: outcomes.map((outcome) => `${described(outcome)}\n`).join(""),
    stderr: "",
  };
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  const { code, stdout, stderr } = run(process.argv.slice(2), REPOSITORY);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
