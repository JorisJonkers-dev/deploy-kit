// The claim-issue candidate extraction, executed with no `gh` call at all.
//
// This is the fix for a real incident: a first version of this logic read
// every bare "#NNN" a pull request mentioned as a claim on that issue, which
// labelled unrelated issues a body merely referenced. These fixtures prove
// the replacement reads intent (a GitHub closing keyword) rather than mere
// mention.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  branchIssueNumber,
  candidateIssues,
  claimAction,
  closingReferences,
  main,
} from "../scripts/claim-issue.ts";
import { collect } from "./support/collect.ts";

const REPOSITORY = join(import.meta.dirname, "..");

describe("closingReferences", () => {
  it("reads a single closing keyword", () => {
    expect(closingReferences("Closes #32")).toStrictEqual([32]);
  });

  it("reads several closing keywords in one text, deduplicated", () => {
    expect(
      closingReferences("closes #32, fixes #33, resolves #32"),
    ).toStrictEqual([32, 33]);
  });

  it("is case-insensitive", () => {
    expect(closingReferences("FIXES #7")).toStrictEqual([7]);
    expect(closingReferences("Resolved #8")).toStrictEqual([8]);
  });

  it("accepts every close/fix/resolve inflection", () => {
    for (const word of [
      "close",
      "closes",
      "closed",
      "fix",
      "fixes",
      "fixed",
      "resolve",
      "resolves",
      "resolved",
    ]) {
      expect(closingReferences(`${word} #1`), word).toStrictEqual([1]);
    }
  });

  it("accepts a colon between the keyword and the number", () => {
    expect(closingReferences("Fixes: #32")).toStrictEqual([32]);
  });

  // The exact shape of the incident this script exists to prevent: a bare
  // mention is not a claim, however it reads in prose.
  it("does not read a mention with no closing keyword as a claim", () => {
    expect(closingReferences("follows #115")).toStrictEqual([]);
    expect(closingReferences("blocked by #39")).toStrictEqual([]);
    expect(closingReferences("see #41")).toStrictEqual([]);
    expect(closingReferences("unlike #41, this one is done")).toStrictEqual([]);
  });

  it("does not match a keyword that is only a substring of a longer word", () => {
    expect(closingReferences("discloses #32")).toStrictEqual([]);
    expect(closingReferences("prefixes #32")).toStrictEqual([]);
  });

  // Decision: a closing keyword quoted inside a fenced code block is not a
  // claim, the same treatment lint-docs.ts's pathClaims gives a fenced
  // block's contents. An issue body that quotes "Closes #99" as an example
  // of the convention, inside a fence, is not thereby claiming #99.
  it("does not read a closing keyword inside a fenced code block", () => {
    const body = ["```", "Closes #99", "```", "", "See #41 for context."].join(
      "\n",
    );
    expect(closingReferences(body)).toStrictEqual([]);
  });

  it("still reads a real claim outside the fence, in the same body", () => {
    const body = ["Closes #32.", "", "```", "Closes #99", "```"].join("\n");
    expect(closingReferences(body)).toStrictEqual([32]);
  });

  it("finds nothing in text with no closing keyword at all", () => {
    expect(closingReferences("nothing to see here")).toStrictEqual([]);
  });
});

describe("branchIssueNumber", () => {
  it("reads the leading number after the last slash", () => {
    expect(branchIssueNumber("docs/32-agents-md")).toBe(32);
  });

  it("reads the leading number of a branch with no slash", () => {
    expect(branchIssueNumber("32-agents-md")).toBe(32);
  });

  it("finds nothing when the branch names no leading number", () => {
    expect(branchIssueNumber("docs/agents-md")).toBeNull();
  });

  it("finds nothing for an empty branch name", () => {
    expect(branchIssueNumber("")).toBeNull();
  });
});

describe("candidateIssues", () => {
  it("combines the title, the body and the branch, deduplicated and sorted", () => {
    expect(
      candidateIssues({
        title: "docs: route every agent (closes #32)",
        body: "Fixes #33",
        branch: "docs/33-agents-md",
      }),
    ).toStrictEqual([32, 33]);
  });

  it("finds nothing when none of the three names a claim", () => {
    expect(
      candidateIssues({
        title: "docs: tidy up (see #41)",
        body: "follows #115",
        branch: "docs/agents-md",
      }),
    ).toStrictEqual([]);
  });
});

describe("claimAction", () => {
  it("claims on opened, reopened and edited", () => {
    expect(claimAction("opened")).toBe("claim");
    expect(claimAction("reopened")).toBe("claim");
    expect(claimAction("edited")).toBe("claim");
  });

  it("releases on closed", () => {
    expect(claimAction("closed")).toBe("release");
  });

  it("does nothing for a push (synchronize), deliberately not a trigger", () => {
    expect(claimAction("synchronize")).toBeNull();
  });

  it("does nothing for an event it does not recognise", () => {
    expect(claimAction("labeled")).toBeNull();
  });
});

describe("the command", () => {
  it("prints every candidate, one per line, sorted", () => {
    const output = collect();
    expect(
      main(
        ["--title", "closes #33", "--body", "fixes #32", "--branch", "main"],
        output,
      ),
    ).toBe(0);
    expect(output.text()).toBe("32\n33\n");
  });

  it("prints nothing when there is nothing to claim", () => {
    const output = collect();
    expect(
      main(["--title", "see #41", "--body", "", "--branch", "main"], output),
    ).toBe(0);
    expect(output.text()).toBe("");
  });

  it("treats a missing flag as an empty string", () => {
    const output = collect();
    expect(main([], output)).toBe(0);
    expect(output.text()).toBe("");
  });

  it("runs when Node starts the script, which is how the workflow runs it", () => {
    const run = spawnSync(
      process.execPath,
      [
        join(REPOSITORY, "scripts", "claim-issue.ts"),
        "--title",
        "closes #32",
        "--body",
        "",
        "--branch",
        "main",
      ],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("32\n");
  });
});

describe("the entrypoint guard", () => {
  // As with lint-agents.ts: a same-process module reload drives the
  // bottom-of-file guard and the `output` parameter's default value, both of
  // which every explicit-argument call above leaves untouched.
  it("runs main and sets process.exitCode when Node starts this module", async () => {
    const modulePath = join(REPOSITORY, "scripts", "claim-issue.ts");
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [process.argv[0] ?? "node", modulePath];
    vi.resetModules();
    try {
      await import("../scripts/claim-issue.ts");
      expect(process.exitCode).toBe(0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
