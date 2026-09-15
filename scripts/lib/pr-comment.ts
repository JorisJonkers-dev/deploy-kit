// The pull request shape-and-coverage comment: one pure function
// (`renderComment`) over plain data, per issue #33 ("The rendering is one
// pure function over plain data, and it is tested; the collecting and
// posting steps carry no logic worth a test."). scripts/pr-report.ts does
// the collecting (git diff, the coverage report, the cached baseline) and
// the posting (`gh api`); everything here only ever reads its arguments.
//
// The marker is how a second push updates the same comment instead of
// leaving a trail: scripts/pr-report.ts lists the pull request's existing
// comments, and `planComment` picks the one that already carries it.
import { BUCKETS, type Bucket, type BucketTotals } from "./change-buckets.ts";
import { COVERAGE_METRICS, type CoverageTotals } from "./coverage-summary.ts";
import type { PatchCoverage } from "./patch-coverage.ts";

export const COMMENT_MARKER = "<!-- deploy-kit:pr-report:v1 -->";

export interface Baseline {
  readonly commit: string;
  readonly coverage: CoverageTotals;
}

export interface CommentInput {
  readonly bucketTotals: ReadonlyMap<Bucket | null, BucketTotals>;
  readonly branchCoverage: CoverageTotals;
  readonly baseline: Baseline | null;
  readonly patchCoverage: PatchCoverage | null;
}

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatDiff(value: number): string {
  const rounded = value.toFixed(2);
  return value > 0 ? `+${rounded}` : rounded;
}

function shapeTable(totals: ReadonlyMap<Bucket | null, BucketTotals>): string {
  const rows: string[] = [
    "| bucket | files | additions | deletions |",
    "|---|---|---|---|",
  ];
  let sawAny = false;
  for (const bucket of BUCKETS) {
    const entry = totals.get(bucket);
    if (!entry) continue;
    sawAny = true;
    rows.push(
      `| ${bucket} | ${entry.files} | +${entry.additions} | -${entry.deletions} |`,
    );
  }
  const unclassified = totals.get(null);
  if (unclassified) {
    sawAny = true;
    rows.push(
      `| _unclassified_ | ${unclassified.files} | +${unclassified.additions} | -${unclassified.deletions} |`,
    );
  }
  if (!sawAny) return "This pull request changes no tracked file.";
  return rows.join("\n");
}

function coverageTable(input: CommentInput): string {
  if (input.baseline === null) {
    const rows: string[] = [
      "No baseline is cached from `main` yet.",
      "",
      "| metric | this branch |",
      "|---|---|",
    ];
    for (const metric of COVERAGE_METRICS)
      rows.push(
        `| ${metric} | ${formatPct(input.branchCoverage[metric].pct)} |`,
      );
    return rows.join("\n");
  }

  const rows: string[] = [
    `Baseline: \`main\` @ \`${input.baseline.commit.slice(0, 7)}\`.`,
    "",
    "| metric | this branch | main | diff |",
    "|---|---|---|---|",
  ];
  for (const metric of COVERAGE_METRICS) {
    const branchPct = input.branchCoverage[metric].pct;
    const basePct = input.baseline.coverage[metric].pct;
    rows.push(
      `| ${metric} | ${formatPct(branchPct)} | ${formatPct(basePct)} | ${formatDiff(branchPct - basePct)} |`,
    );
  }
  return rows.join("\n");
}

function patchCoverageLine(patch: PatchCoverage | null): string {
  if (patch === null || patch.totalLines === 0)
    return "This pull request changed no covered line.";
  const pct = (patch.coveredLines / patch.totalLines) * 100;
  return (
    `Lines this pull request changed: ${patch.coveredLines}/${patch.totalLines} ` +
    `covered (${formatPct(pct)}).`
  );
}

/** The full comment body for `input`, marker included. */
export function renderComment(input: CommentInput): string {
  return [
    COMMENT_MARKER,
    "",
    "## Shape",
    "",
    shapeTable(input.bucketTotals),
    "",
    "## Coverage",
    "",
    coverageTable(input),
    "",
    patchCoverageLine(input.patchCoverage),
    "",
  ].join("\n");
}

export interface ExistingComment {
  readonly id: number;
  readonly body: string;
}

/**
 * The id of the existing comment carrying {@link COMMENT_MARKER}, or `null`
 * when none does. A second push finds its own earlier comment through this
 * and updates it in place; the first push finds nothing and a new comment is
 * created.
 */
export function planComment(
  existing: readonly ExistingComment[],
  marker: string = COMMENT_MARKER,
): number | null {
  return existing.find((comment) => comment.body.includes(marker))?.id ?? null;
}
