// One shard of a mutation run.
//
// Every mutant in one job grew with src/ past an hour, so both mutation runs
// are parallel shards: the pull request's (the `mutation-shard` jobs in
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
// mutants: a whole-file split leaves the shard holding it running alone.
// Every file is spread over every shard instead, so a change that re-tests one
// module re-tests it in parallel.
//
// A library first: tests call plan() and run() in-process. The command is
// `node scripts/mutation-shard.ts <shard> <count>`, which prints the shard's
// ranges as the comma-separated list `stryker run --mutate` takes.
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { isEntrypoint } from "./lib/entrypoint.ts";

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

/** Lines `start` to `end` of a file, counted from 1, and how many mutants they stand for. */
export interface Unit {
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
 * are one unit, since a range is whole lines.
 */
export function units(source: string): Unit[] {
  const file = ts.createSourceFile("unit.ts", source, ts.ScriptTarget.Latest);
  const line = (position: number): number =>
    file.getLineAndCharacterOfPosition(position).line + 1;
  const found: Unit[] = [];
  for (const statement of file.statements) {
    const unit = {
      start: line(statement.getStart(file)),
      end: line(statement.getEnd()),
      weight: weight(statement),
    };
    const last = found.at(-1);
    if (last !== undefined && last.end >= unit.start)
      found[found.length - 1] = {
        start: last.start,
        end: unit.end,
        weight: last.weight + unit.weight,
      };
    else found.push(unit);
  }
  return found;
}

/** Lines `start` to `end` of the file at `path`, which one shard mutates. */
export interface Range {
  readonly path: string;
  readonly start: number;
  readonly end: number;
}

const lighter = (a: number, b: number): number => a - b;

/**
 * Every shard's ranges, shard 1 first. The heaviest file is split first, its
 * heaviest unit first, each unit going to the shard holding least of that file
 * so far, then least of every file, then the lowest-numbered. So each file is
 * spread evenly over the shards, the shards come out about equal, and the same
 * tree always splits the same way. Neighbouring units one shard holds are one
 * range.
 */
export function plan(
  files: readonly { readonly path: string; readonly units: readonly Unit[] }[],
  count: number,
): Range[][] {
  const loads = Array.from({ length: count }, () => 0);
  const shards: Range[][] = Array.from({ length: count }, () => []);
  const total = (held: readonly Unit[]): number =>
    held.reduce((sum, unit) => sum + unit.weight, 0);
  const heaviestFirst = [...files].sort(
    (a, b) =>
      lighter(total(b.units), total(a.units)) || (a.path < b.path ? -1 : 1),
  );
  for (const { path, units: held } of heaviestFirst) {
    const here = Array.from({ length: count }, () => 0);
    const owners: number[] = [];
    const order = held
      .map((unit, index) => ({ unit, index }))
      .sort(
        (a, b) => lighter(b.unit.weight, a.unit.weight) || a.index - b.index,
      );
    for (const { unit, index } of order) {
      let best = 0;
      for (let shard = 1; shard < count; shard += 1) {
        const byFile = lighter(here[shard] ?? 0, here[best] ?? 0);
        if (
          byFile < 0 ||
          (byFile === 0 && (loads[shard] ?? 0) < (loads[best] ?? 0))
        )
          best = shard;
      }
      owners[index] = best;
      here[best] = (here[best] ?? 0) + unit.weight;
      loads[best] = (loads[best] ?? 0) + unit.weight;
    }
    held.forEach((unit, index) => {
      const shard = owners[index] ?? 0;
      const ranges = shards[shard] ?? [];
      const last = ranges.at(-1);
      if (last?.path === path && owners[index - 1] === shard)
        ranges[ranges.length - 1] = { path, start: last.start, end: unit.end };
      else ranges.push({ path, start: unit.start, end: unit.end });
    });
  }
  return shards.map((ranges) =>
    [...ranges].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : a.start - b.start,
    ),
  );
}

/** The shard, numbered from 1, whose one range holds lines `start` to `end` of `path`. */
export function owner(
  shards: readonly (readonly Range[])[],
  path: string,
  start: number,
  end: number,
): number | undefined {
  const index = shards.findIndex((ranges) =>
    ranges.some(
      (range) =>
        range.path === path && range.start <= start && end <= range.end,
    ),
  );
  return index === -1 ? undefined : index + 1;
}

/** Every shard's ranges for the tree at `root`, as stryker.config.json names it. */
export function planned(root: string, count: number): Range[][] {
  const { mutate } = JSON.parse(
    readFileSync(join(root, "stryker.config.json"), "utf8"),
  ) as { readonly mutate: readonly string[] };
  return plan(
    mutatedFiles(root, mutate).map((path) => ({
      path,
      units: units(readFileSync(join(root, path), "utf8")),
    })),
    count,
  );
}

/** What the command prints, and the code it exits with. */
export interface Outcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const whole = /^[1-9]\d*$/;

export function run(argv: readonly string[], root: string): Outcome {
  const [shard = "", count = ""] = argv;
  if (argv.length !== 2 || !whole.test(shard) || !whole.test(count))
    return {
      code: 2,
      stdout: "",
      stderr: "usage: node scripts/mutation-shard.ts <shard> <count>\n",
    };
  const index = Number(shard);
  const shards = Number(count);
  if (index > shards)
    return {
      code: 2,
      stdout: "",
      stderr: `shard ${shard} of ${count} does not exist\n`,
    };
  const ranges = planned(root, shards)[index - 1] ?? [];
  // A shard with nothing to mutate scores nothing, which is no proof at all.
  if (ranges.length === 0)
    return {
      code: 1,
      stdout: "",
      stderr: `shard ${shard} of ${count} holds nothing to mutate: use fewer shards\n`,
    };
  return {
    code: 0,
    stdout: `${ranges
      .map(({ path, start, end }) => `${path}:${String(start)}-${String(end)}`)
      .join(",")}\n`,
    stderr: "",
  };
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  const { code, stdout, stderr } = run(process.argv.slice(2), REPOSITORY);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
