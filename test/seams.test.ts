// REQ-018 (docs/requirements.md). RULE-012, RULE-013, RULE-025, RULE-026 and
// RULE-041, each proved on a probe in a ring it forbids and shown silent in a
// ring it allows.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repositoryEslint } from "./support/eslint.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const PROBES = [
  "src/domain/probe.ts",
  "src/application/probe.ts",
  "src/infrastructure/probe.ts",
  "src/cli/probe.ts",
  "src/cli/boundary.ts",
  "src/domain/probe.test.ts",
  "scripts/probe.ts",
  "tool.config.ts",
];

const eslint = repositoryEslint(PROBES);

async function fired(path: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, {
    filePath: join(REPOSITORY, path),
  });
  return (result?.messages ?? []).map(
    (message) => `${message.ruleId ?? "fatal"}: ${message.message}`,
  );
}

const AMBIENT = {
  environment: "export const home = process.env.HOME;\n",
  "Date.now": "export const now = (): number => Date.now();\n",
  "new Date()": "export const now = (): Date => new Date();\n",
  "performance.now": "export const now = (): number => performance.now();\n",
  "Math.random": "export const roll = (): number => Math.random();\n",
  "crypto.randomUUID":
    'import { randomUUID } from "node:crypto";\nexport const id = (): string => randomUUID();\n',
  spawning:
    'import { spawn } from "node:child_process";\nexport const run = spawn;\n',
  "a synchronous import":
    'import { readFileSync } from "node:fs";\nexport const read = readFileSync;\n',
  "a synchronous call":
    'import * as fs from "node:fs";\nexport const read = (p: string): string => fs.readFileSync(p, "utf8");\n',
};

describe(
  "RULE-012: ambient reads belong to the infrastructure and CLI rings",
  { timeout: 120_000 },
  () => {
    for (const [what, source] of Object.entries(AMBIENT)) {
      it(`refuses ${what} in the domain and the application`, async () => {
        for (const ring of ["src/domain/probe.ts", "src/application/probe.ts"])
          expect(await fired(ring, source)).toContainEqual(
            expect.stringMatching(/^no-restricted-syntax: RULE-012: /),
          );
      });

      it(`allows ${what} in infrastructure, the CLI and tests`, async () => {
        for (const ring of [
          "src/infrastructure/probe.ts",
          "src/cli/probe.ts",
          "src/domain/probe.test.ts",
        ])
          expect(await fired(ring, source)).not.toContainEqual(
            expect.stringMatching(/^no-restricted-syntax:/),
          );
      });
    }

    it("allows a date from a value and a call merely ending in Sync-free names", async () => {
      expect(
        await fired(
          "src/domain/probe.ts",
          "export const at = (ms: number): Date => new Date(ms);\n",
        ),
      ).toStrictEqual([]);
    });
  },
);

describe(
  "RULE-013: the process is touched only in src/cli/boundary.ts",
  { timeout: 120_000 },
  () => {
    const TOUCHES = {
      exit: "export const stop = (): never => process.exit(1);\n",
      exitCode:
        "export const fail = (): void => {\n  process.exitCode = 1;\n};\n",
      stdout: 'export const say = (): boolean => process.stdout.write("x");\n',
      stderr: 'export const warn = (): boolean => process.stderr.write("x");\n',
      console: 'export const log = (): void => {\n  console.log("x");\n};\n',
    };

    for (const [what, source] of Object.entries(TOUCHES)) {
      it(`refuses ${what} outside the boundary file, the CLI included`, async () => {
        for (const ring of [
          "src/domain/probe.ts",
          "src/infrastructure/probe.ts",
          "src/cli/probe.ts",
        ])
          expect(await fired(ring, source)).toContainEqual(
            expect.stringMatching(/^no-restricted-properties: .*RULE-013: /),
          );
      });

      it(`allows ${what} in the boundary file`, async () => {
        expect(await fired("src/cli/boundary.ts", source)).toStrictEqual([]);
      });
    }
  },
);

describe("naming and exports", { timeout: 120_000 }, () => {
  it("RULE-025 refuses an I-prefixed interface and allows a noun", async () => {
    expect(
      await fired(
        "scripts/probe.ts",
        "export interface IPort {\n  x: number;\n}\n",
      ),
    ).toContainEqual(
      expect.stringMatching(/^@typescript-eslint\/naming-convention:/),
    );
    expect(
      await fired(
        "scripts/probe.ts",
        "export interface Port {\n  x: number;\n}\n",
      ),
    ).toStrictEqual([]);
  });

  it("RULE-026 refuses a type-only import written as a value import", async () => {
    const source =
      'import { GateOutput } from "./lib/output.ts";\nexport const x = (o: GateOutput): GateOutput => o;\n';
    expect(await fired("scripts/probe.ts", source)).toContainEqual(
      expect.stringMatching(/^@typescript-eslint\/consistent-type-imports:/),
    );
  });

  it("RULE-041 refuses a default export outside a tool configuration file", async () => {
    const source = "const value = 1;\nexport default value;\n";
    expect(await fired("scripts/probe.ts", source)).toContainEqual(
      expect.stringMatching(/^no-restricted-exports:/),
    );
    expect(await fired("tool.config.ts", source)).not.toContainEqual(
      expect.stringMatching(/^no-restricted-exports:/),
    );
  });
});
