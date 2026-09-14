// The behaviour ledger, docs/requirements.md: what keeps it honest.
//
// docs/requirements.md holds one row per behaviour this repository
// guarantees: a greppable id, one sentence a contributor or a consumer can
// rely on, and the test file that proves it. A row can lose its proof
// silently when the test it names is renamed, emptied or deleted while the
// code it covered stays in place; nothing else in the suite would notice.
// This is what notices: every row parses; every named file exists, is a test
// file and holds at least one test; ids are unique; the document's stated row
// count matches what it actually holds; and every id cited anywhere in the
// tracked tree resolves to a row.
//
// This is not docs/architecture-rules.md (issue #29, not yet landed): that
// ledger will list the rules a tool enforces (a lint rule, a dependency-
// cruiser check, an ESLint message), each keyed to its enforcer and severity.
// This one lists the behaviours a person depends on, each keyed to the test
// that fails when it stops being true. A behaviour can rest on several rules,
// and one rule can serve several behaviours, so the two ledgers are
// deliberately not merged.
//
// A library first, like the other gates: tests call lintRequirements() in
// -process, and `node scripts/lint-requirements.ts [root]` is the command.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

/** One row of the ledger: an id, its guarantee, and the test that proves it. */
export interface RequirementRow {
  readonly id: string;
  readonly sentence: string;
  readonly test: string;
}

/** What one run found: how many rows it read, and every violation. */
export interface RequirementsLintResult {
  readonly rows: number;
  readonly errors: readonly string[];
}

const REPOSITORY = join(import.meta.dirname, "..");
const LEDGER = join("docs", "requirements.md");

const CITATION = /\bREQ-\d{3}\b/g;
const STATED_COUNT = /this ledger holds \*\*(\d+)\*\* rows?\b/i;

// A row's link text is the test path relative to the repository root
// (`test/x.test.ts`); its href is that same path relative to docs/
// (`../test/x.test.ts`), since the ledger lives in docs/. Both are checked
// against each other, so a row cannot link one file while claiming another.
const ROW =
  /^\|\s*(REQ-\d{3})\s*\|\s*(.+?)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|$/;

/** Every line that opens like a ledger row, matched or not. */
function candidateLines(text: string): string[] {
  return text.split("\n").filter((line) => /^\|\s*REQ-\d{3}\s*\|/.test(line));
}

/**
 * Parse the ledger body into rows. Pure and synchronous, so a malformed row
 * is testable against a string with no filesystem involved. A line that opens
 * like a row but does not match it is reported and dropped, not guessed at.
 */
export function parseRequirements(text: string): {
  readonly rows: readonly RequirementRow[];
  readonly errors: readonly string[];
} {
  const rows: RequirementRow[] = [];
  const errors: string[] = [];
  for (const line of candidateLines(text)) {
    const match = ROW.exec(line);
    const id = match?.[1];
    const sentence = match?.[2];
    const linkText = match?.[3];
    const href = match?.[4];
    if (
      id === undefined ||
      sentence === undefined ||
      linkText === undefined ||
      href === undefined
    ) {
      errors.push(`malformed row: ${line}`);
      continue;
    }
    if (linkText !== href.replace(/^\.\.\//, ""))
      errors.push(
        `${id}: link text '${linkText}' does not match its target '${href}'`,
      );
    rows.push({ id, sentence, test: linkText });
  }
  return { rows, errors };
}

/**
 * Every id cited outside the row that declares it, across the tracked tree,
 * that no row carries. Pure over a {rel: content} map, so it is testable
 * against a synthetic tree the way emdash.test.ts's offendersIn() is.
 */
export function citationErrors(
  files: Readonly<Record<string, string>>,
  ids: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const reported = new Set<string>();
  // Object keys are unique paths, so two entries are never equal: a strict
  // less-than is enough to order them, with no equal case to fall through to.
  const entries = Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [rel, content] of entries) {
    for (const match of content.matchAll(CITATION)) {
      const id = match[0];
      const key = `${rel}\0${id}`;
      if (ids.has(id) || reported.has(key)) continue;
      reported.add(key);
      errors.push(`${rel} cites ${id}, which no row carries`);
    }
  }
  return errors;
}

/** Every tracked file's text, keyed by its path relative to `root`. */
function trackedText(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  }).split("\0");
  for (const rel of tracked) {
    if (rel === "") continue;
    try {
      files[rel] = readFileSync(join(root, rel), "utf8");
    } catch {
      // A path that cannot be read as text (a symlink to nowhere, a
      // directory entry) carries no citation either way.
    }
  }
  return files;
}

/** Lint the behaviour ledger under `root`. */
export function lintRequirements(root: string): RequirementsLintResult {
  const path = join(root, LEDGER);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { rows: 0, errors: [`${LEDGER}: ledger missing`] };
  }

  const { rows, errors: parseErrors } = parseRequirements(text);
  const errors = [...parseErrors];

  const byId = new Map<string, RequirementRow>();
  for (const row of rows) {
    const seen = byId.get(row.id);
    if (seen)
      errors.push(`${row.id}: id used twice, also for '${seen.sentence}'`);
    else byId.set(row.id, row);
  }

  for (const row of rows) {
    const testPath = join(root, row.test);
    let content: string;
    try {
      content = readFileSync(testPath, "utf8");
    } catch {
      errors.push(`${row.id}: names '${row.test}', which does not exist`);
      continue;
    }
    if (!row.test.endsWith(".test.ts"))
      errors.push(`${row.id}: '${row.test}' is not a test file`);
    if (!/\b(?:test|it)\s*\(/.test(content))
      errors.push(`${row.id}: '${row.test}' holds no test`);
  }

  const stated = STATED_COUNT.exec(text)?.[1];
  if (stated === undefined)
    errors.push(`${LEDGER}: does not state how many rows it holds`);
  else if (Number(stated) !== rows.length)
    errors.push(
      `${LEDGER}: states ${stated} rows, holds ${String(rows.length)}`,
    );

  errors.push(...citationErrors(trackedText(root), new Set(byId.keys())));

  return { rows: rows.length, errors };
}

/** Lint the tree named by argv[0], or this repository, and say what was found. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const { rows, errors } = lintRequirements(argv[0] ?? REPOSITORY);
  if (errors.length > 0) {
    output.err(
      `requirements lint: ${errors.length} error(s)\n` +
        errors.map((e) => `  - ${e}\n`).join(""),
    );
    return 1;
  }
  output.out(`requirements lint: ${rows} rows clean\n`);
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
