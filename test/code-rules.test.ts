// RULE-019, RULE-023, RULE-024, RULE-033 and RULE-042: the rules one file
// shows on its own, each proved on a probe that breaks it and shown silent on
// one that keeps it. They are this repository's own ESLint rules, in
// scripts/lib/eslint-rules.ts, because no configured rule reads what they read.
import { join } from "node:path";
import { Linter } from "eslint";
import { plugin } from "../scripts/lib/eslint-rules.ts";
import { describe, expect, it } from "vitest";
import { repositoryEslint } from "./support/eslint.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const PROBES = [
  "src/domain/probe.ts",
  "src/domain/ProbeModule.ts",
  "src/domain/probe_module.ts",
  "src/domain/probe-module.test.ts",
  "scripts/probe.ts",
  "test/probe.test.ts",
  "test/support/probe.ts",
];

const eslint = repositoryEslint(PROBES);

/** The messages of the repository's own rules on `source` linted as `path`. */
async function fired(path: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, {
    filePath: join(REPOSITORY, path),
  });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId?.startsWith("deploy-kit/") ?? false)
    .map((message) => `${message.ruleId ?? ""}: ${message.message}`);
}

describe("the rules one file shows on its own", { timeout: 120_000 }, () => {
  it("RULE-019 refuses a computed dynamic import and allows a literal one", async () => {
    expect(
      await fired(
        "src/domain/probe.ts",
        "export const load = (name: string): Promise<unknown> => import(name);\n",
      ),
    ).toStrictEqual([
      "deploy-kit/no-computed-dynamic-import: RULE-019: a dynamic import names its module literally, so the graph can read the edge",
    ]);
    expect(
      await fired(
        "src/domain/probe.ts",
        'export const load = (): Promise<unknown> => import("./other.ts");\nexport const also = (): Promise<unknown> => import(`./other.ts`);\n',
      ),
    ).toStrictEqual([]);
  });

  it("RULE-023 refuses a Node builtin without its node: prefix, however it is imported", async () => {
    const refused = [
      'import { join } from "path";\nexport const j = join;\n',
      'export { join } from "path";\n',
      'export const load = (): Promise<unknown> => import("fs/promises");\n',
    ];
    for (const source of refused)
      expect(await fired("scripts/probe.ts", source)).toStrictEqual([
        expect.stringMatching(
          /^deploy-kit\/node-builtin-prefix: RULE-023: import "node:(path|fs\/promises)", not "(path|fs\/promises)"$/,
        ),
      ]);
    expect(
      await fired(
        "scripts/probe.ts",
        'import { join } from "node:path";\nimport { z } from "zod";\nimport { v } from "./other.ts";\nexport const all = [join, z, v];\n',
      ),
    ).toStrictEqual([]);
  });

  it("RULE-024 refuses a module file not named in kebab-case", async () => {
    for (const path of [
      "src/domain/ProbeModule.ts",
      "src/domain/probe_module.ts",
    ])
      expect(await fired(path, "export const v = 1;\n")).toStrictEqual([
        expect.stringMatching(
          /^deploy-kit\/kebab-case-filename: RULE-024: (probe_module|ProbeModule)\.ts is not named in kebab-case$/,
        ),
      ]);
    for (const path of ["src/domain/probe-module.test.ts", "scripts/probe.ts"])
      expect(await fired(path, "export const v = 1;\n")).toStrictEqual([]);
  });

  it("RULE-033 refuses a test importing another test, and allows test/support", async () => {
    expect(
      await fired(
        "test/probe.test.ts",
        'import { v } from "./other.test.ts";\nexport const w = v;\n',
      ),
    ).toStrictEqual([
      "deploy-kit/no-test-imports-test: RULE-033: ./other.test.ts is a test; a shared fixture belongs in test/support/",
    ]);
    expect(
      await fired(
        "test/probe.test.ts",
        'import { v } from "./support/probe.ts";\nexport const w = v;\n',
      ),
    ).toStrictEqual([]);
  });

  it("RULE-042 refuses CommonJS in any file but the dependency-cruiser configuration", async () => {
    expect(
      await fired(
        "scripts/probe.ts",
        'const fs = require("node:fs");\nmodule.exports = { fs };\nexports.more = 1;\n',
      ),
    ).toStrictEqual([
      "deploy-kit/esm-only: RULE-042: require() is CommonJS; this package is ESM",
      "deploy-kit/esm-only: RULE-042: module.exports is CommonJS; this package is ESM",
      "deploy-kit/esm-only: RULE-042: exports is CommonJS; this package is ESM",
    ]);
    expect(
      await fired(
        ".dependency-cruiser.cjs",
        "module.exports = { forbidden: [] };\n",
      ),
    ).toStrictEqual([]);
  });
});

// ESLint loads eslint.config.js, and the rules with it, as a module of its own,
// which coverage does not attribute to the file. The same cases run here against
// the imported rules, so each rule is measured on both its outcomes.
describe("the rules, imported", () => {
  const linter = new Linter({ configType: "flat" });
  const own = (rule: string, filename: string, code: string): number =>
    linter.verify(
      code,
      [
        {
          files: ["**/*.ts"],
          plugins: { "deploy-kit": plugin },
          rules: { [`deploy-kit/${rule}`]: "error" },
        },
      ],
      filename,
    ).length;

  it.each([
    ["no-computed-dynamic-import", "probe.ts", "import(name);", 1],
    ["no-computed-dynamic-import", "probe.ts", 'import("./a.ts");', 0],
    ["node-builtin-prefix", "probe.ts", 'import "path";', 1],
    ["node-builtin-prefix", "probe.ts", 'import "node:path";', 0],
    ["node-builtin-prefix", "probe.ts", "export const v = 1;", 0],
    ["kebab-case-filename", "ProbeModule.ts", "", 1],
    ["kebab-case-filename", "probe-module.ts", "", 0],
    ["no-test-imports-test", "probe.test.ts", 'import "./a.test.ts";', 1],
    ["no-test-imports-test", "probe.test.ts", 'import "./support/a.ts";', 0],
    ["esm-only", "probe.ts", "module.exports = 1;", 1],
    ["no-computed-dynamic-import", "probe.ts", "import(`./a.ts`);", 0],
    ["esm-only", "probe.ts", 'require("./a.cjs");', 1],
    ["esm-only", "probe.ts", "exports.v = 1;", 1],
    ["esm-only", "probe.ts", "export const v = 1;", 0],
  ])("%s on %s: %s reports %i", (rule, filename, code, count) => {
    expect(own(rule, filename, code)).toBe(count);
  });
});
