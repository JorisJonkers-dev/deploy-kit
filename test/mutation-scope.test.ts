// REQ-064 (docs/requirements.md): a pull request that changes nothing the
// mutation gate reads does not run it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { reaches, run, type Versions } from "../scripts/mutation-scope.ts";

const REPOSITORY = join(import.meta.dirname, "..");

const PACKAGE = JSON.stringify({
  name: "deploy-kit",
  version: "0.18.0",
  devDependencies: { vitest: "4.1.11" },
});
const LOCK = JSON.stringify({
  name: "deploy-kit",
  version: "0.18.0",
  packages: { "": { name: "deploy-kit", version: "0.18.0" } },
});
const released = (text: string): string => text.replaceAll("0.18.0", "0.19.0");

const unread = (): Versions => ({ before: undefined, after: undefined });

describe("whether a change reaches the mutation gate", () => {
  it("reaches it through src/, test/, the Stryker and Vitest configuration, the Node version, and the gate's own pipeline", () => {
    for (const path of [
      "src/check/union.ts",
      "test/model/descriptor.test.ts",
      "stryker.config.json",
      "vitest.mutation.config.ts",
      "tsconfig.json",
      ".nvmrc",
      ".github/workflows/ci.yml",
      ".github/actions/setup/action.yml",
      "scripts/mutation-shard.ts",
      "scripts/mutation-merge.ts",
      "scripts/mutation-scope.ts",
      "scripts/lib/mutation-report.ts",
      "scripts/lib/entrypoint.ts",
    ])
      expect(reaches(["CHANGELOG.md", path], unread), path).toBe(path);
  });

  it("does not reach it through documents, the release manifest, or another gate's script", () => {
    expect(
      reaches(
        [
          "CHANGELOG.md",
          ".release-please-manifest.json",
          "docs/adr/architecture/0063-coverage-and-mutation-are-ratchets.md",
          "spec/v1/10-project-intent.md",
          "emf/pom.xml",
          "scripts/lint-adrs.ts",
          "scripts/lib/pr-comment.ts",
          ".github/workflows/release.yml",
        ],
        unread,
      ),
    ).toBeUndefined();
  });

  it("does not reach it through a version bump alone, and reaches it through a dependency change", () => {
    const bumped = (path: string) =>
      path === "package.json"
        ? { before: PACKAGE, after: released(PACKAGE) }
        : { before: LOCK, after: released(LOCK) };
    expect(
      reaches(["package.json", "package-lock.json"], bumped),
    ).toBeUndefined();

    const upgraded = (path: string) =>
      path === "package.json"
        ? { before: PACKAGE, after: PACKAGE.replace("4.1.11", "4.2.0") }
        : { before: LOCK, after: LOCK };
    expect(reaches(["package-lock.json", "package.json"], upgraded)).toBe(
      "package.json",
    );
    // A file added, removed or no longer JSON is a change in full.
    for (const versions of [
      { before: undefined, after: PACKAGE },
      { before: PACKAGE, after: undefined },
      { before: PACKAGE, after: "{" },
    ])
      expect(reaches(["package.json"], () => versions)).toBe("package.json");
  });
});

/** A repository whose second commit changes `files`, and its first commit. */
function history(files: Readonly<Record<string, string | null>>): string {
  const root = mkdtempSync(join(tmpdir(), "mutation-scope-"));
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  git("init", "--quiet");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  git("config", "commit.gpgsign", "false");
  write("package.json", PACKAGE);
  write("src/a.ts", "export const a = 1;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  for (const [path, text] of Object.entries(files))
    if (text === null) rmSync(join(root, path));
    else write(path, text);
  git("add", "--all");
  git("commit", "--quiet", "-m", "change");
  return root;
}

describe("the mutation scope command", () => {
  it("prints false for a release, naming why on stderr", () => {
    const root = history({
      "package.json": released(PACKAGE),
      "CHANGELOG.md": "# Changelog\n",
    });

    expect(run(["HEAD^1"], root)).toStrictEqual({
      code: 0,
      stdout: "false\n",
      stderr:
        "Nothing the mutation gate reads changed: main's result stands.\n",
    });
  });

  it("prints true for a change under src/, and for a move out of it", () => {
    expect(
      run(["HEAD^1"], history({ "src/a.ts": "export const a = 2;\n" })),
    ).toStrictEqual({
      code: 0,
      stdout: "true\n",
      stderr: "src/a.ts changed, so the mutation gate runs.\n",
    });
    // A rename read as one is only its new path; the old one is a change too.
    expect(
      run(
        ["HEAD^1"],
        history({ "src/a.ts": null, "docs/a.ts": "export const a = 1;\n" }),
      ).stdout,
    ).toBe("true\n");
  });

  it("refuses a call that names no base", () => {
    expect(run([], REPOSITORY)).toStrictEqual({
      code: 2,
      stdout: "",
      stderr: "usage: node scripts/mutation-scope.ts <base>\n",
    });
  });

  it("runs when Node starts this module", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [
      process.argv[0] ?? "node",
      join(REPOSITORY, "scripts", "mutation-scope.ts"),
    ];
    vi.resetModules();
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await import("../scripts/mutation-scope.ts");
      expect(process.exitCode).toBe(2);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
