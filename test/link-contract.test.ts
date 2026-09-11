// Relative links across the tree, executed.
//
// The ADR domain move rewrote about a hundred references outside the decision
// set. Nothing checked them, so the next move could break every one of them
// with every other gate green. These fixtures prove the check would fail.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintLinks, main } from "../scripts/lint-links.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

type Files = Readonly<Record<string, string>>;

function write(root: string, files: Files): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

/**
 * A git repository under this test's directory. The lint reads `git ls-files`,
 * so an untracked scratch file cannot fail a build, and the fixture has to be
 * a repository for the same reason. `untracked` is written after the add.
 */
function repository(tracked: Files, untracked: Files = {}): string {
  const root = mkdtempSync(join(temporary(), "link-lint-"));
  write(root, tracked);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  write(root, untracked);
  return root;
}

describe("the link lint", () => {
  it("passes resolving links and anchors, and counts the files it read", () => {
    const root = repository({
      "README.md": "# Root\n\nSee [the chapter](spec/ch.md#a-heading).\n",
      "spec/ch.md":
        "# Chapter\n\n## A heading\n\nBack to [root](../README.md).\n",
    });
    expect(lintLinks(root)).toStrictEqual({ files: 2, errors: [] });
  });

  it("fails a link to a moved file", () => {
    const root = repository({
      "README.md": "# Root\n\nSee [it](docs/adr/0003-a-decision.md).\n",
      "docs/adr/model/0003-a-decision.md": "# Moved\n",
    });
    expect(lintLinks(root).errors).toStrictEqual([
      "README.md: link to missing docs/adr/0003-a-decision.md",
    ]);
  });

  it("fails a link to a renamed heading", () => {
    const root = repository({
      "README.md": "# Root\n\nSee [it](spec/ch.md#the-old-name).\n",
      "spec/ch.md": "# Chapter\n\n## The new name\n",
    });
    expect(lintLinks(root).errors).toStrictEqual([
      "README.md: anchor #the-old-name not found in spec/ch.md",
    ]);
  });

  it("checks a same-file anchor", () => {
    const root = repository({
      "README.md":
        "# Root\n\n## Here\n\nSee [above](#here) and [nowhere](#gone).\n",
    });
    expect(lintLinks(root).errors).toStrictEqual([
      "README.md: anchor #gone not found in README.md",
    ]);
  });

  it("resolves an explicit HTML anchor", () => {
    const root = repository({
      "gaps.md":
        '# Gaps\n\n<a id="g-27"></a>G-27 exists.\n\nSee [G-27](#g-27).\n',
    });
    expect(lintLinks(root).errors).toStrictEqual([]);
  });

  it("resolves a link to a directory without checking an anchor", () => {
    const root = repository({
      "README.md":
        "# Root\n\nSee [the spec](spec/) and [again](spec#anything).\n",
      "spec/ch.md": "# Chapter\n",
    });
    expect(lintLinks(root).errors).toStrictEqual([]);
  });

  it("treats a link inside a fenced block as illustration", () => {
    const root = repository({
      "README.md": "# Root\n\n```md\n[example](nowhere/at/all.md)\n```\n",
    });
    expect(lintLinks(root).errors).toStrictEqual([]);
  });

  it("does not fetch an external URL", () => {
    const root = repository({
      "README.md": "# Root\n\n[issue](https://example.invalid/nope).\n",
    });
    expect(lintLinks(root).errors).toStrictEqual([]);
  });

  it("ignores an untracked file", () => {
    const root = repository(
      { "tracked.md": "# Fine\n" },
      { "scratch.md": "[broken](nowhere.md)\n" },
    );
    expect(lintLinks(root)).toStrictEqual({ files: 1, errors: [] });
  });
});

describe("the command", () => {
  it("says how many files were clean, and exits 0", () => {
    const output = collect();
    expect(main([repository({ "README.md": "# Fine\n" })], output)).toBe(0);
    expect(output.text()).toBe("link lint: 1 files clean\n");
  });

  it("lists every broken link under a count, and exits 1", () => {
    const output = collect();
    expect(
      main([repository({ "README.md": "[gone](gone.md)\n" })], output),
    ).toBe(1);
    expect(output.text()).toBe(
      "link lint: 1 error(s)\n  - README.md: link to missing gone.md\n",
    );
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    const run = spawnSync(
      process.execPath,
      [
        join(REPOSITORY, "scripts", "lint-links.ts"),
        repository({ "README.md": "[gone](gone.md)\n" }),
      ],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("link lint: 1 error(s)");
  });
});
