// One shard of the mutation gate.
//
// The Mutation job ran every mutant in one job, and its length grew with
// src/ past an hour. CI now runs the gate as parallel shards, each handed a
// disjoint share of the files stryker.config.json mutates. The break score is
// 100, so every shard scoring 100 is the whole gate scoring 100: sharding
// changes how long the gate takes, never what it accepts.
//
// A library first: tests call shardFiles() and run() in-process. The command
// is `node scripts/mutation-shard.ts <shard> <count>`, which prints the
// shard's files as the comma-separated list `stryker run --mutate` takes.
import { globSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** One file to mutate, and its size, which stands in for how many mutants it holds. */
export interface MutatedFile {
  readonly path: string;
  readonly size: number;
}

/**
 * Every file the config's `mutate` patterns name, a `!` pattern removing what
 * the others matched, in path order.
 */
export function mutatedFiles(
  root: string,
  patterns: readonly string[],
): MutatedFile[] {
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
    .sort()
    .map((path) => ({ path, size: statSync(join(root, path)).size }));
}

/**
 * The files of shard `index` of `count`, numbered from 1. Largest first, each
 * file goes to the shard holding the fewest bytes so far, the lowest-numbered
 * on a tie, so every file lands in exactly one shard, the shards come out
 * about equal, and the same files always split the same way.
 */
export function shardFiles(
  files: readonly MutatedFile[],
  index: number,
  count: number,
): string[] {
  const loads = Array.from({ length: count }, () => 0);
  const owner = new Map<string, number>();
  const largestFirst = [...files].sort(
    (a, b) => b.size - a.size || (a.path < b.path ? -1 : 1),
  );
  for (const { path, size } of largestFirst) {
    const lightest = loads.indexOf(Math.min(...loads));
    owner.set(path, lightest);
    loads[lightest] = (loads[lightest] ?? 0) + size;
  }
  return files
    .map(({ path }) => path)
    .filter((path) => owner.get(path) === index - 1);
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
  const { mutate } = JSON.parse(
    readFileSync(join(root, "stryker.config.json"), "utf8"),
  ) as { readonly mutate: readonly string[] };
  const files = shardFiles(mutatedFiles(root, mutate), index, shards);
  // A shard with nothing to mutate scores nothing, which is no proof at all.
  if (files.length === 0)
    return {
      code: 1,
      stdout: "",
      stderr: `shard ${shard} of ${count} holds no file: use fewer shards\n`,
    };
  return { code: 0, stdout: `${files.join(",")}\n`, stderr: "" };
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  const { code, stdout, stderr } = run(process.argv.slice(2), REPOSITORY);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
