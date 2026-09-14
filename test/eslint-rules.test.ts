// The lint rules that apply to every file, executed.
//
// test/harness.test.ts proves the rules this repository adds for test files.
// These are the other half: the four rules eslint.config.js names for every
// TypeScript file, and the two presets it turns on, which between them carry
// far more rules than anyone will ever name by hand. A rule that has only
// ever run over clean code is untested: nothing proves it would fail.
//
// Each of these is a row in docs/architecture-rules.md, and
// scripts/lint-rules.ts checks that this file still mentions the rule id each
// row cites, so deleting a case below fails the rule ledger rather than
// quietly leaving a row unproven.
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const REPOSITORY = join(import.meta.dirname, "..");

describe("the lint rules for every file", { timeout: 120_000 }, () => {
  // Linted from memory at a path under scripts/, so the project-wide rules
  // apply and the test-file overrides do not. It is not on disk, so the
  // project service would refuse it; admitting that one path to the default
  // project is the only thing this changes about the repository's own config.
  const PROBE = "scripts/probe.ts";
  const eslint = new ESLint({
    cwd: REPOSITORY,
    overrideConfig: {
      languageOptions: {
        parserOptions: {
          projectService: { allowDefaultProject: ["*.js", "*.cjs", PROBE] },
          tsconfigRootDir: REPOSITORY,
        },
      },
    },
  });

  async function rulesFiredOn(source: string): Promise<(string | null)[]> {
    const [result] = await eslint.lintText(source, {
      filePath: join(REPOSITORY, PROBE),
    });
    return (result?.messages ?? []).map((message) => message.ruleId);
  }

  it("reject a suppression that silences a whole file", async () => {
    const source = "// @ts-nocheck\nexport const v = 1;\n";
    expect(await rulesFiredOn(source)).toContain(
      "@typescript-eslint/ban-ts-comment",
    );
  });

  it("reject an explicit any", async () => {
    const source = "export const v = (x: any): number => Number(x);\n";
    expect(await rulesFiredOn(source)).toContain(
      "@typescript-eslint/no-explicit-any",
    );
  });

  it("reject an unused binding that does not say so with an underscore", async () => {
    const source = "const unused = 1;\nexport const v = 2;\n";
    expect(await rulesFiredOn(source)).toContain(
      "@typescript-eslint/no-unused-vars",
    );
  });

  it("reject an object interpolated into a template literal", async () => {
    const source =
      "const o = { a: 1 };\nexport const v = `value: ${JSON.parse('{}') as object}` + String(o);\n";
    expect(await rulesFiredOn(source)).toContain(
      "@typescript-eslint/restrict-template-expressions",
    );
  });

  it("reject a floating promise, which no rule here names and the preset carries", async () => {
    const source =
      "const work = async (): Promise<number> => 1;\n" +
      "export const v = (): void => {\n  work();\n};\n";
    expect(await rulesFiredOn(source)).toContain(
      "@typescript-eslint/no-floating-promises",
    );
  });

  it("reject an empty catch, which the recommended preset carries", async () => {
    const source =
      "export const v = (): void => {\n" +
      "  try {\n    JSON.parse('1');\n  } catch {}\n};\n";
    expect(await rulesFiredOn(source)).toContain("no-empty");
  });

  it("accept a file that breaks none of them, so they are not simply forbidding everything", async () => {
    const source = "export const v = (n: number): string => `value: ${n}`;\n";
    expect(await rulesFiredOn(source)).toStrictEqual([]);
  });
});
