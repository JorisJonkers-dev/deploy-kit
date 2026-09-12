// No em-dashes may enter the repository.
//
// Both rewrite batches landed: #26 (specification) and #27 (decision records,
// registers, root documents and tooling) rewrote every existing em-dash, so the
// transitional allow list is gone and this is a flat ban. The failure message
// says what to use instead.
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

function isExcluded(rel) {
  if (EXCLUDE.includes(rel)) return true;
  return EXCLUDE_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

// Pure scan over a {rel: content} map, so the mechanism is testable against
// synthetic trees exactly the way link-contract.test.js does. Returns the
// list of offenders, each naming the file and what to write instead.
function offendersIn(files) {
  const offenders = [];
  for (const rel of Object.keys(files).sort()) {
    if (isExcluded(rel)) continue;
    if (files[rel].includes("\u2014")) {
      offenders.push(
        `${rel} contains an em-dash (\u2014); use a comma, a colon, a full stop or parentheses instead`,
      );
    }
  }
  return offenders;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .sort();
}

test("no em-dash in tracked text outside the exclusions", () => {
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
  const offenders = offendersIn(files);
  assert.deepEqual(offenders, []);
});

test("an em-dash fails and names the file and what to use instead", () => {
  const offenders = offendersIn({
    "a.md": "fine\n",
    "b.md": "uses an em dash\u2014here\n",
  });
  assert.equal(offenders.length, 1);
  assert.equal(
    offenders[0],
    "b.md contains an em-dash (\u2014); use a comma, a colon, a full stop or parentheses instead",
  );
});

test("docs/mde and CHANGELOG.md are never scanned", () => {
  const offenders = offendersIn({
    "docs/mde/lecture/notes.md": "third-party\u2014verbatim\n",
    "CHANGELOG.md": "release please\u2014owns this\n",
  });
  assert.deepEqual(offenders, []);
});
