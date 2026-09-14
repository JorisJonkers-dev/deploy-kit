// REQ-019 (docs/requirements.md): every committed oracle file is in canonical form.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedText } from "../scripts/lib/tracked.ts";
import { canonicalJson } from "../src/index.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const ORACLE =
  /^spec\/v1\/examples\/(?:.+\/)?(?:expected\/[^/]+\.json|[^/]+\.diagnostics\.json)$/;

type Files = Readonly<Record<string, string>>;

function oracles(files: Files): Files {
  return Object.fromEntries(
    Object.entries(files).filter(([rel]) => ORACLE.test(rel)),
  );
}

function oracleErrors(files: Files): string[] {
  return Object.entries(oracles(files)).flatMap(([rel, text]) => {
    let canonical: string;
    try {
      canonical = canonicalJson(JSON.parse(text));
    } catch (error) {
      return [`${rel}: ${(error as Error).message}`];
    }
    return text === canonical ? [] : [`${rel}: not in canonical form`];
  });
}

describe("oracle files", () => {
  const committed = oracles(trackedText(REPOSITORY));

  it("include minimal's parsed intent and dependency edges", () => {
    expect(Object.keys(committed)).toEqual(
      expect.arrayContaining([
        "spec/v1/examples/minimal/expected/intent.json",
        "spec/v1/examples/minimal/expected/dependencies.json",
      ]),
    );
  });

  it("are each byte-identical to their own canonical form", () => {
    expect(oracleErrors(committed)).toStrictEqual([]);
  });

  it("carry one entry per Application in a dependencies oracle, each naming its edges", () => {
    const shaped = (value: unknown): boolean => {
      const applications = (value as { applications?: unknown }).applications;
      return (
        Array.isArray(applications) &&
        applications.length > 0 &&
        applications.every((entry: unknown) => {
          const { id, edges } = entry as { id?: unknown; edges?: unknown };
          return typeof id === "string" && Array.isArray(edges);
        })
      );
    };
    const dependencies = Object.entries(committed).filter(([rel]) =>
      rel.endsWith("/dependencies.json"),
    );

    expect(dependencies.length).toBeGreaterThan(0);
    for (const [rel, text] of dependencies)
      expect(shaped(JSON.parse(text)), rel).toBe(true);
  });
});

describe("oracleErrors", () => {
  const at = "spec/v1/examples/x/expected/intent.json";

  it.each([
    ["keys out of order", '{"b":1,"a":2}'],
    ["insignificant whitespace", '{"a": 1}'],
    ["a trailing newline", '{"a":1}\n'],
    ["a number not in shortest form", '{"a":1.50}'],
  ])("refuses %s", (_, text) => {
    expect(oracleErrors({ [at]: text })).toStrictEqual([
      `${at}: not in canonical form`,
    ]);
  });

  it("refuses a null, naming where it sits", () => {
    expect(oracleErrors({ [at]: '{"a":[null]}' })).toStrictEqual([
      `${at}: null at /a/0: an absent optional field is absent, never null`,
    ]);
  });

  it("refuses text that is not JSON", () => {
    expect(oracleErrors({ [at]: "{" })[0]).toMatch(
      /^spec\/v1\/examples\/x\/expected\/intent\.json: /,
    );
  });

  it("holds refused-case diagnostics to the same form and ignores files that are not oracles", () => {
    const refusal = "spec/v1/examples/refusals/y.diagnostics.json";

    expect(
      oracleErrors({
        [refusal]: '[{"code":"X", "path":"/a"}]',
        "spec/v1/examples/x/notes.json": '{"b":1,"a":2}',
        "test/expected/intent.json": '{"b":1,"a":2}',
      }),
    ).toStrictEqual([`${refusal}: not in canonical form`]);
  });

  it("passes a canonical oracle", () => {
    expect(oracleErrors({ [at]: '{"a":1,"b":[true,"x"]}' })).toStrictEqual([]);
  });
});
