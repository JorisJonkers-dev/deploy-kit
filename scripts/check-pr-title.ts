// Validate a pull request title, or every commit in a range, against the
// Conventional Commits shape release-please reads, and explain the expected
// shape when one does not match.
//
// The set of accepted types is this script's single source of truth, and a
// test keeps it equal to the set the vendored commit-msg hook accepts. The
// workflow runs this on every pull request, and a contributor runs the same
// command before pushing, so the workflow enforces nothing that cannot be
// reproduced on a laptop:
//
//   node scripts/check-pr-title.ts --title "feat(ci): add a workflow" [--range a..b]
import { execFileSync } from "node:child_process";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

// The Conventional Commits types release-please understands. This must stay
// equal to the list in templates/push-protection/hooks/commit-msg, and
// test/pr-title-contract.test.ts keeps the two in step.
export const COMMIT_TYPES: readonly string[] = [
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

/** Whether one subject line is a Conventional Commit, or a release or merge line. */
export function isConventional(subject: string): boolean {
  return RELEASE.test(subject) || EXACT.test(subject);
}

/** Why a subject fails, in words, or null when it passes. */
export function failureReason(subject: string): string | null {
  if (isConventional(subject)) return null;
  return (
    `"${subject}" is not a Conventional Commit. ` +
    `Expected one of ${COMMIT_TYPES.join(", ")} in the form ` +
    `type(scope)!: subject, e.g. feat(ci): add workflow. ` +
    `Release-please reads feat and fix; the hook also accepts ` +
    `docs, style, refactor, perf, test, build, ci, chore and revert.`
  );
}

/**
 * Every failure in a pull request title and, when a range is given, in each
 * commit subject in that range of the repository at `cwd`. Empty means clean.
 */
export function check(
  title: string,
  range?: string,
  cwd: string = process.cwd(),
): string[] {
  const failures: string[] = [];
  const titleFailure = failureReason(title);
  if (titleFailure !== null)
    failures.push(`pull request title: ${titleFailure}`);

  if (range) {
    const subjects = execFileSync("git", ["log", "--format=%s", range], {
      cwd,
      encoding: "utf8",
    })
      .split("\n")
      .filter((subject) => subject !== "");
    for (const subject of subjects) {
      const why = failureReason(subject);
      if (why !== null) failures.push(`commit "${subject}": ${why}`);
    }
  }
  return failures;
}

/** Check `--title` and an optional `--range`; exit 0 when clean, 1 when not, 2 on bad usage. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const title = flag("--title");
  if (!title) {
    output.err(
      'usage: node scripts/check-pr-title.ts --title "..." [--range a..b]\n',
    );
    return 2;
  }
  const failures = check(title, flag("--range"));
  if (failures.length > 0) {
    output.err(failures.map((failure) => `${failure}\n`).join(""));
    return 1;
  }
  output.out("pr title and commits are conventional\n");
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
