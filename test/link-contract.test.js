// Relative links across the tree, executed.
//
// The ADR domain move rewrote about a hundred references outside the decision
// set. Nothing checked them, so the next move could break every one of them
// with every other gate green. These fixtures prove the check would fail.
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const LINT = join(import.meta.dirname, "..", "scripts", "lint-links.mjs");

/** Build a tracked tree, run the link lint, return {code, output}. */
function lintLinks(files) {
  const root = mkdtempSync(join(tmpdir(), "link-lint-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const target = join(root, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    // The lint reads `git ls-files`, so an untracked scratch file cannot fail
    // a build; the fixture has to be a repository for the same reason.
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    const r = spawnSync("node", [LINT, root], { encoding: "utf8" });
    return { code: r.status, output: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("resolving links and anchors pass", () => {
  const { code, output } = lintLinks({
    "README.md": "# Root\n\nSee [the chapter](spec/ch.md#a-heading).\n",
    "spec/ch.md":
      "# Chapter\n\n## A heading\n\nBack to [root](../README.md).\n",
  });
  assert.equal(code, 0, output);
  assert.match(output, /files clean/);
});

test("a link to a moved file fails", () => {
  const { code, output } = lintLinks({
    "README.md": "# Root\n\nSee [it](docs/adr/0003-a-decision.md).\n",
    "docs/adr/model/0003-a-decision.md": "# Moved\n",
  });
  assert.equal(code, 1);
  assert.match(output, /link to missing docs\/adr\/0003-a-decision\.md/);
});

test("a link to a renamed heading fails", () => {
  const { code, output } = lintLinks({
    "README.md": "# Root\n\nSee [it](spec/ch.md#the-old-name).\n",
    "spec/ch.md": "# Chapter\n\n## The new name\n",
  });
  assert.equal(code, 1);
  assert.match(output, /anchor #the-old-name not found in spec\/ch\.md/);
});

test("a same-file anchor is checked", () => {
  const { code, output } = lintLinks({
    "README.md":
      "# Root\n\n## Here\n\nSee [above](#here) and [nowhere](#gone).\n",
  });
  assert.equal(code, 1);
  assert.match(output, /anchor #gone not found/);
});

test("an explicit HTML anchor resolves", () => {
  const { code, output } = lintLinks({
    "gaps.md":
      '# Gaps\n\n<a id="g-27"></a>G-27 exists.\n\nSee [G-27](#g-27).\n',
  });
  assert.equal(code, 0, output);
});

test("a link inside a fenced block is illustration, not a link", () => {
  const { code, output } = lintLinks({
    "README.md": "# Root\n\n```md\n[example](nowhere/at/all.md)\n```\n",
  });
  assert.equal(code, 0, output);
});

test("an external URL is not fetched", () => {
  const { code, output } = lintLinks({
    "README.md": "# Root\n\n[issue](https://example.invalid/nope).\n",
  });
  assert.equal(code, 0, output);
});

test("an untracked file is not linted", () => {
  const root = mkdtempSync(join(tmpdir(), "link-lint-"));
  try {
    writeFileSync(join(root, "tracked.md"), "# Fine\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    writeFileSync(join(root, "scratch.md"), "[broken](nowhere.md)\n");
    const r = spawnSync("node", [LINT, root], { encoding: "utf8" });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
