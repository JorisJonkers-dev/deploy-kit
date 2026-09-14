// The rule ledger, docs/architecture-rules.md: what keeps it honest.
//
// docs/architecture-rules.md holds one row per rule the compiler and this
// repository are held to: a greppable id, its family, the sentence, the
// enforcer that runs it, and the fixture that proves it fires. This is what
// notices when a row and the tree stop agreeing.
//
// The checks, in the order a reader meets them:
//
//   - every row parses, its id is unique and shaped RULE-NNN, and its family
//     is one the document's own Families table declares (and every declared
//     family is used, so the taxonomy cannot grow dead entries);
//   - an enforced row's enforcer resolves: a dependency-cruiser rule name
//     that .dependency-cruiser.cjs configures, an ESLint rule id that
//     eslint.config.js configures, an npm script package.json defines, or a
//     file that exists;
//   - an enforced row names a fixture: a real, non-empty test file that
//     mentions the witness (the literal the fixture asserts on), so a row
//     whose fixture was deleted or rewritten past its rule fails here;
//   - a pending row carries a ticket and a reason, and names no fixture, so
//     "pending" can never read as proven;
//   - the converse: every dependency-cruiser rule and every ESLint rule this
//     repository configures by name is claimed by exactly one enforced row.
//     A rule enforced with no row fails, and so does a rule quietly moved to
//     pending while its configuration still runs. That is what stops pending
//     becoming where rules go to be forgotten;
//   - the stated totals (rows, and how many are pending) match what the
//     document holds, and every RULE-NNN cited in the tracked tree resolves.
//
// This is not docs/requirements.md. That ledger lists the behaviours a person
// depends on, keyed to the test that fails when one stops being true; this
// one lists the rules a tool enforces, keyed to the enforcer that runs them.
// A behaviour can rest on several rules and a rule can serve several
// behaviours, so the two ledgers stay separate and their id spaces do not
// overlap.
//
// A library first, like the other gates: tests call lintRules() in-process,
// and `node scripts/lint-rules.ts [root]` is the command.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";
import { danglingCitations, trackedText } from "./lib/tracked.ts";

/** One row of the ledger. */
export interface RuleRow {
  readonly id: string;
  readonly family: string;
  readonly sentence: string;
  readonly enforcement: Enforcement;
  /** The fixture's path, relative to the repository root, or null when pending. */
  readonly fixture: string | null;
  /** The literal the fixture asserts on, or null when pending. */
  readonly witness: string | null;
}

/** What one run found: the rows it read, how many are pending, and every violation. */
export interface RulesLintResult {
  readonly rows: number;
  readonly pending: number;
  readonly errors: readonly string[];
}

const REPOSITORY = join(import.meta.dirname, "..");
const LEDGER = join("docs", "architecture-rules.md");

const CITATION = /\bRULE-\d{3}\b/g;
const STATED_ROWS = /this ledger holds \*\*(\d+)\*\* rules?\b/i;
const STATED_PENDING = /\*\*(\d+)\*\* of them pending\b/i;

/** The enforcer kinds a row may name, each resolvable against the tree. */
const KINDS = ["depcruise", "eslint", "npm", "file"] as const;
type Kind = (typeof KINDS)[number];

const isKind = (candidate: string): candidate is Kind =>
  (KINDS as readonly string[]).includes(candidate);

/** How a row says it is enforced: by a named enforcer, or not yet at all. */
export type Enforcement =
  | { readonly kind: Kind; readonly value: string }
  | {
      readonly kind: "pending";
      readonly ticket: string;
      readonly reason: string;
    };

/** The shortest reason that says anything: shorter than this is a shrug. */
const MIN_REASON = 20;

// A row is five cells: the id, its family, the rule, its enforcer, its proof.
const ROW =
  /^\|\s*(RULE-\d{3})\s*\|\s*([a-z]+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/;
// `kind:value`, backticked so the document renders it as the token it is.
const ENFORCER = /^`([a-z]+):(.+)`$/;
// pending (#29): a reason, or pending (n/a): a reason, for a rule no ticket
// will bring because it waits on something outside this repository's plan.
const PENDING = /^pending \((#\d+|n\/a)\):\s*(.*)$/;
// A link to the fixture, then the literal that fixture asserts on.
const PROOF = /^\[([^\]]+)\]\(([^)]+)\)\s+`([^`]+)`$/;
// A Families table row: `| family | what it covers |`.
const FAMILY = /^\|\s*([a-z]+)\s*\|\s*(.+?)\s*\|$/;

/** Every line that opens like a ledger row, matched or not. */
function candidateLines(text: string): string[] {
  return text.split("\n").filter((line) => /^\|\s*RULE-\d{3}\s*\|/.test(line));
}

/** The families the document's own Families table declares, in order. */
export function parseFamilies(text: string): string[] {
  const section = text.split("\n## Families\n")[1]?.split("\n## ")[0] ?? "";
  const families: string[] = [];
  for (const line of section.split("\n")) {
    const match = FAMILY.exec(line);
    const family = match?.[1];
    if (family === undefined || family === "family") continue;
    families.push(family);
  }
  return families;
}

/** Read one row's enforcer cell, or null when it is neither form. */
function parseEnforcement(cell: string): Enforcement | null {
  const enforcer = ENFORCER.exec(cell);
  const kind = enforcer?.[1];
  const value = enforcer?.[2];
  if (kind !== undefined && value !== undefined && isKind(kind))
    return { kind, value };
  const pending = PENDING.exec(cell);
  if (pending?.[1] !== undefined)
    return { kind: "pending", ticket: pending[1], reason: pending[2] ?? "" };
  return null;
}

/**
 * Parse the ledger body into rows. Pure and synchronous, so a malformed row
 * is testable against a string with no filesystem involved. A line that opens
 * like a row but does not match it is reported and dropped, not guessed at.
 */
export function parseRules(text: string): {
  readonly rows: readonly RuleRow[];
  readonly errors: readonly string[];
} {
  const rows: RuleRow[] = [];
  const errors: string[] = [];
  for (const line of candidateLines(text)) {
    const match = ROW.exec(line);
    const id = match?.[1];
    const family = match?.[2];
    const sentence = match?.[3];
    const enforcerCell = match?.[4];
    const proofCell = match?.[5];
    if (
      id === undefined ||
      family === undefined ||
      sentence === undefined ||
      enforcerCell === undefined ||
      proofCell === undefined
    ) {
      errors.push(`malformed row: ${line}`);
      continue;
    }

    const enforcement = parseEnforcement(enforcerCell);
    if (enforcement === null) {
      errors.push(
        `${id}: enforcer '${enforcerCell}' is neither a backticked ` +
          `kind:value nor a 'pending (#NNN): reason' entry`,
      );
      continue;
    }

    const proof = PROOF.exec(proofCell);
    const linkText = proof?.[1];
    const href = proof?.[2];
    const witness = proof?.[3];
    if (enforcement.kind === "pending") {
      if (proofCell !== "pending")
        errors.push(
          `${id}: is pending, so its proof cell must read 'pending', not '${proofCell}'`,
        );
      rows.push({
        id,
        family,
        sentence,
        enforcement,
        fixture: null,
        witness: null,
      });
      continue;
    }
    if (linkText === undefined || href === undefined || witness === undefined) {
      errors.push(
        `${id}: is enforced, so its proof cell must be a linked fixture and a ` +
          `backticked witness, not '${proofCell}'`,
      );
      continue;
    }
    if (linkText !== href.replace(/^\.\.\//, ""))
      errors.push(
        `${id}: link text '${linkText}' does not match its target '${href}'`,
      );
    rows.push({
      id,
      family,
      sentence,
      enforcement,
      fixture: linkText,
      witness,
    });
  }
  return { rows, errors };
}

/** The rule names `.dependency-cruiser.cjs` configures under `forbidden`. */
export function dependencyCruiserRules(text: string): string[] {
  // `\bname:` and not `name:`, so the `fileName:` of the tsConfig option is
  // not read as a rule: there is no word boundary inside `fileName`.
  return [...text.matchAll(/\bname:\s*"([^"]+)"/g)].map(
    (match) => match[1] as string,
  );
}

/**
 * The rule ids `eslint.config.js` configures by name and leaves on. A quoted
 * key whose value is an options array or a severity is a rule; `"off"` is a
 * rule this repository deliberately does not run, and a quoted key with any
 * other value (`"ts-expect-error": "allow-with-description"`) is an option of
 * one, not a rule of its own.
 */
export function eslintRules(text: string): string[] {
  const rules: string[] = [];
  for (const match of text.matchAll(
    /(?:^|[\s{,])"([^"]+)":\s*(\[|"error"|"warn"|"off")/gm,
  )) {
    if (match[2] === '"off"') continue;
    rules.push(match[1] as string);
  }
  return rules;
}

/** The npm scripts `package.json` defines, or none when it cannot be read. */
function packageScripts(root: string): Set<string> {
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    return new Set(Object.keys(pkg.scripts ?? {}));
  } catch {
    return new Set();
  }
}

/** The text of `rel` under `root`, or null when there is no such file. */
function read(root: string, rel: string): string | null {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/** Check one enforced row's enforcer against what the tree configures. */
function enforcerErrors(
  row: RuleRow,
  configured: {
    readonly depcruise: ReadonlySet<string>;
    readonly eslint: ReadonlySet<string>;
    readonly npm: ReadonlySet<string>;
  },
  root: string,
): string[] {
  const enforcement = row.enforcement;
  if (enforcement.kind === "pending") return [];
  const value = enforcement.value;
  switch (enforcement.kind) {
    case "depcruise":
      return configured.depcruise.has(value)
        ? []
        : [
            `${row.id}: names dependency-cruiser rule '${value}', which ` +
              `.dependency-cruiser.cjs does not configure`,
          ];
    case "eslint":
      return configured.eslint.has(value)
        ? []
        : [
            `${row.id}: names ESLint rule '${value}', which eslint.config.js ` +
              `does not configure`,
          ];
    case "npm":
      return configured.npm.has(value)
        ? []
        : [
            `${row.id}: names npm script '${value}', which package.json does ` +
              `not define`,
          ];
    default:
      return existsSync(join(root, value))
        ? []
        : [`${row.id}: names file '${value}', which does not exist`];
  }
}

/** Check one row's fixture: it exists, holds a test, and mentions the witness. */
function fixtureErrors(row: RuleRow, root: string): string[] {
  const { fixture, witness } = row;
  if (fixture === null || witness === null) return [];
  const content = read(root, fixture);
  if (content === null)
    return [`${row.id}: names fixture '${fixture}', which does not exist`];
  const errors: string[] = [];
  if (!fixture.endsWith(".test.ts"))
    errors.push(`${row.id}: fixture '${fixture}' is not a test file`);
  if (!/\b(?:test|it)\s*\(/.test(content))
    errors.push(`${row.id}: fixture '${fixture}' holds no test`);
  if (!content.includes(witness))
    errors.push(
      `${row.id}: fixture '${fixture}' never mentions '${witness}', so ` +
        `nothing in it proves this rule fires`,
    );
  return errors;
}

/**
 * The converse check: a configuration this repository runs today, against the
 * rows that claim it. A configured rule no enforced row claims is either a
 * rule nobody wrote down or a row that has quietly been moved to pending;
 * both fail here, which is what keeps the pending list from becoming a place
 * rules go to be forgotten.
 */
function converseErrors(
  configured: readonly string[],
  rows: readonly RuleRow[],
  kind: "depcruise" | "eslint",
  source: string,
): string[] {
  const errors: string[] = [];
  for (const name of configured) {
    const claimed = rows.filter(
      (row) => row.enforcement.kind === kind && row.enforcement.value === name,
    );
    if (claimed.length === 0)
      errors.push(
        `${source}: rule '${name}' is enforced, and no ledger row claims it; ` +
          `a row that calls it pending does not count`,
      );
    else if (claimed.length > 1)
      errors.push(
        `${source}: rule '${name}' is claimed by ${String(claimed.length)} ` +
          `rows (${claimed.map((row) => row.id).join(", ")}); one enforcer, one row`,
      );
  }
  return errors;
}

/** Lint the rule ledger under `root`. */
export function lintRules(root: string): RulesLintResult {
  const text = read(root, LEDGER);
  if (text === null)
    return { rows: 0, pending: 0, errors: [`${LEDGER}: ledger missing`] };

  const { rows, errors: parseErrors } = parseRules(text);
  const errors = [...parseErrors];
  const pending = rows.filter(
    (row) => row.enforcement.kind === "pending",
  ).length;

  // -- families: a row names a declared one, and every declared one is used
  const families = parseFamilies(text);
  if (families.length === 0) errors.push(`${LEDGER}: no Families table`);
  const declared = new Set(families);
  const used = new Set(rows.map((row) => row.family));
  for (const row of rows)
    if (!declared.has(row.family))
      errors.push(
        `${row.id}: family '${row.family}' is not declared in the Families table`,
      );
  for (const family of families)
    if (!used.has(family))
      errors.push(
        `${LEDGER}: family '${family}' is declared and no rule uses it`,
      );

  // -- ids are unique
  const byId = new Map<string, RuleRow>();
  for (const row of rows) {
    const seen = byId.get(row.id);
    if (seen)
      errors.push(`${row.id}: id used twice, also for '${seen.sentence}'`);
    else byId.set(row.id, row);
  }

  const depcruiseText = read(root, ".dependency-cruiser.cjs");
  const eslintText = read(root, "eslint.config.js");
  if (depcruiseText === null)
    errors.push(`${LEDGER}: .dependency-cruiser.cjs is missing`);
  if (eslintText === null)
    errors.push(`${LEDGER}: eslint.config.js is missing`);
  const depcruise = dependencyCruiserRules(depcruiseText ?? "");
  const eslint = eslintRules(eslintText ?? "");
  const configured = {
    depcruise: new Set(depcruise),
    eslint: new Set(eslint),
    npm: packageScripts(root),
  };

  for (const row of rows) {
    errors.push(...enforcerErrors(row, configured, root));
    errors.push(...fixtureErrors(row, root));
    if (row.enforcement.kind === "pending") {
      if (row.enforcement.reason.length < MIN_REASON)
        errors.push(
          `${row.id}: is pending with no reason; a pending row says why it is ` +
            `not enforced yet`,
        );
    }
  }

  errors.push(
    ...converseErrors(depcruise, rows, "depcruise", ".dependency-cruiser.cjs"),
  );
  errors.push(...converseErrors(eslint, rows, "eslint", "eslint.config.js"));

  // -- the stated totals match what the document holds
  const statedRows = STATED_ROWS.exec(text)?.[1];
  if (statedRows === undefined)
    errors.push(`${LEDGER}: does not state how many rules it holds`);
  else if (Number(statedRows) !== rows.length)
    errors.push(
      `${LEDGER}: states ${statedRows} rules, holds ${String(rows.length)}`,
    );

  const statedPending = STATED_PENDING.exec(text)?.[1];
  if (statedPending === undefined)
    errors.push(`${LEDGER}: does not state how many rules are pending`);
  else if (Number(statedPending) !== pending)
    errors.push(
      `${LEDGER}: states ${statedPending} pending, holds ${String(pending)}`,
    );

  errors.push(
    ...danglingCitations(trackedText(root), new Set(byId.keys()), CITATION),
  );

  return { rows: rows.length, pending, errors };
}

/** Lint the tree named by argv[0], or this repository, and say what was found. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const { rows, pending, errors } = lintRules(argv[0] ?? REPOSITORY);
  if (errors.length > 0) {
    output.err(
      `rules lint: ${errors.length} error(s)\n` +
        errors.map((e) => `  - ${e}\n`).join(""),
    );
    return 1;
  }
  output.out(`rules lint: ${rows} rules clean, ${pending} pending\n`);
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
