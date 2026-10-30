// Negative fixtures for the behaviour ledger.
//
// A lint that has only ever run against a clean ledger is untested: nothing
// proves it would fail. Each case builds a throwaway tree that violates
// exactly one rule and asserts the lint reports it, naming the file and the
// row.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  citationErrors,
  lintRequirements,
  parseRequirements,
} from "../scripts/lint-requirements.ts";
import { temporary } from "./setup.ts";

type Files = Readonly<Record<string, string>>;

function write(root: string, files: Files): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

/** A test file that satisfies "exists, is a test file, holds a test". */
const VALID_TEST =
  'import { expect, it } from "vitest";\n' +
  'it("x", () => {\n  expect(1).toBe(1);\n});\n';

/**
 * A git repository whose front page, area files and test files are `files`,
 * over a default front page and a valid test/a.test.ts so a case can name
 * them without redeclaring them.
 */
function fixture(files: Files): string {
  const root = mkdtempSync(join(temporary(), "requirements-lint-"));
  write(root, {
    "docs/requirements.md": "# Behaviour ledger\n",
    "test/a.test.ts": VALID_TEST,
    ...files,
  });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

/** An area file holding `rows`, under its heading and table head. */
const area = (...rows: readonly string[]): string =>
  "# Area\n\n| id | guarantee | proved by |\n|---|---|---|\n" +
  rows.map((row) => `${row}\n`).join("");

const ROW_A =
  "| REQ-001 | a thing holds | [test/a.test.ts](../../test/a.test.ts) |";

// Built from two halves, so this file's own source does not carry the
// citation it tests for: an id no row of the real ledger carries, which the
// real ledger's own contract test would otherwise catch once this file is
// tracked.
const BOGUS_ID = ["REQ", "999"].join("-");

describe("lintRequirements", () => {
  it("passes a clean, minimal ledger, so it is not simply forbidding everything", () => {
    const root = fixture({ "docs/requirements/area.md": area(ROW_A) });
    expect(lintRequirements(root)).toStrictEqual({ rows: 1, errors: [] });
  });

  it("counts the rows of every area file together", () => {
    const root = fixture({
      "docs/requirements/a.md": area(ROW_A),
      "docs/requirements/b.md": area(
        "| REQ-002 | another holds | [test/a.test.ts](../../test/a.test.ts) |",
      ),
    });
    expect(lintRequirements(root)).toStrictEqual({ rows: 2, errors: [] });
  });

  it("fails, naming the file, when the front page itself is missing", () => {
    const root = mkdtempSync(join(temporary(), "requirements-lint-"));
    write(root, { "docs/requirements/area.md": area(ROW_A) });
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements.md: front page missing",
    ]);
  });

  it("fails when no area file exists", () => {
    const root = fixture({});
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements/: holds no area file",
    ]);
  });

  it("reads only Markdown files as area files", () => {
    const root = fixture({ "docs/requirements/notes.txt": "# Notes\n" });
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements/: holds no area file",
    ]);
  });

  it("fails a row on the front page, which holds none", () => {
    const root = fixture({
      "docs/requirements.md": `# Behaviour ledger\n\n${ROW_A}\n`,
      "docs/requirements/area.md": area(ROW_A),
    });
    expect(lintRequirements(root).errors).toStrictEqual([
      `docs/requirements.md: holds a row, which belongs in an area file under docs/requirements/: ${ROW_A}`,
    ]);
  });

  it("fails an area file that holds no row", () => {
    const root = fixture({
      "docs/requirements/area.md": area(ROW_A),
      "docs/requirements/empty.md": area(),
    });
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements/empty.md: holds no row",
    ]);
  });

  it("fails a row that does not parse as a markdown-linked row", () => {
    const root = fixture({
      "docs/requirements/area.md": area(
        "| REQ-001 | a thing holds | test/a.test.ts |",
      ),
    });
    expect(lintRequirements(root).errors).toContain(
      "docs/requirements/area.md: malformed row: | REQ-001 | a thing holds | test/a.test.ts |",
    );
  });

  it("fails a row whose link text does not match its own target", () => {
    const root = fixture({
      "docs/requirements/area.md": area(
        "| REQ-001 | a thing holds | [test/wrong.test.ts](../../test/a.test.ts) |",
      ),
    });
    expect(lintRequirements(root).errors).toContain(
      "docs/requirements/area.md: REQ-001: link text 'test/wrong.test.ts' does not match its target '../../test/a.test.ts'",
    );
  });

  it("fails a row whose target is relative to docs/ rather than to its area file", () => {
    const root = fixture({
      "docs/requirements/area.md": area(
        "| REQ-001 | a thing holds | [test/a.test.ts](../test/a.test.ts) |",
      ),
    });
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements/area.md: REQ-001: link text 'test/a.test.ts' does not match its target '../test/a.test.ts'",
    ]);
  });

  it("fails, naming the file and the row, when the test file it names does not exist", () => {
    const root = fixture({
      "docs/requirements/area.md": area(
        "| REQ-001 | a thing holds | [test/gone.test.ts](../../test/gone.test.ts) |",
      ),
    });
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements/area.md: REQ-001: names 'test/gone.test.ts', which does not exist",
    ]);
  });

  it("fails, naming the file and the row, when the test file it names holds no test", () => {
    const root = fixture({
      "docs/requirements/area.md": area(
        "| REQ-001 | a thing holds | [test/empty.test.ts](../../test/empty.test.ts) |",
      ),
      "test/empty.test.ts": "",
    });
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements/area.md: REQ-001: 'test/empty.test.ts' holds no test",
    ]);
  });

  it("fails, naming the file and the row, when the file it names is not a test file", () => {
    const root = fixture({
      "docs/requirements/area.md": area(
        "| REQ-001 | a thing holds | [test/notes.txt](../../test/notes.txt) |",
      ),
      "test/notes.txt": "it( is not a test call in a text file\n",
    });
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements/area.md: REQ-001: 'test/notes.txt' is not a test file",
    ]);
  });

  it("fails two rows of one file sharing one id, naming both sentences", () => {
    const root = fixture({
      "docs/requirements/area.md": area(
        "| REQ-001 | first thing | [test/a.test.ts](../../test/a.test.ts) |",
        "| REQ-001 | second thing | [test/a.test.ts](../../test/a.test.ts) |",
      ),
    });
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements/area.md: REQ-001: id used twice, also in docs/requirements/area.md for 'first thing'",
    ]);
  });

  it("fails two area files sharing one id, naming both files", () => {
    const root = fixture({
      "docs/requirements/a.md": area(
        "| REQ-001 | first thing | [test/a.test.ts](../../test/a.test.ts) |",
      ),
      "docs/requirements/b.md": area(
        "| REQ-001 | second thing | [test/a.test.ts](../../test/a.test.ts) |",
      ),
    });
    expect(lintRequirements(root).errors).toStrictEqual([
      "docs/requirements/b.md: REQ-001: id used twice, also in docs/requirements/a.md for 'first thing'",
    ]);
  });

  it("fails when an id no row carries is cited elsewhere in the tree", () => {
    const root = fixture({
      "docs/requirements/area.md": area(ROW_A),
      "src/note.ts": `// see ${BOGUS_ID} for context\n`,
    });
    expect(lintRequirements(root).errors).toStrictEqual([
      `src/note.ts cites ${BOGUS_ID}, which no row carries`,
    ]);
  });

  it("ignores an untracked file's citation, the same way the em-dash ban ignores scratch files", () => {
    const root = fixture({ "docs/requirements/area.md": area(ROW_A) });
    writeFileSync(join(root, "scratch.md"), `${BOGUS_ID}, never staged\n`);
    expect(lintRequirements(root).errors).toStrictEqual([]);
  });
});

describe("parseRequirements", () => {
  it("returns one row per well-formed line, in document order", () => {
    const { rows, errors } = parseRequirements(
      "| REQ-002 | second | [test/b.test.ts](../../test/b.test.ts) |\n" +
        "| REQ-001 | first | [test/a.test.ts](../../test/a.test.ts) |",
    );
    expect(errors).toStrictEqual([]);
    expect(rows.map((row) => row.id)).toStrictEqual(["REQ-002", "REQ-001"]);
  });

  it("ignores prose that merely contains a pipe", () => {
    const { rows, errors } = parseRequirements(
      "Some table | with a pipe | but no REQ id\n",
    );
    expect(rows).toStrictEqual([]);
    expect(errors).toStrictEqual([]);
  });
});

describe("citationErrors", () => {
  it("reports each offending id once per file, not once per occurrence", () => {
    expect(
      citationErrors(
        {
          "a.ts": `${BOGUS_ID} and again ${BOGUS_ID}`,
          "b.ts": "REQ-001 is fine",
        },
        new Set(["REQ-001"]),
      ),
    ).toStrictEqual([`a.ts cites ${BOGUS_ID}, which no row carries`]);
  });

  it("walks files in path order regardless of the order they were given in", () => {
    expect(
      citationErrors(
        {
          "z.ts": BOGUS_ID,
          "a.ts": BOGUS_ID,
        },
        new Set(),
      ),
    ).toStrictEqual([
      `a.ts cites ${BOGUS_ID}, which no row carries`,
      `z.ts cites ${BOGUS_ID}, which no row carries`,
    ]);
  });
});
