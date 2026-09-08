// The decision-record contract, executed. docs/adr/README.md states the rules;
// scripts/lint-adrs.mjs enforces them; this test is what makes the enforcement
// part of `npm test` rather than a thing someone remembers to run.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

// The linted domains, each its own directory under docs/adr. `deferred` is
// parked direction work and is deliberately not part of the linted set.
const ADR_DIR = "docs/adr";
const DOMAINS = ["model", "architecture"];
const adrFiles = DOMAINS.flatMap((domain) =>
  (existsSync(join(ADR_DIR, domain)) ? readdirSync(join(ADR_DIR, domain)) : [])
    .filter((f) => /^\d{4}-.+\.md$/.test(f))
    .map((f) => join(domain, f)),
).sort();

test("the ADR lint passes over the committed decision set", () => {
  const out = execFileSync("node", ["scripts/lint-adrs.mjs"], {
    encoding: "utf8",
  });
  assert.match(out, /files clean/);
});

test("the decision set is non-empty, and one number is used once", () => {
  assert.ok(adrFiles.length >= 40, `only ${adrFiles.length} ADRs found`);
  const numbers = adrFiles.map((f) => Number(basename(f).slice(0, 4)));
  assert.equal(new Set(numbers).size, numbers.length, "duplicate ADR number");
});

test("every premise carries a falsifiable claim and every decision rests on one", () => {
  const premises = new Set();
  const decisions = [];

  for (const file of adrFiles) {
    const text = readFileSync(join(ADR_DIR, file), "utf8");
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, `${file}: no frontmatter`);

    const tier = frontmatter[1].match(/^tier: (\w+)$/m)?.[1];
    assert.ok(
      tier === "premise" || tier === "decision",
      `${file}: bad tier ${tier}`,
    );

    const restsOn = text.split("\n## Rests on\n")[1]?.split("\n## ")[0] ?? "";
    assert.match(restsOn, /False\s+if:/, `${file}: claim is not falsifiable`);
    assert.match(restsOn, /Settled\s+by:/, `${file}: no settling test`);

    if (tier === "premise") premises.add(basename(file).slice(0, 4));
    else decisions.push({ file, frontmatter: frontmatter[1] });
  }

  assert.ok(premises.size > 0, "no premises found");
  for (const { file, frontmatter } of decisions) {
    const named = frontmatter.match(/^rests-on: (.+)$/m)?.[1] ?? "";
    const ids = named.match(/\d{4}/g) ?? [];
    assert.ok(ids.length > 0, `${file}: decision names no premise`);
    for (const id of ids) {
      assert.ok(premises.has(id), `${file}: rests-on ${id} is not a premise`);
    }
  }
});

test("an open claim names an owner who can settle it", () => {
  for (const file of adrFiles) {
    const text = readFileSync(join(ADR_DIR, file), "utf8");
    const claim = text.match(/^claim: (\S+)$/m)?.[1];
    if (claim && claim !== "settled") {
      assert.match(text, /^owner: \S+$/m, `${file}: ${claim} without an owner`);
    }
  }
});
