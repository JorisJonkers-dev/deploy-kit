// REQ-022 (docs/requirements.md): the mutation gate over src/.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY = join(import.meta.dirname, "..");

interface StrykerConfig {
  readonly mutate: readonly string[];
  readonly thresholds: { readonly break: number };
  readonly vitest: { readonly configFile: string };
}

const config = JSON.parse(
  readFileSync(join(REPOSITORY, "stryker.config.json"), "utf8"),
) as StrykerConfig;

// A suite that imports from src/ but cannot run in Stryker's sandbox, which
// holds no git index, with the suite that kills its mutants instead.
const OUTSIDE_THE_SANDBOX: Readonly<Record<string, string>> = {
  "test/oracles.test.ts":
    "lists oracle files from the git index; test/canonical-json.test.ts covers the writer",
};

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith(".test.ts") ? [relative(REPOSITORY, path)] : [];
  });
}

describe("the mutation gate", () => {
  it('mutates every module under src/ and breaks below the measured score, "break": 100', () => {
    const text = readFileSync(join(REPOSITORY, "stryker.config.json"), "utf8");

    expect(text).toContain('"break": 100');
    expect(config.thresholds.break).toBe(100);
    expect(config.mutate).toContain("src/**/*.ts");
  });

  it("runs every test file that imports from src/", () => {
    const runner = readFileSync(
      join(REPOSITORY, config.vitest.configFile),
      "utf8",
    );
    const importing = testFiles(join(REPOSITORY, "test")).filter(
      (file) =>
        !(file in OUTSIDE_THE_SANDBOX) &&
        /from "(\.\.\/)+src\//.test(
          readFileSync(join(REPOSITORY, file), "utf8"),
        ),
    );

    expect(importing.length).toBeGreaterThan(0);
    for (const file of importing)
      expect(
        runner.includes(`"${file}"`) ||
          (file.startsWith("test/model/") &&
            runner.includes('"test/model/**/*.test.ts"')),
        file,
      ).toBe(true);
  });
});
