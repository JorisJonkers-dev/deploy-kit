// REQ-055 (docs/requirements.md): the weekly full run names the mutants no
// test detected.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run } from "../scripts/mutation-survivors.ts";

const REPOSITORY = join(import.meta.dirname, "..");

type Mutant = readonly [
  status: string,
  mutator: string,
  line: number,
  column: number,
];

/** A directory holding one Stryker JSON report per shard, as CI downloads them. */
function reports(
  shards: readonly Readonly<Record<string, readonly Mutant[]>>[],
): string {
  const root = mkdtempSync(join(tmpdir(), "mutation-survivors-"));
  shards.forEach((files, index) => {
    const dir = join(root, `mutation-report-${String(index + 1)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "mutation.json"),
      JSON.stringify({
        files: Object.fromEntries(
          Object.entries(files).map(([path, mutants]) => [
            path,
            {
              mutants: mutants.map(([status, mutatorName, line, column]) => ({
                status,
                mutatorName,
                location: { start: { line, column } },
              })),
            },
          ]),
        ),
      }),
    );
  });
  return root;
}

describe("the weekly full run's report", () => {
  it("prints nothing when every mutant of every shard was detected", () => {
    const root = reports([
      { "src/a.ts": [["Killed", "StringLiteral", 1, 1]] },
      {
        "src/b.ts": [
          ["Timeout", "BlockStatement", 2, 3],
          ["Ignored", "ArrayDeclaration", 4, 5],
        ],
      },
    ]);

    expect(run([root])).toStrictEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("names each mutant that survived or that no test covers, by file and position", () => {
    const root = reports([
      {
        "src/b.ts": [
          ["Survived", "ConditionalExpression", 12, 5],
          ["Killed", "StringLiteral", 1, 1],
          ["Survived", "EqualityOperator", 3, 9],
          ["Survived", "BooleanLiteral", 3, 2],
        ],
      },
      { "src/a.ts": [["NoCoverage", "BlockStatement", 7, 1]] },
    ]);

    expect(run([root])).toStrictEqual({
      code: 0,
      stdout: [
        "The weekly full mutation run left 4 mutants undetected.",
        "A pull request re-tests only the mutants its own change reaches, so no gate saw these.",
        "",
        "- `src/a.ts:7:1` BlockStatement: no test covers it",
        "- `src/b.ts:3:2` BooleanLiteral: survived",
        "- `src/b.ts:3:9` EqualityOperator: survived",
        "- `src/b.ts:12:5` ConditionalExpression: survived",
        "",
      ].join("\n"),
      stderr: "",
    });
  });

  it("counts one mutant as one", () => {
    const root = reports([
      { "src/a.ts": [["Survived", "StringLiteral", 1, 1]] },
    ]);

    expect(run([root]).stdout).toContain("left 1 mutant undetected.");
  });

  it("refuses a directory with no report, which proves nothing, and a call that names none", () => {
    const empty = mkdtempSync(join(tmpdir(), "mutation-survivors-"));

    expect(run([empty])).toStrictEqual({
      code: 1,
      stdout: "",
      stderr: `no mutation.json under ${empty}: a run with no report proves nothing\n`,
    });
    for (const argv of [[], [empty, empty]])
      expect(run(argv)).toStrictEqual({
        code: 2,
        stdout: "",
        stderr: "usage: node scripts/mutation-survivors.ts <directory>\n",
      });
  });

  it("runs when Node starts this module", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [
      process.argv[0] ?? "node",
      join(REPOSITORY, "scripts", "mutation-survivors.ts"),
    ];
    vi.resetModules();
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await import("../scripts/mutation-survivors.ts");
      expect(process.exitCode).toBe(2);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
