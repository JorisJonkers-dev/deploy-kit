// REQ-022 (docs/requirements.md): the mutation gate over src/, on a pull
// request and in the weekly full run.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY = join(import.meta.dirname, "..");

interface StrykerConfig {
  readonly mutate: readonly string[];
  readonly reporters: readonly string[];
  readonly thresholds: { readonly break: number };
  readonly vitest: { readonly configFile: string };
  readonly ignorePatterns: readonly string[];
}

const config = JSON.parse(
  readFileSync(join(REPOSITORY, "stryker.config.json"), "utf8"),
) as StrykerConfig;

// A suite that imports from src/ but cannot run in Stryker's sandbox, which
// holds no git index, with the suite that kills its mutants instead.
const OUTSIDE_THE_SANDBOX: Readonly<Record<string, string>> = {
  "test/oracles.test.ts":
    "lists oracle files from the git index; test/canonical-json.test.ts covers the writer",
};

const workflow = (name: string): string =>
  readFileSync(join(REPOSITORY, ".github", "workflows", name), "utf8");

const ci = workflow("ci.yml");
const full = workflow("mutation-full.yml");
/** One job's text: from its key to the blank line that ends it. */
const jobOf = (text: string, key: string): string =>
  text.split(`  '${key}':\n`)[1]?.split("\n\n")[0] ?? "";
const gateJob = jobOf(ci, "mutation");
const pullRequestShardJob = jobOf(ci, "mutation-shard");
const scopeJob = jobOf(ci, "mutation-scope");
const fullBaselineJob = jobOf(full, "baseline");
const shardJob = jobOf(full, "shard");

/** The shard count a job's matrix lists, once it is 1 to N in order. */
function matrixCount(job: string): number {
  const shards = /'shard': \[([\d, ]+)\]/.exec(job)?.[1] ?? "";
  const count = shards.split(",").length;
  expect(shards.split(",").map(Number)).toStrictEqual(
    Array.from({ length: count }, (_, index) => index + 1),
  );
  expect(count).toBeGreaterThan(1);
  return count;
}

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith(".test.ts") ? [relative(REPOSITORY, path)] : [];
  });
}

describe("the mutation gate", () => {
  it('mutates every module under src/ and breaks below the measured score, "break": 100', () => {
    const text = readFileSync(join(REPOSITORY, "stryker.config.json"), "utf8");

    expect(text).toContain('"break": 100');
    expect(config.thresholds.break).toBe(100);
    expect(config.mutate).toContain("src/**/*.ts");
  });

  // docs/adr/architecture/0120: scripts/ does not join the scope yet because
  // two of its own gates cannot be exercised inside Stryker's sandbox (a
  // git-index read, and a subprocess-only smoke test). A change that widens
  // `mutate` should widen this assertion in the same pull request as 0063's
  // successor.
  it("does not mutate scripts/ until its own gates are sandbox-safe", () => {
    expect(config.mutate).toStrictEqual([
      "src/**/*.ts",
      "!src/cli/boundary.ts",
    ]);
  });

  // The report is uploaded as a CI artifact so a survivor or a timeout is
  // inspectable without reproducing the run locally, and html is what a
  // person reads; json and clear-text are what the other two checks read.
  it("reports in html as well as json and clear-text", () => {
    expect(config.reporters).toStrictEqual([
      "clear-text",
      "progress",
      "json",
      "html",
    ]);
  });

  it("uploads the html report as a CI artifact, even when the mutation step fails", () => {
    for (const job of [pullRequestShardJob, shardJob]) {
      expect(job).toContain("actions/upload-artifact@");
      expect(job).toContain("'if': 'always()'");
      expect(job).toContain("'path': 'reports/mutation'");
    }
    // The merged report too, whenever the gate tested anything.
    expect(gateJob).toContain(
      `'if': "always() && needs.mutation-scope.outputs.needed == 'true'"`,
    );
    expect(gateJob).toContain("'path': 'reports/mutation'");
  });

  // RULE-064. Stryker tests a mutant again when its module changed or the
  // test that killed it changed, and takes every other result from the
  // report it is handed, so the score is still over every mutant.
  it("re-tests on a pull request what the change reaches, against the last green run on main, npm run test:mutation -- --incremental", () => {
    expect(pullRequestShardJob).toContain(
      'npm run test:mutation -- --incremental --mutate "$ranges"',
    );
    expect(scopeJob).toContain(
      'gh api "repos/${REPO}/actions/artifacts?name=mutation-incremental&per_page=30"',
    );
    expect(pullRequestShardJob).toContain(
      'gh run download "${BASELINE}" --repo "${REPO}" --name mutation-incremental --dir reports',
    );
    expect(ci).toMatch(/'pipeline-complete':[\s\S]*?- 'mutation'\n/);
  });

  // A static mutant runs every suite, so a pull request skips the ones it
  // would re-test and stays inside five minutes; a push to main tests them.
  it("skips static mutants on a pull request only, and records the stage's time against five minutes", () => {
    expect(pullRequestShardJob).toContain(
      `if [ "\${EVENT}" = 'pull_request' ]; then static=(--ignoreStatic); fi`,
    );
    expect(pullRequestShardJob).toContain(
      'npm run test:mutation -- --incremental --mutate "$ranges" "${static[@]}"',
    );
    expect(gateJob).toContain("'name': 'Record how long mutation took'");
    expect(gateJob).toContain('[ "${seconds}" -gt 300 ]');
    expect(gateJob).toContain('>> "$GITHUB_STEP_SUMMARY"');
  });

  // test/mutation-baseline.test.ts holds which tests keep their identity.
  it("keeps every test that did not change in the report, after it downloads and before any shard reads it", () => {
    const rebase =
      "'run': 'node scripts/mutation-baseline.ts reports/stryker-incremental.json'";
    const download = pullRequestShardJob.indexOf(
      "--name mutation-incremental --dir reports &&",
    );
    const shard = pullRequestShardJob.indexOf("node scripts/mutation-shard.ts");

    expect(download).toBeGreaterThan(-1);
    expect(pullRequestShardJob.indexOf(rebase)).toBeGreaterThan(download);
    expect(pullRequestShardJob.indexOf(rebase)).toBeLessThan(shard);
  });

  // test/mutation-shard.test.ts holds the split, and
  // test/mutation-merge.test.ts the merge.
  it("shards the pull request's run as the matrix lists, and merges exactly those shards", () => {
    const count = String(matrixCount(pullRequestShardJob));

    expect(pullRequestShardJob).toContain(
      `ranges="$(node scripts/mutation-shard.ts "$SHARD" ${count} reports/stryker-incremental.json)"`,
    );
    // The merge reads what each shard ran, beside its report.
    expect(pullRequestShardJob).toContain(
      `printf '%s\\n' "$ranges" > reports/mutation/ranges.txt`,
    );
    expect(pullRequestShardJob).toContain(
      `'name': 'Mutation (\${{ matrix.shard }}/${count})'`,
    );
    expect(pullRequestShardJob).toContain(
      "'name': 'mutation-report-${{ matrix.shard }}'",
    );
    expect(gateJob).toContain(
      "--pattern 'mutation-report-*' --dir reports/shards",
    );
    expect(gateJob).toContain(
      `node scripts/mutation-merge.ts reports/shards ${count}`,
    );
  });

  it("uploads the merged report the next run reads from a green run on main that is no pull request, and from nothing else", () => {
    const upload = gateJob.split("'name': 'Upload the report")[1] ?? "";

    expect(upload).toContain(
      `'if': "github.event_name != 'pull_request' && github.ref == 'refs/heads/main' && needs.mutation-shard.result == 'success'"`,
    );
    expect(upload).toContain("'name': 'mutation-incremental'");
    // Where Stryker reads it when no other path is named, and where the
    // merge writes it.
    expect(upload).toContain("'path': 'reports/stryker-incremental.json'");
    expect(JSON.stringify(config)).not.toContain("incrementalFile");
    expect(pullRequestShardJob).not.toContain("mutation-incremental'");
  });

  // The full run is shards, each mutating a disjoint share of the files the
  // config names; test/mutation-shard.test.ts holds the split itself.
  it("runs the full run as one shard per matrix entry, each handed the shard count the matrix lists", () => {
    const count = String(matrixCount(shardJob));

    expect(shardJob).toContain(
      `ranges="$(node scripts/mutation-shard.ts "$SHARD" ${count} reports/baseline/stryker-incremental.json)"`,
    );
    expect(shardJob).toContain('npm run test:mutation -- --mutate "$ranges"');
    expect(shardJob).not.toContain("--incremental");
  });

  // Shards that planned from different reports would overlap or leave a
  // statement out, so one job chooses the report for all of them.
  it("hands every shard of a run the one report its time weights come from", () => {
    const chosen = "'BASELINE': '${{ needs.mutation-scope.outputs.baseline }}'";
    expect(scopeJob).toContain(
      "'baseline': '${{ steps.baseline.outputs.run }}'",
    );
    expect(pullRequestShardJob).toContain(chosen);
    expect(pullRequestShardJob).not.toContain("gh run list");

    expect(fullBaselineJob).toContain(
      'gh api "repos/${REPO}/actions/artifacts?name=mutation-incremental&per_page=30"',
    );
    expect(shardJob).toContain("'needs':\n      - 'baseline'");
    expect(shardJob).toContain(
      "'BASELINE': '${{ needs.baseline.outputs.run }}'",
    );
    expect(shardJob).toContain(
      'gh run download "${BASELINE}" --repo "${REPO}" --name mutation-incremental --dir reports/baseline',
    );
    expect(shardJob).not.toContain("gh run list");
  });

  it("runs the full run on a weekly schedule and on request, and on no push or pull request", () => {
    const triggers = full.split("'on':\n")[1]?.split("\n\n")[0] ?? "";

    expect(triggers).toMatch(
      /'schedule':\n(\s+#.*\n)*\s+- 'cron': '\d+ \d+ \* \* \d'/,
    );
    expect(triggers).toContain("'workflow_dispatch':");
    expect(triggers).not.toContain("'pull_request'");
    expect(triggers).not.toContain("'push'");
    expect(triggers).not.toContain("'workflow_call'");
  });

  it("opens an issue naming the survivors of the full run, and gates nothing", () => {
    const survivors = full.split("  'survivors':\n")[1] ?? "";

    expect(survivors).toContain("'if': 'always()'");
    expect(survivors).toContain("'issues': 'write'");
    expect(survivors).toContain(
      'body="$(node scripts/mutation-survivors.ts reports/shards)"',
    );
    expect(survivors).toContain("gh issue create");
    expect(survivors).toContain("gh issue comment");
    // The issue it comments on is one it opened: a title is anyone's to copy.
    expect(survivors).toContain(
      '.user.login == "github-actions[bot]" and .title == env.TITLE',
    );
    expect(survivors).not.toContain("--search");
    // Only the job that writes the issue may write one.
    expect(shardJob).not.toContain("'issues'");
    // `Pipeline Complete` needs only jobs of ci.yml, which never calls this.
    expect(ci).not.toContain("'uses': './.github/workflows/mutation-full.yml'");
    expect(full).not.toContain("'workflow_call'");
  });

  it("runs every test file that imports from src/", () => {
    const runner = readFileSync(
      join(REPOSITORY, config.vitest.configFile),
      "utf8",
    );
    const importing = testFiles(join(REPOSITORY, "test")).filter(
      (file) =>
        !(file in OUTSIDE_THE_SANDBOX) &&
        /from "(\.\.\/)+src\//.test(
          readFileSync(join(REPOSITORY, file), "utf8"),
        ),
    );

    expect(importing.length).toBeGreaterThan(0);
    for (const file of importing)
      expect(
        runner.includes(`"${file}"`) ||
          (file.startsWith("test/model/") &&
            runner.includes('"test/model/**/*.test.ts"')),
        file,
      ).toBe(true);
  });

  it("ignores .claude and .agents, so the sandbox copy never touches the .claude/skills symlink", () => {
    // Stryker's sandbox copy once died here: "EISDIR: illegal operation on a
    // directory, copyfile '.../.claude/skills' -> '.../.stryker-tmp/.../.claude/skills'",
    // because copyfile refuses a symlink that points at a directory.
    expect(config.ignorePatterns).toContain("/.claude");
    expect(config.ignorePatterns).toContain("/.agents");
  });
});
