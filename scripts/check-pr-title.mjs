#!/usr/bin/env node
// Validate a pull request title, or every commit in a range, against the
// Conventional Commits shape release-please reads, and explain the expected
// shape when one does not match.
//
// The set of accepted types is the single source of truth for this script, and
// a test keeps it equal to the set the vendored commit-msg hook accepts. The
// workflow runs this on every pull request, and a contributor runs the same
// command locally before pushing, so the workflow enforces nothing that cannot
// be reproduced on a laptop.
import { execFileSync } from "node:child_process";

// The Conventional Commits types release-please understands. This must stay
// equal to the case in `templates/push-protection/hooks/commit-msg`;
// test/pr-title-contract.test.js keeps them in lockstep.
export const COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
];

const SCOPE = String.raw`\([a-z0-9._/-]+\)`;
const RELEASE = /^(Merge\s|Revert\s|chore\(main\): release\s|Release\s)/;
const EXACT = new RegExp(`^(${COMMIT_TYPES.join("|")})(${SCOPE})?!?: .+`);

/** Does this single subject line satisfy a conventional commit? */
export function isConventional(subject) {
  return RELEASE.test(subject) || EXACT.test(subject);
}

/** A human-readable `why` for a subject that failed. */
export function failureReason(subject) {
  if (isConventional(subject)) return null;
  return (
    `"${subject}" is not a Conventional Commit. ` +
    `Expected one of ${COMMIT_TYPES.join(", ")} in the form ` +
    `type(scope)!: subject, e.g. feat(ci): add workflow. ` +
    `Release-please merges read feat and fix; the hook also accepts ` +
    `docs, style, refactor, perf, test, build, ci, chore and revert.`
  );
}

/**
 * Check a pull request title, or every commit in a range. Returns a list of
 * failures; empty means clean.
 *
 * @param title {string} the pull request title
 * @param range {string|undefined} a commit range "sha..sha"; when given, every
 *   commit subject in the range is checked in addition to the title.
 */
export function check(title, range = undefined) {
  const failures = [];
  const titleClean = failureReason(title);
  if (titleClean) failures.push(`pull request title: ${titleClean}`);

  if (range) {
    const subjects = execFileSync("git", ["log", "--format=%s", range], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
    for (const subject of subjects) {
      const why = failureReason(subject);
      if (why) failures.push(`commit "${subject}": ${why}`);
      // Dependabot's subjects are already conventional; nothing to special-case.
    }
  }
  return failures;
}

// CLI: `node scripts/check-pr-title.mjs --title "..." [--range a..b]`.
// Exits 0 when clean, 1 with the failures on stderr when not.
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop())
) {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  const title = get("--title");
  const range = get("--range");
  if (!title) {
    console.error(
      'usage: node scripts/check-pr-title.mjs --title "..." [--range a..b]',
    );
    process.exit(2);
  }
  const failures = check(title, range);
  if (failures.length > 0) {
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log("pr title and commits are conventional");
  process.exit(0);
}
