// The pull request's mutation shards, merged into one report.
//
// Each shard of the `mutation-shard` jobs in .github/workflows/ci.yml mutates
// its own ranges (scripts/mutation-shard.ts) and writes a report holding every
// mutant: its own, tested or kept, and every other shard's, carried over from
// the report of the last green run on main. This takes each mutant from the
// shard whose range holds it, so the merged report is the one a single run
// over every module would have written. It decides the score against the
// break threshold in stryker.config.json, names every mutant no test detected,
// and is what a push to main uploads for the next run to read.
//
// A library first: tests call merge() and run() in-process. The command is
// `node scripts/mutation-merge.ts <directory> <count>`, the directory holding
// one downloaded `mutation-report-<shard>` directory per shard. It writes
// reports/mutation/mutation.json and reports/stryker-incremental.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import {
  DETECTED,
  UNDETECTED,
  listed,
  undetected,
  type Mutant,
  type Report,
  type Test,
} from "./lib/mutation-report.ts";
import { owner, planned, type Range } from "./mutation-shard.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/**
 * What identifies a test across reports, whose ids hold only within one. A
 * shard can report a test with no location where another reports 1:1, and
 * Stryker reads both as its first position, so this does too.
 */
const testKey = (file: string, { name, location }: Test): string =>
  `${file}@${String(location?.start.line ?? 1)}:${String(location?.start.column ?? 1)}\n${name}`;

const byPosition = (a: Mutant, b: Mutant): number =>
  a.location.start.line - b.location.start.line ||
  a.location.start.column - b.location.start.column ||
  a.location.end.line - b.location.end.line ||
  a.location.end.column - b.location.end.column;

type Files = Record<string, { source?: string; mutants: Mutant[] }>;
type TestFiles = Record<string, { source?: string; tests: Test[] }>;

/**
 * One report from every shard's, `reports[k]` being shard k + 1's. A mutant
 * is kept from the shard whose range holds it whole, and only from that one;
 * a test is one test however many shards ran it, renumbered, with every
 * mutant's test ids pointing at the merged ones.
 */
export function merge(
  reports: readonly Report[],
  shards: readonly (readonly Range[])[],
): Report {
  const files: Files = {};
  const testFiles: TestFiles = {};
  const ids = new Map<string, string>();
  reports.forEach((report, index) => {
    const local = new Map<string, string>();
    for (const [file, { tests, ...rest }] of Object.entries(
      report.testFiles ?? {},
    )) {
      const merged = (testFiles[file] ??= { ...rest, tests: [] });
      for (const test of tests) {
        const key = testKey(file, test);
        let id = ids.get(key);
        if (id === undefined) {
          id = String(ids.size);
          ids.set(key, id);
          merged.tests.push({ ...test, id });
        }
        local.set(test.id, id);
      }
    }
    const remap = (tests: readonly string[]): string[] =>
      tests.flatMap((test) => {
        const id = local.get(test);
        return id === undefined ? [] : [id];
      });
    for (const [file, { mutants, ...rest }] of Object.entries(report.files)) {
      const merged = (files[file] ??= { ...rest, mutants: [] });
      for (const mutant of mutants) {
        const { start, end } = mutant.location;
        if (owner(shards, file, start.line, end.line) !== index + 1) continue;
        merged.mutants.push({
          ...mutant,
          ...(mutant.coveredBy && { coveredBy: remap(mutant.coveredBy) }),
          ...(mutant.killedBy && { killedBy: remap(mutant.killedBy) }),
        });
      }
    }
  });
  let next = 0;
  for (const file of Object.values(files))
    file.mutants = file.mutants.sort(byPosition).map((mutant) => ({
      ...mutant,
      id: String(next++),
    }));
  return { ...reports[0], files, testFiles };
}

/** What the command prints, and the code it exits with. */
export interface Outcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const whole = /^[1-9]\d*$/;

export function run(argv: readonly string[], root: string): Outcome {
  const [directory = "", count = ""] = argv;
  if (argv.length !== 2 || !whole.test(count))
    return {
      code: 2,
      stdout: "",
      stderr: "usage: node scripts/mutation-merge.ts <directory> <count>\n",
    };
  const shards = Number(count);
  const reports: Report[] = [];
  for (let shard = 1; shard <= shards; shard += 1) {
    const path = join(
      directory,
      `mutation-report-${String(shard)}`,
      "mutation.json",
    );
    if (!existsSync(path))
      return {
        code: 1,
        stdout: "",
        stderr: `shard ${String(shard)} of ${count} left no report: a shard that reported nothing proves nothing\n`,
      };
    reports.push(JSON.parse(readFileSync(path, "utf8")) as Report);
  }
  const merged = merge(reports, planned(root, shards));
  const mutants = Object.values(merged.files).flatMap((file) => file.mutants);
  const detected = mutants.filter(({ status }) => DETECTED.has(status)).length;
  const missed = mutants.filter(({ status }) => status in UNDETECTED).length;
  if (detected + missed === 0)
    return {
      code: 1,
      stdout: "",
      stderr:
        "the shards hold no mutant: a score over nothing proves nothing\n",
    };
  const text = JSON.stringify(merged);
  for (const path of [
    "reports/mutation/mutation.json",
    "reports/stryker-incremental.json",
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const { thresholds } = JSON.parse(
    readFileSync(join(root, "stryker.config.json"), "utf8"),
  ) as { readonly thresholds: { readonly break: number } };
  const score = (detected / (detected + missed)) * 100;
  const shown = score.toFixed(2);
  const summary =
    `${count} shards, ${String(mutants.length)} mutants: ${String(detected)} detected, ` +
    `${String(missed)} undetected, ${String(mutants.length - detected - missed)} not scored. ` +
    `Score ${shown}, break ${String(thresholds.break)}.`;
  const lines = [summary, ...undetected([merged.files]).map(listed)];
  return {
    code: score < thresholds.break ? 1 : 0,
    stdout: `${lines.join("\n")}\n`,
    stderr:
      score < thresholds.break
        ? `score ${shown} is under the break score ${String(thresholds.break)}\n`
        : "",
  };
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  const { code, stdout, stderr } = run(process.argv.slice(2), REPOSITORY);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
