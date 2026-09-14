// The pipeline's job list must track the repository's own gates. An npm
// script with no workflow behind it is a gate nobody wired; a workflow that
// calls a script that no longer exists is a job whose step was never updated
// when the script moved or was renamed. Per
// docs/adr/architecture/0102-the-gate-grows-with-the-code.md, a new gate's
// script and its CI job land in the same pull request, and this is the test
// that makes drift between the two visible instead of silent.
//
// REQ-010 (docs/requirements.md): a gate's npm script and the CI job that
// runs it land together.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY = join(import.meta.dirname, "..");

interface Pending {
  readonly script: string;
  readonly reason: string;
  readonly ticket: string;
}

// A script that runs in no workflow is normally a gate the wiring forgot.
// These four are deliberate exceptions, not gates: two mutate the working
// tree, which no CI step may do, one is the fast local loop the coverage
// variant supersedes in every workflow, and one is the local aggregate of
// every gate below, kept so a contributor can run the whole set in one
// command. None will ever gain a workflow step of its own, which is what the
// ticket field says for each.
const PENDING: readonly Pending[] = [
  {
    script: "lint:fix",
    reason: "eslint --fix mutates the tree; a developer command, not a gate",
    ticket: "n/a, never run in CI by design",
  },
  {
    script: "format",
    reason:
      "prettier --write mutates the tree; a developer command, not a gate",
    ticket: "n/a, never run in CI by design",
  },
  {
    script: "test",
    reason: "the fast local loop without coverage; CI runs test:coverage",
    ticket: "n/a, never run in CI by design",
  },
  {
    script: "verify",
    reason:
      "the local aggregate of every gate below; CI runs each gate as its " +
      "own job rather than the chain",
    ticket: "n/a, never run in CI by design",
  },
];

function packageScripts(): Record<string, string> {
  const pkg = JSON.parse(
    readFileSync(join(REPOSITORY, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  return pkg.scripts;
}

function workflows(): { name: string; text: string }[] {
  const dir = join(REPOSITORY, ".github", "workflows");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml"))
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
}

/** Whether `text` (a workflow file) runs the npm script named `script`. */
function runsScript(text: string, script: string): boolean {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`npm run ${escaped}(?![\\w:-])`).test(text);
}

describe("npm script wiring", () => {
  const scripts = packageScripts();
  const files = workflows();
  const wholeText = files.map((file) => file.text).join("\n");

  it("has scripts to check, so a clean result is not proving nothing", () => {
    expect(Object.keys(scripts).length).toBeGreaterThan(5);
  });

  it("every pending script names a reason and a ticket, so the list is not empty by omission", () => {
    for (const pending of PENDING) {
      expect(scripts, pending.script).toHaveProperty(pending.script);
      expect(pending.reason.length, pending.script).toBeGreaterThan(0);
      expect(pending.ticket.length, pending.script).toBeGreaterThan(0);
    }
  });

  it("every script either runs in some workflow, or is listed pending with a reason", () => {
    const pendingNames = new Set(PENDING.map((pending) => pending.script));
    const unwired = Object.keys(scripts).filter(
      (name) => !pendingNames.has(name) && !runsScript(wholeText, name),
    );
    expect(unwired).toStrictEqual([]);
  });

  it("no workflow calls an npm script package.json does not define", () => {
    for (const { name, text } of files)
      for (const match of text.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
        const script = match[1] ?? "";
        expect(scripts, `${name} calls npm run ${script}`).toHaveProperty(
          script,
        );
      }
  });

  it("every gate script a workflow invokes directly with node exists on disk", () => {
    const invoked = new Set<string>();
    for (const { text } of files)
      for (const match of text.matchAll(/node scripts\/([\w.-]+\.ts)/g))
        if (match[1]) invoked.add(match[1]);

    // A tautology check: this is what would fail if a direct `node
    // scripts/...` call were ever removed from every workflow without anyone
    // noticing, since an empty set trivially satisfies the loop below.
    expect(invoked.size).toBeGreaterThan(0);

    for (const file of invoked)
      expect(
        () => readFileSync(join(REPOSITORY, "scripts", file)),
        file,
      ).not.toThrow();
  });
});
