// Negative fixtures for the meaning lint.
//
// A lint that has only ever run against a clean tree is untested: nothing
// proves it would fail. Each case builds a throwaway tree that violates
// exactly one of the three checks and asserts the lint reports it.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  lintMeaning,
  main,
  parseCount,
  retiredTermErrors,
  sentencesOf,
  staleCountErrors,
  supersededAdrs,
  supersededCitationErrors,
} from "../scripts/lint-meaning.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

type Files = Readonly<Record<string, string>>;

function write(root: string, files: Files): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

/**
 * The two real sources the stale-count check reads for its collections: a
 * Gates table of two rows in `docs/architecture.md`, and a two-adapter
 * enumeration in ADR 0052's own shape. Present in every fixture so a case
 * that does not touch counts still lints cleanly.
 */
const COUNT_SOURCES: Files = {
  "docs/architecture.md":
    "# Architecture\n\n## Gates\n\nTwo gates hold the structure.\n\n" +
    "| gate | command | catches |\n|---|---|---|\n" +
    "| lint | `npm run lint` | drift |\n" +
    "| test | `npm run test` | breakage |\n\n## Tooling\n\nNothing here.\n",
  "docs/adr/model/0052-registered-adapters-are-v1.md":
    "---\ntier: decision\nstatus: proposed\nclaim: settled\ndate: 2026-08-31\n" +
    'normative: spec/v1/30-deliverables.md#adapters\nrests-on: ["0003"]\n---\n\n' +
    "# The registered adapters are v1\n\n" +
    "The set is two central adapters (`kubernetes`, `vault-policy`) enumerated.\n",
};

/** A git repository under this test's directory, tracking `files` over the count sources. */
function fixture(files: Files): string {
  const root = mkdtempSync(join(temporary(), "meaning-lint-"));
  write(root, { ...COUNT_SOURCES, ...files });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

/** A minimal ADR file: valid frontmatter, an optional `superseded-by`, one H1. */
function adr(title: string, supersededBy?: string): string {
  return (
    "---\ntier: decision\nstatus: proposed\nclaim: settled\ndate: 2026-08-31\n" +
    (supersededBy === undefined ? "" : `superseded-by: ${supersededBy}\n`) +
    `normative: spec/v1/00-overview.md#x\nrests-on: ["0003"]\n---\n\n# ${title}\n`
  );
}

describe("superseded citation", () => {
  const SUPERSEDED: Files = {
    "docs/adr/model/0001-old-way.md": adr("The old way", "0002"),
    "docs/adr/model/0002-new-way.md": adr("The new way"),
  };

  it("fails a citation of a superseded ADR with no successor in the same sentence", () => {
    const root = fixture({
      ...SUPERSEDED,
      "README.md":
        "The old way governs this\n" +
        "([0001](docs/adr/model/0001-old-way.md)).\n",
    });
    expect(lintMeaning(root).errors).toContain(
      "README.md: cites superseded 0001 without its successor 0002 in the same sentence",
    );
  });

  it("passes when the successor is linked in the same sentence", () => {
    const root = fixture({
      ...SUPERSEDED,
      "README.md":
        "The old way governs this ([0001](docs/adr/model/0001-old-way.md), " +
        "superseded by [0002](docs/adr/model/0002-new-way.md)).\n",
    });
    expect(lintMeaning(root).errors).toStrictEqual([]);
  });

  it("passes a table row citing both in one cell, the register's own shape", () => {
    const root = fixture({
      ...SUPERSEDED,
      "README.md":
        "| id | claim |\n|---|---|\n" +
        "| [0001](docs/adr/model/0001-old-way.md) | superseded by [0002](docs/adr/model/0002-new-way.md) |\n",
    });
    expect(lintMeaning(root).errors).toStrictEqual([]);
  });

  it("exempts the successor's own file citing what it replaces", () => {
    const root = fixture({
      "docs/adr/model/0001-old-way.md":
        SUPERSEDED["docs/adr/model/0001-old-way.md"] ?? "",
      "docs/adr/model/0002-new-way.md":
        adr("The new way") + "\nThis supersedes [0001](0001-old-way.md).\n",
    });
    expect(lintMeaning(root).errors).toStrictEqual([]);
  });

  it("fails two sentences apart the same way link-contract fails a moved link", () => {
    const root = fixture({
      ...SUPERSEDED,
      "README.md":
        "The old way governs this ([0001](docs/adr/model/0001-old-way.md)). " +
        "It was replaced ([0002](docs/adr/model/0002-new-way.md)).\n",
    });
    expect(lintMeaning(root).errors).toContain(
      "README.md: cites superseded 0001 without its successor 0002 in the same sentence",
    );
  });
});

describe("retired term", () => {
  it("fails a bare mention of a retired term outside a quotation", () => {
    const root = fixture({
      "notes.md": "The Cluster Context still holds this fact.\n",
    });
    expect(lintMeaning(root).errors).toContain(
      "notes.md: uses retired term 'Cluster Context' outside a quotation",
    );
  });

  it("fails the other retired term, Service Intent", () => {
    const root = fixture({
      "notes.md": "A field on Service Intent carries this value.\n",
    });
    expect(lintMeaning(root).errors).toContain(
      "notes.md: uses retired term 'Service Intent' outside a quotation",
    );
  });

  it("passes a mention inside a blockquote, the amendment-note shape", () => {
    const root = fixture({
      "notes.md": "> Renamed: the old name was Cluster Context.\n",
    });
    expect(lintMeaning(root).errors).toStrictEqual([]);
  });

  it("passes an italicised mention", () => {
    const root = fixture({
      "notes.md": "Formerly the *Cluster Context*, now renamed.\n",
    });
    expect(lintMeaning(root).errors).toStrictEqual([]);
  });

  it("passes a paragraph that cites the ADR which retired the term", () => {
    const root = fixture({
      "notes.md":
        "Until [0095](docs/adr/model/0095-x.md) this was called the Cluster " +
        "Context, and the name changed when the content became authored intent.\n",
    });
    expect(lintMeaning(root).errors).toStrictEqual([]);
  });

  it("passes CONTEXT.md itself, the glossary that names the retirement", () => {
    const root = fixture({
      "CONTEXT.md":
        "**Cluster Context.** Retired, bare, no quotation at all.\n",
    });
    expect(lintMeaning(root).errors).toStrictEqual([]);
  });
});

describe("stale count", () => {
  it("fails a claim that no longer matches the collection it counts", () => {
    const root = fixture({
      "spec/v1/examples/RENDER-GAPS.md":
        "Rendered against the sixteen registered adapters.\n",
    });
    expect(lintMeaning(root).errors).toContain(
      "spec/v1/examples/RENDER-GAPS.md: states sixteen for the adapters ADR 0052 " +
        "names as v1's registered set, which holds 2",
    );
  });

  it("passes a claim that matches the collection", () => {
    const root = fixture({
      "spec/v1/examples/RENDER-GAPS.md":
        "Rendered against the two registered adapters.\n",
    });
    expect(lintMeaning(root).errors).toStrictEqual([]);
  });

  it("fails a Gates table count gone stale", () => {
    const root = fixture({
      "docs/architecture.md":
        "# Architecture\n\n## Gates\n\nThree gates hold the structure.\n\n" +
        "| gate | command | catches |\n|---|---|---|\n" +
        "| lint | `npm run lint` | drift |\n| test | `npm run test` | breakage |\n\n" +
        "## Tooling\n\nNothing here.\n",
    });
    expect(lintMeaning(root).errors).toContain(
      "docs/architecture.md: states Three for the rows of the Gates table in " +
        "docs/architecture.md, which holds 2",
    );
  });
});

describe("lintMeaning", () => {
  it("passes a clean, minimal tree, so it is not simply forbidding everything", () => {
    expect(lintMeaning(fixture({ "README.md": "# Fine\n" }))).toStrictEqual({
      files: 3,
      errors: [],
    });
  });

  it("ignores docs/mde and CHANGELOG.md, the same exclusions the em-dash ban uses", () => {
    const root = fixture({
      "docs/mde/paper.md": "Service Intent, verbatim coursework text.\n",
      "CHANGELOG.md": "* mentions Service Intent, release-please owns this\n",
    });
    expect(lintMeaning(root).errors).toStrictEqual([]);
  });
});

describe("the command", () => {
  it("says how many files were clean, and exits 0", () => {
    const output = collect();
    expect(main([fixture({})], output)).toBe(0);
    expect(output.text()).toMatch(/^meaning lint: \d+ files clean\n$/);
  });

  it("lists every violation under a count, and exits 1", () => {
    const output = collect();
    const root = fixture({
      "spec/v1/examples/RENDER-GAPS.md":
        "Rendered against the sixteen registered adapters.\n",
    });
    expect(main([root], output)).toBe(1);
    expect(output.text()).toContain("meaning lint: 1 error(s)");
    expect(output.text()).toContain("states sixteen for the adapters");
  });

  it("checks this repository when no tree is named", () => {
    expect(main([], collect())).toBe(0);
  });
});

describe("sentencesOf", () => {
  it("keeps a table row atomic, unsplit by a period-free cell boundary", () => {
    expect(sentencesOf("| a | b |\n| c | d |")).toStrictEqual([
      "| a | b |",
      "| c | d |",
    ]);
  });

  it("does not split a sentence on a period inside a link's path", () => {
    expect(sentencesOf("See [it](model/0001-x.md). Then this.")).toStrictEqual([
      "See [it](model/0001-x.md).",
      "Then this.",
    ]);
  });
});

describe("parseCount", () => {
  it("reads a numeral and a number word alike", () => {
    expect(parseCount("6")).toBe(6);
    expect(parseCount("six")).toBe(6);
    expect(parseCount("Sixteen")).toBe(16);
  });

  it("returns null for anything else", () => {
    expect(parseCount("several")).toBeNull();
  });
});

describe("supersededAdrs", () => {
  it("reads the superseded-by field across every domain", () => {
    expect(
      supersededAdrs({
        "docs/adr/model/0001-x.md": adr("X", "0002"),
        "docs/adr/model/0002-y.md": adr("Y"),
      }),
    ).toStrictEqual([
      { rel: "docs/adr/model/0001-x.md", number: "0001", supersededBy: "0002" },
    ]);
  });

  it("skips an ADR-shaped file with no frontmatter block, rather than throwing", () => {
    expect(
      supersededAdrs({
        "docs/adr/model/0001-x.md": "# No frontmatter at all\n",
      }),
    ).toStrictEqual([]);
  });
});

describe("the stale-count sources, reshaped", () => {
  it("counts zero gates rather than throwing when the Gates heading is gone", () => {
    const root = fixture({
      "docs/architecture.md": "# Architecture\n\nNo Gates section here.\n",
    });
    expect(staleCountErrors(root)).toStrictEqual([]);
  });

  it("counts zero adapters rather than throwing when 0052 carries no enumeration", () => {
    const root = fixture({
      "docs/adr/model/0052-registered-adapters-are-v1.md":
        "---\ntier: decision\nstatus: proposed\nclaim: settled\ndate: 2026-08-31\n" +
        'normative: spec/v1/30-deliverables.md#adapters\nrests-on: ["0003"]\n---\n\n' +
        "# The registered adapters are v1\n\nNo enumeration in this shape.\n",
      "spec/v1/examples/RENDER-GAPS.md":
        "Rendered against the six registered adapters.\n",
    });
    expect(staleCountErrors(root)).toContain(
      "spec/v1/examples/RENDER-GAPS.md: states six for the adapters ADR 0052 " +
        "names as v1's registered set, which holds 0",
    );
  });

  it("skips a claim entirely when its own source file does not exist", () => {
    const root = mkdtempSync(join(temporary(), "meaning-lint-bare-"));
    write(root, { "README.md": "# No count sources at all\n" });
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    expect(staleCountErrors(root)).toStrictEqual([]);
  });
});

describe("pure helpers stay pure over a synthetic tree", () => {
  it("supersededCitationErrors takes a {rel: content} map with no filesystem", () => {
    const files = {
      "docs/adr/model/0001-x.md": adr("X", "0002"),
      "docs/adr/model/0002-y.md": adr("Y"),
      "a.md": "cites [0001](docs/adr/model/0001-x.md) alone.\n",
    };
    expect(supersededCitationErrors(files)).toStrictEqual([
      "a.md: cites superseded 0001 without its successor 0002 in the same sentence",
    ]);
  });

  it("retiredTermErrors and staleCountErrors are exercised above via lintMeaning", () => {
    expect(
      retiredTermErrors({ "a.md": "Fine, no retired term here.\n" }),
    ).toStrictEqual([]);
    expect(staleCountErrors(fixture({}))).toStrictEqual([]);
  });
});
