// REQ-022 (docs/requirements.md): the mutation gate over src/.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY = join(import.meta.dirname, "..");

interface StrykerConfig {
  readonly mutate: readonly string[];
  readonly reporters: readonly string[];
  readonly thresholds: { readonly break: number };
  readonly vitest: { readonly configFile: string };
  readonly ignorePatterns: readonly string[];
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

  // docs/adr/architecture/0120: scripts/ does not join the scope yet because
  // two of its own gates cannot be exercised inside Stryker's sandbox (a
  // git-index read, and a subprocess-only smoke test). A change that widens
  // `mutate` should widen this assertion in the same pull request as 0120's
  // successor.
  it("does not mutate scripts/ until its own gates are sandbox-safe", () => {
    expect(config.mutate).toStrictEqual([
      "src/**/*.ts",
      "!src/cli/boundary.ts",
    ]);
  });

  // The report is uploaded as a CI artifact so a survivor or a timeout is
  // inspectable without reproducing the run locally, and html is what a
  // person reads; json and clear-text are what the other two checks read.
  it("reports in html as well as json and clear-text", () => {
    expect(config.reporters).toStrictEqual([
      "clear-text",
      "progress",
      "json",
      "html",
    ]);
  });

  it("uploads the html report as a CI artifact, even when the mutation step fails", () => {
    const workflow = readFileSync(
      join(REPOSITORY, ".github", "workflows", "ci.yml"),
      "utf8",
    );
    const mutationJob =
      workflow.split("'mutation':\n")[1]?.split("\n\n")[0] ?? "";

    expect(mutationJob).toContain("actions/upload-artifact@");
    expect(mutationJob).toContain("'if': 'always()'");
    expect(mutationJob).toContain("'path': 'reports/mutation'");
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

  it("ignores .claude and .agents, so the sandbox copy never touches the .claude/skills symlink", () => {
    // Stryker's sandbox copy once died here: "EISDIR: illegal operation on a
    // directory, copyfile '.../.claude/skills' -> '.../.stryker-tmp/.../.claude/skills'",
    // because copyfile refuses a symlink that points at a directory.
    expect(config.ignorePatterns).toContain("/.claude");
    expect(config.ignorePatterns).toContain("/.agents");
  });
});
