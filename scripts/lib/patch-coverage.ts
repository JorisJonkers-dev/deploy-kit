// The coverage of the lines a pull request changed, as opposed to the
// coverage of the branch as a whole: a change can raise the ratchet overall
// while leaving the lines it just added untested, if enough of the rest of
// the branch is covered to hide it, and that is exactly the gap this answers
// instead of the branch-wide percentage.
//
// A line the diff added counts only when the file that added it also
// appears in the lcov report with a hit count for that exact line: a file
// outside `vitest.config.ts`'s coverage `include` (documentation, spec,
// tests themselves) contributes no denominator, the same way a blank line or
// a comment inside a covered file is not a countable statement and so is
// silently absent from `DA:` rather than present at zero.
import type { LcovReport } from "./lcov.ts";

/** One file's added line numbers, in the new (post-change) file's numbering. */
export type AddedLines = ReadonlyMap<string, readonly number[]>;

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const NEW_FILE_HEADER = /^\+\+\+ b\/(.+)$/;

/**
 * Every added line, by the path it was added to, from `git diff --unified=0`
 * output. Zero context lines is what makes the hunk body exactly the added
 * and removed lines with nothing else to tell apart, so the caller must pass
 * a diff produced that way.
 */
export function addedLinesByFile(diffText: string): AddedLines {
  const result = new Map<string, number[]>();
  let currentFile: string | null = null;
  let nextLine = 0;

  for (const line of diffText.split("\n")) {
    if (line === "+++ /dev/null") {
      currentFile = null;
      continue;
    }
    const fileMatch = NEW_FILE_HEADER.exec(line);
    if (fileMatch) {
      currentFile = fileMatch[1] as string;
      if (!result.has(currentFile)) result.set(currentFile, []);
      continue;
    }

    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch) {
      nextLine = Number(hunkMatch[1]);
      continue;
    }

    if (currentFile === null) continue;
    if (line.startsWith("+")) {
      (result.get(currentFile) as number[]).push(nextLine);
      nextLine += 1;
    }
    // A `-` line removes from the old file only, so it does not advance the
    // new file's line counter; a `\ No newline at end of file` marker and
    // anything else inside a zero-context hunk carries no line of its own.
  }
  return result;
}

export interface PatchCoverage {
  readonly coveredLines: number;
  readonly totalLines: number;
}

/**
 * How many of the lines `addedByFile` names are covered, of those that
 * `lcov` also instruments. A file or line missing from `lcov` contributes to
 * neither the numerator nor the denominator.
 */
export function patchCoverage(
  addedByFile: AddedLines,
  lcov: LcovReport,
): PatchCoverage {
  let coveredLines = 0;
  let totalLines = 0;
  for (const [file, lines] of addedByFile) {
    const hits = lcov.get(file);
    if (!hits) continue;
    for (const lineNo of lines) {
      const hitCount = hits.get(lineNo);
      if (hitCount === undefined) continue;
      totalLines += 1;
      if (hitCount > 0) coveredLines += 1;
    }
  }
  return { coveredLines, totalLines };
}

/** `coverage`'s percentage, or `null` when it names no instrumented line at all. */
export function patchCoveragePct(coverage: PatchCoverage): number | null {
  if (coverage.totalLines === 0) return null;
  return (coverage.coveredLines / coverage.totalLines) * 100;
}
