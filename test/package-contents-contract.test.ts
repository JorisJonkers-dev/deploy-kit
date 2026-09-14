// The package contents gate (scripts/check-package-contents.ts). `files` in
// package.json is advisory: npm bundles package.json, README and LICENSE
// regardless of it, and a stray glob can widen it silently. This proves the
// gate catches that against real npm, not only against a fabricated list.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  checkPackageContents,
  isAllowed,
  main,
  packedFiles,
  violations,
} from "../scripts/check-package-contents.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** A minimal npm package under a fresh temporary directory. */
function pkg(
  files: readonly string[],
  extra: Readonly<Record<string, string>> = {},
): string {
  const root = mkdtempSync(join(temporary(), "pkg-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", version: "0.0.0", files }),
  );
  for (const [rel, content] of Object.entries(extra)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

/** A stand-in npm that echoes `output` for any `pack --dry-run` call. */
function fakeNpm(output: string): string {
  const bin = mkdtempSync(join(temporary(), "npm-bin-"));
  const path = join(bin, "npm");
  writeFileSync(path, `#!/bin/sh\necho '${output}'\n`);
  chmodSync(path, 0o755);
  return bin;
}

describe("isAllowed", () => {
  it("allows the two declared trees", () => {
    expect(isAllowed("docs/adr/README.md")).toBe(true);
    expect(isAllowed("spec/v1/00-overview.md")).toBe(true);
  });

  it("allows the files npm always bundles", () => {
    expect(isAllowed("package.json")).toBe(true);
    expect(isAllowed("README.md")).toBe(true);
    expect(isAllowed("LICENSE")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isAllowed("src/index.ts")).toBe(false);
    expect(isAllowed("scripts/lint-adrs.ts")).toBe(false);
    expect(isAllowed("CHANGELOG.md")).toBe(false);
  });
});

describe("violations", () => {
  it("is empty when every file is inside the boundary", () => {
    expect(
      violations(["package.json", "docs/adr/a.md", "spec/b.md"]),
    ).toStrictEqual([]);
  });

  it("names, sorted, every file outside the boundary", () => {
    expect(
      violations(["spec/a.md", "src/b.ts", "docs/adr/c.md", "CHANGELOG.md"]),
    ).toStrictEqual(["CHANGELOG.md", "src/b.ts"]);
  });
});

describe("packedFiles", () => {
  it("returns the paths a real npm pack --dry-run would ship", () => {
    const root = pkg(["docs/adr/"], { "docs/adr/a.md": "x" });
    expect(packedFiles(root)).toStrictEqual(["docs/adr/a.md", "package.json"]);
  });

  it("throws when npm refuses the package", () => {
    const root = mkdtempSync(join(temporary(), "bad-pkg-"));
    writeFileSync(join(root, "package.json"), "not json");
    expect(() => packedFiles(root)).toThrow(/npm pack --dry-run failed/);
  });

  it("throws when npm cannot be started at all", () => {
    // A `cwd` that does not exist fails the spawn itself, before npm ever
    // runs, so `run.error` is set rather than `run.status`.
    const gone = join(temporary(), "does-not-exist");
    expect(() => packedFiles(gone)).toThrow(/could not run npm: /);
  });

  it("ships nothing when npm reports no package at all", () => {
    // A real `npm pack --dry-run --json` always names at least one package,
    // but the code does not assume that; a stand-in npm that reports none
    // proves the empty-array fallback rather than only asserting the type.
    vi.stubEnv("PATH", `${fakeNpm("[]")}:${process.env.PATH}`);
    expect(packedFiles(REPOSITORY)).toStrictEqual([]);
  });
});

describe("checkPackageContents", () => {
  it("passes, and says so, when everything is inside the boundary", () => {
    const output = collect();
    const root = pkg(["docs/adr/", "spec/"], {
      "docs/adr/a.md": "x",
      "spec/b.md": "x",
    });
    expect(checkPackageContents(root, output)).toBe(0);
    expect(output.text()).toMatch(/3 files, all inside/);
  });

  it("fails, and names the offenders, when files leaks outside the boundary", () => {
    const output = collect();
    const root = pkg(["docs/adr/", "src/"], {
      "docs/adr/a.md": "x",
      "src/leak.ts": "x",
    });
    expect(checkPackageContents(root, output)).toBe(1);
    expect(output.text()).toMatch(/ship files outside docs\/adr\/ and spec\//);
    expect(output.text()).toMatch(/src\/leak\.ts/);
  });

  it("fails, and explains why, when npm cannot pack the tree", () => {
    const output = collect();
    const root = mkdtempSync(join(temporary(), "bad-pkg-"));
    writeFileSync(join(root, "package.json"), "not json");
    expect(checkPackageContents(root, output)).toBe(1);
    expect(output.text()).toMatch(/^package contents: /);
  });

  it("passes this repository's own tree", () => {
    expect(checkPackageContents(REPOSITORY, collect())).toBe(0);
  });
});

describe("the command", () => {
  it("checks the tree named by argv[0]", () => {
    const output = collect();
    const root = pkg(["docs/adr/"], { "docs/adr/a.md": "x" });
    expect(main([root], output)).toBe(0);
  });

  it("checks this repository when no tree is named", () => {
    expect(main([], collect())).toBe(0);
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    const root = pkg(["docs/adr/", "src/"], {
      "docs/adr/a.md": "x",
      "src/leak.ts": "x",
    });
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "check-package-contents.ts"), root],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("src/leak.ts");
  });
});

describe("the entrypoint guard", () => {
  // This file is small enough that its own bottom-of-file guard, left
  // uncovered as every other gate leaves its own, would be a large enough
  // share of the file to pull the suite under the ratchet. Reloading the
  // module with `process.argv` set to its own path drives the guard for
  // real, in this process, so v8 sees the line the subprocess test above
  // proves but coverage otherwise never reaches.
  it("runs main and sets process.exitCode when Node starts this module", async () => {
    const modulePath = join(REPOSITORY, "scripts", "check-package-contents.ts");
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [process.argv[0] ?? "node", modulePath];
    vi.resetModules();
    try {
      await import("../scripts/check-package-contents.ts");
      expect(process.exitCode).toBe(0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
