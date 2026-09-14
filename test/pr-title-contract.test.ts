// The PR title and commit validator (scripts/check-pr-title.ts) and the
// vendored commit-msg hook must agree on which types are conventional. The
// hook is the authority, copied unchanged from the estate; if one side accepts
// a type the other does not, contributors get conflicting signals on a laptop
// and in CI.
//
// REQ-005 (docs/requirements.md): a pull request title and its commits use a
// conventional-commit type release-please reads.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMIT_TYPES,
  check,
  failureReason,
  isConventional,
  main,
} from "../scripts/check-pr-title.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** A repository whose commits carry `subjects`, and the range that spans them. */
function history(subjects: readonly string[]): { root: string; range: string } {
  const root = mkdtempSync(join(temporary(), "history-"));
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: root, encoding: "utf8" },
    ).trim();
  git("init", "-q");
  // --no-verify: a machine-wide commit-msg hook would refuse the bad subjects
  // this fixture exists to hold.
  git("commit", "-q", "--allow-empty", "--no-verify", "-m", "chore: the base");
  const base = git("rev-parse", "HEAD");
  for (const subject of subjects)
    git("commit", "-q", "--allow-empty", "--no-verify", "-m", subject);
  return { root, range: `${base}..HEAD` };
}

describe("the types", () => {
  it("are the ones the vendored hook accepts, no more and no fewer", () => {
    const hook = readFileSync(
      join(REPOSITORY, "templates", "push-protection", "hooks", "commit-msg"),
      "utf8",
    );
    const listed = /grep -Eq '\^\(([^)]+)\)/.exec(hook)?.[1];
    expect(listed, "no type list in the commit-msg hook").toBeDefined();
    const hookTypes = (listed ?? "")
      .split("|")
      .map((type) => type.trim())
      .sort();
    expect([...COMMIT_TYPES].sort()).toStrictEqual(hookTypes);
  });
});

describe("a subject", () => {
  it("passes when it is conventional", () => {
    for (const subject of [
      "feat: add a workflow",
      "fix(ci): correct the node version",
      "docs(scope): reword",
      "ci: split the pipeline",
      "chore(deps): bump actions/checkout from 6 to 7",
      "build(deps): bump @types/node",
      "revert: undo yesterday",
      "fix: pinch a line",
    ]) {
      expect(isConventional(subject), subject).toBe(true);
      expect(failureReason(subject), subject).toBeNull();
    }
  });

  it("passes when release-please or Dependabot wrote it", () => {
    for (const subject of [
      "chore(main): release 0.1.0",
      "build(deps): bump actions/setup-node from 6 to 7 (#5)",
      "docs: file the slides (#19)",
    ])
      expect(isConventional(subject), subject).toBe(true);
  });

  it("fails, and explains the shape, when it is not conventional", () => {
    for (const subject of [
      "",
      "Bugfix",
      "Fix bug",
      "fix",
      "hotfix: do a thing",
    ]) {
      expect(isConventional(subject), JSON.stringify(subject)).toBe(false);
      expect(failureReason(subject), JSON.stringify(subject)).toMatch(
        /is not a Conventional Commit/,
      );
    }
  });
});

describe("check", () => {
  it("reports a title that is not conventional, and nothing for one that is", () => {
    const failures = check("plain words");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^pull request title: /);
    expect(check("feat: add the workflow")).toStrictEqual([]);
  });

  it("reports each commit in the range that is not conventional", () => {
    const { root, range } = history(["feat: a fine one", "plain words"]);
    const failures = check("feat: a fine title", range, root);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^commit "plain words": /);
  });
});

describe("the command", () => {
  it("prints its usage, and exits 2, without a title", () => {
    const output = collect();
    expect(main([], output)).toBe(2);
    expect(output.text()).toMatch(/^usage: /);
  });

  it("says so, and exits 0, when everything is conventional", () => {
    const output = collect();
    expect(main(["--title", "feat: add a workflow"], output)).toBe(0);
    expect(output.text()).toBe("pr title and commits are conventional\n");
  });

  it("lists the failures, and exits 1, when something is not", () => {
    const output = collect();
    expect(main(["--title", "Fix bug"], output)).toBe(1);
    expect(output.text()).toMatch(/^pull request title: "Fix bug" is not/);
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "check-pr-title.ts"), "--title", "Fix bug"],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('"Fix bug" is not a Conventional Commit');
  });
});
