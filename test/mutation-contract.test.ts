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
const pullRequestJob = jobOf(ci, "mutation");
const shardJob = jobOf(full, "shard");

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
    for (const job of [pullRequestJob, shardJob]) {
      expect(job).toContain("actions/upload-artifact@");
      expect(job).toContain("'if': 'always()'");
      expect(job).toContain("'path': 'reports/mutation'");
    }
  });

  // RULE-064. Stryker tests a mutant again when its module changed or a test
  // file that covered it changed, and takes every other result from the
  // report it is handed, so the score is still over every mutant.
  it("re-tests on a pull request what the change reaches, against the last green run on main, npm run test:mutation -- --incremental", () => {
    expect(pullRequestJob).toContain(
      "'run': 'npm run test:mutation -- --incremental'",
    );
    expect(pullRequestJob).toContain(
      'gh run list --repo "${REPO}" --workflow ci.yml --branch main --event push --status success --limit 1',
    );
    expect(pullRequestJob).toContain(
      'gh run download "${run}" --repo "${REPO}" --name mutation-incremental --dir reports',
    );
    // One job over every module: a matrix would hand each shard a report
    // that holds the other shards' mutants too.
    expect(pullRequestJob).not.toContain("'matrix':");
    expect(pullRequestJob).not.toContain("--mutate");
    expect(ci).toMatch(/'pipeline-complete':[\s\S]*?- 'mutation'\n/);
  });

  it("uploads the report the next run reads from a push to main, and from nothing else", () => {
    const upload = pullRequestJob.split("'name': 'Upload the report")[1] ?? "";

    expect(upload).toContain(
      `'if': "github.event_name == 'push' && github.ref == 'refs/heads/main'"`,
    );
    expect(upload).toContain("'name': 'mutation-incremental'");
    // Where Stryker writes it when no other path is named.
    expect(upload).toContain("'path': 'reports/stryker-incremental.json'");
    expect(JSON.stringify(config)).not.toContain("incrementalFile");
  });

  // The full run is shards, each mutating a disjoint share of the files the
  // config names; test/mutation-shard.test.ts holds the split itself.
  it("runs the full run as one shard per matrix entry, each handed the shard count the matrix lists", () => {
    const shards = /'shard': \[([\d, ]+)\]/.exec(shardJob)?.[1] ?? "";
    const count = shards.split(",").length;

    expect(shards.split(",").map(Number)).toStrictEqual(
      Array.from({ length: count }, (_, index) => index + 1),
    );
    expect(count).toBeGreaterThan(1);
    expect(shardJob).toContain(
      `files="$(node scripts/mutation-shard.ts "$SHARD" ${String(count)})"`,
    );
    expect(shardJob).toContain('npm run test:mutation -- --mutate "$files"');
    expect(shardJob).not.toContain("--incremental");
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
