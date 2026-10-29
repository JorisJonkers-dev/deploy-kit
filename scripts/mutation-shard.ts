// One shard of a mutation run.
//
// Every mutant in one job grew with src/ past an hour, so both mutation runs
// are parallel shards: a push to main's (the `mutation-shard` jobs in
// .github/workflows/ci.yml) and the weekly full run's
// (.github/workflows/mutation-full.yml). Each shard is handed a disjoint share
// of the top-level statements of the files stryker.config.json mutates, as
// line ranges. Stryker makes a mutant only of a node a range holds whole, and
// every node but the file itself sits inside one top-level statement, so every
// mutant lands in exactly one shard. The break score is 100, so every shard
// scoring 100 is the whole run scoring 100: sharding changes how long the run
// takes, never what it accepts.
//
// A shard is cut below the file because one large module holds hundreds of
// mutants: a whole-file split leaves the shard holding it running alone. The
// shares are balanced by time, not by count: a statement weighs the tests its
// mutants ran in the report of the last green run on main, since a static
// mutant runs every suite and a plain one stops at its first killer. A file
// that changed since that report, or a run with no report, weighs by syntax
// nodes instead, scaled to the same unit. Every shard of one run must read the
// same report, or their shares would overlap.
//
// A library first: tests call plan() and run() in-process. The command is
// `node scripts/mutation-shard.ts <shard> <count> [<report>]`, which prints the
// shard's ranges as the comma-separated list `stryker run --mutate` takes.
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { isEntrypoint } from "./lib/entrypoint.ts";
import type { Report } from "./lib/mutation-report.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/**
 * Every file the config's `mutate` patterns name, a `!` pattern removing what
 * the others matched, in path order.
 */
export function mutatedFiles(
  root: string,
  patterns: readonly string[],
): string[] {
  const excluded = new Set(
    patterns
      .filter((pattern) => pattern.startsWith("!"))
      .flatMap((pattern) => globSync(pattern.slice(1), { cwd: root })),
  );
  return [
    ...new Set(
      patterns
        .filter((pattern) => !pattern.startsWith("!"))
        .flatMap((pattern) => globSync(pattern, { cwd: root })),
    ),
  ]
    .filter((path) => !excluded.has(path))
    .sort();
}

/**
 * Lines `start` to `end` of a file, counted from 1, holding one top-level
 * statement or several that share a line, and how many mutants they stand for.
 */
export interface Statement {
  readonly start: number;
  readonly end: number;
  readonly weight: number;
}

/** The syntax nodes Stryker can mutate under `node`: none in a type, an interface or an import. */
function weight(node: ts.Node): number {
  if (
    ts.isTypeNode(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isImportDeclaration(node)
  )
    return 0;
  let total = 1;
  ts.forEachChild(node, (child) => {
    total += weight(child);
  });
  return total;
}

/**
 * The top-level statements of `source`, each weighed by its runtime syntax
 * nodes, which track its mutant count closely. Statements that share a line
 * are one, since a range is whole lines.
 */
export function statements(source: string): Statement[] {
  const file = ts.createSourceFile(
    "statements.ts",
    source,
    ts.ScriptTarget.Latest,
  );
  const line = (position: number): number =>
    file.getLineAndCharacterOfPosition(position).line + 1;
  const found: Statement[] = [];
  for (const statement of file.statements) {
    const next = {
      start: line(statement.getStart(file)),
      end: line(statement.getEnd()),
      weight: weight(statement),
    };
    const last = found.at(-1);
    if (last !== undefined && last.end >= next.start)
      found[found.length - 1] = {
        start: last.start,
        end: next.end,
        weight: last.weight + next.weight,
      };
    else found.push(next);
  }
  return found;
}

/** Lines `start` to `end` of the file at `path`, which one shard mutates. */
export interface Range {
  readonly path: string;
  readonly start: number;
  readonly end: number;
}

const ascending = (a: number, b: number): number => a - b;

/**
 * Every shard's ranges, shard 1 first. The heaviest statement of the whole
 * tree goes first, each to the shard holding least so far, the lowest-numbered
 * on a tie, so the shards come out about equal, one file's statements scatter
 * over them, and the same weights always split the same way. Neighbouring
 * statements one shard holds are one range.
 */
export function plan(
  files: readonly {
    readonly path: string;
    readonly statements: readonly Statement[];
  }[],
  count: number,
): Range[][] {
  const loads = Array.from({ length: count }, () => 0);
  const byPath = [...files].sort((a, b) => (a.path < b.path ? -1 : 1));
  const owners = byPath.map(({ statements: held }) => held.map(() => 0));
  const heaviestFirst = byPath
    .flatMap(({ statements: held }, file) =>
      held.map((statement, index) => ({ statement, file, index })),
    )
    .sort(
      (a, b) =>
        ascending(b.statement.weight, a.statement.weight) ||
        a.file - b.file ||
        a.index - b.index,
    );
  for (const { statement, file, index } of heaviestFirst) {
    const lightest = loads.indexOf(Math.min(...loads));
    (owners[file] ?? [])[index] = lightest;
    loads[lightest] = (loads[lightest] ?? 0) + statement.weight;
  }
  const shards: Range[][] = Array.from({ length: count }, () => []);
  byPath.forEach(({ path, statements: held }, file) => {
    const owned = owners[file] ?? [];
    held.forEach((statement, index) => {
      const ranges = shards[owned[index] ?? 0] ?? [];
      const last = ranges.at(-1);
      if (last?.path === path && owned[index - 1] === owned[index])
        ranges[ranges.length - 1] = {
          path,
          start: last.start,
          end: statement.end,
        };
      else ranges.push({ path, start: statement.start, end: statement.end });
    });
  });
  return shards;
}

/** The shard, numbered from 1, whose one range holds lines `start` to `end` of `path`. */
export function owner(
  shards: readonly (readonly Range[])[],
  { path, start, end }: Range,
): number | undefined {
  const index = shards.findIndex((ranges) =>
    ranges.some(
      (range) =>
        range.path === path && range.start <= start && end <= range.end,
    ),
  );
  return index === -1 ? undefined : index + 1;
}

/** Every file the config mutates, with its top-level statements weighed by syntax nodes. */
export function tree(
  root: string,
): { path: string; source: string; statements: Statement[] }[] {
  const { mutate } = JSON.parse(
    readFileSync(join(root, "stryker.config.json"), "utf8"),
  ) as { readonly mutate: readonly string[] };
  return mutatedFiles(root, mutate).map((path) => {
    const source = readFileSync(join(root, path), "utf8");
    return { path, source, statements: statements(source) };
  });
}

/**
 * `files` weighed by time: each statement by the tests its mutants ran in
 * `report`, one more per mutant for its own start, where the report holds the
 * file's source unchanged. Every other file weighs by syntax nodes, scaled by
 * what a node cost across the files the report does hold.
 */
export function timed(
  files: readonly {
    readonly path: string;
    readonly source: string;
    readonly statements: readonly Statement[];
  }[],
  report: Report | undefined,
): { path: string; statements: Statement[] }[] {
  const measured = new Map<string, Statement[]>();
  let cost = 0;
  let nodes = 0;
  for (const { path, source, statements: held } of files) {
    const file = report?.files[path];
    if (file?.source !== source) continue;
    const weighed = held.map((statement) => ({
      ...statement,
      weight: file.mutants
        .filter(
          ({ location }) =>
            statement.start <= location.start.line &&
            location.end.line <= statement.end,
        )
        .reduce((sum, mutant) => sum + 1 + (mutant.testsCompleted ?? 0), 0),
    }));
    measured.set(path, weighed);
    cost += weighed.reduce((sum, { weight }) => sum + weight, 0);
    nodes += held.reduce((sum, { weight }) => sum + weight, 0);
  }
  const scale = nodes === 0 ? 1 : cost / nodes;
  return files.map(({ path, statements: held }) => ({
    path,
    statements:
      measured.get(path) ??
      held.map((statement) => ({
        ...statement,
        weight: statement.weight * scale,
      })),
  }));
}

/** `ranges` as the comma-separated list `stryker run --mutate` takes. */
export const formatted = (ranges: readonly Range[]): string =>
  ranges
    .map(({ path, start, end }) => `${path}:${String(start)}-${String(end)}`)
    .join(",");

/** The ranges of a list `formatted` wrote, or undefined for anything else. */
export function parsed(text: string): Range[] | undefined {
  const ranges: Range[] = [];
  for (const entry of text.trim().split(",")) {
    const match = /^(.+):(\d+)-(\d+)$/.exec(entry);
    if (match === null) return undefined;
    const [, path = "", start = "", end = ""] = match;
    ranges.push({ path, start: Number(start), end: Number(end) });
  }
  return ranges;
}

/** What the command prints, and the code it exits with. */
export interface Outcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const whole = /^[1-9]\d*$/;

export function run(argv: readonly string[], root: string): Outcome {
  const [shard = "", count = "", report] = argv;
  if (
    (argv.length !== 2 && argv.length !== 3) ||
    !whole.test(shard) ||
    !whole.test(count)
  )
    return {
      code: 2,
      stdout: "",
      stderr:
        "usage: node scripts/mutation-shard.ts <shard> <count> [<report>]\n",
    };
  const index = Number(shard);
  const shards = Number(count);
  if (index > shards)
    return {
      code: 2,
      stdout: "",
      stderr: `shard ${shard} of ${count} does not exist\n`,
    };
  // No report is not a failure: the shares are then balanced by syntax alone.
  const baseline =
    report !== undefined && existsSync(report)
      ? (JSON.parse(readFileSync(report, "utf8")) as Report)
      : undefined;
  const ranges = plan(timed(tree(root), baseline), shards)[index - 1] ?? [];
  // A shard with nothing to mutate scores nothing, which is no proof at all.
  if (ranges.length === 0)
    return {
      code: 1,
      stdout: "",
      stderr: `shard ${shard} of ${count} holds nothing to mutate: use fewer shards\n`,
    };
  return { code: 0, stdout: `${formatted(ranges)}\n`, stderr: "" };
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  const { code, stdout, stderr } = run(process.argv.slice(2), REPOSITORY);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
