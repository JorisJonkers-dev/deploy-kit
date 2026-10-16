// REQ-063 (docs/requirements.md): the pull request's mutation shards merge
// into one report, which decides the score and names every survivor.
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Report } from "../scripts/lib/mutation-report.ts";
import { merge, run } from "../scripts/mutation-merge.ts";
import { planned } from "../scripts/mutation-shard.ts";

const REPOSITORY = join(import.meta.dirname, "..");

// Four statements, two shards: shard 1 holds lines 1 and 5, shard 2 lines 3
// and 7 (the planner's own split of four equal statements).
const SOURCE = [
  "export const a = [1];",
  "",
  "export const b = [2];",
  "",
  "export const c = [3];",
  "",
  "export const d = [4];",
  "",
].join("\n");

type Row = readonly [status: string, line: number, killedBy?: string];

/** A shard's report: `rows` as mutants of src/a.ts, killed by the named test id. */
function report(rows: readonly Row[], tests: readonly string[]): Report {
  return {
    schemaVersion: "2",
    files: {
      "src/a.ts": {
        source: SOURCE,
        mutants: rows.map(([status, line, killedBy], index) => ({
          id: String(index),
          status,
          mutatorName: "ArrayDeclaration",
          location: {
            start: { line, column: 18 },
            end: { line, column: 21 },
          },
          ...(killedBy === undefined
            ? {}
            : { killedBy: [killedBy], coveredBy: [killedBy] }),
        })),
      },
    },
    testFiles: {
      "test/a.test.ts": {
        source: "",
        tests: tests.map((name, index) => ({ id: String(index), name })),
      },
    },
  };
}

/** A repository holding SOURCE, and one downloaded report directory per shard. */
function fixture(shards: readonly (Report | undefined)[]): {
  root: string;
  directory: string;
} {
  const root = mkdtempSync(join(tmpdir(), "mutation-merge-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), SOURCE);
  writeFileSync(
    join(root, "stryker.config.json"),
    JSON.stringify({ mutate: ["src/**/*.ts"], thresholds: { break: 100 } }),
  );
  const directory = join(root, "reports", "shards");
  shards.forEach((shard, index) => {
    if (shard === undefined) return;
    const dir = join(directory, `mutation-report-${String(index + 1)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "mutation.json"), JSON.stringify(shard));
  });
  return { root, directory };
}

const written = (root: string, path: string): Report =>
  JSON.parse(readFileSync(join(root, path), "utf8")) as Report;

describe("merging the mutation shards", () => {
  it("takes each mutant from the shard whose range holds it, and drops what a shard only carried over", () => {
    const { root } = fixture([]);
    // Each shard reports the other's lines too: Stryker carries every result
    // it did not test over from the report it was handed.
    const merged = merge(
      [
        report(
          [
            ["Killed", 1, "0"],
            ["Survived", 3],
            ["Killed", 5, "1"],
          ],
          ["first", "second"],
        ),
        report(
          [
            ["Killed", 1],
            ["Killed", 3, "0"],
            ["Killed", 7, "0"],
          ],
          ["second"],
        ),
      ],
      planned(root, 2),
    );

    const mutants = merged.files["src/a.ts"]?.mutants ?? [];
    expect(
      mutants.map(({ status, location }) => [status, location.start.line]),
    ).toStrictEqual([
      ["Killed", 1],
      ["Killed", 3],
      ["Killed", 5],
      ["Killed", 7],
    ]);
    expect(mutants.map(({ id }) => id)).toStrictEqual(["0", "1", "2", "3"]);
    // A test is one test however many shards ran it, and every shard's own
    // ids point at the one merged id.
    expect(merged.testFiles?.["test/a.test.ts"]?.tests).toStrictEqual([
      { id: "0", name: "first" },
      { id: "1", name: "second" },
    ]);
    expect(mutants.map(({ killedBy }) => killedBy)).toStrictEqual([
      ["0"],
      ["1"],
      ["1"],
      ["1"],
    ]);
    expect(merged.schemaVersion).toBe("2");
  });

  it("reads a test with no location and the same test at 1:1 as one test", () => {
    const { root } = fixture([]);
    const located = report([["Killed", 3, "0"]], ["first"]);
    const merged = merge(
      [
        report([["Killed", 1, "0"]], ["first"]),
        {
          ...located,
          testFiles: {
            "test/a.test.ts": {
              tests: [
                {
                  id: "0",
                  name: "first",
                  location: { start: { line: 1, column: 1 } },
                },
              ],
            },
          },
        },
      ],
      planned(root, 2),
    );

    expect(merged.testFiles?.["test/a.test.ts"]?.tests).toHaveLength(1);
    expect(
      merged.files["src/a.ts"]?.mutants.map(({ killedBy }) => killedBy),
    ).toStrictEqual([["0"], ["0"]]);
  });

  it("writes the merged report where the upload and the next run read it, and passes at the break score", () => {
    const { root, directory } = fixture([
      report(
        [
          ["Killed", 1, "0"],
          ["Ignored", 5],
        ],
        ["first"],
      ),
      report(
        [
          ["Timeout", 3],
          ["Killed", 7, "0"],
        ],
        ["first"],
      ),
    ]);

    expect(run([directory, "2"], root)).toStrictEqual({
      code: 0,
      stdout:
        "2 shards, 4 mutants: 3 detected, 0 undetected, 1 not scored. Score 100.00, break 100.\n",
      stderr: "",
    });
    expect(written(root, "reports/mutation/mutation.json")).toStrictEqual(
      written(root, "reports/stryker-incremental.json"),
    );
    expect(
      written(root, "reports/stryker-incremental.json").files["src/a.ts"]
        ?.mutants,
    ).toHaveLength(4);
  });

  it("fails below the break score and names each survivor, whichever shard it came from", () => {
    const { root, directory } = fixture([
      report(
        [
          ["Killed", 1, "0"],
          ["NoCoverage", 5],
        ],
        ["first"],
      ),
      report(
        [
          ["Survived", 3],
          ["Killed", 7, "0"],
        ],
        ["first"],
      ),
    ]);

    expect(run([directory, "2"], root)).toStrictEqual({
      code: 1,
      stdout: [
        "2 shards, 4 mutants: 2 detected, 2 undetected, 0 not scored. Score 50.00, break 100.",
        "- `src/a.ts:3:18` ArrayDeclaration: survived",
        "- `src/a.ts:5:18` ArrayDeclaration: no test covers it",
        "",
      ].join("\n"),
      stderr: "score 50.00 is under the break score 100\n",
    });
    // The report that names them is still written, for the upload.
    expect(existsSync(join(root, "reports", "mutation", "mutation.json"))).toBe(
      true,
    );
  });

  it("refuses a shard that left no report, a merge with no mutant, and a call that names no shard count", () => {
    const missing = fixture([report([["Killed", 1, "0"]], ["first"])]);
    expect(run([missing.directory, "2"], missing.root)).toStrictEqual({
      code: 1,
      stdout: "",
      stderr:
        "shard 2 of 2 left no report: a shard that reported nothing proves nothing\n",
    });

    const empty = fixture([report([], []), report([], [])]);
    expect(run([empty.directory, "2"], empty.root)).toStrictEqual({
      code: 1,
      stdout: "",
      stderr:
        "the shards hold no mutant: a score over nothing proves nothing\n",
    });

    for (const argv of [[], [missing.directory], [missing.directory, "0"]])
      expect(run(argv, missing.root)).toStrictEqual({
        code: 2,
        stdout: "",
        stderr: "usage: node scripts/mutation-merge.ts <directory> <count>\n",
      });
  });

  it("runs when Node starts this module", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [
      process.argv[0] ?? "node",
      join(REPOSITORY, "scripts", "mutation-merge.ts"),
    ];
    vi.resetModules();
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await import("../scripts/mutation-merge.ts");
      expect(process.exitCode).toBe(2);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
