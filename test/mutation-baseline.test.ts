// REQ-022 (docs/requirements.md): a pull request re-tests a mutant when the
// test that killed it changed, not when another test in its file did.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  described,
  kept,
  layout,
  rebased,
  run,
} from "../scripts/mutation-baseline.ts";
import type { Report, Test } from "../scripts/lib/mutation-report.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** The tests Stryker ran from `names`, numbered in order. */
const ran = (...names: string[]): Test[] =>
  names.map((name, index) => ({ id: String(index), name }));

/** The names of the tests `kept` keeps, or the reason it gave for none. */
function survivors(
  tests: readonly Test[],
  before: string,
  after: string,
): readonly string[] | string {
  const result = kept(tests, before, after);
  return typeof result === "string" ? result : result.map(({ name }) => name);
}

const SUITE = `import { expect, it, describe } from "vitest";
import { render } from "../lib/render.ts";

const fixture = () => ({ name: "notes" });
const rendered = () => render(fixture());

describe("render", () => {
  it("names the object", () => {
    expect(rendered().name).toBe("notes");
  });

  it("holds one object", () => {
    expect([render({ name: "x" })]).toHaveLength(1);
  });
});

it("stands alone", () => {
  expect(1).toBe(1);
});
`;

const SUITE_TESTS = ran(
  "render names the object",
  "render holds one object",
  "stands alone",
);

describe("the baseline a mutation run reads", () => {
  it("keeps every test whose own code and what it names did not change, and drops the one whose body changed", () => {
    const after = SUITE.replace("toHaveLength(1)", "toHaveLength(2)");

    expect(survivors(SUITE_TESTS, SUITE, after)).toStrictEqual([
      "render names the object",
      "stands alone",
    ]);
  });

  it("reads a change of layout or comment as none", () => {
    const after = SUITE.replace(
      'it("stands alone", () => {',
      '// alone\nit(\n  "stands alone",\n  () => {',
    ).replace("expect(1).toBe(1);\n});", "expect(1).toBe(1);\n  });");

    expect(survivors(SUITE_TESTS, SUITE, after)).toStrictEqual([
      "render names the object",
      "render holds one object",
      "stands alone",
    ]);
  });

  it("keeps every test it had when a test, a describe with its own helpers, or an import are added", () => {
    const after = SUITE.replace(
      'import { render } from "../lib/render.ts";',
      'import { render, parse } from "../lib/render.ts";\nimport { read } from "../lib/read.ts";',
    ).concat(`
describe("parse", () => {
  const rendered = () => parse("x");
  it("parses", () => {
    expect(rendered()).toBeDefined();
    expect(read).toBeDefined();
  });
});
`);

    // `rendered` is bound again inside the new describe: a name is compared
    // as text, so the test naming the outer one counts as changed too.
    expect(survivors(SUITE_TESTS, SUITE, after)).toStrictEqual([
      "render holds one object",
      "stands alone",
    ]);
  });

  it("drops a test naming a declaration that changed, through every declaration that names it", () => {
    const after = SUITE.replace('name: "notes"', 'name: "other"');

    expect(survivors(SUITE_TESTS, SUITE, after)).toStrictEqual([
      "render holds one object",
      "stands alone",
    ]);
  });

  it("drops every test that names an import whose source changed, and none that does not", () => {
    const after = SUITE.replace("../lib/render.ts", "../lib/renderer.ts");

    expect(survivors(SUITE_TESTS, SUITE, after)).toStrictEqual([
      "stands alone",
    ]);
  });

  it("drops every test inside a describe whose own code changed, nested ones too, and keeps every test outside it", () => {
    const before = `describe("outer", () => {
  beforeEach(() => {});
  describe("inner", () => {
    it("deep", () => {});
  });
  it("shallow", () => {});
});
describe("other", () => {
  it("apart", () => {});
});
`;
    const tests = ran("outer inner deep", "outer shallow", "other apart");

    expect(
      survivors(tests, before, before.replace("beforeEach(() => {});", "")),
    ).toStrictEqual(["other apart"]);
    expect(
      survivors(
        tests,
        before,
        before.replace(
          'describe("inner", () => {',
          'describe("inner", { retry: 2 }, () => {',
        ),
      ),
    ).toStrictEqual(["outer shallow", "other apart"]);
  });

  it("drops every test in the file when the file's own code changed", () => {
    const before = `vi.mock("../lib/a.ts");\nit("one", () => {});\n`;

    expect(
      survivors(ran("one"), before, before.replace("a.ts", "b.ts")),
    ).toStrictEqual([]);
  });

  it("keeps every test when a declaration none of them names went away", () => {
    const before = `${SUITE}const unused = () => 1;\n`;

    expect(survivors(SUITE_TESTS, before, SUITE)).toStrictEqual([
      "render names the object",
      "render holds one object",
      "stands alone",
    ]);
  });

  it("drops a test that went away, was renamed, or moved into another describe", () => {
    const before = `describe("a", () => {\n  it("x", () => {});\n});\nit("y", () => {});\nit("z", () => {});\n`;
    const after = `describe("a", () => {\n  it("x", () => {});\n  it("z", () => {});\n});\nit("y2", () => {});\n`;

    expect(survivors(ran("a x", "y", "z"), before, after)).toStrictEqual([
      "a x",
    ]);
  });

  it("keeps a test it cannot place only while no scope in the file is dirty", () => {
    const before = `it.each([1, 2])("case %s", () => {});
for (const n of [3]) it(\`loop \${String(n)}\`, () => {});
describe("d", () => {
  afterEach(() => {});
  it("placed", () => {});
});
`;
    const tests = ran("case 1", "case 2", "loop 3", "d placed");

    expect(
      survivors(tests, before, `${before}it("added", () => {});\n`),
    ).toStrictEqual(["case 1", "case 2", "loop 3", "d placed"]);
    expect(
      survivors(tests, before, before.replace("afterEach(() => {});", "")),
    ).toStrictEqual([]);
  });

  it("drops a test it cannot place whose name a placed test now claims", () => {
    const before = `for (const n of [1]) it(\`case \${String(n)}\`, () => {});\n`;
    const after = `${before}it("case 1", () => {});\n`;

    expect(survivors(ran("case 1"), before, after)).toStrictEqual([]);
  });

  it("places neither of two tests under one name, nor a test of a describe it cannot read, and reads them as their scope's own code", () => {
    const source = `describe("dup", () => {
  it("twice", () => {});
  it("twice", () => {});
});
describe(\`computed \${"name"}\`, () => {
  it("inside", () => {});
});
describe("by reference", body);
register("plugin", () => {});
describe.skip("modified", () => {
  it.only("kept", () => {});
  test.concurrent("also", () => {});
});
`;
    const read = layout(source);

    expect([...read.tests.keys()]).toStrictEqual([
      "modified kept",
      "modified also",
    ]);
    expect(
      survivors(
        ran(
          "dup twice",
          "dup twice",
          "computed name inside",
          "modified kept",
          "modified also",
        ),
        source,
        source.replace(
          'it("twice", () => {});\n  it("twice"',
          'it("twice", () => {});\n  it("twice!"',
        ),
      ),
    ).toStrictEqual(["modified kept", "modified also"]);
  });

  it("binds every name a declaration holds, destructured, defaulted, namespaced, or a type", () => {
    const read = layout(`import "./setup.ts";
import fallback, * as all from "./a.ts";
import other, { one as two } from "./b.ts";
import plain from "./d.ts";
import type { Shape } from "./c.ts";
const { a, b: [c, , d] } = value;
function helper() {}
class Holder {}
interface Shaped {}
type Alias = string;
enum Colour { Red }
export default 1;
`);

    expect(
      [...read.declarations.values()].flatMap(({ binds }) => binds),
    ).toStrictEqual([
      "fallback",
      "all",
      "other",
      "two",
      "plain",
      "Shape",
      "a",
      "c",
      "d",
      "helper",
      "Holder",
      "Shaped",
      "Alias",
      "Colour",
    ]);
  });

  it("leaves a file whole when it places a name that is not one test Stryker ran", () => {
    expect(survivors(ran("render names the object"), SUITE, `${SUITE}\n`)).toBe(
      'it places "render holds one object", which is not one test the report holds',
    );
  });
});

describe("the rebased report", () => {
  const report = (source: string): Report => ({
    schemaVersion: "2",
    files: { "src/render.ts": { source: "x", mutants: [] } },
    testFiles: {
      "test/render.test.ts": { source, tests: SUITE_TESTS },
      "test/gone.test.ts": {
        source: "it('gone', () => {});",
        tests: ran("gone"),
      },
      "test/same.test.ts": {
        source: "it('same', () => {});",
        tests: ran("same"),
      },
      "test/unread.test.ts": { tests: ran("unread") },
    },
  });
  const current: Readonly<Record<string, string>> = {
    "test/render.test.ts": SUITE.replace("toHaveLength(1)", "toHaveLength(2)"),
    "test/same.test.ts": "it('same', () => {});",
    "test/unread.test.ts": "it('unread', () => {});",
  };

  it("takes each changed file's current source and keeps only its unchanged tests, leaving every other field and file as it was", () => {
    const { report: rewritten, outcomes } = rebased(
      report(SUITE),
      (path) => current[path],
    );

    expect(rewritten.files).toStrictEqual(report(SUITE).files);
    expect(rewritten.testFiles?.["test/render.test.ts"]).toStrictEqual({
      source: current["test/render.test.ts"],
      tests: [SUITE_TESTS[0], SUITE_TESTS[2]],
    });
    for (const unchanged of [
      "test/gone.test.ts",
      "test/same.test.ts",
      "test/unread.test.ts",
    ])
      expect(rewritten.testFiles?.[unchanged]).toStrictEqual(
        report(SUITE).testFiles?.[unchanged],
      );
    expect(outcomes.map(described)).toStrictEqual([
      "test/render.test.ts: 2 test(s) kept, 1 changed",
    ]);
  });

  it("leaves a file it cannot read whole, and says why", () => {
    const held = SUITE_TESTS.slice(0, 2);
    const { report: rewritten, outcomes } = rebased(
      {
        files: {},
        testFiles: { "test/render.test.ts": { source: SUITE, tests: held } },
      },
      (path) => current[path],
    );

    expect(rewritten.testFiles?.["test/render.test.ts"]).toStrictEqual({
      source: SUITE,
      tests: held,
    });
    expect(outcomes.map(described)).toStrictEqual([
      'test/render.test.ts: every test changed, since it places "stands alone", which is not one test the report holds',
    ]);
  });

  it("reads a report with no test files as one with nothing to rebase", () => {
    expect(rebased({ files: {} }, () => undefined)).toStrictEqual({
      report: { files: {}, testFiles: {} },
      outcomes: [],
    });
  });
});

describe("the command", () => {
  it("rewrites the report in place and names each changed file, reading the tree it is given", () => {
    const root = mkdtempSync(join(tmpdir(), "mutation-baseline-"));
    mkdirSync(join(root, "test"));
    writeFileSync(
      join(root, "test", "render.test.ts"),
      SUITE.replace("toHaveLength(1)", "toHaveLength(2)"),
    );
    const path = join(root, "report.json");
    writeFileSync(
      path,
      JSON.stringify({
        files: {},
        testFiles: {
          "test/render.test.ts": { source: SUITE, tests: SUITE_TESTS },
          "test/gone.test.ts": { source: "", tests: [] },
        },
      }),
    );

    expect(run([path], root)).toStrictEqual({
      code: 0,
      stdout: "test/render.test.ts: 2 test(s) kept, 1 changed\n",
      stderr: "",
    });
    const written = JSON.parse(readFileSync(path, "utf8")) as Report;
    expect(
      written.testFiles?.["test/render.test.ts"]?.tests.map(({ name }) => name),
    ).toStrictEqual(["render names the object", "stands alone"]);
  });

  it("passes over a report that does not exist, and refuses a call that names none", () => {
    expect(run(["/nowhere/report.json"], REPOSITORY)).toStrictEqual({
      code: 0,
      stdout: "No report at /nowhere/report.json: nothing to rebase.\n",
      stderr: "",
    });
    for (const argv of [[], ["a", "b"]])
      expect(run(argv, REPOSITORY)).toStrictEqual({
        code: 2,
        stdout: "",
        stderr: "usage: node scripts/mutation-baseline.ts <report>\n",
      });
  });

  it("passes over only a file that is not there, and throws what else stops a read", () => {
    const root = mkdtempSync(join(tmpdir(), "mutation-baseline-"));
    mkdirSync(join(root, "test", "render.test.ts"), { recursive: true });
    const path = join(root, "report.json");
    writeFileSync(
      path,
      JSON.stringify({
        files: {},
        testFiles: { "test/render.test.ts": { source: SUITE, tests: [] } },
      }),
    );

    expect(() => run([root], root)).toThrow(/EISDIR/);
    expect(() => run([path], root)).toThrow(/EISDIR/);
  });

  it("runs when Node starts this module", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [
      process.argv[0] ?? "node",
      join(REPOSITORY, "scripts", "mutation-baseline.ts"),
    ];
    vi.resetModules();
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await import("../scripts/mutation-baseline.ts");
      expect(process.exitCode).toBe(2);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
