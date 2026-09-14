// No em-dashes may enter the repository.
//
// Both rewrite batches landed: #26 (specification) and #27 (decision records,
// registers, root documents and tooling) rewrote every existing em-dash, so the
// transitional allow list is gone and this is a flat ban. The failure message
// says what to use instead.
//
// Two trees are never scanned: `docs/mde/`, which holds third-party papers,
// lecture material and coursework kept verbatim, and `CHANGELOG.md`, which
// release-please writes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");
// Built from its code point, so this file does not carry the character it bans.
const EM_DASH = String.fromCharCode(0x2014);

const EXCLUDE = ["CHANGELOG.md"];
const EXCLUDE_PREFIXES = ["docs/mde/"];

function isExcluded(rel: string): boolean {
  return (
    EXCLUDE.includes(rel) ||
    EXCLUDE_PREFIXES.some((prefix) => rel.startsWith(prefix))
  );
}

/**
 * Pure scan over a {rel: content} map, so the mechanism is testable against
 * synthetic trees exactly the way link-contract.test.ts does. Returns the
 * offenders, each naming the file and what to write instead.
 */
function offendersIn(files: Readonly<Record<string, string>>): string[] {
  const offenders: string[] = [];
  for (const rel of Object.keys(files).sort()) {
    if (isExcluded(rel)) continue;
    if ((files[rel] ?? "").includes(EM_DASH))
      offenders.push(
        `${rel} contains an em-dash (${EM_DASH}); use a comma, a colon, a full stop or parentheses instead`,
      );
  }
  return offenders;
}

/** Every tracked file outside the exclusions, as {rel: content}. */
function trackedText(): Record<string, string> {
  const files: Record<string, string> = {};
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((rel) => rel !== "" && !isExcluded(rel));
  for (const rel of tracked) {
    try {
      files[rel] = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      // A path that cannot be read as a file is not prose.
    }
  }
  return files;
}

test("no em-dash in tracked text outside the exclusions", () => {
  expect(offendersIn(trackedText())).toStrictEqual([]);
});

test("an em-dash fails and names the file and what to use instead", () => {
  expect(
    offendersIn({
      "a.md": "fine\n",
      "b.md": `uses an em dash${EM_DASH}here\n`,
    }),
  ).toStrictEqual([
    `b.md contains an em-dash (${EM_DASH}); use a comma, a colon, a full stop or parentheses instead`,
  ]);
});

test("docs/mde and CHANGELOG.md are never scanned", () => {
  expect(
    offendersIn({
      "docs/mde/lecture/notes.md": `third-party${EM_DASH}verbatim\n`,
      "CHANGELOG.md": `release please${EM_DASH}owns this\n`,
    }),
  ).toStrictEqual([]);
});
