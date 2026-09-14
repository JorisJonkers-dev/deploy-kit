// The harness proves its own guards fire. A guard that has only ever run
// against well-behaved tests is untested: nothing shows it would catch one.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

describe("the network guard", () => {
  it("fails a test that reaches the network, and names it", () => {
    expect(() => fetch("https://example.invalid/")).toThrow(
      '"fails a test that reaches the network, and names it" tried to reach https://example.invalid/',
    );
  });
});

describe("the temporary directory", () => {
  let previous: string | undefined;

  it("is one directory for the whole of a test", () => {
    previous = temporary();
    writeFileSync(join(previous, "left-behind"), "");
    expect(temporary()).toBe(previous);
  });

  it("is a fresh one for the next test, and the last one is gone", () => {
    expect(previous).toBeDefined();
    expect(temporary()).not.toBe(previous);
    expect(existsSync(previous ?? "")).toBe(false);
  });
});

describe("the lint rules for test files", { timeout: 120_000 }, () => {
  // The probe is linted from memory at a path under test/, so every rule for
  // test files applies to it. It is not on disk, so the project service would
  // refuse it; admitting that one path to the default project is the only
  // thing this changes about the repository's own config.
  const PROBE = "test/probe.test.ts";
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
  const HEADER = 'import { expect, it } from "vitest";\n';

  async function rulesFiredOn(source: string): Promise<(string | null)[]> {
    const [result] = await eslint.lintText(source, {
      filePath: join(REPOSITORY, PROBE),
    });
    return (result?.messages ?? []).map((message) => message.ruleId);
  }

  it("reject a committed .only", async () => {
    const source = `${HEADER}it.only("x", () => {\n  expect(1).toBe(1);\n});\n`;
    expect(await rulesFiredOn(source)).toContain("vitest/no-focused-tests");
  });

  it("reject a committed .skip", async () => {
    const source = `${HEADER}it.skip("x", () => {\n  expect(1).toBe(1);\n});\n`;
    expect(await rulesFiredOn(source)).toContain("vitest/no-disabled-tests");
  });

  it("reject a fixed sleep", async () => {
    const source =
      `${HEADER}it("x", async () => {\n` +
      "  await new Promise((resolve) => setTimeout(resolve, 10));\n" +
      "  expect(1).toBe(1);\n});\n";
    expect(await rulesFiredOn(source)).toContain("no-restricted-globals");
  });

  it("reject a sleep imported from the timers module", async () => {
    const source =
      'import { setTimeout as sleep } from "node:timers/promises";\n' +
      `${HEADER}it("x", async () => {\n  await sleep(10);\n  expect(1).toBe(1);\n});\n`;
    expect(await rulesFiredOn(source)).toContain("no-restricted-imports");
  });

  it("reject a test that asserts nothing", async () => {
    const source = `${HEADER}it("x", () => {\n  JSON.parse("1");\n});\n`;
    expect(await rulesFiredOn(source)).toContain("vitest/expect-expect");
  });

  it("accept a test that asserts, so they are not simply forbidding everything", async () => {
    const source = `${HEADER}it("x", () => {\n  expect(1 + 1).toBe(2);\n});\n`;
    expect(await rulesFiredOn(source)).toStrictEqual([]);
  });
});

describe("coverage ignore comments", () => {
  const HINT = /\/\*\s*(?:v8|c8|istanbul)\s+ignore\b/;
  const sources = ["scripts", "src", "test"]
    .filter((dir) => existsSync(join(REPOSITORY, dir)))
    .flatMap((dir) =>
      readdirSync(join(REPOSITORY, dir), {
        recursive: true,
        encoding: "utf8",
      }).map((file) => join(dir, file)),
    )
    .filter((file) => file.endsWith(".ts"));

  it("have sources to look at, so the count is not taken over nothing", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it("number zero: coverage is a ratchet, and an ignore is slack nobody decided", () => {
    const offenders = sources.filter((file) =>
      HINT.test(readFileSync(join(REPOSITORY, file), "utf8")),
    );
    expect(offenders).toStrictEqual([]);
  });
});
