// What the weekly full mutation run found.
//
// A push to main re-tests only the mutants its own change reaches
// (docs/adr/architecture/0063-coverage-and-mutation-are-ratchets.md), so the
// full run is the check on that shortcut. Every shard of it writes Stryker's
// JSON report; this reads them all and prints the mutants no test detected,
// as the body of the issue the workflow opens. It prints nothing when every
// mutant was detected.
//
// A library first: tests call run() in-process. The command is
// `node scripts/mutation-survivors.ts <directory>`, the directory holding one
// downloaded report per shard.
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { listed, undetected, type Report } from "./lib/mutation-report.ts";

/** What the command prints, and the code it exits with. */
export interface Outcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function run(argv: readonly string[]): Outcome {
  const [directory] = argv;
  if (argv.length !== 1 || directory === undefined)
    return {
      code: 2,
      stdout: "",
      stderr: "usage: node scripts/mutation-survivors.ts <directory>\n",
    };
  const found = globSync("**/mutation.json", { cwd: directory });
  if (found.length === 0)
    return {
      code: 1,
      stdout: "",
      stderr: `no mutation.json under ${directory}: a run with no report proves nothing\n`,
    };
  const survivors = undetected(
    found.map(
      (path) =>
        (JSON.parse(readFileSync(join(directory, path), "utf8")) as Report)
          .files,
    ),
  );
  if (survivors.length === 0) return { code: 0, stdout: "", stderr: "" };
  const count = String(survivors.length);
  const lines = [
    `The weekly full mutation run left ${count} mutant${survivors.length === 1 ? "" : "s"} undetected.`,
    "A push to main re-tests only the mutants its own change reaches, so no gate saw these.",
    "",
    ...survivors.map(listed),
  ];
  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  const { code, stdout, stderr } = run(process.argv.slice(2));
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
