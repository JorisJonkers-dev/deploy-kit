// The release candidate publish, executed: a stand-in `npm` the way
// test/secret-scan-contract.test.ts stands in for gitleaks, so no real
// registry and no real pull request need to exist for the test.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  main,
  publish,
  readPackageVersion,
  writePackageVersion,
  type Config,
} from "../scripts/rc-publish.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

function fixturePackage(version = "0.2.0", name = "@org/pkg"): string {
  const dir = mkdtempSync(join(temporary(), "pkg-"));
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name, version }, null, 2)}\n`,
  );
  return dir;
}

/** A stand-in `npm` that logs its args, prints a marker line, and exits `code`. */
function fakeNpm(code: number): { bin: string; log: string } {
  const dir = mkdtempSync(join(temporary(), "npm-bin-"));
  const bin = join(dir, "npm");
  const log = join(dir, "log.txt");
  writeFileSync(
    bin,
    "#!/bin/sh\n" +
      `printf '%s\\n' "$*" >> "${log}"\n` +
      'echo "npm ran: $*"\n' +
      (code === 0 ? "" : 'echo "npm failed" 1>&2\n') +
      `exit ${code}\n`,
  );
  chmodSync(bin, 0o755);
  return { bin, log };
}

function missingNpm(): string {
  return join(
    mkdtempSync(join(temporary(), "npm-bin-")),
    "definitely-not-here",
  );
}

function config(overrides: Partial<Config> = {}): Config {
  return {
    root: fixturePackage(),
    packageName: "@org/pkg",
    baseVersion: "0.2.0",
    pr: 34,
    run: 17,
    eligibility: {
      eventName: "pull_request",
      isFork: false,
      actor: "a-teammate",
    },
    dryRun: true,
    npmBin: "npm",
    summaryPath: undefined,
    ...overrides,
  };
}

describe("readPackageVersion / writePackageVersion", () => {
  it("round-trips a version", () => {
    const root = fixturePackage("0.2.0");
    writePackageVersion(root, "0.2.1-rc.1.1");
    expect(readPackageVersion(root)).toStrictEqual({
      name: "@org/pkg",
      version: "0.2.1-rc.1.1",
    });
  });
});

describe("publish", () => {
  it("skips, without touching package.json, when the pull request is ineligible", () => {
    const root = fixturePackage("0.2.0");
    const output = collect();
    const result = publish(
      config({
        root,
        eligibility: { eventName: "push", isFork: false, actor: "x" },
      }),
      output,
    );
    expect(result.ran).toBe(false);
    expect(result.failed).toBe(false);
    expect(result.version).toBeNull();
    expect(result.command).toBeNull();
    expect(result.reason).toMatch(/not a pull request event/);
    expect(output.text()).toMatch(/SKIPPED/);
    expect(readPackageVersion(root).version).toBe("0.2.0");
  });

  it("computes the version, writes it, and runs npm publish --tag rc --provenance --dry-run", () => {
    const root = fixturePackage("0.2.0");
    const { bin, log } = fakeNpm(0);
    const output = collect();
    const result = publish(config({ root, npmBin: bin, dryRun: true }), output);
    expect(result.ran).toBe(true);
    expect(result.failed).toBe(false);
    expect(result.version).toBe("0.2.1-rc.34.17");
    expect(readPackageVersion(root).version).toBe("0.2.1-rc.34.17");
    expect(readFileSync(log, "utf8").trim()).toBe(
      "publish --tag rc --provenance --dry-run",
    );
    expect(output.text()).toContain(
      "command: " + bin + " publish --tag rc --provenance --dry-run",
    );
    expect(output.text()).toContain("install: npm install @org/pkg@rc");
  });

  it("omits --dry-run when config says a real publish", () => {
    const root = fixturePackage("0.2.0");
    const { bin, log } = fakeNpm(0);
    publish(config({ root, npmBin: bin, dryRun: false }), collect());
    expect(readFileSync(log, "utf8").trim()).toBe(
      "publish --tag rc --provenance",
    );
  });

  it("appends the summary to summaryPath when one is given", () => {
    const root = fixturePackage("0.2.0");
    const { bin } = fakeNpm(0);
    const summaryPath = join(temporary(), "summary.md");
    writeFileSync(summaryPath, "# existing\n");
    publish(config({ root, npmBin: bin, summaryPath }), collect());
    const summary = readFileSync(summaryPath, "utf8");
    expect(summary).toContain("# existing");
    expect(summary).toContain("rc publish: version 0.2.1-rc.34.17");
  });

  it("tolerates a summaryPath it cannot write to", () => {
    const root = fixturePackage("0.2.0");
    const { bin } = fakeNpm(0);
    const result = publish(
      config({
        root,
        npmBin: bin,
        summaryPath: join(root, "no-such-dir", "summary.md"),
      }),
      collect(),
    );
    expect(result.failed).toBe(false);
  });

  it("fails when npm publish exits non-zero", () => {
    const root = fixturePackage("0.2.0");
    const { bin } = fakeNpm(1);
    const output = collect();
    const result = publish(config({ root, npmBin: bin }), output);
    expect(result.failed).toBe(true);
    expect(result.reason).toBe("npm publish failed");
    expect(output.text()).toMatch(/npm publish failed|failed:/);
  });

  it("fails when npm cannot be started at all", () => {
    const root = fixturePackage("0.2.0");
    const output = collect();
    const result = publish(config({ root, npmBin: missingNpm() }), output);
    expect(result.failed).toBe(true);
    expect(result.reason).toBe("could not start npm");
    expect(output.text()).toMatch(/could not run/);
  });
});

describe("main", () => {
  it("uses this repository's own root when RC_PUBLISH_ROOT is unset", () => {
    const output = collect();
    const code = main({}, [], output);
    expect(code).toBe(0);
    expect(output.text()).toMatch(/SKIPPED/);
  });

  it("falls back to GITHUB_EVENT_NAME and GITHUB_ACTOR when the RC_ prefixed ones are unset", () => {
    const root = fixturePackage("0.2.0");
    const output = collect();
    const code = main(
      {
        RC_PUBLISH_ROOT: root,
        GITHUB_EVENT_NAME: "pull_request",
        RC_IS_FORK: "false",
        GITHUB_ACTOR: "dependabot[bot]",
      },
      [],
      output,
    );
    expect(code).toBe(0);
    expect(output.text()).toMatch(/dependabot/);
  });

  it("treats a run with no event name at all as ineligible", () => {
    const root = fixturePackage("0.2.0");
    const output = collect();
    const code = main({ RC_PUBLISH_ROOT: root }, [], output);
    expect(code).toBe(0);
    expect(output.text()).toMatch(/not a pull request event \(""\)/);
  });

  it("fails when the root has no package.json", () => {
    const output = collect();
    const code = main(
      { RC_PUBLISH_ROOT: join(temporary(), "nothing-here") },
      [],
      output,
    );
    expect(code).toBe(1);
    expect(output.text()).toMatch(/no package.json under/);
  });

  it("reads the environment the workflow sets, and skips a non-pull_request run", () => {
    const root = fixturePackage("0.2.0");
    const output = collect();
    const code = main(
      { RC_PUBLISH_ROOT: root, RC_EVENT_NAME: "push" },
      [],
      output,
    );
    expect(code).toBe(0);
    expect(output.text()).toMatch(/SKIPPED/);
  });

  it("skips a fork pull request", () => {
    const root = fixturePackage("0.2.0");
    const output = collect();
    const code = main(
      {
        RC_PUBLISH_ROOT: root,
        RC_EVENT_NAME: "pull_request",
        RC_IS_FORK: "true",
      },
      [],
      output,
    );
    expect(code).toBe(0);
    expect(output.text()).toMatch(/fork/);
  });

  it("skips a Dependabot pull request", () => {
    const root = fixturePackage("0.2.0");
    const output = collect();
    const code = main(
      {
        RC_PUBLISH_ROOT: root,
        RC_EVENT_NAME: "pull_request",
        RC_IS_FORK: "false",
        RC_ACTOR: "dependabot[bot]",
      },
      [],
      output,
    );
    expect(code).toBe(0);
    expect(output.text()).toMatch(/dependabot/);
  });

  it("publishes for an eligible pull request, using RC_PR_NUMBER and GITHUB_RUN_NUMBER", () => {
    const root = fixturePackage("0.2.0");
    const { bin, log } = fakeNpm(0);
    const output = collect();
    const code = main(
      {
        RC_PUBLISH_ROOT: root,
        RC_EVENT_NAME: "pull_request",
        RC_IS_FORK: "false",
        RC_ACTOR: "a-teammate",
        RC_PR_NUMBER: "34",
        GITHUB_RUN_NUMBER: "17",
        NPM_BIN: bin,
        RC_DRY_RUN: "1",
      },
      [],
      output,
    );
    expect(code).toBe(0);
    expect(readPackageVersion(root).version).toBe("0.2.1-rc.34.17");
    expect(readFileSync(log, "utf8").trim()).toBe(
      "publish --tag rc --provenance --dry-run",
    );
  });

  it("forces a dry run from --dry-run on the command line even when RC_DRY_RUN is unset", () => {
    const root = fixturePackage("0.2.0");
    const { bin, log } = fakeNpm(0);
    main(
      {
        RC_PUBLISH_ROOT: root,
        RC_EVENT_NAME: "pull_request",
        RC_IS_FORK: "false",
        RC_ACTOR: "a-teammate",
        NPM_BIN: bin,
      },
      ["--dry-run"],
      collect(),
    );
    expect(readFileSync(log, "utf8").trim()).toBe(
      "publish --tag rc --provenance --dry-run",
    );
  });

  it("returns 1 when a real publish attempt fails", () => {
    const root = fixturePackage("0.2.0");
    const { bin } = fakeNpm(1);
    const output = collect();
    const code = main(
      {
        RC_PUBLISH_ROOT: root,
        RC_EVENT_NAME: "pull_request",
        RC_IS_FORK: "false",
        RC_ACTOR: "a-teammate",
        NPM_BIN: bin,
      },
      [],
      output,
    );
    expect(code).toBe(1);
  });
});

describe("the entrypoint guard", () => {
  it("runs main and sets process.exitCode when Node starts this module", async () => {
    const modulePath = join(REPOSITORY, "scripts", "rc-publish.ts");
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [process.argv[0] ?? "node", modulePath];
    vi.stubEnv("RC_PUBLISH_ROOT", join(temporary(), "nothing-here"));
    vi.resetModules();
    try {
      await import("../scripts/rc-publish.ts");
      expect(process.exitCode).toBe(1);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "rc-publish.ts")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          RC_PUBLISH_ROOT: join(temporary(), "nothing-here"),
        },
      },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/no package.json under/);
  });
});
