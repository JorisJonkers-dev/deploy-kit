// The behaviour ledger, docs/requirements/*.md: what keeps it honest.
//
// The ledger holds one row per behaviour this repository guarantees: a
// greppable id, one sentence a contributor or a consumer can rely on, and the
// test file that proves it. The rows live in one file per area under
// docs/requirements/, so pull requests on different areas touch different
// files; docs/requirements.md is the front page every citation names, and
// holds no row. A row can lose its proof silently when the test it names is
// renamed, emptied or deleted while the code it covered stays in place;
// nothing else in the suite would notice. This is what notices: every row
// parses; every named file exists, is a test file and holds at least one
// test; ids are unique across every area file; every area file holds a row
// and the front page holds none; and every id cited anywhere in the tracked
// tree resolves to a row.
//
// This is not docs/architecture-rules.md: that ledger lists the rules a tool
// enforces (a lint rule, a dependency-cruiser check, an ESLint message), each
// keyed to its enforcer and to the fixture that proves it fires.
// This one lists the behaviours a person depends on, each keyed to the test
// that fails when it stops being true. A behaviour can rest on several rules,
// and one rule can serve several behaviours, so the two ledgers are
// deliberately not merged.
//
// A library first, like the other gates: tests call lintRequirements() in
// -process, and `node scripts/lint-requirements.ts [root]` is the command.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";
import { danglingCitations, trackedText } from "./lib/tracked.ts";

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
const FRONT_PAGE = "docs/requirements.md";
const AREAS = "docs/requirements";

const CITATION = /\bREQ-\d{3}\b/g;

// A row's link text is the test path relative to the repository root
// (`test/x.test.ts`); its href is that same path relative to the file holding
// the row (`../../test/x.test.ts` from an area file). Both are checked against
// each other, so a row cannot link one file while claiming another.
const AREA_PREFIX = "../../";
const ROW =
  /^\|\s*(REQ-\d{3})\s*\|\s*(.+?)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|$/;

/** Every line that opens like a ledger row, matched or not. */
function candidateLines(text: string): string[] {
  return text.split("\n").filter((line) => /^\|\s*REQ-\d{3}\s*\|/.test(line));
}

/**
 * Parse one area file's body into rows. Pure and synchronous, so a malformed
 * row is testable against a string with no filesystem involved. A line that
 * opens like a row but does not match it is reported and dropped, not guessed
 * at.
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
    if (href !== `${AREA_PREFIX}${linkText}`)
      errors.push(
        `${id}: link text '${linkText}' does not match its target '${href}'`,
      );
    rows.push({ id, sentence, test: linkText });
  }
  return { rows, errors };
}

/**
 * Every REQ id cited outside the row that declares it, across the tracked
 * tree, that no row carries. Pure over a {rel: content} map, so it is
 * testable against a synthetic tree the way emdash.test.ts's offendersIn() is.
 */
export function citationErrors(
  files: Readonly<Record<string, string>>,
  ids: ReadonlySet<string>,
): string[] {
  return danglingCitations(files, ids, CITATION);
}

/** A row, and the area file it was read from. */
interface PlacedRow extends RequirementRow {
  readonly file: string;
}

/** Every area file under `root`, as a path relative to it, sorted. */
function areaFiles(root: string): string[] {
  try {
    return readdirSync(join(root, AREAS))
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map((name) => `${AREAS}/${name}`);
  } catch {
    return [];
  }
}

/** Lint the behaviour ledger under `root`. */
export function lintRequirements(root: string): RequirementsLintResult {
  let front: string;
  try {
    front = readFileSync(join(root, FRONT_PAGE), "utf8");
  } catch {
    return { rows: 0, errors: [`${FRONT_PAGE}: front page missing`] };
  }
  const errors: string[] = [];
  for (const line of candidateLines(front))
    errors.push(
      `${FRONT_PAGE}: holds a row, which belongs in an area file under ${AREAS}/: ${line}`,
    );

  const files = areaFiles(root);
  if (files.length === 0) errors.push(`${AREAS}/: holds no area file`);

  const rows: PlacedRow[] = [];
  for (const file of files) {
    const parsed = parseRequirements(readFileSync(join(root, file), "utf8"));
    errors.push(...parsed.errors.map((error) => `${file}: ${error}`));
    if (parsed.rows.length === 0 && parsed.errors.length === 0)
      errors.push(`${file}: holds no row`);
    rows.push(...parsed.rows.map((row) => ({ ...row, file })));
  }

  const byId = new Map<string, PlacedRow>();
  for (const row of rows) {
    const seen = byId.get(row.id);
    if (seen)
      errors.push(
        `${row.file}: ${row.id}: id used twice, also in ${seen.file} for '${seen.sentence}'`,
      );
    else byId.set(row.id, row);
  }

  for (const row of rows) {
    const testPath = join(root, row.test);
    let content: string;
    try {
      content = readFileSync(testPath, "utf8");
    } catch {
      errors.push(
        `${row.file}: ${row.id}: names '${row.test}', which does not exist`,
      );
      continue;
    }
    if (!row.test.endsWith(".test.ts"))
      errors.push(`${row.file}: ${row.id}: '${row.test}' is not a test file`);
    if (!/\b(?:test|it)\s*\(/.test(content))
      errors.push(`${row.file}: ${row.id}: '${row.test}' holds no test`);
  }

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
