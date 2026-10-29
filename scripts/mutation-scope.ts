// Whether a push to main changes anything the mutation gate reads.
//
// A release changes CHANGELOG.md, the release manifest and the version in
// package.json and package-lock.json; a docs change changes documents.
// Neither changes a module, a test, or anything that decides how they run, so
// the last report stands, and running it again only spends the minutes. The
// `mutation-scope` job in .github/workflows/ci.yml asks this before any shard
// starts, and only for a push to main: a pull request runs no mutation, and
// the nightly run always runs.
//
// A library first: tests call reaches() and run() in-process. The command is
// `node scripts/mutation-scope.ts <base>`, which compares <base> with HEAD and
// prints `true` or `false`, saying why on stderr.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** Every directory whose contents the gate reads. */
const DIRECTORIES = ["src/", "test/", ".github/actions/setup/"];

/** Every file outside them that decides what the gate does or how. */
const FILES = new Set([
  "stryker.config.json",
  "vitest.mutation.config.ts",
  "tsconfig.json",
  ".nvmrc",
  ".github/workflows/ci.yml",
  "scripts/mutation-shard.ts",
  "scripts/mutation-baseline.ts",
  "scripts/mutation-merge.ts",
  "scripts/mutation-scope.ts",
  "scripts/lib/mutation-report.ts",
  "scripts/lib/entrypoint.ts",
]);

/** The files a release changes only the version of, and that hold every dependency. */
const VERSIONED = new Set(["package.json", "package-lock.json"]);

/** A file's text at the base and at HEAD; undefined where it does not exist. */
export interface Versions {
  readonly before: string | undefined;
  readonly after: string | undefined;
}

/** `text` with its own version removed, or undefined when it is no JSON at all. */
function unversioned(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  try {
    const {
      version: _version,
      packages,
      ...rest
    } = JSON.parse(text) as {
      readonly version?: unknown;
      readonly packages?: Readonly<
        Record<string, Readonly<Record<string, unknown>>>
      >;
    };
    if (packages === undefined) return JSON.stringify(rest);
    const { "": own = {}, ...others } = packages;
    const { version: _own, ...root } = own;
    return JSON.stringify({ ...rest, packages: { "": root, ...others } });
  } catch {
    return undefined;
  }
}

/**
 * The first of `paths` that reaches the gate, or undefined when none does.
 * `read` gives a versioned file's text on both sides, for a release changes
 * the version and nothing else.
 */
export function reaches(
  paths: readonly string[],
  read: (path: string) => Versions,
): string | undefined {
  return paths.find((path) => {
    if (FILES.has(path) || DIRECTORIES.some((dir) => path.startsWith(dir)))
      return true;
    if (!VERSIONED.has(path)) return false;
    const { before, after } = read(path);
    const was = unversioned(before);
    return was === undefined || was !== unversioned(after);
  });
}

/** What the command prints, and the code it exits with. */
export interface Outcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function run(argv: readonly string[], root: string): Outcome {
  const [base] = argv;
  if (argv.length !== 1 || base === undefined)
    return {
      code: 2,
      stdout: "",
      stderr: "usage: node scripts/mutation-scope.ts <base>\n",
    };
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const show = (revision: string, path: string): string | undefined => {
    try {
      return execFileSync("git", ["show", `${revision}:${path}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return undefined;
    }
  };
  // Without renames, a file moved out of src/ is its old path as well.
  const changed = git("diff", "--name-only", "--no-renames", base, "HEAD")
    .split("\n")
    .filter((path) => path !== "");
  const path = reaches(changed, (file) => ({
    before: show(base, file),
    after: show("HEAD", file),
  }));
  return path === undefined
    ? {
        code: 0,
        stdout: "false\n",
        stderr:
          "Nothing the mutation gate reads changed: main's result stands.\n",
      }
    : {
        code: 0,
        stdout: "true\n",
        stderr: `${path} changed, so the mutation gate runs.\n`,
      };
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  const { code, stdout, stderr } = run(process.argv.slice(2), REPOSITORY);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
