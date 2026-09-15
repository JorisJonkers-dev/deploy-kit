// The pull request comment: one pure rendering function over plain data
// (renderComment), and the pure decision that makes a second push update
// the same comment instead of adding a new one (planComment).
//
// REQ-026 (docs/requirements.md): a pull request's shape-and-coverage
// comment is updated in place rather than repeated.
import { describe, expect, it } from "vitest";
import type { BucketTotals } from "../scripts/lib/change-buckets.ts";
import type { CoverageTotals } from "../scripts/lib/coverage-summary.ts";
import {
  COMMENT_MARKER,
  planComment,
  renderComment,
  type CommentInput,
} from "../scripts/lib/pr-comment.ts";

function totals(pct: number): CoverageTotals {
  const metric = { total: 100, covered: pct, skipped: 0, pct };
  return {
    statements: metric,
    branches: metric,
    functions: metric,
    lines: metric,
  };
}

function bucket(
  files: number,
  additions: number,
  deletions: number,
): BucketTotals {
  return { files, additions, deletions };
}

describe("renderComment", () => {
  it("carries the marker as its first line, so a re-run can find it again", () => {
    const body = renderComment({
      bucketTotals: new Map(),
      branchCoverage: totals(90),
      baseline: null,
      patchCoverage: null,
    });
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
  });

  it("lists a bucket row for every bucket with changes, in the fixed bucket order", () => {
    const input: CommentInput = {
      bucketTotals: new Map([
        ["tests", bucket(1, 5, 0)],
        ["production code", bucket(2, 10, 3)],
      ]),
      branchCoverage: totals(90),
      baseline: null,
      patchCoverage: null,
    };
    const body = renderComment(input);
    const productionLine = body.indexOf("| production code |");
    const testsLine = body.indexOf("| tests |");
    expect(productionLine).toBeGreaterThan(-1);
    expect(testsLine).toBeGreaterThan(-1);
    // "production code" is listed before "tests" in BUCKETS, and the table
    // renders in that order regardless of Map insertion order above.
    expect(productionLine).toBeLessThan(testsLine);
    expect(body).toContain("| production code | 2 | +10 | -3 |");
  });

  it("names an unclassified change explicitly rather than hiding it", () => {
    const body = renderComment({
      bucketTotals: new Map([[null, bucket(1, 1, 0)]]),
      branchCoverage: totals(90),
      baseline: null,
      patchCoverage: null,
    });
    expect(body).toContain("| _unclassified_ | 1 | +1 | -0 |");
  });

  it("says so when the pull request changes no tracked file", () => {
    const body = renderComment({
      bucketTotals: new Map(),
      branchCoverage: totals(90),
      baseline: null,
      patchCoverage: null,
    });
    expect(body).toContain("This pull request changes no tracked file.");
  });

  it("says there is no baseline, and shows only the branch's own coverage", () => {
    const body = renderComment({
      bucketTotals: new Map(),
      branchCoverage: totals(90),
      baseline: null,
      patchCoverage: null,
    });
    expect(body).toContain("No baseline is cached from `main` yet.");
    expect(body).toContain("| statements | 90.00% |");
    expect(body).not.toContain("diff");
  });

  it("shows the branch beside the main baseline, with its commit and the difference", () => {
    const body = renderComment({
      bucketTotals: new Map(),
      branchCoverage: totals(95),
      baseline: { commit: "abcdef1234567890", coverage: totals(90) },
      patchCoverage: null,
    });
    expect(body).toContain("Baseline: `main` @ `abcdef1`.");
    expect(body).toContain("| statements | 95.00% | 90.00% | +5.00 |");
  });

  it("shows a negative difference without a leading plus", () => {
    const body = renderComment({
      bucketTotals: new Map(),
      branchCoverage: totals(85),
      baseline: { commit: "abcdef1234567890", coverage: totals(90) },
      patchCoverage: null,
    });
    expect(body).toContain("| statements | 85.00% | 90.00% | -5.00 |");
  });

  it("reports the coverage of the lines the pull request changed", () => {
    const body = renderComment({
      bucketTotals: new Map(),
      branchCoverage: totals(90),
      baseline: null,
      patchCoverage: { coveredLines: 3, totalLines: 4 },
    });
    expect(body).toContain(
      "Lines this pull request changed: 3/4 covered (75.00%).",
    );
  });

  it("says so when the pull request changed no covered line", () => {
    const body = renderComment({
      bucketTotals: new Map(),
      branchCoverage: totals(90),
      baseline: null,
      patchCoverage: { coveredLines: 0, totalLines: 0 },
    });
    expect(body).toContain("This pull request changed no covered line.");
  });

  it("says so when there is no patch coverage input at all", () => {
    const body = renderComment({
      bucketTotals: new Map(),
      branchCoverage: totals(90),
      baseline: null,
      patchCoverage: null,
    });
    expect(body).toContain("This pull request changed no covered line.");
  });
});

describe("planComment", () => {
  it("finds the existing comment carrying the marker", () => {
    const id = planComment([
      { id: 1, body: "unrelated" },
      { id: 2, body: `${COMMENT_MARKER}\n\nold body` },
    ]);
    expect(id).toBe(2);
  });

  it("returns null when no existing comment carries the marker, so one is created", () => {
    expect(planComment([{ id: 1, body: "unrelated" }])).toBeNull();
  });

  it("returns null for no existing comments at all", () => {
    expect(planComment([])).toBeNull();
  });

  it("takes the first match when more than one somehow carries the marker", () => {
    const id = planComment([
      { id: 5, body: COMMENT_MARKER },
      { id: 6, body: COMMENT_MARKER },
    ]);
    expect(id).toBe(5);
  });
});
