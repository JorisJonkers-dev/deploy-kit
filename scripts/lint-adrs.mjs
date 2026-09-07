#!/usr/bin/env node
// ADR lint — enforces the docs/adr contract. See review/REBUILD-MANIFEST.md.
// Checks: structure, register integrity, citation/anchor resolution, content shape.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";

// Root defaults to the repository, and is overridable so the negative fixtures
// in test/ can lint a tree that deliberately violates the contract.
const root =
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const adrDir = join(root, "docs", "adr");
const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);

// One directory per decision domain, and the domain decides which normative
// root a pointer must resolve against. `deferred` is parked direction work: it
// is not linted, and its pointers name sections spec/v1 deliberately lacks.
const DOMAINS = {
  model: { normativeRoot: "spec/v1/" },
  architecture: { normativeRoot: "docs/architecture.md" },
};
const isAdrName = (f) => /^\d{4}-.+\.md$/.test(f);
const listing = (dir) => (existsSync(dir) ? readdirSync(dir) : []);

// A file directly under docs/adr belongs to no domain, so no normative root
// applies to it. That is a misplacement, not a domain of its own.
for (const stray of listing(adrDir).filter(isAdrName))
  err(stray, "ADR outside a domain directory");

const files = Object.keys(DOMAINS)
  .flatMap((domain) =>
    listing(join(adrDir, domain))
      .filter(isAdrName)
      .map((name) => ({ domain, name, rel: posix.join(domain, name) })),
  )
  .sort((a, b) => a.rel.localeCompare(b.rel));
if (files.length === 0) {
  console.error("no ADR files found");
  process.exit(1);
}

// One estate-wide number sequence: a citation resolves without knowing which
// domain the decision lives in, which is only true while numbers are unique.
const byNumber = new Map();
for (const f of files) {
  const n = f.name.slice(0, 4);
  const seen = byNumber.get(n);
  if (seen && seen.domain !== f.domain)
    err(f.rel, `number ${n} used in two domains, also ${seen.rel}`);
  else if (!seen) byNumber.set(n, f);
}

const SECTIONS = [
  "## Rests on",
  "## Why",
  "## Alternatives",
  "## Reversibility",
  "## Consequences",
];
const STATUS = ["proposed", "accepted"];
const CLAIM = ["settled", "open", "accepted-untested"];
const PREMISES = new Set();

// GitHub-style heading anchor slug
const slug = (h) =>
  h
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .trim()
    .replace(/ /g, "-");
const anchorsOf = (path) => {
  if (!existsSync(path)) return null;
  return new Set(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => /^#{1,6} /.test(l))
      .map((l) => slug(l.replace(/^#+ /, ""))),
  );
};

const parsed = [];
for (const entry of files) {
  const { domain, name, rel } = entry;
  const f = rel;
  const p = join(adrDir, domain, name);
  const text = readFileSync(p, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) {
    err(f, "missing frontmatter block");
    continue;
  }
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  parsed.push({ f, p, text, fm });

  // -- structure
  if (!["premise", "decision"].includes(fm.tier))
    err(f, `tier must be premise|decision, got '${fm.tier}'`);
  if (fm.tier === "premise") PREMISES.add(name.slice(0, 4));
  if (!STATUS.includes(fm.status) && !fm["superseded-by"])
    err(
      f,
      `status must be proposed|accepted|superseded-by, got '${fm.status}'`,
    );
  if (!CLAIM.includes(fm.claim))
    err(f, `claim must be one of ${CLAIM.join("|")}, got '${fm.claim}'`);
  if (fm.claim !== "settled" && !fm.owner)
    err(f, `claim '${fm.claim}' requires an owner`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.date || ""))
    err(f, `date missing or unparseable: '${fm.date}'`);
  if (!fm.normative) err(f, "normative pointer missing");
  for (const s of SECTIONS)
    if (!text.includes(`\n${s}\n`)) err(f, `missing section '${s}'`);
  if (!/^# .+/m.test(text.slice(m[0].length)))
    err(f, "missing H1 decision sentence");

  // -- rests-on
  if (fm.tier === "decision") {
    const ro = (fm["rests-on"] || "").match(/\d{4}/g);
    if (!ro || ro.length === 0) err(f, "decision missing rests-on");
    else
      for (const r of ro) {
        const target = files.find((x) => x.name.startsWith(r + "-"));
        if (!target) err(f, `rests-on ${r} names no ADR file`);
      }
  } else if (fm["rests-on"]) err(f, "premise must not carry rests-on");

  // -- content shape: no fenced block over 10 lines
  const fences = text.split(/^```/m);
  for (let i = 1; i < fences.length; i += 2) {
    const lines = fences[i].split("\n").length - 1;
    if (lines > 11)
      err(f, `fenced block of ${lines} lines exceeds the 10-line cap`);
  }
  // -- alternatives table has a populated cost column
  const alt = text.split("\n## Alternatives\n")[1]?.split("\n## ")[0] || "";
  const rows = alt
    .split("\n")
    .filter(
      (l) => /^\|/.test(l) && !/^\|[\s\-|]+\|$/.test(l) && !/option/i.test(l),
    );
  if (rows.length === 0) err(f, "Alternatives table has no rows");
  else if (rows.some((r) => r.split("|").filter((c) => c.trim()).length < 3))
    err(f, "Alternatives row lacks a cost or rejection column");

  // -- citations: bare ADR- tokens must be inside links (strip [text](url) first)
  const delinked = text.replace(/\[[^\]]*\]\([^)]*\)/g, "");
  for (const bare of delinked.matchAll(/ADR-\d{4}/g)) {
    err(f, `bare citation '${bare[0]}' outside a link`);
  }
  // -- internal links resolve, relative to the linking file's own directory
  for (const link of text.matchAll(
    /\]\(([^)#\s]*\d{4}-[\w-]+\.md)(?:#[^)]*)?\)/g,
  )) {
    const href = link[1];
    if (/^[a-z]+:/.test(href)) continue; // an absolute URL is somebody else's tree
    if (!existsSync(join(adrDir, domain, href)))
      err(f, `link to missing ADR file ${href}`);
  }
  // -- normative target + anchor exist, under this domain's normative root
  const [np, anchor] = (fm.normative || "").split("#");
  const { normativeRoot } = DOMAINS[domain];
  if (np && !np.startsWith(normativeRoot))
    err(f, `normative target '${np}' is outside '${normativeRoot}'`);
  const anchors = anchorsOf(join(root, np || ""));
  if (anchors === null) err(f, `normative target '${np}' does not exist`);
  else if (anchor && !anchors.has(anchor))
    err(f, `normative anchor '#${anchor}' not found in ${np}`);
}

// rests-on must name premises only
for (const { f, fm } of parsed) {
  if (fm.tier !== "decision") continue;
  for (const r of (fm["rests-on"] || "").match(/\d{4}/g) || []) {
    if (!PREMISES.has(r)) err(f, `rests-on ${r} is not a premise`);
  }
}

// -- register integrity
const readmePath = join(adrDir, "README.md");
if (!existsSync(readmePath)) errors.push("docs/adr/README.md: index missing");
else {
  const readme = readFileSync(readmePath, "utf8");
  for (const { rel } of files)
    if (!readme.includes(rel)) err("README.md", `no row for ${rel}`);
  // Rows carry the domain directory, and may point into deferred/, which is
  // parked direction work and not part of the linted set. Every row is checked
  // against the filesystem rather than against the linted list.
  for (const link of readme.matchAll(/\(([a-z]+\/\d{4}-[\w-]+\.md)\)/g)) {
    if (!existsSync(join(adrDir, link[1])))
      err("README.md", `row points at missing file ${link[1]}`);
  }
}

// -- Open items carry owner / settled by / blocks
const overviewPath = join(root, "spec", "v1", "00-overview.md");
if (existsSync(overviewPath)) {
  const ov = readFileSync(overviewPath, "utf8");
  const open = ov.split(/\n## Open items\n/)[1]?.split(/\n## /)[0];
  if (open) {
    const items = open.split(/\n(?=\d+\. )/).filter((s) => /^\d+\. /.test(s));
    for (const [i, item] of items.entries()) {
      if (/~~/.test(item)) continue; // resolved entries exempt
      for (const req of ["Owner:", "Settled by:", "Blocks:"])
        if (!item.includes(req))
          err("00-overview.md", `open item ${i + 1} missing '${req}'`);
    }
  }
}

if (errors.length) {
  console.error(
    `ADR lint: ${errors.length} error(s)\n` +
      errors.map((e) => "  - " + e).join("\n"),
  );
  process.exit(1);
}
console.log(`ADR lint: ${files.length} files clean`);
