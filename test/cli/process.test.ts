// The CLI at the process seam (docs/architecture.md#testing): a handful of
// runs of the real command, for what only a process shows, its exit status and
// what it writes to stdout and stderr.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY = join(import.meta.dirname, "..", "..");
const command = (...argv: string[]) =>
  spawnSync(process.execPath, [join(REPOSITORY, "src/cli/index.ts"), ...argv], {
    cwd: REPOSITORY,
    encoding: "utf8",
  });

describe("deploy-kit, as a process", () => {
  it("exits 2 on a wrong call, with the usage on stderr", () => {
    const run = command("bogus");

    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/^bogus: no such command\nusage:/);
  });

  it("exits 1 on a refusal, with the diagnostics on stdout under --json", () => {
    const run = command(
      "validate",
      "spec/v1/examples/platform/platform.intent.yml",
      "--json",
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toBe("");
    expect(
      (JSON.parse(run.stdout) as { code: string }[]).map(({ code }) => code),
    ).toContain("E_UNKNOWN_TIER_PROXY");
  });

  it("exits 0 on an accepted set", () => {
    const run = command(
      "validate",
      "spec/v1/examples/minimal/notes.project.yml",
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toBe("accepted (1 read)\n");
  });
});
