// Which issues a pull request actually claims, and how: not every issue
// number it mentions.
//
// A body saying "follows #115", "blocked by #39" or "unlike #41" is not a
// claim on those issues; only a GitHub closing keyword immediately naming
// one is ("closes #32", "fixes #33"). Reading every bare "#NNN" as a claim
// was the shape of a real incident this script exists to prevent: a pull
// request's body cited several unrelated issues in passing, and a workflow
// this naive would have relabelled every one of them.
//
// The candidate list is pure and unit-tested with no `gh` call at all
// (test/claim-issue.test.ts). `.github/workflows/claim-issue.yml` is the one
// thin layer that calls `gh`: it runs `node scripts/claim-issue.ts` for the
// candidate list, then does its own lookup and labelling in bash, so a test
// never has to fake GitHub to prove the extraction correct.
//
//   node scripts/claim-issue.ts --title "docs: fix (#32)" \
//     --body "Closes #32, fixes #33" --branch "docs/32-agents-md"
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

// close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved, an
// optional colon, then #N. Word-bounded on both sides so "discloses #32" or
// "close-up #32" never match, and case-insensitive so "Closes" and "CLOSES"
// both do.
const CLOSING_KEYWORD =
  /\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s*#(\d+)/gi;

/**
 * Strip fenced code blocks before reading prose, the same move
 * lint-docs.ts's pathClaims makes: a closing keyword quoted inside one (an
 * example command, a template) is not a real claim, and reading it as one
 * would make an issue body impossible to use as documentation.
 */
function stripFencedCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

/**
 * The text a regex's second capture group matched. TypeScript types every
 * group as possibly absent regardless of quantifier, but `#(\d+)` is not
 * optional in `CLOSING_KEYWORD`: a match `matchAll` actually yielded cannot
 * itself lack this group. The cast says so once, the same move
 * lint-docs.ts's own `requiredGroup` makes for its regexes.
 */
function requiredGroup(match: RegExpMatchArray): string {
  return match[2] as string;
}

/** Every issue number a closing keyword names in `text`, deduplicated, unsorted. */
export function closingReferences(text: string): readonly number[] {
  const prose = stripFencedCode(text);
  const found = new Set<number>();
  for (const match of prose.matchAll(CLOSING_KEYWORD))
    found.add(Number(requiredGroup(match)));
  return [...found];
}

/**
 * The leading issue number a branch name embeds, or null when it has none.
 * `docs/32-agents-md` names 32; `docs/agents-md` names nothing, because
 * "agents-md" carries no leading digits for this to read.
 */
export function branchIssueNumber(branch: string): number | null {
  // `split` always returns at least one element, so `pop` on its result is
  // never actually undefined; the cast says so once rather than writing an
  // `?? branch` fallback branch nothing can reach.
  const segment = branch.split("/").pop() as string;
  const match = /^(\d+)/.exec(segment);
  return match ? Number(match[1]) : null;
}

export interface CandidateInput {
  readonly title: string;
  readonly body: string;
  readonly branch: string;
}

/**
 * Every issue this pull request claims: a closing keyword in the title or
 * body, plus the branch name's leading number. Sorted, deduplicated. This is
 * the whole candidate list for both directions: claiming (add the labels) and
 * releasing (remove them) read the same list, and only the action taken with
 * it differs, decided by `claimAction`.
 */
export function candidateIssues(input: CandidateInput): readonly number[] {
  const found = new Set<number>();
  for (const number of closingReferences(input.title)) found.add(number);
  for (const number of closingReferences(input.body)) found.add(number);
  const branchNumber = branchIssueNumber(input.branch);
  if (branchNumber !== null) found.add(branchNumber);
  return [...found].sort((a, b) => a - b);
}

export type ClaimAction = "claim" | "release" | null;

/**
 * Whether a pull request event claims or releases the issues it names.
 * `opened`, `reopened` and `edited` claim; `closed` releases; anything else
 * (in particular `synchronize`, deliberately not one of the workflow's
 * trigger types: a push re-claiming an already-claimed issue changes
 * nothing) claims and releases nothing. This mirrors, and is the single
 * tested source of truth for, the branch the workflow's own
 * `if [ "${PR_ACTION}" = closed ]` takes; the workflow's `on.pull_request.types`
 * list has to separately name the same events for GitHub to trigger the job
 * at all, and the two are not machine-checked against each other.
 *
 * A release never extends to a claimed issue's parent: the parent's status
 * reflects the whole epic, and a single child pull request closing is not
 * evidence the epic is done. See the workflow's own header comment.
 */
export function claimAction(event: string): ClaimAction {
  if (event === "opened" || event === "reopened" || event === "edited")
    return "claim";
  if (event === "closed") return "release";
  return null;
}

/** Print every candidate issue number, one per line, sorted, deduplicated. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const flag = (name: string): string => {
    const i = argv.indexOf(name);
    const value = i === -1 ? undefined : argv[i + 1];
    return value ?? "";
  };
  const candidates = candidateIssues({
    title: flag("--title"),
    body: flag("--body"),
    branch: flag("--branch"),
  });
  output.out(candidates.map((number) => `${number}\n`).join(""));
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
