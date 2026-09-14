// The tracked tree, as text, and the dangling-citation scan over it.
//
// Two ledgers cite ids into the tree: docs/requirements.md (REQ-NNN) and
// docs/architecture-rules.md (RULE-NNN). Both need the same two things: every
// tracked file's text, and every id cited somewhere that no row declares. The
// scan is pure over a {path: content} map, so each gate's negative fixtures
// test it against a synthetic tree with no filesystem involved.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Every tracked file's text, keyed by its path relative to `root`. */
export function trackedText(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  }).split("\0");
  for (const rel of tracked) {
    if (rel === "") continue;
    try {
      files[rel] = readFileSync(join(root, rel), "utf8");
    } catch {
      // A path that cannot be read as text (a symlink to nowhere, a
      // directory entry) carries no citation either way.
    }
  }
  return files;
}

/**
 * Every id matching `pattern` that a file cites and no row declares, reported
 * once per file rather than once per occurrence, in path order.
 */
export function danglingCitations(
  files: Readonly<Record<string, string>>,
  ids: ReadonlySet<string>,
  pattern: RegExp,
): string[] {
  const errors: string[] = [];
  const reported = new Set<string>();
  // Object keys are unique paths, so two entries are never equal: a strict
  // less-than is enough to order them, with no equal case to fall through to.
  const entries = Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [rel, content] of entries) {
    for (const match of content.matchAll(pattern)) {
      const id = match[0];
      const key = `${rel}\0${id}`;
      if (ids.has(id) || reported.has(key)) continue;
      reported.add(key);
      errors.push(`${rel} cites ${id}, which no row carries`);
    }
  }
  return errors;
}
