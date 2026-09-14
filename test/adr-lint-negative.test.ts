// Negative fixtures for the decision-record contract.
//
// A lint that has only ever run against a clean tree is untested: nothing
// proves it would fail. Each case builds a throwaway tree that violates
// exactly one rule and asserts the lint reports that rule.
//
// Fixture keys are domain-relative paths under docs/adr, such as
// "model/0002-x.md" or "architecture/0064-y.md", because the domain a file
// lives in decides which normative root its pointer must resolve against.
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintAdrs, main } from "../scripts/lint-adrs.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

interface AdrOptions {
  readonly tier?: string;
  readonly title?: string;
  readonly claim?: string;
  readonly owner?: string;
  readonly restsOn?: string | null;
  readonly normative?: string;
  readonly body?: string;
}

/** A file that satisfies every rule; each case changes one thing about it. */
function validAdr({
  tier = "decision",
  title = "A decision stated as one sentence",
  claim = "settled",
  owner,
  restsOn = '["0001"]',
  normative = "spec/v1/00-overview.md#a-heading",
  body = "",
}: AdrOptions = {}): string {
  return [
    "---",
    `tier: ${tier}`,
    "status: proposed",
    `claim: ${claim}`,
    ...(owner === undefined ? [] : [`owner: ${owner}`]),
    "date: 2026-09-07",
    `normative: ${normative}`,
    ...(tier === "decision" && restsOn !== null
      ? [`rests-on: ${restsOn}`]
      : []),
    "---",
    "",
    `# ${title}`,
    "",
    "## Rests on",
    "A claim. False if: it does not hold. Settled by: one command.",
    "",
    "## Why",
    "Because of evidence.",
    "",
    "## Alternatives",
    "| option | cost if taken | why rejected |",
    "|---|---|---|",
    "| the other thing | a real cost | a real reason |",
    "",
    "## Reversibility",
    "Undo cost today: an hour. Becomes irreversible once: never.",
    "",
    "## Consequences",
    "- something, paid by someone",
    body,
    "",
  ].join("\n");
}

interface TreeOptions {
  readonly premise?: boolean;
  readonly register?: boolean;
  readonly overview?: string;
}

const OVERVIEW = "# Overview\n\n## A heading\n\nText.\n";

/** Write a minimal repository under this test's directory, and return its root. */
function tree(
  files: Readonly<Record<string, string>>,
  { premise = true, register = true, overview = OVERVIEW }: TreeOptions = {},
): string {
  const root = mkdtempSync(join(temporary(), "adr-lint-"));
  const adrDir = join(root, "docs", "adr");
  mkdirSync(adrDir, { recursive: true });
  mkdirSync(join(root, "spec", "v1"), { recursive: true });
  writeFileSync(join(root, "spec", "v1", "00-overview.md"), overview);
  writeFileSync(
    join(root, "docs", "architecture.md"),
    "# Architecture\n\n## Layers\n\nText.\n",
  );
  // The second normative document an architecture ADR may point at. It
  // deliberately carries only one heading, so a pointer at a section it lacks
  // is the case the anchor check has to catch.
  writeFileSync(
    join(root, "docs", "architecture-rules.md"),
    "# Rule ledger\n\n## Rules\n\nText.\n",
  );

  const all: Record<string, string> = { ...files };
  if (premise)
    all["model/0001-a-premise.md"] = validAdr({
      tier: "premise",
      title: "A premise stated as one sentence",
      restsOn: null,
    });
  for (const [rel, content] of Object.entries(all)) {
    const target = join(adrDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  if (register) {
    const rows = Object.keys(all)
      .map((rel) => `| [${basename(rel).slice(0, 4)}](${rel}) | a row |`)
      .join("\n");
    writeFileSync(
      join(adrDir, "README.md"),
      `# Register\n\n| # | title |\n|---|---|\n${rows}\n`,
    );
  }
  return root;
}

/** Every violation the lint reports for a tree, as one string to match. */
function violations(
  files: Readonly<Record<string, string>>,
  options?: TreeOptions,
): string {
  return lintAdrs(tree(files, options)).errors.join("\n");
}

const DECISION = "model/0002-a-decision.md";

describe("a clean tree", () => {
  it("passes, and counts every ADR it read", () => {
    const result = lintAdrs(tree({ [DECISION]: validAdr() }));
    expect(result).toStrictEqual({ files: 2, errors: [] });
  });
});

describe("structure", () => {
  it("fails a file with no frontmatter", () => {
    expect(violations({ [DECISION]: "# Just a title\n" })).toMatch(
      /missing frontmatter block/,
    );
  });

  it("fails a missing required section", () => {
    const broken = validAdr().replace("## Reversibility", "## Notes");
    expect(violations({ [DECISION]: broken })).toMatch(
      /missing section '## Reversibility'/,
    );
  });

  it("fails a missing decision sentence", () => {
    const broken = validAdr().replace(
      "# A decision stated as one sentence\n",
      "",
    );
    expect(violations({ [DECISION]: broken })).toMatch(
      /missing H1 decision sentence/,
    );
  });

  it("fails an unknown tier", () => {
    expect(violations({ [DECISION]: validAdr({ tier: "musing" }) })).toMatch(
      /tier must be premise\|decision, got 'musing'/,
    );
  });

  it("fails a status outside the vocabulary", () => {
    const broken = validAdr().replace("status: proposed", "status: draft");
    expect(violations({ [DECISION]: broken })).toMatch(
      /status must be proposed\|accepted\|superseded-by, got 'draft'/,
    );
  });

  it("accepts a superseded record in place of a status", () => {
    const superseded = validAdr().replace(
      "status: proposed",
      "superseded-by: 0003",
    );
    expect(violations({ [DECISION]: superseded })).toBe("");
  });

  it("fails an unknown claim value", () => {
    expect(violations({ [DECISION]: validAdr({ claim: "probably" }) })).toMatch(
      /claim must be one of/,
    );
  });

  it("fails an open claim without an owner", () => {
    expect(violations({ [DECISION]: validAdr({ claim: "open" }) })).toMatch(
      /requires an owner/,
    );
  });

  it("accepts an open claim that names an owner", () => {
    const open = validAdr({ claim: "open", owner: "someone" });
    expect(violations({ [DECISION]: open })).toBe("");
  });

  it("fails a date that does not parse", () => {
    const broken = validAdr().replace("date: 2026-09-07", "date: soon");
    expect(violations({ [DECISION]: broken })).toMatch(
      /date missing or unparseable: 'soon'/,
    );
  });
});

describe("rests-on", () => {
  it("fails a decision resting on another decision", () => {
    expect(
      violations({
        [DECISION]: validAdr({ restsOn: '["0003"]' }),
        "model/0003-another-decision.md": validAdr(),
      }),
    ).toMatch(/rests-on 0003 is not a premise/);
  });

  it("fails a decision that rests on nothing", () => {
    expect(violations({ [DECISION]: validAdr({ restsOn: "[]" }) })).toMatch(
      /decision missing rests-on/,
    );
  });

  it("fails a decision resting on a number no ADR carries", () => {
    expect(
      violations({ [DECISION]: validAdr({ restsOn: '["0042"]' }) }),
    ).toMatch(/rests-on 0042 names no ADR file/);
  });

  it("fails a premise carrying rests-on", () => {
    const premise = validAdr({ tier: "premise", restsOn: null }).replace(
      "date: 2026-09-07",
      'date: 2026-09-07\nrests-on: ["0001"]',
    );
    expect(violations({ "model/0002-a-premise.md": premise })).toMatch(
      /premise must not carry rests-on/,
    );
  });
});

describe("content", () => {
  it("fails a bare ADR citation outside a link", () => {
    const cited = validAdr({ body: "\nSee ADR-0001 for context.\n" });
    expect(violations({ [DECISION]: cited })).toMatch(
      /bare citation 'ADR-0001' outside a link/,
    );
  });

  it("fails a fenced block over the ten-line cap", () => {
    const fence = [
      "",
      "```yaml",
      ...Array<string>(14).fill("key: value"),
      "```",
      "",
    ];
    expect(
      violations({ [DECISION]: validAdr({ body: fence.join("\n") }) }),
    ).toMatch(/exceeds the 10-line cap/);
  });

  it("fails an Alternatives table with no rows", () => {
    const broken = validAdr().replace(
      "| the other thing | a real cost | a real reason |",
      "",
    );
    expect(violations({ [DECISION]: broken })).toMatch(
      /Alternatives table has no rows/,
    );
  });

  it("fails an Alternatives row without a cost or rejection column", () => {
    const broken = validAdr().replace(
      "| the other thing | a real cost | a real reason |",
      "| the other thing | a real cost |",
    );
    expect(violations({ [DECISION]: broken })).toMatch(
      /Alternatives row lacks a cost or rejection column/,
    );
  });
});

describe("links and normative pointers", () => {
  it("fails a normative anchor that does not exist", () => {
    const broken = validAdr({
      normative: "spec/v1/00-overview.md#no-such-heading",
    });
    expect(violations({ [DECISION]: broken })).toMatch(
      /anchor '#no-such-heading' not found/,
    );
  });

  it("fails a normative target that does not exist", () => {
    const broken = validAdr({ normative: "spec/v1/99-gone.md#a-heading" });
    expect(violations({ [DECISION]: broken })).toMatch(
      /normative target 'spec\/v1\/99-gone\.md' does not exist/,
    );
  });

  it("reports a missing normative pointer instead of stopping at it", () => {
    const broken = validAdr().replace(
      "normative: spec/v1/00-overview.md#a-heading\n",
      "",
    );
    expect(violations({ [DECISION]: broken })).toBe(
      `${DECISION}: normative pointer missing`,
    );
  });

  it("fails a link to a missing ADR file", () => {
    const linked = validAdr({ body: "\nSee [0099](0099-absent.md).\n" });
    expect(violations({ [DECISION]: linked })).toMatch(
      /link to missing ADR file 0099-absent\.md/,
    );
  });

  it("does not follow a link to somebody else's tree", () => {
    const linked = validAdr({
      body: "\nSee [0099](https://example.invalid/0099-elsewhere.md).\n",
    });
    expect(violations({ [DECISION]: linked })).toBe("");
  });
});

describe("the register", () => {
  it("fails a tree with no register at all", () => {
    expect(violations({ [DECISION]: validAdr() }, { register: false })).toMatch(
      /index missing/,
    );
  });

  it("fails an ADR the register has no row for", () => {
    const root = tree({ [DECISION]: validAdr() }, { register: false });
    writeFileSync(
      join(root, "docs", "adr", "README.md"),
      "# Register\n\n| [0001](model/0001-a-premise.md) | a row |\n",
    );
    expect(lintAdrs(root).errors).toStrictEqual([
      `README.md: no row for ${DECISION}`,
    ]);
  });

  it("fails a row pointing at a file that does not exist", () => {
    const root = tree({ [DECISION]: validAdr() });
    appendFileSync(
      join(root, "docs", "adr", "README.md"),
      "| [0099](model/0099-gone.md) | gone |\n",
    );
    expect(lintAdrs(root).errors).toStrictEqual([
      "README.md: row points at missing file model/0099-gone.md",
    ]);
  });

  it("fails an empty decision set loudly", () => {
    expect(violations({}, { premise: false })).toBe("no ADR files found");
  });
});

describe("open items", () => {
  const withItems = (items: string): string =>
    `${OVERVIEW}\n## Open items\n\n${items}`;

  it("fails an open item that names no owner, settling test or blocker", () => {
    const errors = lintAdrs(
      tree(
        { [DECISION]: validAdr() },
        { overview: withItems("1. Undecided.\n") },
      ),
    ).errors;
    expect(errors).toStrictEqual([
      "00-overview.md: open item 1 missing 'Owner:'",
      "00-overview.md: open item 1 missing 'Settled by:'",
      "00-overview.md: open item 1 missing 'Blocks:'",
    ]);
  });

  it("accepts an item that names all three", () => {
    const item =
      "1. Undecided. Owner: me. Settled by: a test. Blocks: nothing.\n";
    expect(
      violations({ [DECISION]: validAdr() }, { overview: withItems(item) }),
    ).toBe("");
  });

  it("exempts a resolved item, struck through", () => {
    expect(
      violations(
        { [DECISION]: validAdr() },
        { overview: withItems("1. ~~Decided.~~\n") },
      ),
    ).toBe("");
  });
});

// docs/adr carries one directory per decision domain. Which directory a file
// lives in decides which normative root its pointer must resolve against, so
// the domain rules get their own fixtures.
describe("domain directories", () => {
  it("passes an architecture ADR anchoring into docs/architecture.md", () => {
    expect(
      violations({
        [DECISION]: validAdr(),
        "architecture/0064-a-code-decision.md": validAdr({
          normative: "docs/architecture.md#layers",
        }),
      }),
    ).toBe("");
  });

  it("fails an architecture ADR with a missing anchor", () => {
    expect(
      violations({
        "architecture/0064-a-code-decision.md": validAdr({
          normative: "docs/architecture.md#no-such-heading",
        }),
      }),
    ).toMatch(/anchor '#no-such-heading' not found/);
  });

  it("passes an architecture ADR anchoring into the rule ledger", () => {
    expect(
      violations({
        [DECISION]: validAdr(),
        "architecture/0064-a-code-decision.md": validAdr({
          normative: "docs/architecture-rules.md#rules",
        }),
      }),
    ).toBe("");
  });

  it("fails an architecture ADR naming a rule ledger section that is not there", () => {
    expect(
      violations({
        "architecture/0064-a-code-decision.md": validAdr({
          normative: "docs/architecture-rules.md#families",
        }),
      }),
    ).toMatch(/anchor '#families' not found in docs\/architecture-rules\.md/);
  });

  it("fails a model ADR pointing outside spec/v1", () => {
    expect(
      violations({
        [DECISION]: validAdr({ normative: "docs/architecture.md#layers" }),
      }),
    ).toMatch(/normative target .* outside .*spec\/v1/);
  });

  it("fails an architecture ADR pointing into spec/v1", () => {
    expect(
      violations({ "architecture/0064-a-code-decision.md": validAdr() }),
    ).toMatch(/normative target .* outside .*docs\/architecture\.md/);
  });

  it("fails an ADR left outside a domain directory", () => {
    expect(
      violations({
        "0002-a-decision.md": validAdr(),
        "model/0003-another-decision.md": validAdr(),
      }),
    ).toMatch(/outside a domain directory/);
  });

  it("fails one number used in two domains", () => {
    expect(
      violations({
        [DECISION]: validAdr(),
        "architecture/0002-a-code-decision.md": validAdr({
          normative: "docs/architecture.md#layers",
        }),
      }),
    ).toMatch(/number 0002 used in two domains/);
  });

  it("resolves a cross-domain link into deferred", () => {
    expect(
      violations({
        [DECISION]: validAdr({
          body: "\nDelivery is [0041](../deferred/0041-a-parked-decision.md).\n",
        }),
        "deferred/0041-a-parked-decision.md": "# Parked, and not linted.\n",
      }),
    ).toBe("");
  });

  it("fails a cross-domain link to a missing file", () => {
    expect(
      violations({
        [DECISION]: validAdr({
          body: "\nDelivery is [0041](../deferred/0041-absent.md).\n",
        }),
      }),
    ).toMatch(/link to missing ADR file \.\.\/deferred\/0041-absent\.md/);
  });

  it("fails a number already used in deferred", () => {
    expect(
      violations({
        [DECISION]: validAdr(),
        "architecture/0041-a-code-decision.md": validAdr({
          normative: "docs/architecture.md#layers",
        }),
        "deferred/0041-a-parked-decision.md": "# Parked, and not linted.\n",
      }),
    ).toMatch(/number 0041 used in two domains/);
  });

  it("fails one number used twice inside a domain", () => {
    expect(
      violations({
        [DECISION]: validAdr(),
        "model/0002-a-different-decision.md": validAdr(),
      }),
    ).toMatch(/number 0002 used twice in model/);
  });

  it("says so when every ADR was left at the root", () => {
    const found = violations(
      { "0002-a-decision.md": validAdr() },
      { premise: false },
    );
    expect(found).toMatch(/outside a domain directory/);
    expect(found).not.toMatch(/no ADR files found/);
  });
});

describe("the command", () => {
  it("says how many files were clean, and exits 0", () => {
    const output = collect();
    expect(main([tree({ [DECISION]: validAdr() })], output)).toBe(0);
    expect(output.text()).toBe("ADR lint: 2 files clean\n");
  });

  it("lists every violation under a count, and exits 1", () => {
    const output = collect();
    const broken = validAdr().replace("## Reversibility", "## Notes");
    expect(main([tree({ [DECISION]: broken })], output)).toBe(1);
    expect(output.text()).toBe(
      "ADR lint: 1 error(s)\n" +
        `  - ${DECISION}: missing section '## Reversibility'\n`,
    );
  });
});
