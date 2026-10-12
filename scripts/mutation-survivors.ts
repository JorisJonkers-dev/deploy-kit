// What the weekly full mutation run found.
//
// A pull request re-tests only the mutants its own change reaches
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

/** The part of Stryker's JSON report this reads. */
interface Report {
  readonly files: Readonly<
    Record<
      string,
      {
        readonly mutants: readonly {
          readonly status: string;
          readonly mutatorName: string;
          readonly location: {
            readonly start: { readonly line: number; readonly column: number };
          };
        }[];
      }
    >
  >;
}

/** The statuses that lower a mutation score, and how the issue words each. */
const UNDETECTED: Readonly<Record<string, string>> = {
  Survived: "survived",
  NoCoverage: "no test covers it",
};

interface Survivor {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly mutator: string;
  readonly outcome: string;
}

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
  const survivors: Survivor[] = found
    .flatMap((path) =>
      Object.entries(
        (JSON.parse(readFileSync(join(directory, path), "utf8")) as Report)
          .files,
      ),
    )
    .flatMap(([file, { mutants }]) =>
      mutants.flatMap(({ status, mutatorName, location }) => {
        const outcome = UNDETECTED[status];
        return outcome === undefined
          ? []
          : [{ file, ...location.start, mutator: mutatorName, outcome }];
      }),
    )
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
    );
  if (survivors.length === 0) return { code: 0, stdout: "", stderr: "" };
  const count = String(survivors.length);
  const lines = [
    `The weekly full mutation run left ${count} mutant${survivors.length === 1 ? "" : "s"} undetected.`,
    "A pull request re-tests only the mutants its own change reaches, so no gate saw these.",
    "",
    ...survivors.map(
      ({ file, line, column, mutator, outcome }) =>
        `- \`${file}:${String(line)}:${String(column)}\` ${mutator}: ${outcome}`,
    ),
  ];
  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  const { code, stdout, stderr } = run(process.argv.slice(2));
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
