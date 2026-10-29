// The pipeline's job list must track the repository's own gates. An npm
// script with no workflow behind it is a gate nobody wired; a workflow that
// calls a script that no longer exists is a job whose step was never updated
// when the script moved or was renamed. Per
// docs/adr/architecture/0064-a-gate-is-a-script-or-a-named-job.md, a new gate's
// script and its CI job land in the same pull request, and this is the test
// that makes drift between the two visible instead of silent.
//
// REQ-010 (docs/requirements.md): a gate's npm script and the CI job that
// runs it land together.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY = join(import.meta.dirname, "..");

interface Pending {
  readonly script: string;
  readonly reason: string;
  readonly ticket: string;
}

// A script that runs in no workflow is normally a gate the wiring forgot.
// These four are deliberate exceptions, not gates: two mutate the working
// tree, which no CI step may do, one is the fast local loop the coverage
// variant supersedes in every workflow, and one is the local aggregate of
// every gate below, kept so a contributor can run the whole set in one
// command. None will ever gain a workflow step of its own, which is what the
// ticket field says for each.
const PENDING: readonly Pending[] = [
  {
    script: "lint:fix",
    reason: "eslint --fix mutates the tree; a developer command, not a gate",
    ticket: "n/a, never run in CI by design",
  },
  {
    script: "format",
    reason:
      "prettier --write mutates the tree; a developer command, not a gate",
    ticket: "n/a, never run in CI by design",
  },
  {
    script: "test",
    reason: "the fast local loop without coverage; CI runs test:coverage",
    ticket: "n/a, never run in CI by design",
  },
  {
    script: "verify",
    reason:
      "the local aggregate of every gate below; CI runs each gate as its " +
      "own job rather than the chain",
    ticket: "n/a, never run in CI by design",
  },
];

function packageScripts(): Record<string, string> {
  const pkg = JSON.parse(
    readFileSync(join(REPOSITORY, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  return pkg.scripts;
}

function workflows(): { name: string; text: string }[] {
  const dir = join(REPOSITORY, ".github", "workflows");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml"))
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
}

/** Whether `text` (a workflow file) runs the npm script named `script`. */
function runsScript(text: string, script: string): boolean {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`npm run ${escaped}(?![\\w:-])`).test(text);
}

describe("npm script wiring", () => {
  const scripts = packageScripts();
  const files = workflows();
  const wholeText = files.map((file) => file.text).join("\n");

  it("has scripts to check, so a clean result is not proving nothing", () => {
    expect(Object.keys(scripts).length).toBeGreaterThan(5);
  });

  it("every pending script names a reason and a ticket, so the list is not empty by omission", () => {
    for (const pending of PENDING) {
      expect(scripts, pending.script).toHaveProperty(pending.script);
      expect(pending.reason.length, pending.script).toBeGreaterThan(0);
      expect(pending.ticket.length, pending.script).toBeGreaterThan(0);
    }
  });

  it("every script either runs in some workflow, or is listed pending with a reason", () => {
    const pendingNames = new Set(PENDING.map((pending) => pending.script));
    const unwired = Object.keys(scripts).filter(
      (name) => !pendingNames.has(name) && !runsScript(wholeText, name),
    );
    expect(unwired).toStrictEqual([]);
  });

  it("no workflow calls an npm script package.json does not define", () => {
    for (const { name, text } of files)
      for (const match of text.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
        const script = match[1] ?? "";
        expect(scripts, `${name} calls npm run ${script}`).toHaveProperty(
          script,
        );
      }
  });

  it("every gate script a workflow invokes directly with node exists on disk", () => {
    const invoked = new Set<string>();
    for (const { text } of files)
      for (const match of text.matchAll(/node scripts\/([\w.-]+\.ts)/g))
        if (match[1]) invoked.add(match[1]);

    // A tautology check: this is what would fail if a direct `node
    // scripts/...` call were ever removed from every workflow without anyone
    // noticing, since an empty set trivially satisfies the loop below.
    expect(invoked.size).toBeGreaterThan(0);

    for (const file of invoked)
      expect(
        () => readFileSync(join(REPOSITORY, "scripts", file)),
        file,
      ).not.toThrow();
  });
});

// REQ-016 (docs/requirements.md): a code scanning finding of any severity fails
// Pipeline Complete.
describe("code scanning gates the merge", () => {
  const ci = readFileSync(
    join(REPOSITORY, ".github", "workflows", "ci.yml"),
    "utf8",
  );
  const codeql = readFileSync(
    join(REPOSITORY, ".github", "workflows", "codeql.yml"),
    "utf8",
  );
  const needs =
    /'pipeline-complete':[\s\S]*?'needs':\n((?:\s+- '[\w-]+'\n)+)/.exec(
      ci,
    )?.[1] ?? "";

  it("CI calls the CodeQL workflow as a job Pipeline Complete needs", () => {
    expect(ci).toContain("'uses': './.github/workflows/codeql.yml'");
    expect(needs).toContain("- 'codeql'");
    expect(codeql).toContain("'workflow_call':");
  });

  it("the CodeQL workflow fails on any unsuppressed finding", () => {
    expect(codeql).toContain("'name': 'Fail on any finding'");
    expect(codeql).toContain("'output': 'sarif'");
    expect(codeql).toContain("select((.suppressions // []) | length == 0)");
    expect(codeql).toContain("exit 1");
  });
});

// RULE-075 (docs/architecture-rules.md): the mutation gate is a scope job,
// parallel shards and one merging job, and only the merging job is a gate.
describe("the mutation gate's jobs", () => {
  const ci = readFileSync(
    join(REPOSITORY, ".github", "workflows", "ci.yml"),
    "utf8",
  );
  const job = (key: string): string =>
    ci.split(`  '${key}':\n`)[1]?.split("\n\n")[0] ?? "";
  const needs =
    /'pipeline-complete':[\s\S]*?'needs':\n((?:\s+- '[\w-]+'\n)+)/.exec(
      ci,
    )?.[1] ?? "";
  const scope = job("mutation-scope");
  const shard = job("mutation-shard");
  const gate = job("mutation");

  it("Pipeline Complete needs the merging job, which never skips, and no shard, which may", () => {
    expect(needs).toContain("- 'mutation'\n");
    expect(needs).not.toContain("- 'mutation-shard'");
    expect(needs).not.toContain("- 'mutation-scope'");
    expect(gate).toContain(
      `'needs':\n      - 'mutation-scope'\n      - 'mutation-shard'\n    'if': "always() && !startsWith(github.head_ref, 'release-please--')"`,
    );
  });

  it("runs the shards only where the scope job says the change reaches a mutant", () => {
    expect(scope).toContain("'needed': '${{ steps.scope.outputs.needed }}'");
    expect(shard).toContain("'needs':\n      - 'mutation-scope'");
    expect(shard).toContain(
      `'if': "needs.mutation-scope.outputs.needed == 'true'"`,
    );
    expect(shard).toContain("'fail-fast': false");
  });

  it("asks for a pull request against its merge commit's first parent, and runs on every push to main and the nightly run", () => {
    expect(scope).toContain("'fetch-depth': '2'");
    expect(scope).toContain(`if [ "\${EVENT}" = 'pull_request' ]; then`);
    expect(scope).toContain(
      'needed="$(node scripts/mutation-scope.ts HEAD^1)"',
    );
    expect(scope).not.toContain("needed='false'");
    expect(scope).toContain(`else\n            needed='true'`);
    expect(ci).toContain("'schedule':\n    - 'cron': '23 2 * * *'");
  });

  it("runs no gate on a release pull request, and Pipeline Complete passes it", () => {
    const release = "!startsWith(github.head_ref, 'release-please--')";
    for (const key of [
      "typecheck",
      "lint",
      "format",
      "architecture",
      "contracts",
      "tests",
      "mutation-scope",
      "package-contents",
      "actionlint",
      "secret-scan",
      "codeql",
    ])
      expect(job(key)).toContain(`'if': "${release}"`);
    // Its steps are apart by blank lines, so read it to the end of the file.
    const complete = ci.split("  'pipeline-complete':\n")[1] ?? "";
    expect(complete).toContain(`\${{ ${release} &&`);
    expect(complete).toContain(
      `'if': "startsWith(github.head_ref, 'release-please--')"`,
    );
  });

  it("passes where nothing it reads changed, and fails where the scope job or any shard did not succeed", () => {
    expect(gate).toContain(
      `'if': "needs.mutation-scope.result == 'success' && needs.mutation-scope.outputs.needed == 'false'"`,
    );
    const fail =
      gate.split("'name': 'Fail: the scope or a shard did not succeed'")[1] ??
      "";
    expect(fail).toContain("needs.mutation-scope.result != 'success'");
    expect(fail).toContain("needs.mutation-shard.result != 'success'");
    expect(fail).toContain("'run': 'exit 1'");
  });
});
