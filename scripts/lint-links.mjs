#!/usr/bin/env node
// Relative links and heading anchors across every tracked Markdown file.
//
// The ADR lint checks links inside the decision set and the register. Nothing
// checked the rest, and the ADR domain move rewrote about a hundred references
// in spec/v1, CONTEXT.md, README.md, docs/architecture.md and two CI comments
// — every one of which could have broken with lint:adrs, typecheck and the
// tests all green. This closes that.
//
// External URLs are not fetched: this checks what this repository owns.
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root =
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

/** Tracked Markdown, so a scratch file in the tree cannot fail the build. */
const tracked = execFileSync("git", ["ls-files", "-z", "*.md"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

/** GitHub-style heading anchor slug, matching scripts/lint-adrs.mjs. */
const slug = (h) =>
  h
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .trim()
    .replace(/ /g, "-");

const anchorCache = new Map();
const anchorsOf = (path) => {
  if (!anchorCache.has(path)) {
    const set = new Set();
    if (existsSync(path) && statSync(path).isFile()) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        if (/^#{1,6} /.test(line)) set.add(slug(line.replace(/^#+ /, "")));
        // An explicit anchor, as the gap list uses: <a id="g-27"></a>
        for (const a of line.matchAll(/<a\s+id="([^"]+)"/g)) set.add(a[1]);
      }
    }
    anchorCache.set(path, set);
  }
  return anchorCache.get(path);
};

for (const file of tracked) {
  const text = readFileSync(join(root, file), "utf8");
  // Strip fenced blocks: a link inside an example is illustration, not a link.
  const prose = text.replace(/^```[\s\S]*?^```/gm, "");

  for (const link of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = link[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // absolute URL or mailto

    const [targetPath, anchor] = href.split("#");
    const target = targetPath
      ? resolve(join(root, dirname(file)), targetPath)
      : join(root, file);

    if (!existsSync(target)) {
      errors.push(`${file}: link to missing ${href}`);
      continue;
    }
    if (!anchor || !statSync(target).isFile()) continue;
    if (!anchorsOf(target).has(anchor))
      errors.push(
        `${file}: anchor #${anchor} not found in ${relative(root, target)}`,
      );
  }
}

if (errors.length) {
  console.error(
    `link lint: ${errors.length} error(s)\n` +
      errors.map((e) => "  - " + e).join("\n"),
  );
  process.exit(1);
}
console.log(`link lint: ${tracked.length} files clean`);
