// Negative fixtures for the rule ledger.
//
// A lint that has only ever run against a clean ledger is untested: nothing
// proves it would fail. Each case builds a throwaway tree that violates
// exactly one rule and asserts the lint reports it, naming the row.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dependencyCruiserRules,
  eslintRules,
  lintRules,
  parseFamilies,
  parseRules,
} from "../scripts/lint-rules.ts";
import { temporary } from "./setup.ts";

type Files = Readonly<Record<string, string>>;

function write(root: string, files: Files): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

/** A fixture that satisfies "exists, is a test file, holds a test, says it". */
const VALID_FIXTURE =
  'import { expect, it } from "vitest";\n' +
  'it("x", () => {\n  expect("a witness").toBe("a witness");\n});\n';

/** The configurations the lint reads, with one rule each to claim. */
const DEFAULTS: Files = {
  "test/a.test.ts": VALID_FIXTURE,
  ".dependency-cruiser.cjs": "module.exports = { forbidden: [] };\n",
  "eslint.config.js": "export default [];\n",
  "package.json": '{"scripts": {"lint:x": "true"}}\n',
};

/** A git repository holding `files` over the defaults above. */
function fixture(files: Files): string {
  const root = mkdtempSync(join(temporary(), "rules-lint-"));
  write(root, { ...DEFAULTS, ...files });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

const FAMILIES = "| family | covers |\n|---|---|\n| gates | the gates |";
const HEADER =
  "| id | family | the rule | enforced by | proved by |\n|---|---|---|---|---|";

/** A whole ledger document around `rows`, with `counts` as its stated totals. */
function ledger(
  rows: string,
  counts = "**1** rules, **0** of them pending",
): string {
  return (
    `# Rule ledger\n\n## Families\n\n${FAMILIES}\n\n` +
    `## Rules\n\nThis ledger holds ${counts}.\n\n${HEADER}\n${rows}\n`
  );
}

const PROOF = "[test/a.test.ts](../test/a.test.ts) `a witness`";
const CLEAN = `| RULE-001 | gates | a rule holds | \`file:test/a.test.ts\` | ${PROOF} |`;

// Built from two halves, so this file's own source does not carry a citation
// that no row of the real docs/architecture-rules.md resolves.
const BOGUS_ID = ["RULE", "999"].join("-");

describe("lintRules", () => {
  it("passes a clean, minimal ledger, so it is not simply forbidding everything", () => {
    expect(
      lintRules(fixture({ "docs/architecture-rules.md": ledger(CLEAN) })),
    ).toStrictEqual({
      rows: 1,
      pending: 0,
      errors: [],
    });
  });

  it("fails, naming the file, when the ledger itself is missing", () => {
    expect(lintRules(fixture({})).errors).toStrictEqual([
      "docs/architecture-rules.md: ledger missing",
    ]);
  });

  it("fails a row that does not parse as five cells", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds |",
      ),
    });
    expect(lintRules(root).errors).toContain(
      "malformed row: | RULE-001 | gates | a rule holds |",
    );
  });

  it("fails an enforcer that is neither a kind:value token nor a pending entry", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        `| RULE-001 | gates | a rule holds | somebody reviews it | ${PROOF} |`,
      ),
    });
    expect(lintRules(root).errors[0]).toMatch(
      /RULE-001: enforcer 'somebody reviews it' is neither/,
    );
  });

  it("fails an enforcer kind the lint cannot resolve against anything", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        `| RULE-001 | gates | a rule holds | \`vibes:strong\` | ${PROOF} |`,
      ),
    });
    expect(lintRules(root).errors[0]).toMatch(/RULE-001: enforcer/);
  });

  it("fails a family the Families table does not declare", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        `| RULE-001 | vibes | a rule holds | \`file:test/a.test.ts\` | ${PROOF} |`,
      ),
    });
    expect(lintRules(root).errors).toContain(
      "RULE-001: family 'vibes' is not declared in the Families table",
    );
  });

  it("fails a declared family no rule uses, so the taxonomy cannot grow dead entries", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(CLEAN).replace(
        "| gates | the gates |",
        "| gates | the gates |\n| vibes | nothing at all |",
      ),
    });
    expect(lintRules(root).errors).toStrictEqual([
      "docs/architecture-rules.md: family 'vibes' is declared and no rule uses it",
    ]);
  });

  it("fails, naming the row, when the fixture it names does not exist", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds | `file:test/a.test.ts` | " +
          "[test/gone.test.ts](../test/gone.test.ts) `a witness` |",
      ),
    });
    expect(lintRules(root).errors).toStrictEqual([
      "RULE-001: names fixture 'test/gone.test.ts', which does not exist",
    ]);
  });

  it("fails a fixture that never mentions the witness, so nothing there proves the rule fires", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds | `file:test/a.test.ts` | " +
          "[test/a.test.ts](../test/a.test.ts) `another witness` |",
      ),
    });
    expect(lintRules(root).errors).toStrictEqual([
      "RULE-001: fixture 'test/a.test.ts' never mentions 'another witness', " +
        "so nothing in it proves this rule fires",
    ]);
  });

  it("fails a fixture that is not a test file, and one that holds no test", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds | `file:test/a.test.ts` | " +
          "[test/notes.txt](../test/notes.txt) `a witness` |",
      ),
      "test/notes.txt": "a witness, in a text file that it( never runs\n",
    });
    expect(lintRules(root).errors).toStrictEqual([
      "RULE-001: fixture 'test/notes.txt' is not a test file",
    ]);

    const empty = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds | `file:test/a.test.ts` | " +
          "[test/empty.test.ts](../test/empty.test.ts) `a witness` |",
      ),
      "test/empty.test.ts": "// a witness, and no test\n",
    });
    expect(lintRules(empty).errors).toStrictEqual([
      "RULE-001: fixture 'test/empty.test.ts' holds no test",
    ]);
  });

  it("fails a row whose link text does not match its own target", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds | `file:test/a.test.ts` | " +
          "[test/wrong.test.ts](../test/a.test.ts) `a witness` |",
      ),
    });
    expect(lintRules(root).errors).toContain(
      "RULE-001: link text 'test/wrong.test.ts' does not match its target '../test/a.test.ts'",
    );
  });

  it("fails an enforced row whose proof cell is not a linked fixture", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds | `file:test/a.test.ts` | somewhere |",
      ),
    });
    expect(lintRules(root).errors[0]).toMatch(
      /RULE-001: is enforced, so its proof cell must be a linked fixture/,
    );
  });

  it("fails a file, script, graph rule or ESLint rule the tree does not carry", () => {
    const cases: readonly [string, RegExp][] = [
      [
        "`file:test/gone.ts`",
        /names file 'test\/gone\.ts', which does not exist/,
      ],
      [
        "`npm:lint:gone`",
        /names npm script 'lint:gone', which package\.json does not define/,
      ],
      [
        "`depcruise:no-such-rule`",
        /names dependency-cruiser rule 'no-such-rule', which \.dependency-cruiser\.cjs does not configure/,
      ],
      [
        "`eslint:no-such-rule`",
        /names ESLint rule 'no-such-rule', which eslint\.config\.js does not configure/,
      ],
    ];
    for (const [enforcer, expected] of cases) {
      const root = fixture({
        "docs/architecture-rules.md": ledger(
          `| RULE-001 | gates | a rule holds | ${enforcer} | ${PROOF} |`,
        ),
      });
      expect(lintRules(root).errors.join("\n"), enforcer).toMatch(expected);
    }
  });

  it("fails a pending row that carries no reason", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds | pending (#29): soon | pending |",
        "**1** rules, **1** of them pending",
      ),
    });
    expect(lintRules(root).errors).toStrictEqual([
      "RULE-001: is pending with no reason; a pending row says why it is not enforced yet",
    ]);
  });

  it("fails a pending row that names no ticket at all", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds | pending: the compiler does not exist yet | pending |",
        "**1** rules, **1** of them pending",
      ),
    });
    expect(lintRules(root).errors[0]).toMatch(/RULE-001: enforcer 'pending:/);
  });

  it("fails a pending row that also claims a fixture, so pending never reads as proven", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | a rule holds | pending (#29): the compiler does not exist yet | " +
          `${PROOF} |`,
        "**1** rules, **1** of them pending",
      ),
    });
    expect(lintRules(root).errors[0]).toMatch(
      /RULE-001: is pending, so its proof cell must read 'pending'/,
    );
  });

  it("fails a configured graph rule that no row claims", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(CLEAN),
      ".dependency-cruiser.cjs":
        'module.exports = { forbidden: [{ name: "no-circular" }] };\n',
    });
    expect(lintRules(root).errors).toStrictEqual([
      ".dependency-cruiser.cjs: rule 'no-circular' is enforced, and no ledger " +
        "row claims it; a row that calls it pending does not count",
    ]);
  });

  it("fails a configured rule a row has quietly moved to pending", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        "| RULE-001 | gates | no import cycle | pending (#29): waiting for the compiler to land | pending |",
        "**1** rules, **1** of them pending",
      ),
      ".dependency-cruiser.cjs":
        'module.exports = { forbidden: [{ name: "no-circular" }] };\n',
    });
    expect(lintRules(root).errors).toStrictEqual([
      ".dependency-cruiser.cjs: rule 'no-circular' is enforced, and no ledger " +
        "row claims it; a row that calls it pending does not count",
    ]);
  });

  it("fails a configured ESLint rule that no row claims, and ignores one turned off", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(CLEAN),
      "eslint.config.js":
        'export default [{ rules: {\n  "no-shadow": "error",\n  "no-undef": "off",\n} }];\n',
    });
    expect(lintRules(root).errors).toStrictEqual([
      "eslint.config.js: rule 'no-shadow' is enforced, and no ledger row " +
        "claims it; a row that calls it pending does not count",
    ]);
  });

  it("fails one enforcer claimed by two rows", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        `| RULE-001 | gates | a rule holds | \`eslint:no-shadow\` | ${PROOF} |\n` +
          `| RULE-002 | gates | another rule holds | \`eslint:no-shadow\` | ${PROOF} |`,
        "**2** rules, **0** of them pending",
      ),
      "eslint.config.js":
        'export default [{ rules: { "no-shadow": "error" } }];\n',
    });
    expect(lintRules(root).errors).toStrictEqual([
      "eslint.config.js: rule 'no-shadow' is claimed by 2 rows " +
        "(RULE-001, RULE-002); one enforcer, one row",
    ]);
  });

  it("fails two rows sharing one id, naming both sentences", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(
        `${CLEAN}\n| RULE-001 | gates | another rule holds | \`file:test/a.test.ts\` | ${PROOF} |`,
        "**2** rules, **0** of them pending",
      ),
    });
    expect(lintRules(root).errors).toStrictEqual([
      "RULE-001: id used twice, also for 'a rule holds'",
    ]);
  });

  it("fails when a stated count disagrees with the rows it holds", () => {
    const rows = fixture({
      "docs/architecture-rules.md": ledger(
        CLEAN,
        "**2** rules, **0** of them pending",
      ),
    });
    expect(lintRules(rows).errors).toStrictEqual([
      "docs/architecture-rules.md: states 2 rules, holds 1",
    ]);

    const pending = fixture({
      "docs/architecture-rules.md": ledger(
        CLEAN,
        "**1** rules, **1** of them pending",
      ),
    });
    expect(lintRules(pending).errors).toStrictEqual([
      "docs/architecture-rules.md: states 1 pending, holds 0",
    ]);
  });

  it("fails a ledger that states neither count, and one with no Families table", () => {
    const root = fixture({
      "docs/architecture-rules.md": `# Rule ledger\n\n## Families\n\n${FAMILIES}\n\n## Rules\n\n${HEADER}\n${CLEAN}\n`,
    });
    expect(lintRules(root).errors).toStrictEqual([
      "docs/architecture-rules.md: does not state how many rules it holds",
      "docs/architecture-rules.md: does not state how many rules are pending",
    ]);

    const noFamilies = fixture({
      "docs/architecture-rules.md":
        "# Rule ledger\n\n## Rules\n\nThis ledger holds **1** rules, " +
        `**0** of them pending.\n\n${HEADER}\n${CLEAN}\n`,
    });
    expect(lintRules(noFamilies).errors).toStrictEqual([
      "docs/architecture-rules.md: no Families table",
      "RULE-001: family 'gates' is not declared in the Families table",
    ]);
  });

  it("fails a tree whose rule configurations are missing altogether", () => {
    const root = mkdtempSync(join(temporary(), "rules-bare-"));
    write(root, {
      "docs/architecture-rules.md": ledger(
        CLEAN,
        "**0** rules, **0** of them pending",
      ),
    });
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    const { errors } = lintRules(root);
    expect(errors).toContain(
      "docs/architecture-rules.md: .dependency-cruiser.cjs is missing",
    );
    expect(errors).toContain(
      "docs/architecture-rules.md: eslint.config.js is missing",
    );
  });

  it("fails when an id no row carries is cited elsewhere in the tree", () => {
    const root = fixture({
      "docs/architecture-rules.md": ledger(CLEAN),
      "scripts/note.ts": `// see ${BOGUS_ID} for context\n`,
    });
    expect(lintRules(root).errors).toStrictEqual([
      `scripts/note.ts cites ${BOGUS_ID}, which no row carries`,
    ]);
  });

  it("ignores an untracked file's citation, the same way the em-dash ban ignores scratch files", () => {
    const root = fixture({ "docs/architecture-rules.md": ledger(CLEAN) });
    writeFileSync(join(root, "scratch.md"), `${BOGUS_ID}, never staged\n`);
    expect(lintRules(root).errors).toStrictEqual([]);
  });
});

describe("parseRules", () => {
  it("returns one row per well-formed line, in document order", () => {
    const { rows, errors } = parseRules(
      `| RULE-002 | gates | second | \`file:a\` | ${PROOF} |\n` +
        `| RULE-001 | gates | first | \`file:a\` | ${PROOF} |`,
    );
    expect(errors).toStrictEqual([]);
    expect(rows.map((row) => row.id)).toStrictEqual(["RULE-002", "RULE-001"]);
  });

  it("ignores prose that merely contains a pipe", () => {
    const { rows, errors } = parseRules(
      "Some table | with a pipe | but no id\n",
    );
    expect(rows).toStrictEqual([]);
    expect(errors).toStrictEqual([]);
  });
});

describe("reading the configurations", () => {
  it("reads a graph ruleset's rule names, and nothing else that is quoted", () => {
    expect(
      dependencyCruiserRules(
        'module.exports = { forbidden: [\n  { name: "no-circular", comment: "x" },\n' +
          '  { name: "no-orphans" },\n] };\n',
      ),
    ).toStrictEqual(["no-circular", "no-orphans"]);
  });

  it("reads an ESLint config's named rules, skipping options and rules turned off", () => {
    expect(
      eslintRules(
        'export default [{ rules: {\n  "a/one": "error",\n  "a/two": [\n    "error",\n' +
          '    { "ts-ignore": true, "ts-expect-error": "allow-with-description" },\n' +
          '  ],\n  "a/three": "warn",\n  "a/four": "off",\n} }];\n',
      ),
    ).toStrictEqual(["a/one", "a/two", "a/three"]);
  });

  it("reads the families a document declares, skipping its header row", () => {
    expect(
      parseFamilies(
        `# L\n\n## Families\n\n${FAMILIES}\n| tests | the tests |\n\n## Rules\n\n| gone | not a family |\n`,
      ),
    ).toStrictEqual(["gates", "tests"]);
  });
});
