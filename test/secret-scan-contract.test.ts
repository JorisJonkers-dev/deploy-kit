// The secret scan gate, executed.
//
// lint-secrets.ts wraps gitleaks for two reasons: it skips loudly when the
// binary is absent rather than passing quietly, and it fails the build when
// the binary fails. Both are what make it a gate rather than a script, and
// neither is proven by running it against a clean tree. A stand-in binary
// stands in for gitleaks throughout, the same way manifest-contract.test.ts
// stands in for kubeconform: a real scanner is never started here, so no
// planted-credential fixture needs to exist in this tracked file at all, and
// none does.
//
// REQ-013 (docs/requirements.md): `npm run verify` runs the same secret scan
// CI runs, and fails on a finding rather than only after a push.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { lintSecrets, main } from "../scripts/lint-secrets.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** A stand-in gitleaks that answers `version`, then echoes its scan args and exits `code`. */
function gitleaks(code: number): string {
  const bin = join(mkdtempSync(join(temporary(), "bin-")), "gitleaks");
  writeFileSync(
    bin,
    "#!/bin/sh\n" +
      'if [ "$1" = "version" ]; then echo "8.30.1"; exit 0; fi\n' +
      'echo "fake gitleaks finding File:$6"\n' +
      `exit ${code}\n`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

/**
 * A stand-in that answers `version` and then deletes itself, so the probe
 * spawns fine but the scan invocation right after it cannot: `spawnSync`
 * fails to start the process at all and sets `error` rather than `status`,
 * the same case package-contents-contract.test.ts covers for `npm` with a
 * missing `cwd`. There is no `cwd` to break here, since `bin` is an explicit
 * path rather than a name looked up on PATH, so the binary removes itself
 * between the two calls instead.
 */
function vanishingGitleaks(): string {
  const bin = join(mkdtempSync(join(temporary(), "bin-")), "gitleaks");
  writeFileSync(bin, '#!/bin/sh\nrm -- "$0"\necho "8.30.1"\nexit 0\n');
  chmodSync(bin, 0o755);
  return bin;
}

/**
 * A stand-in that answers `version`, then kills itself with a signal on the
 * scan call rather than exiting, so `spawnSync` reports `status: null` and no
 * `error`: the one way a process ends without an exit code.
 */
function signalledGitleaks(): string {
  const bin = join(mkdtempSync(join(temporary(), "bin-")), "gitleaks");
  writeFileSync(
    bin,
    "#!/bin/sh\n" +
      'if [ "$1" = "version" ]; then echo "8.30.1"; exit 0; fi\n' +
      "kill -TERM $$\nsleep 5\n",
  );
  chmodSync(bin, 0o755);
  return bin;
}

describe("the secret scan", () => {
  it("skips loudly and passes when the binary is absent", () => {
    const output = collect();
    const absent = join(temporary(), "definitely-not-here");
    expect(lintSecrets(temporary(), absent, output)).toBe(0);
    expect(output.text()).toMatch(/SKIPPED/);
    expect(output.text()).toMatch(/GITLEAKS/);
  });

  it("passes when gitleaks passes, handing it the source root", () => {
    const output = collect();
    const root = temporary();
    expect(lintSecrets(root, gitleaks(0), output)).toBe(0);
    expect(output.text()).toMatch(`fake gitleaks finding File:${root}`);
  });

  it("fails the build and names the file when gitleaks finds something", () => {
    const output = collect();
    const root = temporary();
    expect(lintSecrets(root, gitleaks(1), output)).toBe(1);
    expect(output.text()).toMatch(`File:${root}`);
  });

  it("fails loudly when gitleaks passes the probe but cannot then be run", () => {
    const output = collect();
    expect(lintSecrets(temporary(), vanishingGitleaks(), output)).toBe(1);
    expect(output.text()).toMatch(/secret scan: could not run/);
  });

  it("fails the build when the scan is killed by a signal, leaving no exit status", () => {
    expect(lintSecrets(temporary(), signalledGitleaks(), collect())).toBe(1);
  });
});

describe("the command", () => {
  it("takes the binary from GITLEAKS", () => {
    expect(main([temporary()], { GITLEAKS: gitleaks(3) }, collect())).toBe(3);
  });

  it("scans this repository when no root is given", () => {
    expect(main([], { GITLEAKS: gitleaks(0) }, collect())).toBe(0);
  });

  it("falls back to the literal gitleaks name on PATH when GITLEAKS is unset", () => {
    const dir = mkdtempSync(join(temporary(), "path-bin-"));
    const bin = join(dir, "gitleaks");
    writeFileSync(
      bin,
      "#!/bin/sh\n" +
        'if [ "$1" = "version" ]; then echo "8.30.1"; exit 0; fi\n' +
        "exit 0\n",
    );
    chmodSync(bin, 0o755);
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);
    expect(main([temporary()], {}, collect())).toBe(0);
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    // GITLEAKS names a binary that is not there, so the gate has to skip.
    // Not an empty PATH: an empty PATH means the current directory, and CI
    // downloads gitleaks into the directory the tests run from.
    const absent = join(temporary(), "definitely-not-here");
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "lint-secrets.ts"), temporary()],
      { encoding: "utf8", env: { PATH: "", GITLEAKS: absent } },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(
      /secret scan: SKIPPED because .* is not on PATH/,
    );
  });
});

describe("the entrypoint guard", () => {
  // This file is small enough that its own bottom-of-file guard, left
  // uncovered as every other gate leaves its own, would be a large enough
  // share of the file to pull the suite under the ratchet, the same reason
  // check-package-contents.ts's guard test gives. Reloading the module with
  // `process.argv` set to its own path drives the guard for real, in this
  // process, so v8 sees the line the subprocess test above proves but
  // coverage otherwise never reaches. GITLEAKS is stubbed to an absent path
  // so the run is the deterministic skip, not a real scan of this tree.
  it("runs main and sets process.exitCode when Node starts this module", async () => {
    const modulePath = join(REPOSITORY, "scripts", "lint-secrets.ts");
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [process.argv[0] ?? "node", modulePath];
    vi.stubEnv("GITLEAKS", join(temporary(), "definitely-not-here"));
    vi.resetModules();
    try {
      await import("../scripts/lint-secrets.ts");
      expect(process.exitCode).toBe(0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
