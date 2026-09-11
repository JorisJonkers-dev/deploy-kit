// The PR title/commit validator (scripts/check-pr-title.mjs) and the vendored
// commit-msg hook must agree on which types are conventional. The hook is the
// authority, copied unchanged from the estate; if one side accepts a type the
// other does not, contributors get conflicting signals on laptop and in CI.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMIT_TYPES,
  isConventional,
  failureReason,
  check,
} from "../scripts/check-pr-title.mjs";

test("every type the script accepts the vendored hook accepts too", () => {
  const hook = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "templates",
      "push-protection",
      "hooks",
      "commit-msg",
    ),
    "utf8",
  );
  const match = hook.match(/grep -Eq '\^\(([^)]+)\)/);
  assert.ok(match, "could not read the type list out of the commit-msg hook");
  const hookTypes = match[1]
    .split("|")
    .map((t) => t.trim())
    .sort();
  const scriptTypes = [...COMMIT_TYPES].sort();
  assert.deepEqual(
    scriptTypes,
    hookTypes,
    "script and commit-msg hook must accept the same conventional commit types",
  );
});

test("conventional subjects pass", () => {
  const pass = [
    "feat: add a workflow",
    "fix(ci): correct the node version",
    "docs(scope): reword",
    "ci: split the pipeline",
    "chore(deps): bump actions/checkout from 6 to 7",
    "build(deps): bump @types/node",
    "revert: undo yesterday",
    "chore(main): release 0.2.0",
  ];
  for (const s of pass) {
    assert.ok(isConventional(s), `${s} should be conventional`);
    assert.equal(failureReason(s), null, `${s} should have no failure reason`);
  }
});

test("non-conventional subjects fail and explain the shape", () => {
  const fail = [
    "", // empty
    "Bugfix", // not in the type list
    "Fix bug", // missing the colon
    "fix", // no subject after the colon
    "feat", // bare
    "hotfix: do a thing", // not a conventional type
    "fix: without punctuation after subject", // actually conventional; see pass
  ];
  for (const s of fail.filter(
    (x) => x !== "fix: without punctuation after subject",
  )) {
    assert.ok(
      !isConventional(s),
      `${JSON.stringify(s)} should not be conventional`,
    );
    const reason = failureReason(s);
    assert.ok(reason, `${s} should explain the failure`);
    assert.match(reason, /Conventional Commit/);
  }
  // The colon form without a scope, with a proper subject, is conventional.
  assert.ok(
    isConventional("fix: pinch a line"),
    "fix: <subject> is conventional",
  );
});

test("release-please and Dependabot subjects pass", () => {
  // The workflow and CI gate that no bot update is wrongly rejected.
  for (const s of [
    "chore(main): release 0.1.0",
    "build(deps): bump actions/setup-node from 6 to 7 (#5)",
    "docs: file the slides (#19)",
  ]) {
    assert.ok(isConventional(s), `${s} should pass`);
  }
});

test("check() reports a bad title and bad commits in a range", () => {
  // No range: only the title is judged.
  const bad = check("plain words", undefined);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /pull request title/);

  const good = check("feat: add the workflow");
  assert.deepEqual(good, []);
});
