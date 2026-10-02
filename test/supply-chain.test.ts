// Installing this repository's dependencies runs no third-party code, and every
// dependency resolves to one version a reviewer saw. Renovate pins ranges and
// holds third-party releases for seven days through the shared configuration;
// these two rules close what that leaves open: a range written by hand, and a
// lifecycle script an install would run.
//
// RULE-071 (docs/architecture-rules.md): every dependency is an exact version.
// RULE-072 (docs/architecture-rules.md): every install, local or in CI, runs
// with lifecycle scripts disabled.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const REPOSITORY = join(import.meta.dirname, "..");
const read = (rel: string): string =>
  readFileSync(join(REPOSITORY, rel), "utf8");

const SECTIONS = ["dependencies", "devDependencies"] as const;
// One exact semver version: no operator, no wildcard, no tag, no range.
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Every dependency of a package.json that names anything but one exact version. */
function rangedDependencies(manifest: unknown): string[] {
  const offenders: string[] = [];
  for (const section of SECTIONS) {
    const entries = (manifest as Record<string, unknown>)[section] ?? {};
    for (const [name, version] of Object.entries(entries)) {
      if (typeof version !== "string" || !EXACT.test(version))
        offenders.push(
          `${section}.${name} is ${JSON.stringify(version)}, not an exact version; pin it`,
        );
    }
  }
  return offenders;
}

// `npm ci` or `npm install` as a command, anywhere in a step's shell.
const INSTALL = /\bnpm\s+(?:ci|install|i)\b[^\n;&|]*/g;

/** Every `run` value a workflow or action holds, however deeply nested. */
function runs(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(runs);
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) =>
    key === "run" && typeof value === "string" ? [value] : runs(value),
  );
}

/** Every npm install in a workflow or action file that runs lifecycle scripts. */
function scriptedInstalls(files: Readonly<Record<string, string>>): string[] {
  const offenders: string[] = [];
  for (const [rel, text] of Object.entries(files))
    for (const run of runs(parse(text)))
      for (const [command] of run.matchAll(INSTALL))
        if (!command.includes("--ignore-scripts"))
          offenders.push(
            `${rel}: '${command.trim()}' runs lifecycle scripts; add --ignore-scripts`,
          );
  return offenders;
}

/** Whether an .npmrc disables lifecycle scripts for a local install. */
function disablesScripts(npmrc: string): boolean {
  return npmrc
    .split("\n")
    .some((line) => /^\s*ignore-scripts\s*=\s*true\s*$/.test(line));
}

/** Every workflow and composite action, as {rel: content}. */
function pipelineFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const directory of [".github/workflows", ".github/actions"])
    for (const entry of readdirSync(join(REPOSITORY, directory), {
      recursive: true,
      encoding: "utf8",
    }))
      if (/\.ya?ml$/.test(entry))
        files[`${directory}/${entry}`] = read(`${directory}/${entry}`);
  return files;
}

describe("RULE-071: every dependency is an exact version", () => {
  it("holds for package.json", () => {
    expect(rangedDependencies(JSON.parse(read("package.json")))).toEqual([]);
  });

  it("refuses a caret, a tilde, a wildcard and a tag", () => {
    expect(
      rangedDependencies({
        dependencies: { zod: "^4.5.4", yaml: "2.9.1" },
        devDependencies: { a: "~1.0.0", b: "*", c: "latest", d: "1.0.0-rc.1" },
      }),
    ).toEqual([
      'dependencies.zod is "^4.5.4", not an exact version; pin it',
      'devDependencies.a is "~1.0.0", not an exact version; pin it',
      'devDependencies.b is "*", not an exact version; pin it',
      'devDependencies.c is "latest", not an exact version; pin it',
    ]);
  });
});

describe("RULE-072: every install runs with lifecycle scripts disabled", () => {
  it("holds for every workflow and action, and for a local install", () => {
    const files = pipelineFiles();
    expect(Object.keys(files).length).toBeGreaterThan(0);
    expect(scriptedInstalls(files)).toEqual([]);
    expect(disablesScripts(read(".npmrc"))).toBe(true);
  });

  it("refuses an install that runs lifecycle scripts", () => {
    expect(
      scriptedInstalls({
        "a.yml": [
          "# a comment naming npm ci is not a step",
          "'description': 'run npm ci'",
          "'steps':",
          "  - 'run': 'npm ci'",
          "  - 'run': 'npm ci --ignore-scripts'",
        ].join("\n"),
        "b.yml":
          "jobs:\n  x:\n    steps:\n      - run: |\n          set -e\n          npm install --no-audit\n",
      }),
    ).toEqual([
      "a.yml: 'npm ci' runs lifecycle scripts; add --ignore-scripts",
      "b.yml: 'npm install --no-audit' runs lifecycle scripts; add --ignore-scripts",
    ]);
  });

  it("reads an .npmrc that leaves scripts on as not disabling them", () => {
    expect(disablesScripts("ignore-scripts=false\n")).toBe(false);
    expect(disablesScripts("# ignore-scripts=true\n")).toBe(false);
    expect(disablesScripts("registry=x\nignore-scripts = true\n")).toBe(true);
  });
});
