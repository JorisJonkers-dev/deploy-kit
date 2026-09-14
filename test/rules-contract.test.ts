// The rule ledger, executed. docs/architecture-rules.md states which rules
// this repository and the compiler are held to, scripts/lint-rules.ts enforces
// that every row still resolves, and this is what makes that enforcement part
// of the test run rather than a thing someone remembers to run. It also starts
// the lint the way CI would, as a command, which is what proves the guard at
// the bottom of the script still runs it.
//
// REQ-014 (docs/requirements.md): every rule this repository enforces has a
// ledger row with a greppable id and a fixture that proves it fires.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import {
  dependencyCruiserRules,
  eslintRules,
  lintRules,
  main,
  parseFamilies,
  parseRules,
} from "../scripts/lint-rules.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const LEDGER = join(REPOSITORY, "docs", "architecture-rules.md");
const ledgerText = (): string => readFileSync(LEDGER, "utf8");

test("the rules lint, run as a command, passes over the committed ledger", () => {
  const out = execFileSync(
    process.execPath,
    [join(REPOSITORY, "scripts", "lint-rules.ts")],
    { encoding: "utf8" },
  );
  expect(out).toMatch(/^rules lint: \d+ rules clean, \d+ pending$/m);
});

test("the ledger is non-empty, and its stated counts match what it holds", () => {
  const { rows } = parseRules(ledgerText());
  expect(rows.length).toBeGreaterThanOrEqual(20);
  const pending = rows.filter(
    (row) => row.enforcement.kind === "pending",
  ).length;
  expect(lintRules(REPOSITORY)).toStrictEqual({
    rows: rows.length,
    pending,
    errors: [],
  });
});

test("every row's id is unique and shaped RULE-NNN", () => {
  const ids = parseRules(ledgerText()).rows.map((row) => row.id);
  for (const id of ids) expect(id).toMatch(/^RULE-\d{3}$/);
  expect(new Set(ids).size).toBe(ids.length);
});

test("every family the taxonomy declares carries at least one rule", () => {
  const { rows } = parseRules(ledgerText());
  const families = parseFamilies(ledgerText());
  expect(families.length).toBeGreaterThan(5);
  const used = new Set(rows.map((row) => row.family));
  for (const family of families) expect(used, family).toContain(family);
});

test("every rule the graph ruleset configures is claimed by exactly one enforced row", () => {
  const configured = dependencyCruiserRules(
    readFileSync(join(REPOSITORY, ".dependency-cruiser.cjs"), "utf8"),
  );
  expect(configured.length).toBeGreaterThan(10);
  const { rows } = parseRules(ledgerText());
  for (const name of configured) {
    const claimed = rows.filter(
      (row) =>
        row.enforcement.kind === "depcruise" && row.enforcement.value === name,
    );
    expect(claimed, name).toHaveLength(1);
  }
});

test("every ESLint rule this repository names is claimed by exactly one enforced row", () => {
  const configured = eslintRules(
    readFileSync(join(REPOSITORY, "eslint.config.js"), "utf8"),
  );
  expect(configured.length).toBeGreaterThan(5);
  const { rows } = parseRules(ledgerText());
  for (const id of configured) {
    const claimed = rows.filter(
      (row) =>
        row.enforcement.kind === "eslint" && row.enforcement.value === id,
    );
    expect(claimed, id).toHaveLength(1);
  }
});

test("every enforced row's fixture is a real test that asserts on its witness", () => {
  const { rows } = parseRules(ledgerText());
  const enforced = rows.filter((row) => row.fixture !== null);
  expect(enforced.length).toBeGreaterThanOrEqual(20);
  for (const row of enforced) {
    const content = readFileSync(join(REPOSITORY, row.fixture ?? ""), "utf8");
    expect(row.fixture, row.id).toMatch(/\.test\.ts$/);
    expect(content, row.id).toMatch(/\b(?:test|it)\s*\(/);
    expect(content, `${row.id} witness`).toContain(row.witness ?? "");
  }
});

test("every pending row names a ticket and a reason, and claims no fixture", () => {
  const { rows } = parseRules(ledgerText());
  const pending = rows.filter((row) => row.enforcement.kind === "pending");
  expect(pending.length).toBeGreaterThan(0);
  for (const row of pending) {
    const { enforcement } = row;
    if (enforcement.kind !== "pending") throw new Error(`${row.id}: enforced`);
    expect(enforcement.ticket, row.id).toMatch(/^(#\d+|n\/a)$/);
    expect(enforcement.reason.length, row.id).toBeGreaterThanOrEqual(20);
    expect(row.fixture, row.id).toBeNull();
  }
});

describe("the command", () => {
  const LEDGER_BODY =
    "# Rule ledger\n\n" +
    "## Families\n\n" +
    "| family | covers |\n|---|---|\n| gates | the gates |\n\n" +
    "## Rules\n\n" +
    "This ledger holds **1** rules, **0** of them pending.\n\n" +
    "| id | family | the rule | enforced by | proved by |\n|---|---|---|---|---|\n" +
    "| RULE-001 | gates | a rule holds | `file:test/a.test.ts` | " +
    "[test/a.test.ts](../test/a.test.ts) `a witness` |\n";

  /** A tree the lint can read: a ledger, a fixture, and empty configurations. */
  function fixture(body: string): string {
    const root = mkdtempSync(join(temporary(), "rules-command-"));
    mkdirSync(join(root, "docs"), { recursive: true });
    mkdirSync(join(root, "test"), { recursive: true });
    writeFileSync(join(root, "docs", "architecture-rules.md"), body);
    writeFileSync(
      join(root, "test", "a.test.ts"),
      'import { expect, it } from "vitest";\n' +
        'it("a witness", () => {\n  expect(1).toBe(1);\n});\n',
    );
    writeFileSync(
      join(root, ".dependency-cruiser.cjs"),
      "module.exports = {};",
    );
    writeFileSync(join(root, "eslint.config.js"), "export default [];");
    writeFileSync(join(root, "package.json"), '{"scripts":{}}');
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    return root;
  }

  it("says how many rules are clean and how many are pending, and exits 0", () => {
    const output = collect();
    expect(main([fixture(LEDGER_BODY)], output)).toBe(0);
    expect(output.text()).toBe("rules lint: 1 rules clean, 0 pending\n");
  });

  it("lists every violation under a count, and exits 1", () => {
    const output = collect();
    const root = fixture("# Rule ledger\n\n## Families\n\n| a | b |\n");
    expect(main([root], output)).toBe(1);
    expect(output.text()).toMatch(/^rules lint: \d+ error\(s\)\n/);
    expect(output.text()).toContain("does not state how many rules it holds");
  });

  it("checks this repository when no tree is named", () => {
    expect(main([], collect())).toBe(0);
  });

  it("runs when Node starts the script, which is how CI would run it", () => {
    const root = fixture("# Rule ledger\n\nno rules here\n");
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "lint-rules.ts"), root],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("does not state how many rules it holds");
  });
});
