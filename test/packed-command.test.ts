// The published package, at the one seam only an install shows
// (docs/architecture.md#the-published-package): the tarball `npm pack` builds
// is installed into an empty project, and the `deploy-kit` it puts on the
// path is run. Node strips no types under node_modules, so a package whose
// bin still pointed at TypeScript, or whose build dropped a file, fails here
// and nowhere else in the suite.
//
// REQ-046 (docs/requirements.md): the published package runs the command.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPOSITORY = join(import.meta.dirname, "..");
const EXAMPLES = join(REPOSITORY, "spec/v1/examples");

/** Packing builds, and installing unpacks: both outlast a unit test's limit. */
const SLOW = 180_000;

const npm = (cwd: string, ...argv: string[]) =>
  spawnSync("npm", argv, { cwd, encoding: "utf8" });

// One install serves every test below, so it lives outside the directory each
// test is given and loses: this suite makes its own, and removes it.
let scratch: string;
let project: string;

/** The installed command, run from the project that installed it. */
const command = (...argv: string[]) =>
  spawnSync(join(project, "node_modules/.bin/deploy-kit"), argv, {
    cwd: project,
    encoding: "utf8",
  });

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "deploy-kit-packed-"));
  const tarballs = join(scratch, "tarballs");
  mkdirSync(tarballs);
  const packed = npm(
    REPOSITORY,
    "pack",
    "--json",
    "--pack-destination",
    tarballs,
  );
  if (packed.status !== 0) throw new Error(`npm pack: ${packed.stderr}`);
  const [{ filename }] = JSON.parse(packed.stdout) as [{ filename: string }];

  project = join(scratch, "consumer");
  mkdirSync(project);
  // The package's two runtime dependencies are the copies this repository
  // already installed, and npm's cache is an empty directory: the install
  // resolves nothing from a registry, on any machine, so the suite still
  // reaches no network.
  const installed = (name: string) =>
    `file:${join(REPOSITORY, "node_modules", name)}`;
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({
      name: "consumer",
      version: "0.0.0",
      private: true,
      overrides: { zod: installed("zod"), yaml: installed("yaml") },
    }),
  );
  const install = npm(
    project,
    "install",
    "--offline",
    "--cache",
    join(scratch, "cache"),
    "--no-audit",
    "--no-fund",
    join(tarballs, filename),
  );
  if (install.status !== 0) throw new Error(`npm install: ${install.stderr}`);
}, SLOW);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("the published package", () => {
  it("puts a command on the path that is JavaScript, not the source", () => {
    const manifest = JSON.parse(
      readFileSync(
        join(project, "node_modules/@jorisjonkers-dev/deploy-kit/package.json"),
        "utf8",
      ),
    ) as { bin: Record<string, string> };

    expect(manifest.bin).toStrictEqual({ "deploy-kit": "dist/cli/index.js" });
    expect(
      readFileSync(
        join(
          project,
          "node_modules/@jorisjonkers-dev/deploy-kit",
          manifest.bin["deploy-kit"] ?? "",
        ),
        "utf8",
      ),
    ).toMatch(/^#!\/usr\/bin\/env node\n/);
  });

  it("accepts a worked example", () => {
    const run = command(
      "validate",
      join(EXAMPLES, "minimal/notes.project.yml"),
    );

    expect(run.stderr).toBe("");
    expect(run.stdout).toBe("accepted (1 read)\n");
    expect(run.status).toBe(0);
  });

  it("refuses a broken set with its code, and exits 1", () => {
    const run = command(
      "validate",
      join(EXAMPLES, "platform/platform.intent.yml"),
      "--json",
    );

    expect(run.status).toBe(1);
    expect(
      (JSON.parse(run.stdout) as { code: string }[]).map(({ code }) => code),
    ).toContain("E_UNKNOWN_TIER_PROXY");
  });

  it("exits 2 on a wrong call, with the usage", () => {
    const run = command("bogus");

    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/^bogus: no such command\nusage:/);
  });

  it("packs a fragment carrying the release it was handed", () => {
    const out = join(project, "fragment");
    const run = command(
      "publish",
      join(EXAMPLES, "minimal/notes.project.yml"),
      "--repository",
      "JorisJonkers-dev/notes",
      "--source-sha",
      "0123456789abcdef0123456789abcdef01234567",
      "--version",
      "1.4.0",
      "--out",
      out,
    );

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(readFileSync(join(out, "fragment.yml"), "utf8")).toMatch(
      /version: 1\.4\.0/,
    );
  });
});
