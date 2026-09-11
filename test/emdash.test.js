// No new em-dashes may enter the repository.
//
// THIS ONLY STOPS NEW ONES. Rewriting the existing ones off the list is #26
// (specification) and #27 (decision records, registers, root documents and
// tooling). Each rewrite batch is expected to take its files off the allow
// list below in the same pull request, so a listed file that no longer carries
// an em-dash *also* fails: the list can only shrink, never silently go stale.
//
// Two trees are never scanned: `docs/mde/`, which holds third-party papers,
// lecture material and coursework kept verbatim, and `CHANGELOG.md`, which
// release-please writes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(import.meta.dirname, "..");

const EXCLUDE = ["CHANGELOG.md"];
const EXCLUDE_PREFIXES = ["docs/mde/"];

// Files that still contain an em-dash today. The list can only shrink: each
// rewrite batch (see #26 and #27) removes the files it cleaned. A file listed
// here that no longer contains an em-dash fails the same way a new offender
// does, so the list cannot drift from the tree.
const ALLOW = [];

function isExcluded(rel) {
  if (EXCLUDE.includes(rel)) return true;
  return EXCLUDE_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

// Pure classification over a {rel: content} map, so the mechanism is testable
// against synthetic trees exactly the way link-contract.test.js does.
// Returns the list of offenders, each prefixed with why it fails.
function classify(files) {
  const offenders = [];
  for (const rel of Object.keys(files).sort()) {
    const hasEmDash = files[rel].includes("\u2014");
    const allowListed = ALLOW.includes(rel);
    if (isExcluded(rel)) {
      if (allowListed) {
        offenders.push(`${rel}: excluded but listed on the allow list`);
      }
      continue;
    }
    if (hasEmDash && !allowListed) {
      offenders.push(`${rel} contains an em-dash (\u2014)`);
    } else if (!hasEmDash && allowListed) {
      offenders.push(`${rel} is on the allow list but has no em-dash left`);
    }
  }
  return offenders;
}

// The live check: every tracked file (outside the exclusions) must satisfy the
// allow list exactly as it stands today.
function trackedFiles() {
  return execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .sort();
}

test("no new em-dashes in tracked text outside the exclusions", () => {
  const files = {};
  for (const rel of trackedFiles()) {
    let body;
    try {
      body = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue; // binary files that readFileSync chokes on are not prose
    }
    files[rel] = body;
  }
  const offenders = classify(files);
  assert.deepEqual(offenders, []);
});

test("adding an em-dash to an unlisted file fails and names the file", () => {
  const offenders = classify({
    "a.md": "fine\n",
    "b.md": "uses an em dash\u2014here\n",
  });
  assert.deepEqual(offenders, ["b.md contains an em-dash (\u2014)"]);
});

test("a listed file with no em-dash left fails until removed from the list", () => {
  // With an empty allow list the transition is already complete, so the
  // "listed but clean" branch is unreachable (its whole point was to force
  // each rewrite batch to prune the list).
  if (ALLOW.length === 0) return;
  const rel = ALLOW[0];
  const files = {};
  for (const r of ALLOW) files[r] = "\u2014\n";
  files[rel] = "clean now\n";
  const offenders = classify(files);
  assert.ok(
    offenders.some((o) => o.startsWith(`${rel} is on the allow list`)),
    offenders.join("\n"),
  );
});

test("docs/mde and CHANGELOG.md are never scanned", () => {
  const offenders = classify({
    "docs/mde/lecture/notes.md": "third-party\u2014verbatim\n",
    "CHANGELOG.md": "release please\u2014owns this\n",
  });
  assert.deepEqual(offenders, []);
});

test("the allow list holds every tracked file that contains an em-dash today", () => {
  const files = {};
  for (const rel of trackedFiles()) {
    let body;
    try {
      body = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    files[rel] = body;
  }
  const actual = [];
  for (const rel of Object.keys(files).sort()) {
    if (isExcluded(rel)) continue;
    if (files[rel].includes("\u2014")) actual.push(rel);
  }
  const missing = actual.filter((rel) => !ALLOW.includes(rel));
  const stale = ALLOW.filter((rel) => !actual.includes(rel));
  assert.deepEqual(
    { missing, stale },
    { missing: [], stale: [] },
    "the allow list must match the tracked files containing an em-dash",
  );
});
