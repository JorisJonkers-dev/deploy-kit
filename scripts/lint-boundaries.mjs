#!/usr/bin/env node
// Layer-boundary lint. The ruleset is .dependency-cruiser.cjs, which is where
// the hexagon is written down; this wrapper exists for one reason: the compiler
// has no src/ yet, and dependency-cruiser exits non-zero when asked to read a
// directory that does not exist. It skips loudly rather than passing silently,
// and starts enforcing the moment src/ lands.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
// Root is overridable so the fixtures in test/ can check the ruleset against
// trees that deliberately cross a boundary. The ruleset itself is always this
// repository's, which is the thing under test.
const root = process.argv[2] ?? repo;
const config = join(repo, ".dependency-cruiser.cjs");
const targets = ["src"].filter((d) => existsSync(join(root, d)));

if (targets.length === 0) {
  console.log(
    "boundary lint: SKIPPED: src/ does not exist yet. " +
      "The ruleset in .dependency-cruiser.cjs takes effect with the first module.",
  );
  process.exit(0);
}

// The local binary by absolute path, never `npx`: with a cwd outside this
// repository npx resolves the name from the registry instead of node_modules.
const bin = join(repo, "node_modules", ".bin", "depcruise");
const r = spawnSync(bin, [...targets, "--config", config], {
  cwd: root,
  stdio: "inherit",
});
// stdio is inherited, so a spawn failure prints nothing of its own: without
// this the operator sees a bare non-zero exit on a fresh or pruned install.
if (r.error) {
  console.error(`boundary lint: could not run ${bin}: ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
