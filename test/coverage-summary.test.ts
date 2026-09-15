// Reading vitest's json-summary reporter output, the source both the
// coverage ratchet and the pull request comment ultimately read.
import { describe, expect, it } from "vitest";
import {
  coverageDelta,
  parseCoverageSummary,
  type CoverageTotals,
} from "../scripts/lib/coverage-summary.ts";

function totals(pct: number): CoverageTotals {
  const metric = { total: 100, covered: pct, skipped: 0, pct };
  return {
    statements: metric,
    branches: metric,
    functions: metric,
    lines: metric,
  };
}

describe("parseCoverageSummary", () => {
  it("reads the total entry", () => {
    const json = JSON.stringify({
      total: {
        statements: { total: 10, covered: 9, skipped: 0, pct: 90 },
        branches: { total: 4, covered: 4, skipped: 0, pct: 100 },
        functions: { total: 2, covered: 2, skipped: 0, pct: 100 },
        lines: { total: 10, covered: 9, skipped: 0, pct: 90 },
      },
      "scripts/a.ts": {
        statements: { total: 1, covered: 1, skipped: 0, pct: 100 },
      },
    });
    const result = parseCoverageSummary(json);
    expect(result.statements.pct).toBe(90);
    expect(result.branches.pct).toBe(100);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseCoverageSummary("not json")).toThrow(/not valid JSON/);
  });

  it("throws when the document parses but carries no usable total", () => {
    expect(() => parseCoverageSummary("{}")).toThrow(/no usable "total"/);
    expect(() => parseCoverageSummary('{"total": {"statements": {}}}')).toThrow(
      /no usable "total"/,
    );
    expect(() => parseCoverageSummary("null")).toThrow(/no usable "total"/);
  });
});

describe("coverageDelta", () => {
  it("is null with no baseline", () => {
    expect(coverageDelta(totals(90), null, "statements")).toBeNull();
  });

  it("is the branch's percentage minus the baseline's", () => {
    expect(coverageDelta(totals(95), totals(90), "statements")).toBeCloseTo(5);
    expect(coverageDelta(totals(85), totals(90), "lines")).toBeCloseTo(-5);
  });
});
