// RULE-044 (docs/architecture-rules.md): the CLI's conventions, held at the
// process seam. Help on `--help` and `-h`; data on stdout and diagnostics on
// stderr; only data under `--json`; every exit status one of one enum; no
// colour, so `NO_COLOR` is honoured by having nothing to turn off; and never a
// prompt, so a run with its stdin left open still ends. Each clause is checked
// against what a run printed, by `breaches`, so the same check that holds the
// real command is shown to fire on a probe that breaks every clause.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/cli/main.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");

/** What one run of a command showed from outside. */
interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Whether it was still running, stdin open, when the clock ran out. */
  readonly hung: boolean;
}

type Runner = (argv: readonly string[]) => Promise<Run>;

/** How long a run may take before it counts as waiting for input. */
const PATIENCE = 20_000;

/** The real command, run with `NO_COLOR` set and its stdin open and never written. */
const deployKit: Runner = (argv) =>
  new Promise((resolve) => {
    // Node ends a child still running at `timeout`, and its stdin is a pipe
    // nothing writes to or closes: a prompt would be ended, not answered.
    const child = spawn(
      process.execPath,
      [join(REPOSITORY, "src/cli/index.ts"), ...argv],
      {
        cwd: REPOSITORY,
        env: { ...process.env, NO_COLOR: "1" },
        timeout: PATIENCE,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (status, signal) => {
      resolve({ status, stdout, stderr, hung: signal !== null });
    });
  });

const REFUSED_SET = "spec/v1/examples/platform/platform.intent.yml";
const ACCEPTED_SET = "spec/v1/examples/minimal/notes.project.yml";
const STATUSES: readonly number[] = Object.values(EXIT);
// The escape every terminal colour starts with.
const COLOUR = "\u001b[";

const isJsonArray = (text: string): boolean => {
  try {
    return Array.isArray(JSON.parse(text));
  } catch {
    return false;
  }
};

/** Every clause of RULE-044 a command breaks, by what it printed. */
async function breaches(run: Runner): Promise<string[]> {
  const found: string[] = [];
  const runs = new Map<string, Run>();
  const once = async (...argv: string[]): Promise<Run> => {
    const key = argv.join(" ");
    const held = runs.get(key) ?? (await run(argv));
    runs.set(key, held);
    return held;
  };

  for (const flag of ["--help", "-h"]) {
    const help = await once(flag);
    if (
      help.status !== EXIT.accepted ||
      !help.stdout.startsWith("usage:") ||
      help.stderr !== ""
    )
      found.push(`${flag} prints no help on stdout`);
  }

  const human = await once("validate", REFUSED_SET);
  if (human.stdout !== "" || human.stderr === "")
    found.push("a refusal for a human is not on stderr alone");

  for (const set of [REFUSED_SET, ACCEPTED_SET]) {
    const json = await once("validate", set, "--json");
    if (!isJsonArray(json.stdout))
      found.push(`--json writes something that is not data for ${set}`);
    if (json.status === EXIT.refused && json.stderr !== "")
      found.push("--json writes the diagnostics to stderr");
  }

  const wrong = await once("bogus");
  if (wrong.status !== EXIT.usage || wrong.stdout !== "")
    found.push("a wrong call is not a usage error on stderr");

  const all = [...runs.values()];
  if (all.some(({ status }) => status !== null && !STATUSES.includes(status)))
    found.push("an exit status outside the enum");
  if (all.some(({ stdout, stderr }) => `${stdout}${stderr}`.includes(COLOUR)))
    found.push("colour under NO_COLOR");
  if (all.some(({ hung }) => hung)) found.push("a run waits for input");
  return found;
}

describe("the CLI's conventions", () => {
  it(
    "holds every one in the real command",
    async () => {
      expect(await breaches(deployKit)).toStrictEqual([]);
    },
    PATIENCE * 2,
  );

  it("RULE-044 refuses a CLI that breaks its conventions", async () => {
    // A probe that breaks every clause: help on stderr, diagnostics on stdout,
    // prose under --json, a status no enum names, colour, and a wait for input.
    const probe: Runner = (argv) =>
      Promise.resolve(
        argv.includes("--help") || argv.includes("-h")
          ? { status: 0, stdout: "", stderr: "usage:\n", hung: false }
          : argv.includes("bogus")
            ? { status: 64, stdout: "", stderr: "?\n", hung: false }
            : argv.includes("--json")
              ? {
                  status: EXIT.refused,
                  stdout: "\u001b[31mrefused\u001b[0m\n",
                  stderr: "E_X\n",
                  hung: false,
                }
              : { status: null, stdout: "E_X\n", stderr: "", hung: true },
      );

    expect(await breaches(probe)).toStrictEqual([
      "--help prints no help on stdout",
      "-h prints no help on stdout",
      "a refusal for a human is not on stderr alone",
      `--json writes something that is not data for ${REFUSED_SET}`,
      "--json writes the diagnostics to stderr",
      `--json writes something that is not data for ${ACCEPTED_SET}`,
      "--json writes the diagnostics to stderr",
      "a wrong call is not a usage error on stderr",
      "an exit status outside the enum",
      "colour under NO_COLOR",
      "a run waits for input",
    ]);
  });
});
