// Negative fixtures for the decision-record contract.
//
// A lint that has only ever been run against a clean tree is untested: nothing
// proves it would fail. Each case below builds a throwaway tree that violates
// exactly one rule and asserts the lint reports that rule and exits non-zero.
//
// Fixture keys are domain-relative paths under docs/adr ("model/0002-x.md",
// "architecture/0064-y.md" (because the domain a file lives in decides which
// normative root its pointer must resolve against.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const LINT = join(import.meta.dirname, "..", "scripts", "lint-adrs.mjs");

/** A file that satisfies every rule; cases mutate one thing about it. */
function validAdr(overrides = {}) {
  const {
    tier = "decision",
    title = "A decision stated as one sentence",
    claim = "settled",
    owner = null,
    restsOn = '["0001"]',
    normative = "spec/v1/00-overview.md#a-heading",
    body = "",
  } = overrides;

  return [
    "---",
    `tier: ${tier}`,
    "status: proposed",
    `claim: ${claim}`,
    ...(owner ? [`owner: ${owner}`] : []),
    "date: 2026-09-07",
    `normative: ${normative}`,
    ...(tier === "decision" && restsOn ? [`rests-on: ${restsOn}`] : []),
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

/** Build a minimal tree, run the lint against it, return {code, output}. */
function lintTree(files, { premise = true, register = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "adr-lint-"));
  try {
    const adrDir = join(root, "docs", "adr");
    mkdirSync(adrDir, { recursive: true });
    mkdirSync(join(root, "spec", "v1"), { recursive: true });
    writeFileSync(
      join(root, "spec", "v1", "00-overview.md"),
      "# Overview\n\n## A heading\n\nText.\n",
    );
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "architecture.md"),
      "# Architecture\n\n## Layers\n\nText.\n",
    );

    const all = { ...files };
    if (premise) {
      all["model/0001-a-premise.md"] = validAdr({
        tier: "premise",
        title: "A premise stated as one sentence",
        restsOn: null,
      });
    }
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

    const r = spawnSync("node", [LINT, root], { encoding: "utf8" });
    return { code: r.status, output: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a clean tree passes", () => {
  const { code, output } = lintTree({ "model/0002-a-decision.md": validAdr() });
  assert.equal(code, 0, output);
  assert.match(output, /files clean/);
});

test("a missing required section fails", () => {
  const broken = validAdr().replace("## Reversibility", "## Notes");
  const { code, output } = lintTree({ "model/0002-a-decision.md": broken });
  assert.equal(code, 1);
  assert.match(output, /missing section '## Reversibility'/);
});

test("an unknown claim value fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({ claim: "probably" }),
  });
  assert.equal(code, 1);
  assert.match(output, /claim must be one of/);
});

test("an open claim without an owner fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({ claim: "open" }),
  });
  assert.equal(code, 1);
  assert.match(output, /requires an owner/);
});

test("a decision resting on another decision fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({ restsOn: '["0003"]' }),
    "model/0003-another-decision.md": validAdr(),
  });
  assert.equal(code, 1);
  assert.match(output, /rests-on 0003 is not a premise/);
});

test("a premise carrying rests-on fails", () => {
  const premise = validAdr({ tier: "premise", restsOn: null }).replace(
    "date: 2026-09-07",
    'date: 2026-09-07\nrests-on: ["0001"]',
  );
  const { code, output } = lintTree({ "model/0002-a-premise.md": premise });
  assert.equal(code, 1);
  assert.match(output, /premise must not carry rests-on/);
});

test("a bare ADR citation outside a link fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({
      body: "\nSee ADR-0001 for context.\n",
    }),
  });
  assert.equal(code, 1);
  assert.match(output, /bare citation 'ADR-0001' outside a link/);
});

test("a normative anchor that does not exist fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({
      normative: "spec/v1/00-overview.md#no-such-heading",
    }),
  });
  assert.equal(code, 1);
  assert.match(output, /anchor '#no-such-heading' not found/);
});

test("a link to a missing ADR file fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({
      body: "\nSee [0099](0099-absent.md).\n",
    }),
  });
  assert.equal(code, 1);
  assert.match(output, /link to missing ADR file 0099-absent\.md/);
});

test("a fenced block over the ten-line cap fails", () => {
  const fence = ["", "```yaml", ...Array(14).fill("key: value"), "```", ""];
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({ body: fence.join("\n") }),
  });
  assert.equal(code, 1);
  assert.match(output, /exceeds the 10-line cap/);
});

test("an Alternatives table with no rows fails", () => {
  const broken = validAdr().replace(
    "| the other thing | a real cost | a real reason |",
    "",
  );
  const { code, output } = lintTree({ "model/0002-a-decision.md": broken });
  assert.equal(code, 1);
  assert.match(output, /Alternatives table has no rows/);
});

test("an ADR absent from the register fails", () => {
  const { code, output } = lintTree(
    { "model/0002-a-decision.md": validAdr() },
    { register: false },
  );
  assert.equal(code, 1);
  assert.match(output, /index missing/);
});

test("an empty decision set fails loudly", () => {
  const { code, output } = lintTree({}, { premise: false });
  assert.equal(code, 1);
  assert.match(output, /no ADR files found/);
});

// -- domain directories ------------------------------------------------------
// docs/adr carries one directory per decision domain. Which directory a file
// lives in decides which normative root its pointer must resolve against, so
// the domain rules get their own fixtures.

test("an architecture ADR anchoring into docs/architecture.md passes", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr(),
    "architecture/0064-a-code-decision.md": validAdr({
      normative: "docs/architecture.md#layers",
    }),
  });
  assert.equal(code, 0, output);
  assert.match(output, /files clean/);
});

test("an architecture ADR with a missing anchor fails", () => {
  const { code, output } = lintTree({
    "architecture/0064-a-code-decision.md": validAdr({
      normative: "docs/architecture.md#no-such-heading",
    }),
  });
  assert.equal(code, 1);
  assert.match(output, /anchor '#no-such-heading' not found/);
});

test("a model ADR pointing outside spec/v1 fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({
      normative: "docs/architecture.md#layers",
    }),
  });
  assert.equal(code, 1);
  assert.match(output, /normative target .* outside .*spec\/v1/);
});

test("an architecture ADR pointing into spec/v1 fails", () => {
  const { code, output } = lintTree({
    "architecture/0064-a-code-decision.md": validAdr(),
  });
  assert.equal(code, 1);
  assert.match(output, /normative target .* outside .*docs\/architecture\.md/);
});

test("an ADR left outside a domain directory fails", () => {
  const { code, output } = lintTree({
    "0002-a-decision.md": validAdr(),
    "model/0003-another-decision.md": validAdr(),
  });
  assert.equal(code, 1);
  assert.match(output, /outside a domain directory/);
});

test("one number used in two domains fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr(),
    "architecture/0002-a-code-decision.md": validAdr({
      normative: "docs/architecture.md#layers",
    }),
  });
  assert.equal(code, 1);
  assert.match(output, /number 0002 used in two domains/);
});

test("a cross-domain link into deferred resolves", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({
      body: "\nDelivery is [0041](../deferred/0041-a-parked-decision.md).\n",
    }),
    "deferred/0041-a-parked-decision.md": "# Parked, and not linted.\n",
  });
  assert.equal(code, 0, output);
});

test("a cross-domain link to a missing file fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr({
      body: "\nDelivery is [0041](../deferred/0041-absent.md).\n",
    }),
  });
  assert.equal(code, 1);
  assert.match(
    output,
    /link to missing ADR file \.\.\/deferred\/0041-absent\.md/,
  );
});

test("a number already used in deferred fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr(),
    "architecture/0041-a-code-decision.md": validAdr({
      normative: "docs/architecture.md#layers",
    }),
    "deferred/0041-a-parked-decision.md": "# Parked, and not linted.\n",
  });
  assert.equal(code, 1);
  assert.match(output, /number 0041 used in two domains/);
});

test("one number used twice inside a domain fails", () => {
  const { code, output } = lintTree({
    "model/0002-a-decision.md": validAdr(),
    "model/0002-a-different-decision.md": validAdr(),
  });
  assert.equal(code, 1);
  assert.match(output, /number 0002 used twice in model/);
});

test("a tree where every ADR was left at the root says so", () => {
  const { code, output } = lintTree(
    { "0002-a-decision.md": validAdr() },
    { premise: false },
  );
  assert.equal(code, 1);
  assert.match(output, /outside a domain directory/);
  assert.doesNotMatch(output, /no ADR files found/);
});
