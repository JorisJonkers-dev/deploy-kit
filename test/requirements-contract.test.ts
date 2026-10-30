// The behaviour ledger, executed. docs/requirements/*.md state the guarantees,
// scripts/lint-requirements.ts enforces that every row still holds, and this
// is what makes that enforcement part of the test run rather than a thing
// someone remembers to run. It also starts the lint the way CI would, as a
// command, which is what proves the guard at the bottom of the script still
// runs it.
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import {
  lintRequirements,
  main,
  parseRequirements,
} from "../scripts/lint-requirements.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const AREAS = join(REPOSITORY, "docs", "requirements");

/** Every row of every committed area file. */
function committedRows(): ReturnType<typeof parseRequirements>["rows"] {
  return readdirSync(AREAS)
    .filter((name) => name.endsWith(".md"))
    .flatMap(
      (name) => parseRequirements(readFileSync(join(AREAS, name), "utf8")).rows,
    );
}

test("the requirements lint, run as a command, passes over the committed ledger", () => {
  const out = execFileSync(
    process.execPath,
    [join(REPOSITORY, "scripts", "lint-requirements.ts")],
    { encoding: "utf8" },
  );
  expect(out).toMatch(/^requirements lint: \d+ rows clean$/m);
});

test("the ledger is non-empty, and the lint reads every row its area files hold", () => {
  const rows = committedRows();
  expect(rows.length).toBeGreaterThanOrEqual(8);
  expect(lintRequirements(REPOSITORY)).toStrictEqual({
    rows: rows.length,
    errors: [],
  });
});

test("every row's id is unique and shaped REQ-NNN", () => {
  const rows = committedRows();
  const ids = rows.map((row) => row.id);
  for (const id of ids) expect(id).toMatch(/^REQ-\d{3}$/);
  expect(new Set(ids).size).toBe(ids.length);
});

test("every row names a real test file that holds at least one test", () => {
  const rows = committedRows();
  for (const row of rows) {
    const content = readFileSync(join(REPOSITORY, row.test), "utf8");
    expect(row.test, row.id).toMatch(/\.test\.ts$/);
    expect(content, row.id).toMatch(/\b(?:test|it)\s*\(/);
  }
});

describe("the command", () => {
  const VALID_TEST =
    'import { expect, it } from "vitest";\n' +
    'it("x", () => {\n  expect(1).toBe(1);\n});\n';

  function fixture(areaBody: string): string {
    const root = mkdtempSync(join(temporary(), "requirements-command-"));
    mkdirSync(join(root, "docs", "requirements"), { recursive: true });
    mkdirSync(join(root, "test"), { recursive: true });
    writeFileSync(
      join(root, "docs", "requirements.md"),
      "# Behaviour ledger\n",
    );
    writeFileSync(join(root, "docs", "requirements", "area.md"), areaBody);
    writeFileSync(join(root, "test", "a.test.ts"), VALID_TEST);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    return root;
  }

  it("says how many rows are clean, and exits 0", () => {
    const output = collect();
    const root = fixture(
      "# Area\n\n" +
        "| id | guarantee | proved by |\n|---|---|---|\n" +
        "| REQ-001 | a thing holds | [test/a.test.ts](../../test/a.test.ts) |\n",
    );
    expect(main([root], output)).toBe(0);
    expect(output.text()).toBe("requirements lint: 1 rows clean\n");
  });

  it("lists every violation under a count, and exits 1", () => {
    const output = collect();
    const root = fixture("# Area\n\nno rows here\n");
    expect(main([root], output)).toBe(1);
    expect(output.text()).toBe(
      "requirements lint: 1 error(s)\n" +
        "  - docs/requirements/area.md: holds no row\n",
    );
  });

  it("checks this repository when no tree is named", () => {
    expect(main([], collect())).toBe(0);
  });

  it("runs when Node starts the script, which is how CI would run it", () => {
    const root = fixture("# Area\n\nno rows here\n");
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "lint-requirements.ts"), root],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("docs/requirements/area.md: holds no row");
  });
});
