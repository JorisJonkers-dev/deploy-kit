// The npm package contents gate.
//
// The decision (docs/adr/README.md) is that until the compiler exists, the
// package ships `docs/adr` and `spec` only. `files` in package.json is meant
// to say that, but `files` is advisory, not enforced: npm always bundles
// package.json, README and LICENSE regardless of it, and a typo or a stray
// glob widening `files` would ship silently. Nothing short of asking npm what
// it would actually pack proves the boundary holds.
//
// A library first: tests call checkPackageContents() in-process against a
// fixture package, and `node scripts/check-package-contents.ts [root]` is the
// command, which asks the real npm in `root` (this repository, by default).
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

const REPOSITORY = join(import.meta.dirname, "..");

// The two trees the decision names, and the files npm always bundles
// regardless of `files` (package.json, README, LICENSE, the main field; this
// repository has no main field, so it is absent from the list npm reports).
const ALLOWED_PREFIXES = ["docs/adr/", "spec/"];
const ALWAYS_INCLUDED = ["package.json", "README.md", "LICENSE"];

/** True when `path`, a path `npm pack` reports, is inside the declared boundary. */
export function isAllowed(path: string): boolean {
  return (
    ALWAYS_INCLUDED.includes(path) ||
    ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

/** Every packed path that falls outside the declared boundary, sorted. */
export function violations(files: readonly string[]): string[] {
  return files.filter((file) => !isAllowed(file)).sort();
}

/**
 * Ask the `npm` on PATH what `npm pack` would ship from `cwd`, as the paths it
 * reports. Throws when npm cannot run, or refuses the package, since neither
 * leaves a file list to check.
 */
export function packedFiles(cwd: string): string[] {
  const run = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd,
    encoding: "utf8",
  });
  if (run.error) throw new Error(`could not run npm: ${run.error.message}`);
  if (run.status !== 0)
    throw new Error(`npm pack --dry-run failed: ${run.stderr.trim()}`);
  const parsed = JSON.parse(run.stdout) as { files: { path: string }[] }[];
  return (parsed[0]?.files ?? []).map((entry) => entry.path);
}

/** Check the package `npm pack` would build from `root`. */
export function checkPackageContents(root: string, output: GateOutput): number {
  let files: string[];
  try {
    files = packedFiles(root);
  } catch (error) {
    output.err(`package contents: ${(error as Error).message}\n`);
    return 1;
  }

  const offenders = violations(files);
  if (offenders.length > 0) {
    output.err(
      "package contents: npm pack would ship files outside docs/adr/ and " +
        `spec/: ${offenders.join(", ")}\n`,
    );
    return 1;
  }
  output.out(
    `package contents: ${files.length} files, all inside docs/adr/ and spec/\n`,
  );
  return 0;
}

/** Check the tree named by argv[0], or this repository. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  return checkPackageContents(argv[0] ?? REPOSITORY, output);
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
