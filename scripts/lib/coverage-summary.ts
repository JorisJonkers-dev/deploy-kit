// The one shape this repository's coverage report is read as: the "total"
// entry of vitest's `json-summary` reporter
// (coverage/coverage-summary.json), the same file vitest.config.ts's
// `reporter` list already produces for every coverage run, gate or report
// alike.

export interface MetricSummary {
  readonly total: number;
  readonly covered: number;
  readonly skipped: number;
  readonly pct: number;
}

export const COVERAGE_METRICS = [
  "statements",
  "branches",
  "functions",
  "lines",
] as const;

export type CoverageMetric = (typeof COVERAGE_METRICS)[number];

export type CoverageTotals = Readonly<Record<CoverageMetric, MetricSummary>>;

/** Whether `value` has the four metrics a coverage total needs, each with a `pct`. */
function isCoverageTotals(value: unknown): value is CoverageTotals {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return COVERAGE_METRICS.every((metric) => {
    const entry = record[metric];
    return (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { pct?: unknown }).pct === "number"
    );
  });
}

/**
 * The `total` entry of a `coverage-summary.json` document. Throws when
 * `json` does not parse, or parses to something with no usable `total`, so a
 * caller never mistakes a malformed report for zero coverage.
 */
export function parseCoverageSummary(json: string): CoverageTotals {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `coverage summary is not valid JSON: ${(error as Error).message}`,
      { cause: error },
    );
  }
  const total =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).total
      : undefined;
  if (!isCoverageTotals(total))
    throw new Error('coverage summary carries no usable "total" entry');
  return total;
}

/** `branch`'s percentage for `metric` minus `baseline`'s, or `null` with no baseline. */
export function coverageDelta(
  branch: CoverageTotals,
  baseline: CoverageTotals | null,
  metric: CoverageMetric,
): number | null {
  if (baseline === null) return null;
  return branch[metric].pct - baseline[metric].pct;
}
