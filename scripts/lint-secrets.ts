// The secret scan CI runs, wrapped so `npm run verify` catches a leaked
// credential on the machine that wrote it rather than after a push.
//
// gitleaks scans the tree against its default ruleset plus this repository's
// own .gitleaks.toml allowlist (--no-git: the working tree, not git history,
// the same source CI's checkout scans). A machine without the binary skips
// loudly rather than passing quietly, the same shape as the other gates that
// shell out to a pinned external tool.
//
// A library first: tests call lintSecrets() in-process with a stand-in
// binary, and `node scripts/lint-secrets.ts [root]` is the command, which
// takes the binary from GITLEAKS, or from the PATH.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** Scan `root` for committed secrets with the gitleaks at `bin`. */
export function lintSecrets(
  root: string,
  bin: string,
  output: GateOutput,
): number {
  const probe = spawnSync(bin, ["version"], { encoding: "utf8" });
  if (probe.error) {
    output.out(
      `secret scan: SKIPPED because ${bin} is not on PATH. ` +
        "CI installs a pinned release; set GITLEAKS to run it locally.\n",
    );
    return 0;
  }

  const run = spawnSync(
    bin,
    [
      "detect",
      "--no-git",
      "--redact",
      "--verbose",
      "--source",
      root,
      "--exit-code",
      "1",
    ],
    { encoding: "utf8" },
  );
  if (run.error) {
    output.err(`secret scan: could not run ${bin}: ${run.error.message}\n`);
    return 1;
  }
  output.out(run.stdout);
  output.err(run.stderr);
  return run.status ?? 1;
}

/** Scan the tree named by argv[0], or this repository. */
export function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  output: GateOutput = processOutput,
): number {
  return lintSecrets(argv[0] ?? REPOSITORY, env.GITLEAKS ?? "gitleaks", output);
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
