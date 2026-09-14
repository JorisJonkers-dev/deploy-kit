// ADR lint: enforces the docs/adr contract that docs/adr/README.md states.
// Checks structure, register integrity, citation and anchor resolution, and
// content shape.
//
// A library first. Tests call lintAdrs() in-process, so coverage and mutation
// testing see every rule; `node scripts/lint-adrs.ts [root]` is the command.
// The root is overridable so the negative fixtures can lint a tree that
// deliberately violates the contract.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { slug } from "./lib/markdown.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

/** What one run found: how many ADR files it read, and every violation. */
export interface AdrLintResult {
  readonly files: number;
  readonly errors: readonly string[];
}

interface AdrFile {
  readonly domain: string;
  readonly name: string;
  readonly rel: string;
}

const REPOSITORY = join(import.meta.dirname, "..");

// One directory per decision domain, and the domain decides which normative
// roots a pointer may resolve against. `deferred` is parked direction work: it
// is not linted, and its pointers name sections spec/v1 deliberately lacks.
//
// An architecture ADR may point at either normative document for code: the
// structure itself, or the ledger of rules that structure is held to.
const DOMAINS = [
  { domain: "model", normativeRoots: ["spec/v1/"] },
  {
    domain: "architecture",
    normativeRoots: ["docs/architecture.md", "docs/architecture-rules.md"],
  },
] as const;

const SECTIONS = [
  "## Rests on",
  "## Why",
  "## Alternatives",
  "## Reversibility",
  "## Consequences",
];
const STATUS = ["proposed", "accepted"];
const CLAIM = ["settled", "open", "accepted-untested"];

const isAdrName = (file: string): boolean => /^\d{4}-.+\.md$/.test(file);
const listing = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir) : [];
const byRel = (a: AdrFile, b: AdrFile): number => a.rel.localeCompare(b.rel);

/**
 * The heading anchors of a document, or null when there is no such file. The
 * read is the check: asking first and reading afterwards is a race, and a
 * directory fails the read the same way a missing file does.
 */
function anchorsOf(path: string): Set<string> | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  return new Set(
    text
      .split("\n")
      .filter((line) => /^#{1,6} /.test(line))
      .map((line) => slug(line.replace(/^#+ /, ""))),
  );
}

/** The `key: value` lines of a frontmatter block. */
function fieldsOf(block: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of block.split("\n")) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (kv?.[1] !== undefined) fields.set(kv[1], (kv[2] ?? "").trim());
  }
  return fields;
}

/** Lint the decision set under `root`. */
export function lintAdrs(root: string): AdrLintResult {
  const adrDir = join(root, "docs", "adr");
  const errors: string[] = [];
  const err = (file: string, message: string): void => {
    errors.push(`${file}: ${message}`);
  };

  // A file directly under docs/adr belongs to no domain, so no normative root
  // applies to it. That is a misplacement, not a domain of its own.
  for (const stray of listing(adrDir).filter(isAdrName))
    err(stray, "ADR outside a domain directory");

  const files = DOMAINS.flatMap(({ domain, normativeRoots }) =>
    listing(join(adrDir, domain))
      .filter(isAdrName)
      .map((name) => ({
        domain,
        normativeRoots,
        name,
        rel: posix.join(domain, name),
      })),
  ).sort(byRel);

  // The stray files come first: a tree where every ADR sits at the docs/adr
  // root is the migration mistake, and "no ADR files found" is the less useful
  // of the two diagnoses.
  if (files.length === 0)
    return {
      files: 0,
      errors: errors.length > 0 ? errors : ["no ADR files found"],
    };

  // One estate-wide number sequence: a citation resolves without knowing which
  // domain the decision lives in, which is only true while numbers are unique
  // across every domain, deferred/ included, since ADRs cite into it.
  const deferred = listing(join(adrDir, "deferred"))
    .filter(isAdrName)
    .map((name) => ({
      domain: "deferred",
      name,
      rel: posix.join("deferred", name),
    }));
  const byNumber = new Map<string, AdrFile>();
  for (const file of [...files, ...deferred].sort(byRel)) {
    const number = file.name.slice(0, 4);
    const seen = byNumber.get(number);
    if (seen === undefined) byNumber.set(number, file);
    else
      err(
        file.rel,
        seen.domain === file.domain
          ? `number ${number} used twice in ${file.domain}, also ${seen.rel}`
          : `number ${number} used in two domains, also ${seen.rel}`,
      );
  }

  const premises = new Set<string>();
  const decisions: { readonly rel: string; readonly restsOn: string[] }[] = [];

  for (const { domain, normativeRoots, name, rel } of files) {
    const text = readFileSync(join(adrDir, domain, name), "utf8");
    const block = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!block) {
      err(rel, "missing frontmatter block");
      continue;
    }
    const fields = fieldsOf(block[1] ?? "");

    // -- structure
    const tier = fields.get("tier");
    if (tier !== "premise" && tier !== "decision")
      err(rel, `tier must be premise|decision, got '${String(tier)}'`);
    if (tier === "premise") premises.add(name.slice(0, 4));

    const status = fields.get("status");
    if (
      (status === undefined || !STATUS.includes(status)) &&
      !fields.get("superseded-by")
    )
      err(
        rel,
        `status must be proposed|accepted|superseded-by, got '${String(status)}'`,
      );

    const claim = fields.get("claim");
    if (claim === undefined || !CLAIM.includes(claim))
      err(
        rel,
        `claim must be one of ${CLAIM.join("|")}, got '${String(claim)}'`,
      );
    if (claim !== "settled" && !fields.get("owner"))
      err(rel, `claim '${String(claim)}' requires an owner`);

    const date = fields.get("date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? ""))
      err(rel, `date missing or unparseable: '${String(date)}'`);

    const normative = fields.get("normative");
    if (!normative) err(rel, "normative pointer missing");

    for (const section of SECTIONS)
      if (!text.includes(`\n${section}\n`))
        err(rel, `missing section '${section}'`);
    if (!/^# .+/m.test(text.slice(block[0].length)))
      err(rel, "missing H1 decision sentence");

    // -- rests-on: a decision names premises, a premise names nothing
    const restsOn = fields.get("rests-on");
    if (tier === "decision") {
      const ids = (restsOn ?? "").match(/\d{4}/g) ?? [];
      if (ids.length === 0) err(rel, "decision missing rests-on");
      for (const id of ids)
        if (!files.some((file) => file.name.startsWith(`${id}-`)))
          err(rel, `rests-on ${id} names no ADR file`);
      decisions.push({ rel, restsOn: ids });
    } else if (restsOn) err(rel, "premise must not carry rests-on");

    // -- content shape: no fenced block over ten lines
    text.split(/^```/m).forEach((chunk, i) => {
      if (i % 2 === 0) return;
      const lines = chunk.split("\n").length - 1;
      if (lines > 11)
        err(rel, `fenced block of ${lines} lines exceeds the 10-line cap`);
    });

    // -- the Alternatives table has rows, each with a cost or rejection column
    const alternatives =
      text.split("\n## Alternatives\n")[1]?.split("\n## ")[0] ?? "";
    const rows = alternatives
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("|") &&
          !/^\|[\s\-|]+\|$/.test(line) &&
          !/option/i.test(line),
      );
    if (rows.length === 0) err(rel, "Alternatives table has no rows");
    else if (
      rows.some(
        (row) => row.split("|").filter((cell) => cell.trim() !== "").length < 3,
      )
    )
      err(rel, "Alternatives row lacks a cost or rejection column");

    // -- citations: a bare ADR- token must sit inside a link
    const delinked = text.replace(/\[[^\]]*\]\([^)]*\)/g, "");
    for (const bare of delinked.matchAll(/ADR-\d{4}/g))
      err(rel, `bare citation '${bare[0]}' outside a link`);

    // -- links to other ADRs resolve, relative to the linking file's directory
    for (const link of text.matchAll(
      /\]\(([^)#\s]*\d{4}-[\w-]+\.md)(?:#[^)]*)?\)/g,
    )) {
      const href = link[1] ?? "";
      if (/^[a-z]+:/.test(href)) continue; // an absolute URL is somebody else's tree
      if (!existsSync(join(adrDir, domain, href)))
        err(rel, `link to missing ADR file ${href}`);
    }

    // -- the normative target and its anchor exist, under this domain's root
    if (normative) {
      const [target = "", anchor] = normative.split("#");
      if (!normativeRoots.some((root) => target.startsWith(root)))
        err(
          rel,
          `normative target '${target}' is outside '${normativeRoots.join(", ")}'`,
        );
      const anchors = anchorsOf(join(root, target));
      if (anchors === null)
        err(rel, `normative target '${target}' does not exist`);
      else if (anchor && !anchors.has(anchor))
        err(rel, `normative anchor '#${anchor}' not found in ${target}`);
    }
  }

  // rests-on names premises only; a decision-to-decision dependency is prose
  for (const { rel, restsOn } of decisions)
    for (const id of restsOn)
      if (!premises.has(id)) err(rel, `rests-on ${id} is not a premise`);

  // -- register integrity
  const register = join(adrDir, "README.md");
  if (!existsSync(register)) errors.push("docs/adr/README.md: index missing");
  else {
    const readme = readFileSync(register, "utf8");
    for (const { rel } of files)
      if (!readme.includes(rel)) err("README.md", `no row for ${rel}`);
    // Rows carry the domain directory and may point into deferred/, which is
    // not part of the linted set, so every row is checked against the
    // filesystem rather than against the linted list.
    for (const row of readme.matchAll(/\(([a-z]+\/\d{4}-[\w-]+\.md)\)/g)) {
      const target = row[1] ?? "";
      if (!existsSync(join(adrDir, target)))
        err("README.md", `row points at missing file ${target}`);
    }
  }

  // -- every open item carries an owner, a settling test and what it blocks
  const overview = join(root, "spec", "v1", "00-overview.md");
  if (existsSync(overview)) {
    const open = readFileSync(overview, "utf8")
      .split(/\n## Open items\n/)[1]
      ?.split(/\n## /)[0];
    const items = (open ?? "")
      .split(/\n(?=\d+\. )/)
      .filter((item) => /^\d+\. /.test(item));
    items.forEach((item, i) => {
      if (item.includes("~~")) return; // a resolved entry is struck through
      for (const required of ["Owner:", "Settled by:", "Blocks:"])
        if (!item.includes(required))
          err("00-overview.md", `open item ${i + 1} missing '${required}'`);
    });
  }

  return { files: files.length, errors };
}

/** Lint the tree named by argv[0], or this repository, and say what was found. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const { files, errors } = lintAdrs(argv[0] ?? REPOSITORY);
  if (errors.length > 0) {
    output.err(
      `ADR lint: ${errors.length} error(s)\n` +
        errors.map((e) => `  - ${e}\n`).join(""),
    );
    return 1;
  }
  output.out(`ADR lint: ${files} files clean\n`);
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
