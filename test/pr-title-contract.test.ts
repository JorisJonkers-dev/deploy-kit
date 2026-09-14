// The PR title and commit validator (scripts/check-pr-title.ts) and the
// vendored commit-msg hook must agree on which types are conventional. The
// hook is the authority, copied unchanged from the estate; if one side accepts
// a type the other does not, contributors get conflicting signals on a laptop
// and in CI.
//
// REQ-005 (docs/requirements.md): a pull request title and its commits use a
// conventional-commit type release-please reads.
//
// REQ-012 (docs/requirements.md): a pull request's title, body and commits
// carry no agent attribution.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMIT_TYPES,
  attributionFindings,
  check,
  failureReason,
  isConventional,
  main,
} from "../scripts/check-pr-title.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/**
 * A repository whose commits carry `messages` (each a full commit message,
 * subject only or subject plus a trailer-bearing body), and the range that
 * spans them.
 */
function history(messages: readonly string[]): { root: string; range: string } {
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
  for (const message of messages)
    git("commit", "-q", "--allow-empty", "--no-verify", "-m", message);
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

  it("reports agent attribution in the pull request body, naming the line", () => {
    const failures = check(
      "feat: add a workflow",
      undefined,
      undefined,
      "Thanks!\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBe(
      "pull request body: a Co-Authored-By trailer names a coding agent " +
        '("claude"); credit a person instead, or remove the trailer ' +
        '("Co-Authored-By: Claude <noreply@anthropic.com>")',
    );
  });

  it("passes a pull request body with no attribution", () => {
    expect(
      check(
        "feat: add a workflow",
        undefined,
        undefined,
        "Nothing to see here.",
      ),
    ).toStrictEqual([]);
  });

  it("reports agent attribution in a commit message, naming the commit", () => {
    const { root, range } = history([
      "feat: a fine one",
      "fix: patch\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
    ]);
    const failures = check("feat: a fine title", range, root);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(
      /^commit "fix: patch": a Co-Authored-By trailer names a coding agent \("claude"\)/,
    );
  });

  it("passes a commit with a human co-author", () => {
    const { root, range } = history([
      "fix: patch\n\nCo-Authored-By: Jane Doe <jane@example.com>",
    ]);
    expect(check("feat: a fine title", range, root)).toStrictEqual([]);
  });

  it("passes a clean pull request end to end", () => {
    const { root, range } = history(["fix: patch", "docs: update"]);
    expect(
      check("feat: add a workflow", range, root, "Nothing to see here."),
    ).toStrictEqual([]);
  });
});

describe("attributionFindings", () => {
  it("passes a human co-author", () => {
    expect(
      attributionFindings("Co-Authored-By: Jane Doe <jane@example.com>"),
    ).toStrictEqual([]);
  });

  it("finds a Co-Authored-By trailer naming a coding agent", () => {
    const findings = attributionFindings(
      "fix: patch\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(
      "Co-Authored-By: Claude <noreply@anthropic.com>",
    );
    expect(findings[0]?.reason).toMatch(
      /a Co-Authored-By trailer names a coding agent \("claude"\)/,
    );
  });

  it("finds a Co-Authored-By trailer naming a known agent bot account", () => {
    const findings = attributionFindings(
      "Co-authored-by: google-labs-jules[bot] " +
        "<161369871+google-labs-jules[bot]@users.noreply.github.com>",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/"google-labs-jules"/);
  });

  it("finds a generated-with banner naming a coding agent", () => {
    const findings = attributionFindings(
      "fix: patch\n\n🤖 Generated with [Claude Code](https://claude.ai/code)",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(
      /a "generated with" banner names a coding agent \("claude"\)/,
    );
  });

  it("passes a banner that names nothing agent-shaped", () => {
    expect(
      attributionFindings("Generated with love, by the whole team"),
    ).toStrictEqual([]);
  });

  it("finds a link back to a coding agent session", () => {
    const findings = attributionFindings(
      "See https://claude.ai/chat/abc123 for the transcript",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toBe(
      "a link back to a coding agent session; remove the link",
    );
  });

  it("finds a session link through an arbitrary subdomain", () => {
    const findings = attributionFindings(
      "See https://app.devin.ai/session/9 for the transcript",
    );
    expect(findings).toHaveLength(1);
  });

  it("finds every genuine multi-label host, dot and all", () => {
    for (const url of [
      "https://chat.openai.com/c/abc",
      "https://jules.google.com/task/1",
      "https://windsurf.com/session/1",
    ])
      expect(
        attributionFindings(`See ${url} for the transcript`),
        url,
      ).toHaveLength(1);
  });

  it("passes a link to anything that is not an agent session", () => {
    expect(
      attributionFindings("See https://github.com/org/repo/pull/1"),
    ).toStrictEqual([]);
  });

  it("does not match a banned host sitting in another host's path", () => {
    // Unanchored, "claude.ai" as a bare substring would also match here;
    // the real host is evil.com, and claude.ai is only a path segment.
    expect(
      attributionFindings("See https://evil.com/claude.ai/x for details"),
    ).toStrictEqual([]);
  });

  it("does not match a host name one character off from a real host", () => {
    // An unescaped "." in "chat.openai.com" is a wildcard, so it would also
    // match "chatXopenai.com". It must not.
    expect(
      attributionFindings("See https://chatXopenai.com/session for details"),
    ).toStrictEqual([]);
    expect(
      attributionFindings("See https://julesXgoogle.com/session for details"),
    ).toStrictEqual([]);
  });

  it("does not match a real host used as a prefix of someone else's domain", () => {
    // claude.ai followed by another label, rather than a real host
    // boundary, is claude.ai.evil.com, not a link to claude.ai.
    expect(
      attributionFindings("See https://claude.ai.evil.com/x for details"),
    ).toStrictEqual([]);
  });

  it("ignores blank lines", () => {
    expect(attributionFindings("\n\n")).toStrictEqual([]);
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

  it("fails, naming the line, when the body carries agent attribution", () => {
    const output = collect();
    const code = main(
      [
        "--title",
        "feat: add a workflow",
        "--body",
        "Co-Authored-By: Claude <noreply@anthropic.com>",
      ],
      output,
    );
    expect(code).toBe(1);
    expect(output.text()).toMatch(
      /^pull request body: a Co-Authored-By trailer names a coding agent \("claude"\)/,
    );
  });

  it("passes when the body's Co-Authored-By names a person", () => {
    const output = collect();
    const code = main(
      [
        "--title",
        "feat: add a workflow",
        "--body",
        "Co-Authored-By: Jane Doe <jane@example.com>",
      ],
      output,
    );
    expect(code).toBe(0);
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
