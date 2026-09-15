// The coverage of the lines a pull request changed, computed from a
// zero-context `git diff` and an lcov report, both as plain text/data so
// neither git nor a real coverage run needs to exist for the test.
import { describe, expect, it } from "vitest";
import {
  addedLinesByFile,
  patchCoverage,
  patchCoveragePct,
} from "../scripts/lib/patch-coverage.ts";
import type { LcovReport } from "../scripts/lib/lcov.ts";

function lcov(entries: Record<string, Record<number, number>>): LcovReport {
  return new Map(
    Object.entries(entries).map(([file, lines]) => [
      file,
      new Map(
        Object.entries(lines).map(([line, hits]) => [Number(line), hits]),
      ),
    ]),
  );
}

describe("addedLinesByFile", () => {
  it("numbers added lines from the hunk header, in the new file", () => {
    const diff = [
      "diff --git a/scripts/a.ts b/scripts/a.ts",
      "index 1111111..2222222 100644",
      "--- a/scripts/a.ts",
      "+++ b/scripts/a.ts",
      "@@ -2,0 +3,2 @@ some context",
      "+const a = 1;",
      "+const b = 2;",
    ].join("\n");
    expect(addedLinesByFile(diff).get("scripts/a.ts")).toStrictEqual([3, 4]);
  });

  it("does not advance the new-file counter for a removed line", () => {
    const diff = [
      "diff --git a/scripts/a.ts b/scripts/a.ts",
      "--- a/scripts/a.ts",
      "+++ b/scripts/a.ts",
      "@@ -5 +5 @@",
      "-const c = 3;",
      "+const c = 4;",
    ].join("\n");
    expect(addedLinesByFile(diff).get("scripts/a.ts")).toStrictEqual([5]);
  });

  it("counts every added line of a new file", () => {
    const diff = [
      "diff --git a/scripts/new.ts b/scripts/new.ts",
      "new file mode 100644",
      "index 0000000..abc1234",
      "--- /dev/null",
      "+++ b/scripts/new.ts",
      "@@ -0,0 +1,3 @@",
      "+line1",
      "+line2",
      "+line3",
    ].join("\n");
    expect(addedLinesByFile(diff).get("scripts/new.ts")).toStrictEqual([
      1, 2, 3,
    ]);
  });

  it("adds no entry for a deleted file: /dev/null never opens an added-lines record", () => {
    const diff = [
      "diff --git a/scripts/old.ts b/scripts/old.ts",
      "deleted file mode 100644",
      "index abc1234..0000000",
      "--- a/scripts/old.ts",
      "+++ /dev/null",
      "@@ -1,3 +0,0 @@",
      "-line1",
      "-line2",
      "-line3",
    ].join("\n");
    expect(addedLinesByFile(diff).has("scripts/old.ts")).toBe(false);
  });

  it("tracks two files in one diff independently", () => {
    const diff = [
      "diff --git a/scripts/a.ts b/scripts/a.ts",
      "--- a/scripts/a.ts",
      "+++ b/scripts/a.ts",
      "@@ -1,0 +2 @@",
      "+a",
      "diff --git a/scripts/b.ts b/scripts/b.ts",
      "--- a/scripts/b.ts",
      "+++ b/scripts/b.ts",
      "@@ -1,0 +9 @@",
      "+b",
    ].join("\n");
    const added = addedLinesByFile(diff);
    expect(added.get("scripts/a.ts")).toStrictEqual([2]);
    expect(added.get("scripts/b.ts")).toStrictEqual([9]);
  });

  it("keeps one entry when a file's new-file header appears more than once", () => {
    const diff = [
      "diff --git a/scripts/a.ts b/scripts/a.ts",
      "--- a/scripts/a.ts",
      "+++ b/scripts/a.ts",
      "@@ -1,0 +2 @@",
      "+a",
      "+++ b/scripts/a.ts",
      "@@ -5,0 +7 @@",
      "+b",
    ].join("\n");
    expect(addedLinesByFile(diff).get("scripts/a.ts")).toStrictEqual([2, 7]);
  });

  it("returns an empty map for an empty diff", () => {
    expect(addedLinesByFile("").size).toBe(0);
  });
});

describe("patchCoverage", () => {
  it("counts an added, instrumented line as covered when it has hits", () => {
    const added = new Map([["scripts/a.ts", [1, 2]]]);
    const coverage = patchCoverage(
      added,
      lcov({ "scripts/a.ts": { 1: 3, 2: 0 } }),
    );
    expect(coverage).toStrictEqual({ coveredLines: 1, totalLines: 2 });
  });

  it("excludes a file lcov never instrumented, such as documentation", () => {
    const added = new Map([["docs/architecture.md", [1, 2, 3]]]);
    const coverage = patchCoverage(added, lcov({}));
    expect(coverage).toStrictEqual({ coveredLines: 0, totalLines: 0 });
  });

  it("excludes an added line lcov has no DA record for, such as a blank line", () => {
    const added = new Map([["scripts/a.ts", [1, 2, 3]]]);
    const coverage = patchCoverage(
      added,
      lcov({ "scripts/a.ts": { 1: 1, 3: 1 } }),
    );
    expect(coverage).toStrictEqual({ coveredLines: 2, totalLines: 2 });
  });

  it("returns zero over zero for no added lines", () => {
    expect(patchCoverage(new Map(), lcov({}))).toStrictEqual({
      coveredLines: 0,
      totalLines: 0,
    });
  });
});

describe("patchCoveragePct", () => {
  it("is null when nothing instrumented was changed", () => {
    expect(patchCoveragePct({ coveredLines: 0, totalLines: 0 })).toBeNull();
  });

  it("is the covered fraction otherwise", () => {
    expect(patchCoveragePct({ coveredLines: 3, totalLines: 4 })).toBe(75);
  });
});
