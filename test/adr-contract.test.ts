// The decision-record contract, executed. docs/adr/README.md states the rules,
// scripts/lint-adrs.ts enforces them, and this is what makes the enforcement
// part of the test run rather than a thing someone remembers to run. It also
// starts the lint the way CI does, as a command, which is what proves the
// guard at the bottom of the script still runs it.
//
// REQ-001 (docs/requirements.md): every decision record satisfies its
// frontmatter, register and citation contract.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vitest";

const REPOSITORY = join(import.meta.dirname, "..");
const ADR_DIR = join(REPOSITORY, "docs", "adr");

// The linted domains, each its own directory under docs/adr. `deferred` is
// parked direction work and is deliberately not part of the linted set.
const DOMAINS = ["model", "architecture"];
const adrFiles = DOMAINS.flatMap((domain) =>
  (existsSync(join(ADR_DIR, domain)) ? readdirSync(join(ADR_DIR, domain)) : [])
    .filter((file) => /^\d{4}-.+\.md$/.test(file))
    .map((file) => join(domain, file)),
).sort();

test("the ADR lint, run as a command, passes over the committed decision set", () => {
  const out = execFileSync(
    process.execPath,
    [join(REPOSITORY, "scripts", "lint-adrs.ts")],
    { encoding: "utf8" },
  );
  expect(out).toMatch(/^ADR lint: \d+ files clean$/m);
});

test("the decision set is non-empty, and one number is used once", () => {
  expect(adrFiles.length).toBeGreaterThanOrEqual(40);
  const numbers = adrFiles.map((file) => Number(basename(file).slice(0, 4)));
  expect(new Set(numbers).size, "duplicate ADR number").toBe(numbers.length);
});

test("every premise carries a falsifiable claim and every decision rests on one", () => {
  const premises = new Set<string>();
  const decisions: { file: string; frontmatter: string }[] = [];

  for (const file of adrFiles) {
    const text = readFileSync(join(ADR_DIR, file), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
    expect(frontmatter, `${file}: no frontmatter`).toBeDefined();

    const tier = /^tier: (\w+)$/m.exec(frontmatter ?? "")?.[1];
    expect(["premise", "decision"], `${file}: bad tier`).toContain(tier);

    const restsOn = text.split("\n## Rests on\n")[1]?.split("\n## ")[0] ?? "";
    expect(restsOn, `${file}: claim is not falsifiable`).toMatch(/False\s+if:/);
    expect(restsOn, `${file}: no settling test`).toMatch(/Settled\s+by:/);

    if (tier === "premise") premises.add(basename(file).slice(0, 4));
    else decisions.push({ file, frontmatter: frontmatter ?? "" });
  }

  expect(premises.size, "no premises found").toBeGreaterThan(0);
  for (const { file, frontmatter } of decisions) {
    const ids =
      /^rests-on: (.+)$/m.exec(frontmatter)?.[1]?.match(/\d{4}/g) ?? [];
    expect(ids.length, `${file}: decision names no premise`).toBeGreaterThan(0);
    for (const id of ids)
      expect(premises.has(id), `${file}: rests-on ${id} is not a premise`).toBe(
        true,
      );
  }
});

test("an open claim names an owner who can settle it", () => {
  for (const file of adrFiles) {
    const text = readFileSync(join(ADR_DIR, file), "utf8");
    const claim = /^claim: (\S+)$/m.exec(text)?.[1];
    if (claim !== undefined && claim !== "settled")
      expect(text, `${file}: ${claim} without an owner`).toMatch(
        /^owner: \S+$/m,
      );
  }
});
