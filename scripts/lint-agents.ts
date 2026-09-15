// The AGENTS.md script-list contract: every npm script package.json defines
// is named there verbatim, so a script that lands without a matching line
// fails here instead of going undocumented until a reader trips over it.
//
// lint-docs.ts already checks the opposite direction: that a script README.md
// or CONTRIBUTING.md *claims* to exist really does. This gate starts from the
// other end, package.json's real script list, and asks whether AGENTS.md
// names each one. Per issue #32: "A test fails when package.json gains a
// script that AGENTS.md does not list."
//
// A library first, like the other gates: tests call lintAgents() in-process,
// and `node scripts/lint-agents.ts [root]` is the command.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const DOCUMENT = "AGENTS.md";

export interface AgentsLintResult {
  readonly scripts: number;
  readonly errors: readonly string[];
}

function packageScripts(root: string): Readonly<Record<string, string>> {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts ?? {};
}

/**
 * Whether `document` names `script` verbatim: as `npm run <script>` (or
 * bare `npm test`, for the one script npm itself runs without `run`), or as
 * its own backtick-quoted token. Both forms are word-bounded, so `lint`
 * appearing only as a substring of `lint:adrs` does not read as proof that
 * `lint` itself was ever named.
 */
export function namesScript(document: string, script: string): boolean {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (script === "test" && /\bnpm test\b/.test(document)) return true;
  return (
    new RegExp(`npm run ${escaped}(?![\\w:-])`).test(document) ||
    new RegExp(`\`${escaped}\``).test(document)
  );
}

/**
 * Check that `root`'s AGENTS.md names every script its package.json defines.
 * A repository with no scripts has nothing to check; a repository with
 * scripts but no AGENTS.md fails every one of them, since an absent document
 * documents nothing.
 */
export function lintAgents(root: string): AgentsLintResult {
  const scripts = Object.keys(packageScripts(root));

  let document: string | null;
  try {
    document = readFileSync(join(root, DOCUMENT), "utf8");
  } catch {
    document = null;
  }

  const errors = scripts
    .filter((script) => document === null || !namesScript(document, script))
    .map((script) =>
      document === null
        ? `${DOCUMENT}: does not exist, so script '${script}' is undocumented`
        : `${DOCUMENT}: package.json defines script '${script}', which does not appear in ${DOCUMENT}`,
    );

  return { scripts: scripts.length, errors };
}

/** Lint the tree named by argv[0], or this repository, and say what was found. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const { scripts, errors } = lintAgents(argv[0] ?? REPOSITORY);
  if (errors.length > 0) {
    output.err(
      `agents lint: ${errors.length} error(s)\n` +
        errors.map((e) => `  - ${e}\n`).join(""),
    );
    return 1;
  }
  output.out(`agents lint: ${scripts} script(s) all named in ${DOCUMENT}\n`);
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
