// The AGENTS.md script-list contract, executed.
//
// AGENTS.md documents every npm script verbatim (issue #32), and a script
// added to package.json with no matching line in AGENTS.md is exactly the
// kind of drift that reads fine at a glance and is wrong: the fixtures below
// prove lint-agents.ts catches it, on a tree where only one thing is
// deliberately wrong.
//
// REQ-032 (docs/requirements.md): a script added to package.json cannot land
// silently; AGENTS.md is checked to name every one verbatim.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { lintAgents, main, namesScript } from "../scripts/lint-agents.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** A fixture repository: package.json with `scripts`, and AGENTS.md with `agents`. */
function repo(options: {
  scripts?: Readonly<Record<string, string>>;
  agents?: string;
  noAgentsFile?: boolean;
  noScriptsField?: boolean;
}): string {
  const root = mkdtempSync(join(temporary(), "agents-lint-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "0.0.0",
      ...(options.noScriptsField ? {} : { scripts: options.scripts ?? {} }),
    }),
  );
  if (!options.noAgentsFile)
    writeFileSync(join(root, "AGENTS.md"), options.agents ?? "# Fixture\n");
  return root;
}

describe("namesScript", () => {
  it("reads npm run <script>, word-bounded", () => {
    expect(namesScript("run `npm run verify` first", "verify")).toBe(true);
  });

  it("does not read a longer script as proof the shorter one was named", () => {
    expect(namesScript("run `npm run lint:adrs` first", "lint")).toBe(false);
  });

  it("reads a bare backtick-quoted script name", () => {
    expect(namesScript("the `verify` script runs the gates", "verify")).toBe(
      true,
    );
  });

  it("reads bare npm test as the test script, and only that script", () => {
    expect(namesScript("run `npm test` first", "test")).toBe(true);
    expect(namesScript("run `npm test` first", "typecheck")).toBe(false);
  });

  it("falls through to the backtick form for test when no bare npm test phrase appears", () => {
    expect(namesScript("the `test` script runs the suite", "test")).toBe(true);
  });

  it("finds nothing when the script is never named", () => {
    expect(namesScript("nothing to see here", "verify")).toBe(false);
  });
});

describe("lintAgents", () => {
  it("passes when AGENTS.md names every script package.json defines", () => {
    const root = repo({
      scripts: { lint: "eslint .", "lint:adrs": "node scripts/lint-adrs.ts" },
      agents: "Run `npm run lint` and `npm run lint:adrs`.\n",
    });
    const result = lintAgents(root);
    expect(result.errors).toStrictEqual([]);
    expect(result.scripts).toBe(2);
  });

  it("fails a script package.json defines that AGENTS.md never names", () => {
    const root = repo({
      scripts: { lint: "eslint .", "lint:new": "node scripts/lint-new.ts" },
      agents: "Run `npm run lint`.\n",
    });
    const { errors } = lintAgents(root);
    expect(errors).toStrictEqual([
      "AGENTS.md: package.json defines script 'lint:new', which does not appear in AGENTS.md",
    ]);
  });

  it("fails every script when AGENTS.md does not exist", () => {
    const root = repo({ scripts: { lint: "eslint ." }, noAgentsFile: true });
    const { errors } = lintAgents(root);
    expect(errors).toStrictEqual([
      "AGENTS.md: does not exist, so script 'lint' is undocumented",
    ]);
  });

  it("passes a repository with no scripts, even with no AGENTS.md", () => {
    const root = repo({ scripts: {}, noAgentsFile: true });
    expect(lintAgents(root)).toStrictEqual({ scripts: 0, errors: [] });
  });

  it("treats a package.json with no scripts field as naming none", () => {
    const root = repo({ noScriptsField: true, noAgentsFile: true });
    expect(lintAgents(root)).toStrictEqual({ scripts: 0, errors: [] });
  });

  it("passes this repository's own AGENTS.md", () => {
    const result = lintAgents(REPOSITORY);
    expect(result.errors).toStrictEqual([]);
    expect(result.scripts).toBeGreaterThan(5);
  });
});

describe("the command", () => {
  it("says how many scripts were clean, and exits 0", () => {
    const output = collect();
    const root = repo({
      scripts: { verify: "npm run test" },
      agents: "`npm run verify` runs the gates.\n",
    });
    expect(main([root], output)).toBe(0);
    expect(output.text()).toBe(
      "agents lint: 1 script(s) all named in AGENTS.md\n",
    );
  });

  it("lists every undocumented script under a count, and exits 1", () => {
    const output = collect();
    const root = repo({
      scripts: { gone: "echo gone" },
      agents: "# Fixture\n",
    });
    expect(main([root], output)).toBe(1);
    expect(output.text()).toBe(
      "agents lint: 1 error(s)\n" +
        "  - AGENTS.md: package.json defines script 'gone', which does not appear in AGENTS.md\n",
    );
  });

  it("checks this repository when no tree is named", () => {
    expect(main([], collect())).toBe(0);
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    const root = repo({
      scripts: { gone: "echo gone" },
      agents: "# Fixture\n",
    });
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "lint-agents.ts"), root],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("script 'gone'");
  });
});

describe("the entrypoint guard", () => {
  // This file is small enough that its own bottom-of-file guard, left
  // uncovered as every other gate leaves its own, would be a large enough
  // share of the file to pull the suite under the ratchet. Reloading the
  // module with `process.argv` set to its own path drives the guard for
  // real, in this process, so v8 sees the line the subprocess test above
  // proves but coverage otherwise never reaches; it also exercises the
  // `output` parameter's default value, which every other in-process call
  // in this file supplies explicitly.
  it("runs main and sets process.exitCode when Node starts this module", async () => {
    const modulePath = join(REPOSITORY, "scripts", "lint-agents.ts");
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [process.argv[0] ?? "node", modulePath];
    vi.resetModules();
    try {
      await import("../scripts/lint-agents.ts");
      expect(process.exitCode).toBe(0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
