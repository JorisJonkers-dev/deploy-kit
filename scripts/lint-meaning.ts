// Lint for meaning: the checks above (lint-adrs.ts, lint-links.ts) prove that
// a citation resolves and an anchor exists. Neither notices a citation that
// resolves to authority that no longer holds, a word the model retired still
// read as current, or a stated count that has drifted from what it counts.
// Those are silent: every other gate stays green while they rot.
//
// Two checks, each driven by a small data table beside the logic that reads
// it, so covering one more case is a data edit, never a code edit. A citation
// of a superseded decision needs no check: the register holds one record per
// decision and lint-adrs.ts refuses `superseded-by`.
//
//   - retired term: a phrase CONTEXT.md marks fully retired, found bare
//     outside a quotation, a blockquote (every renamed ADR carries its own
//     amendment note this way) or the file that performed the retirement;
//   - stale count: a prose claim about the size of a real, named collection
//     in this repository (a table's own rows, an enumerated list in one ADR)
//     checked against that collection, not a blanket sweep for every number.
//
// A library first, like the other gates: tests call lintMeaning() in-process,
// and `node scripts/lint-meaning.ts [root]` is the command.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

/** What one run found: how many Markdown files it read, and every violation. */
export interface MeaningLintResult {
  readonly files: number;
  readonly errors: readonly string[];
}

const REPOSITORY = join(import.meta.dirname, "..");

// Never scanned, the same exclusions the em-dash ban uses: docs/mde holds
// third-party coursework kept verbatim, and CHANGELOG.md is release-please's.
// Everything else is in scope, emf/ included: its register shares this
// tree's ADR number sequence and its own citations can go stale the same way.
const EXCLUDE = new Set(["CHANGELOG.md"]);
const EXCLUDE_PREFIXES = ["docs/mde/"];

function inScope(rel: string): boolean {
  return (
    rel.endsWith(".md") &&
    !EXCLUDE.has(rel) &&
    !EXCLUDE_PREFIXES.some((prefix) => rel.startsWith(prefix))
  );
}

/** Every tracked Markdown file in scope, as {rel: content}. */
function trackedMarkdown(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  }).split("\0");
  for (const rel of tracked) {
    if (rel === "" || !inScope(rel)) continue;
    try {
      files[rel] = readFileSync(join(root, rel), "utf8");
    } catch {
      // A path that cannot be read as text carries no meaning either way.
    }
  }
  return files;
}

/** A tracked Markdown file's text stripped of fenced code: illustration, not prose. */
function proseOf(text: string): string {
  return text.replace(/^```[\s\S]*?^```/gm, "");
}

/**
 * `files`, as `[rel, content]` pairs in path order. Every key of an object
 * built from its own `Object.keys` resolves, so the cast says once why this
 * is never the `undefined` `noUncheckedIndexedAccess` types it as, rather
 * than an unreachable `?? ""` repeated at every call site.
 */
function sortedEntries(
  files: Readonly<Record<string, string>>,
): readonly (readonly [string, string])[] {
  return Object.keys(files)
    .sort()
    .map((rel) => [rel, files[rel] as string] as const);
}

// ---------------------------------------------------------------------------
// Link and match helpers, shared by the retired-term and stale-count checks.
// ---------------------------------------------------------------------------

const LINK = /\[[^\]\n]*\]\(([^)\s]+)\)/g;

/**
 * The text a regex match's first capture group matched, when the group's
 * own quantifier guarantees it participated in the match (a `+`-quantified
 * group, never optional). `noUncheckedIndexedAccess` still types it as
 * possibly absent regardless; this says once why the cast is safe, rather
 * than `?? ""` guessing at a case the regex cannot reach.
 */
function requiredGroup(match: RegExpMatchArray): string {
  return match[1] as string;
}

/**
 * The text before the first `#`, or the whole string if it carries none.
 * `String.split` always returns at least one element, so index 0 is never
 * absent, regardless of what `noUncheckedIndexedAccess` types it as.
 */
function beforeHash(href: string): string {
  return href.split("#")[0] as string;
}

// ---------------------------------------------------------------------------
// Cited numbers, shared by the retired-term check.
// ---------------------------------------------------------------------------

/**
 * The four-digit ADR numbers a sentence links to. Every ADR link ends in
 * `NNNN-slug.md` regardless of how deep its relative path is, and the number
 * sequence is estate-wide and flat, so the number is read straight off the
 * href: no path resolution, and so no filesystem, is needed to tell which
 * ADR a link names.
 */
function citedNumbers(sentence: string): ReadonlySet<string> {
  const numbers = new Set<string>();
  for (const link of sentence.matchAll(LINK)) {
    const href = beforeHash(requiredGroup(link));
    const number = /(\d{4})-[\w-]+\.md$/.exec(href)?.[1];
    if (number !== undefined) numbers.add(number);
  }
  return numbers;
}

// ---------------------------------------------------------------------------
// Retired term.
//
// CONTEXT.md's "Words to use carefully" section covers words needing care,
// most of which still have a legitimate current meaning ("Deploy", "Render",
// "Config"): banning those bare would fail on every correct use. This list
// holds only the phrases the section calls fully retired, with no legitimate
// current sense of their own: "Cluster Context" (retired outright by 0045)
// and "Service Intent" (retired by 0009; the document is now Project
// Intent). Deliberately excluded: bare "Service", "Workload" and "Domain".
// CONTEXT.md itself keeps all three overloaded on purpose (a Kubernetes
// `Service`, a rendered `workload.yaml`, a DNS name, an ADR domain, the
// compiler's own hexagon core), so a mechanical ban on the bare word would
// misfire on every one of those legitimate senses. Adding one more retired
// phrase later is a row in this array, not a change to the function below.
// ---------------------------------------------------------------------------

export interface RetiredTerm {
  readonly term: string;
  /** Matches a bare occurrence; must be global. */
  readonly pattern: RegExp;
  /** Files exempt outright: the glossary, and the ADR that retired the term. */
  readonly exemptFiles: readonly string[];
  /** The ADR that retired it; citing it in the same paragraph exempts a mention. */
  readonly retiredBy: string;
}

export const RETIRED_TERMS: readonly RetiredTerm[] = [
  {
    term: "Cluster Context",
    pattern: /\bCluster Context\b/g,
    exemptFiles: [
      "CONTEXT.md",
      "docs/adr/model/0045-platform-intent-is-the-second-authored-document.md",
    ],
    retiredBy: "0045",
  },
  {
    term: "Service Intent",
    pattern: /\bService Intent\b/g,
    exemptFiles: [
      "CONTEXT.md",
      "docs/adr/model/0009-intent-is-authored-one-file-per-project.md",
    ],
    retiredBy: "0009",
  },
];

/** Whether `text` at `index` (a match's start) sits on a blockquote line. */
function onBlockquoteLine(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*>/.test(text.slice(lineStart, index + 1));
}

/** Whether the occurrence at `index` sits inside `*italics*`, `_italics_`, or quote marks. */
function isQuotedMention(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 1), index);
  const after = text.slice(index + length, index + length + 1);
  const marks = ["*", "_", '"', "“", "‘", "'"];
  const closing = ["*", "_", '"', "”", "’", "'"];
  return marks.includes(before) && closing.includes(after);
}

/**
 * Every bare use of a retired term, outside a quotation, a blockquote, its
 * own record, or a paragraph that also cites the ADR that retired it (a
 * paragraph explaining what a chapter used to be called, citing that
 * decision, reads as history rather than the word treated as current).
 */
export function retiredTermErrors(
  files: Readonly<Record<string, string>>,
): string[] {
  const errors: string[] = [];
  for (const [rel, content] of sortedEntries(files)) {
    const prose = proseOf(content);
    for (const retired of RETIRED_TERMS) {
      if (retired.exemptFiles.includes(rel)) continue;
      for (const paragraph of prose.split(/\n{2,}/)) {
        if (citedNumbers(paragraph).has(retired.retiredBy)) continue;
        retired.pattern.lastIndex = 0;
        for (const match of paragraph.matchAll(retired.pattern)) {
          const index = match.index;
          if (onBlockquoteLine(paragraph, index)) continue;
          if (isQuotedMention(paragraph, index, match[0].length)) continue;
          errors.push(
            `${rel}: uses retired term '${retired.term}' outside a quotation`,
          );
        }
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Stale count.
//
// Only a claim tied to a real, named collection: a table's own row count, or
// an enumerated backticked list inside one specific ADR. Not a blanket sweep
// over every number in prose, which would either miss what it cannot verify
// or misreport a number that was never a claim about this repository's own
// state (the sixteen-adapter evidence 0037 keeps about the generation
// this compiler replaces, for instance, which is history, not a live count).
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/** A numeral or a number word (case-insensitive) to an integer, or null. */
export function parseCount(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  const value = NUMBER_WORDS[token.toLowerCase()];
  return value ?? null;
}

export interface CountedClaim {
  readonly id: string;
  /** What the number is claimed to count, for the error message. */
  readonly describe: string;
  /** Files whose prose may state this claim. */
  readonly files: readonly string[];
  /** Matches the claim; capture group 1 is the numeral or number word. Must be global. */
  readonly pattern: RegExp;
  /** The real size of the collection, read from `root`. */
  readonly actual: (root: string) => number;
}

/** The Gates table's own row count, in `docs/architecture.md`. */
function gateCount(root: string): number {
  const text = readFileSync(join(root, "docs", "architecture.md"), "utf8");
  const section = text.split("\n## Gates\n")[1]?.split("\n## ")[0] ?? "";
  return section
    .split("\n")
    .filter(
      (line) =>
        /^\|.*\|.*\|.*\|$/.test(line) &&
        !/^\|\s*gate\s*\|/i.test(line) &&
        !/^\|[\s-]*\|[\s-]*\|[\s-]*\|$/.test(line),
    ).length;
}

/** The registered-adapter list ADR 0037 enumerates. */
function registeredAdapterCount(root: string): number {
  const text = readFileSync(
    join(
      root,
      "docs",
      "adr",
      "model",
      "0037-six-registered-adapters-satisfy-one-port.md",
    ),
    "utf8",
  );
  const list =
    /The set is [\w-]+ central adapters \(([^)]*)\)/.exec(text)?.[1] ?? "";
  return [...list.matchAll(/`[^`]+`/g)].length;
}

export const CHECKED_COUNTS: readonly CountedClaim[] = [
  {
    id: "gates",
    describe: "the rows of the Gates table in docs/architecture.md",
    files: ["docs/architecture.md"],
    pattern: /\b(\w+)\s+gates\s+hold\s+the\s+structure\b/gi,
    actual: gateCount,
  },
  {
    id: "registered adapters",
    describe: "the adapters ADR 0037 names as v1's registered set",
    files: ["spec/v1/examples/RENDER-GAPS.md"],
    pattern: /\b(\w+)\s+registered\s+adapters\b/gi,
    actual: registeredAdapterCount,
  },
];

/** Every stated count that disagrees with the real collection it claims to count. */
export function staleCountErrors(root: string): string[] {
  const errors: string[] = [];
  for (const claim of CHECKED_COUNTS) {
    let actual: number;
    try {
      actual = claim.actual(root);
    } catch {
      continue; // the source this claim ties to does not exist in this tree
    }
    for (const file of claim.files) {
      let text: string;
      try {
        text = readFileSync(join(root, file), "utf8");
      } catch {
        continue;
      }
      claim.pattern.lastIndex = 0;
      for (const match of text.matchAll(claim.pattern)) {
        const token = requiredGroup(match);
        const stated = parseCount(token);
        if (stated !== null && stated !== actual)
          errors.push(
            `${file}: states ${token} for ${claim.describe}, which holds ${String(actual)}`,
          );
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// The gate.
// ---------------------------------------------------------------------------

/** Lint every tracked Markdown file under `root` for meaning: citations, terms, counts. */
export function lintMeaning(root: string): MeaningLintResult {
  const files = trackedMarkdown(root);
  const errors = [...retiredTermErrors(files), ...staleCountErrors(root)];
  return { files: Object.keys(files).length, errors };
}

/** Lint the tree named by argv[0], or this repository, and say what was found. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const { files, errors } = lintMeaning(argv[0] ?? REPOSITORY);
  if (errors.length > 0) {
    output.err(
      `meaning lint: ${errors.length} error(s)\n` +
        errors.map((e) => `  - ${e}\n`).join(""),
    );
    return 1;
  }
  output.out(`meaning lint: ${files} files clean\n`);
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
