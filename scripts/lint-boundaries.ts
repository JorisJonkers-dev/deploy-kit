// Layer-boundary lint. The ruleset is .dependency-cruiser.cjs, which is where
// the hexagon is written down; this wrapper exists for one reason:
// dependency-cruiser exits non-zero when asked to read a directory that does
// not exist. It skips loudly rather than passing silently. This repository's
// own src/ landed with the Service Intent metamodel, so the gate enforces here
// rather than skipping; the skip branch is still reached by a fixture tree
// with no src/ at all, which is what its negative fixtures are.
//
// A library first: tests call lintBoundaries() in-process against fixture
// trees, and `node scripts/lint-boundaries.ts [root]` is the command.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const CONFIG = join(REPOSITORY, ".dependency-cruiser.cjs");

/**
 * Cruise the src/ of `root` against this repository's ruleset, and return the
 * exit status. The ruleset is always this repository's: it is the thing under
 * test, and a fixture tree only supplies the modules.
 */
export function lintBoundaries(root: string, output: GateOutput): number {
  if (!existsSync(join(root, "src"))) {
    output.out(
      "boundary lint: SKIPPED because src/ does not exist yet. " +
        "The ruleset in .dependency-cruiser.cjs takes effect with the first module.\n",
    );
    return 0;
  }

  // The local binary by absolute path, never `npx`: with a cwd outside this
  // repository npx resolves the name from the registry instead of node_modules.
  const bin = join(REPOSITORY, "node_modules", ".bin", "depcruise");
  const run = spawnSync(bin, ["src", "--config", CONFIG], {
    cwd: root,
    encoding: "utf8",
  });
  // A spawn failure prints nothing of its own: without this the operator sees
  // a bare non-zero exit on a fresh or pruned install.
  if (run.error) {
    output.err(`boundary lint: could not run ${bin}: ${run.error.message}\n`);
    return 1;
  }
  output.out(run.stdout);
  output.err(run.stderr);
  return run.status ?? 1;
}

/** Lint the tree named by argv[0], or this repository. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  return lintBoundaries(argv[0] ?? REPOSITORY, output);
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
