// Validate a pull request title, or every commit in a range, against the
// Conventional Commits shape release-please reads, and explain the expected
// shape when one does not match. The same pass also scans the pull request
// body and every commit message in the range for agent attribution: a
// Co-Authored-By trailer naming a coding agent rather than a person, a
// "generated with" banner naming one, or a link back to an agent session.
//
// The set of accepted types is this script's single source of truth, and a
// test keeps it equal to the set the vendored commit-msg hook accepts. The
// workflow runs this on every pull request, and a contributor runs the same
// command before pushing, so the workflow enforces nothing that cannot be
// reproduced on a laptop:
//
//   node scripts/check-pr-title.ts --title "feat(ci): add a workflow" \
//     [--range a..b] [--body "pull request body text"]
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

// Coding-agent identifiers seen in real trailers, banners and links. Brand
// terms only: no bare human first name, because Cody, Devin and Jules are
// all names real people carry, so matching them alone would fail a genuine
// human co-author on a coincidence. Where an agent's own commits identify it
// through a distinctive bot account (`devin-ai-integration`,
// `google-labs-jules[bot]`) that account name is the marker instead of the
// plain name.
const AGENT_MARKERS: readonly string[] = [
  "claude",
  "anthropic",
  "copilot",
  "chatgpt",
  "openai",
  "codex",
  "cursor",
  "windsurf",
  "aider",
  "codeium",
  "tabnine",
  "devin-ai-integration",
  "devin.ai",
  "google-labs-jules",
  "jules[bot]",
  "amazon-q-developer",
  "codewhisperer",
];

/** The first agent marker `text` contains, case-insensitively, or undefined. */
function agentMarker(text: string): string | undefined {
  const lower = text.toLowerCase();
  return AGENT_MARKERS.find((marker) => lower.includes(marker));
}

const CO_AUTHOR_LINE = /^co-authored-by:\s*(.+)$/i;
const BANNER_LINE = /\bgenerated\s+(with|by|using)\b/i;
const SESSION_HOSTS: readonly string[] = [
  "claude.ai",
  "chatgpt.com",
  "chat.openai.com",
  "devin.ai",
  "app.devin.ai",
  "cursor.sh",
  "windsurf.com",
  "windsurf.ai",
  "aider.chat",
  "jules.google.com",
];
const SESSION_LINK = new RegExp(
  `https?://\\S*(?:${SESSION_HOSTS.map((host) => host.replace(/\./g, "\\.")).join("|")})\\S*`,
  "i",
);

/** One line of a pull request body or commit message that carries agent attribution. */
export interface AttributionFinding {
  readonly line: string;
  readonly reason: string;
}

/**
 * Every line in `text` that carries agent attribution: a Co-Authored-By
 * trailer naming a coding agent, a "generated with" banner naming one, or a
 * link back to an agent session. A human co-author, an ordinary banner-free
 * message, and a link to anything else all produce nothing here.
 */
export function attributionFindings(text: string): AttributionFinding[] {
  const findings: AttributionFinding[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;

    const coAuthor = CO_AUTHOR_LINE.exec(line);
    if (coAuthor) {
      // The `.+` group cannot be empty when the outer regex has matched.
      const marker = agentMarker(coAuthor[1] as string);
      if (marker) {
        findings.push({
          line,
          reason:
            `a Co-Authored-By trailer names a coding agent ("${marker}"); ` +
            `credit a person instead, or remove the trailer`,
        });
        continue;
      }
    }

    if (BANNER_LINE.test(line)) {
      const marker = agentMarker(line);
      if (marker) {
        findings.push({
          line,
          reason:
            `a "generated with" banner names a coding agent ("${marker}"); ` +
            `remove the banner`,
        });
        continue;
      }
    }

    if (SESSION_LINK.test(line))
      findings.push({
        line,
        reason: "a link back to a coding agent session; remove the link",
      });
  }
  return findings;
}

/** Every attribution finding in `text`, each named as coming from `context`. */
function attributionFailures(context: string, text: string): string[] {
  return attributionFindings(text).map(
    (finding) => `${context}: ${finding.reason} ("${finding.line}")`,
  );
}

/**
 * Every failure in a pull request title and body and, when a range is given,
 * in each commit subject and full message in that range of the repository at
 * `cwd`. Empty means clean.
 */
export function check(
  title: string,
  range?: string,
  cwd: string = process.cwd(),
  body?: string,
): string[] {
  const failures: string[] = [];
  const titleFailure = failureReason(title);
  if (titleFailure !== null)
    failures.push(`pull request title: ${titleFailure}`);

  if (body) failures.push(...attributionFailures("pull request body", body));

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

    // %B carries the full, unwrapped commit message (subject and body), so a
    // trailer or banner in the body is only visible here. \x00 separates
    // records, since a commit message may itself hold a blank line.
    const messages = execFileSync("git", ["log", "--format=%B%x00", range], {
      cwd,
      encoding: "utf8",
    })
      .split("\0")
      .map((message) => message.replace(/\n+$/, ""))
      .filter((message) => message !== "");
    for (const message of messages) {
      // `messages` is filtered to non-empty strings, so splitting one always
      // yields at least one element.
      const subject = message.split("\n")[0] as string;
      failures.push(...attributionFailures(`commit "${subject}"`, message));
    }
  }
  return failures;
}

/**
 * Check `--title`, an optional `--range` and an optional `--body`; exit 0
 * when clean, 1 when not, 2 on bad usage.
 */
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
      'usage: node scripts/check-pr-title.ts --title "..." ' +
        '[--range a..b] [--body "..."]\n',
    );
    return 2;
  }
  const failures = check(title, flag("--range"), process.cwd(), flag("--body"));
  if (failures.length > 0) {
    output.err(failures.map((failure) => `${failure}\n`).join(""));
    return 1;
  }
  output.out("pr title and commits are conventional\n");
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
