// Comment each pull request's shape and coverage (issue #33): a job that
// gates nothing, wired into `.github/workflows/ci.yml` as `pr-report`, run
// only on `pull_request`. It never fails the build: coverage stays enforced
// by the `tests` gate's own thresholds, and this only reports on top of
// that.
//
// The pieces:
//   - scripts/lib/change-buckets.ts, scripts/lib/coverage-summary.ts,
//     scripts/lib/lcov.ts and scripts/lib/patch-coverage.ts each answer one
//     pure question over plain data.
//   - scripts/lib/pr-comment.ts renders the comment body from those answers,
//     and decides whether an existing comment carries the marker.
//   - This file is the collecting (git, the coverage report, the cached
//     `main` baseline) and the posting (`gh api`), which is exactly the
//     glue issue #33 says "carries no logic worth a test": every branch a
//     test does cover here, but by running real git against a fixture
//     repository and a stand-in `gh`, the same shape scripts/lint-secrets.ts
//     already uses for gitleaks.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bucketTotals, type ChangedFile } from "./lib/change-buckets.ts";
import { isEntrypoint } from "./lib/entrypoint.ts";
import {
  parseCoverageSummary,
  type CoverageTotals,
} from "./lib/coverage-summary.ts";
import { parseLcov } from "./lib/lcov.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";
import { addedLinesByFile, patchCoverage } from "./lib/patch-coverage.ts";
import {
  planComment,
  renderComment,
  type CommentInput,
  type ExistingComment,
} from "./lib/pr-comment.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const MAX_BUFFER = 64 * 1024 * 1024;

export interface Config {
  readonly root: string;
  readonly baseSha: string;
  readonly headSha: string;
  readonly repository: string;
  readonly prNumber: number;
  readonly coverageSummaryPath: string;
  readonly lcovPath: string;
  readonly baselinePath: string;
  readonly ghBin: string;
}

/** Every file changed between `baseSha` and `headSha`, with its added and removed line counts. */
export function changedFiles(
  root: string,
  baseSha: string,
  headSha: string,
): ChangedFile[] {
  const numstat = execFileSync(
    "git",
    ["diff", "--numstat", `${baseSha}...${headSha}`],
    { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
  );
  const files: ChangedFile[] = [];
  for (const line of numstat.split("\n")) {
    if (line.trim() === "") continue;
    // git diff --numstat always emits exactly three tab-separated fields for
    // a normal entry: two counts (or "-" for a binary file) and a path.
    const [added, deleted, path] = line.split("\t") as [string, string, string];
    files.push({
      path,
      additions: added === "-" ? 0 : Number(added),
      deletions: deleted === "-" ? 0 : Number(deleted),
    });
  }
  return files;
}

/** The zero-context diff between `baseSha` and `headSha`, for `addedLinesByFile`. */
export function diffText(
  root: string,
  baseSha: string,
  headSha: string,
): string {
  return execFileSync(
    "git",
    ["diff", "--unified=0", `${baseSha}...${headSha}`],
    { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
  );
}

export interface CachedBaseline {
  readonly commit: string;
  readonly coverage: CoverageTotals;
}

/** The cached `main` baseline at `path`, or `null` when it is absent or unreadable. */
export function readBaseline(path: string): CachedBaseline | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      commit?: unknown;
      coverage?: unknown;
    };
    if (
      typeof parsed.commit !== "string" ||
      typeof parsed.coverage !== "object" ||
      parsed.coverage === null
    )
      return null;
    return {
      commit: parsed.commit,
      coverage: parsed.coverage as CoverageTotals,
    };
  } catch {
    return null;
  }
}

/** Every comment `gh api` reports on this pull request's issue thread. */
export function listComments(
  ghBin: string,
  repository: string,
  prNumber: number,
): ExistingComment[] {
  const run = spawnSync(
    ghBin,
    ["api", `repos/${repository}/issues/${String(prNumber)}/comments`],
    { encoding: "utf8", maxBuffer: MAX_BUFFER },
  );
  if (run.error)
    throw new Error(`could not run ${ghBin}: ${run.error.message}`);
  if (run.status !== 0)
    throw new Error(`gh api (list comments) failed: ${run.stderr.trim()}`);
  const parsed = JSON.parse(run.stdout) as { id: number; body: string }[];
  return parsed.map((comment) => ({ id: comment.id, body: comment.body }));
}

/** Create a new comment, or update `existingId`'s body in place when one was found. */
export function upsertComment(
  ghBin: string,
  repository: string,
  prNumber: number,
  existingId: number | null,
  body: string,
): void {
  const args =
    existingId === null
      ? [
          "api",
          `repos/${repository}/issues/${String(prNumber)}/comments`,
          "-f",
          `body=${body}`,
        ]
      : [
          "api",
          "--method",
          "PATCH",
          `repos/${repository}/issues/comments/${String(existingId)}`,
          "-f",
          `body=${body}`,
        ];
  const run = spawnSync(ghBin, args, {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  if (run.error)
    throw new Error(`could not run ${ghBin}: ${run.error.message}`);
  if (run.status !== 0)
    throw new Error(
      `gh api (${existingId === null ? "create" : "update"} comment) failed: ${run.stderr.trim()}`,
    );
}

/** The comment body for `config`, computed from the tree checked out at `config.root`. */
export function buildComment(config: Config): string {
  const files = changedFiles(config.root, config.baseSha, config.headSha);
  const totals = bucketTotals(files);
  const branchCoverage = parseCoverageSummary(
    readFileSync(config.coverageSummaryPath, "utf8"),
  );
  const baseline = readBaseline(config.baselinePath);

  let patch: CommentInput["patchCoverage"] = null;
  if (existsSync(config.lcovPath)) {
    const lcov = parseLcov(readFileSync(config.lcovPath, "utf8"));
    const added = addedLinesByFile(
      diffText(config.root, config.baseSha, config.headSha),
    );
    patch = patchCoverage(added, lcov);
  }

  return renderComment({
    bucketTotals: totals,
    branchCoverage,
    baseline,
    patchCoverage: patch,
  });
}

/**
 * Post or update the pull request comment for `config`. Always returns 0:
 * per issue #33, a job that gates nothing tolerates its own failure, so a
 * missing token, a fork pull request's read-only token, or `gh` itself being
 * absent is reported to `output.err` rather than failing the build.
 */
export function report(
  config: Config,
  output: GateOutput = processOutput,
): number {
  let body: string;
  try {
    body = buildComment(config);
  } catch (error) {
    output.err(
      `pr report: could not build the comment: ${(error as Error).message}\n`,
    );
    return 0;
  }

  try {
    const existing = listComments(
      config.ghBin,
      config.repository,
      config.prNumber,
    );
    const existingId = planComment(existing);
    upsertComment(
      config.ghBin,
      config.repository,
      config.prNumber,
      existingId,
      body,
    );
    output.out(
      `pr report: ${existingId === null ? "posted" : "updated"} the comment on #${String(config.prNumber)}\n`,
    );
  } catch (error) {
    output.err(
      `pr report: could not post the comment: ${(error as Error).message}\n`,
    );
    output.out(body);
  }
  return 0;
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/** Build a {@link Config} from the CI environment and run the report. Never throws. */
export function main(
  env: NodeJS.ProcessEnv = process.env,
  output: GateOutput = processOutput,
): number {
  try {
    const config: Config = {
      root: env.PR_REPORT_ROOT ?? REPOSITORY,
      baseSha: requiredEnv(env, "PR_BASE_SHA"),
      headSha: requiredEnv(env, "PR_HEAD_SHA"),
      repository: requiredEnv(env, "GITHUB_REPOSITORY"),
      prNumber: Number(requiredEnv(env, "PR_NUMBER")),
      coverageSummaryPath:
        env.COVERAGE_SUMMARY_PATH ??
        join(REPOSITORY, "coverage", "coverage-summary.json"),
      lcovPath:
        env.COVERAGE_LCOV_PATH ?? join(REPOSITORY, "coverage", "lcov.info"),
      baselinePath:
        env.COVERAGE_BASELINE_PATH ??
        join(REPOSITORY, ".coverage-baseline", "coverage-summary.json"),
      ghBin: env.GH_BIN ?? "gh",
    };
    return report(config, output);
  } catch (error) {
    output.err(`pr report: ${(error as Error).message}\n`);
    return 0;
  }
}

if (isEntrypoint(import.meta.url, process.argv[1])) process.exitCode = main();
