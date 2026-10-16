// REQ-022 (docs/requirements.md): the mutation gate over src/, as shards.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  mutatedFiles,
  owner,
  plan,
  run,
  units,
  type Unit,
} from "../scripts/mutation-shard.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** A repository holding `files`, and a Stryker config naming `mutate`. */
function fixture(
  files: Readonly<Record<string, string>>,
  mutate: readonly string[],
): string {
  const root = mkdtempSync(join(tmpdir(), "mutation-shard-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  writeFileSync(join(root, "stryker.config.json"), JSON.stringify({ mutate }));
  return root;
}

/** One statement per weight, statement `n` on lines 10n+1 to 10n+5. */
const weighed = (weights: readonly number[]): Unit[] =>
  weights.map((weight, index) => ({
    start: index * 10 + 1,
    end: index * 10 + 5,
    weight,
  }));

describe("a mutation shard", () => {
  it("puts every top-level statement of every file the config mutates in exactly one shard, of this repository too", () => {
    const { mutate } = JSON.parse(
      readFileSync(join(REPOSITORY, "stryker.config.json"), "utf8"),
    ) as { readonly mutate: readonly string[] };
    const files = mutatedFiles(REPOSITORY, mutate).map((path) => ({
      path,
      units: units(readFileSync(join(REPOSITORY, path), "utf8")),
    }));
    const shards = plan(files, 6);

    expect(files.map(({ path }) => path)).not.toContain("src/cli/boundary.ts");
    for (const shard of shards) expect(shard.length).toBeGreaterThan(0);
    for (const { path, units: held } of files)
      for (const { start, end } of held)
        expect(
          shards.filter((shard) =>
            shard.some(
              (range) =>
                range.path === path && range.start <= start && end <= range.end,
            ),
          ),
          `${path}:${String(start)}`,
        ).toHaveLength(1);
  });

  it("weighs a statement by its runtime syntax, so a type, an interface or an import weighs nothing", () => {
    const found = units(
      [
        'import { x } from "./x.ts";',
        "export interface Shape { readonly a: string }",
        "type Alias = Shape | string;",
        "",
        "// A comment between statements belongs to neither.",
        "export const one = 1;",
        "export function twice(value: number): number {",
        "  return value * 2;",
        "}",
      ].join("\n"),
    );

    expect(found.map(({ start, end }) => [start, end])).toStrictEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [6, 6],
      [7, 9],
    ]);
    expect(found.map(({ weight }) => weight).slice(0, 3)).toStrictEqual([
      0, 0, 0,
    ]);
    expect(found[3]?.weight).toBeGreaterThan(0);
    expect(found[4]?.weight).toBeGreaterThan(found[3]?.weight ?? 0);
  });

  it("joins statements that share a line, so no line is two shards' at once", () => {
    const spans = (source: string): number[][] =>
      units(source).map(({ start, end }) => [start, end]);

    expect(spans("const a = 1; const b = 2;\nconst c = 3;\n")).toStrictEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(
      spans("const a = [\n  1,\n]; const b = 2;\nconst c = 3;\n"),
    ).toStrictEqual([
      [1, 3],
      [4, 4],
    ]);
  });

  it("spreads one large file over every shard, heaviest statement first, joining neighbours one shard holds", () => {
    // 40 to shard 1, 30 to shard 2, 20 to shard 2, 10 to shard 1.
    expect(
      plan([{ path: "src/big.ts", units: weighed([40, 10, 30, 20]) }], 2),
    ).toStrictEqual([
      [{ path: "src/big.ts", start: 1, end: 15 }],
      [{ path: "src/big.ts", start: 21, end: 35 }],
    ]);
    // The same weights in another order: neighbours land apart.
    expect(
      plan([{ path: "src/big.ts", units: weighed([30, 10, 20, 40]) }], 2),
    ).toStrictEqual([
      [
        { path: "src/big.ts", start: 11, end: 15 },
        { path: "src/big.ts", start: 31, end: 35 },
      ],
      [
        { path: "src/big.ts", start: 1, end: 5 },
        { path: "src/big.ts", start: 21, end: 25 },
      ],
    ]);
  });

  it("balances the shards across files, the heaviest file first and the lowest-numbered shard on a tie", () => {
    expect(
      plan(
        [
          { path: "src/b.ts", units: weighed([10]) },
          { path: "src/a.ts", units: weighed([10]) },
          { path: "src/c.ts", units: weighed([25]) },
        ],
        2,
      ),
    ).toStrictEqual([
      [{ path: "src/c.ts", start: 1, end: 5 }],
      [
        { path: "src/a.ts", start: 1, end: 5 },
        { path: "src/b.ts", start: 1, end: 5 },
      ],
    ]);
  });

  it("finds the one shard whose range holds a span, and none for a span across two", () => {
    const shards = plan(
      [{ path: "src/big.ts", units: weighed([40, 10, 30, 20]) }],
      2,
    );

    expect(owner(shards, "src/big.ts", 1, 15)).toBe(1);
    expect(owner(shards, "src/big.ts", 22, 22)).toBe(2);
    expect(owner(shards, "src/big.ts", 14, 22)).toBeUndefined();
    expect(owner(shards, "src/other.ts", 1, 1)).toBeUndefined();
  });

  it("reads the config's patterns, a ! pattern removing what the others matched, and prints ranges --mutate takes", () => {
    const root = fixture(
      {
        "src/a.ts": "export const a = [1, 2, 3];\n\nexport const b = 1;\n",
        "src/b/c.ts": "export const c = 1;\n",
        "src/skip.ts": "export const skip = 1;\n",
        "other/d.ts": "export const d = 1;\n",
      },
      ["src/**/*.ts", "!src/skip.ts"],
    );

    expect(mutatedFiles(root, ["src/**/*.ts", "!src/skip.ts"])).toStrictEqual([
      "src/a.ts",
      "src/b/c.ts",
    ]);
    expect(run(["1", "2"], root)).toStrictEqual({
      code: 0,
      stdout: "src/a.ts:1-1\n",
      stderr: "",
    });
    // The lighter shard takes the next file whole.
    expect(run(["2", "2"], root).stdout).toBe("src/a.ts:3-3,src/b/c.ts:1-1\n");
  });

  it("refuses a shard with nothing to mutate, and a call that names no shard", () => {
    const root = fixture({ "src/a.ts": "export const a = 1;\n" }, [
      "src/**/*.ts",
    ]);

    expect(run(["2", "2"], root)).toStrictEqual({
      code: 1,
      stdout: "",
      stderr: "shard 2 of 2 holds nothing to mutate: use fewer shards\n",
    });
    for (const argv of [[], ["1"], ["0", "2"], ["x", "2"], ["1", "2", "3"]])
      expect(run(argv, root).code, argv.join(" ")).toBe(2);
    expect(run(["3", "2"], root)).toStrictEqual({
      code: 2,
      stdout: "",
      stderr: "shard 3 of 2 does not exist\n",
    });
  });

  it("runs when Node starts this module", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [
      process.argv[0] ?? "node",
      join(REPOSITORY, "scripts", "mutation-shard.ts"),
    ];
    vi.resetModules();
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await import("../scripts/mutation-shard.ts");
      expect(process.exitCode).toBe(2);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
