// REQ-022 (docs/requirements.md): the mutation gate over src/, run as shards.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mutatedFiles,
  run,
  shardFiles,
  type MutatedFile,
} from "../scripts/mutation-shard.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** A repository holding `files`, each `size` bytes, and a Stryker config naming `mutate`. */
function fixture(
  files: Readonly<Record<string, number>>,
  mutate: readonly string[],
): string {
  const root = mkdtempSync(join(tmpdir(), "mutation-shard-"));
  for (const [path, size] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "x".repeat(size));
  }
  writeFileSync(join(root, "stryker.config.json"), JSON.stringify({ mutate }));
  return root;
}

const sized = (sizes: readonly number[]): MutatedFile[] =>
  sizes.map((size, index) => ({ path: `src/f${String(index)}.ts`, size }));

describe("a mutation shard", () => {
  it("puts every file the config mutates in exactly one shard, of this repository too", () => {
    const { mutate } = JSON.parse(
      readFileSync(join(REPOSITORY, "stryker.config.json"), "utf8"),
    ) as { readonly mutate: readonly string[] };
    const files = mutatedFiles(REPOSITORY, mutate);
    const shards = [1, 2, 3, 4, 5, 6].map((index) =>
      shardFiles(files, index, 6),
    );

    expect(files.map(({ path }) => path)).not.toContain("src/cli/boundary.ts");
    expect(shards.flat().sort()).toStrictEqual(
      files.map(({ path }) => path).sort(),
    );
    expect(new Set(shards.flat()).size).toBe(files.length);
    for (const shard of shards) expect(shard.length).toBeGreaterThan(0);
  });

  it("gives the largest file a shard of its own and balances the rest by size", () => {
    const files = sized([100, 10, 30, 30, 20]);

    expect(shardFiles(files, 1, 2)).toStrictEqual(["src/f0.ts"]);
    expect(shardFiles(files, 2, 2)).toStrictEqual([
      "src/f1.ts",
      "src/f2.ts",
      "src/f3.ts",
      "src/f4.ts",
    ]);
    // Equal sizes split by path, the lowest-numbered shard first.
    expect(shardFiles(sized([5, 5]), 1, 2)).toStrictEqual(["src/f0.ts"]);
    expect(shardFiles(sized([5, 5]), 2, 2)).toStrictEqual(["src/f1.ts"]);
  });

  it("reads the config's patterns, a ! pattern removing what the others matched", () => {
    const root = fixture(
      { "src/a.ts": 3, "src/b/c.ts": 2, "src/skip.ts": 1, "other/d.ts": 1 },
      ["src/**/*.ts", "!src/skip.ts"],
    );

    expect(mutatedFiles(root, ["src/**/*.ts", "!src/skip.ts"])).toStrictEqual([
      { path: "src/a.ts", size: 3 },
      { path: "src/b/c.ts", size: 2 },
    ]);
    expect(run(["1", "2"], root)).toStrictEqual({
      code: 0,
      stdout: "src/a.ts\n",
      stderr: "",
    });
    expect(run(["2", "2"], root).stdout).toBe("src/b/c.ts\n");
  });

  it("refuses a shard with no file, and a call that names no shard", () => {
    const root = fixture({ "src/a.ts": 1 }, ["src/**/*.ts"]);

    expect(run(["2", "2"], root)).toStrictEqual({
      code: 1,
      stdout: "",
      stderr: "shard 2 of 2 holds no file: use fewer shards\n",
    });
    for (const argv of [[], ["1"], ["0", "2"], ["x", "2"], ["1", "2", "3"]])
      expect(run(argv, root).code, argv.join(" ")).toBe(2);
    expect(run(["3", "2"], root)).toStrictEqual({
      code: 2,
      stdout: "",
      stderr: "shard 3 of 2 does not exist\n",
    });
  });
});
