// Relative links and heading anchors across every tracked Markdown file.
//
// The ADR lint checks links inside the decision set and the register. Nothing
// checked the rest, and the ADR domain move rewrote about a hundred references
// in spec/v1, CONTEXT.md, README.md, docs/architecture.md and two CI comments,
// every one of which could have broken with lint:adrs, typecheck and the tests
// all green. This closes that.
//
// External URLs are not fetched: this checks what this repository owns. A
// library first, like the other gates: tests call lintLinks() in-process, and
// `node scripts/lint-links.ts [root]` is the command.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { slug } from "./lib/markdown.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

/** What one run found: how many Markdown files it read, and every broken link. */
export interface LinkLintResult {
  readonly files: number;
  readonly errors: readonly string[];
}

const REPOSITORY = join(import.meta.dirname, "..");

/** Check every link in the tracked Markdown of the repository at `root`. */
export function lintLinks(root: string): LinkLintResult {
  const errors: string[] = [];

  // Tracked Markdown, so a scratch file in the tree cannot fail the build.
  const tracked = execFileSync("git", ["ls-files", "-z", "*.md"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file !== "");

  const anchorCache = new Map<string, Set<string>>();
  const anchorsOf = (path: string, text: string): Set<string> => {
    const cached = anchorCache.get(path);
    if (cached) return cached;
    const anchors = new Set<string>();
    for (const line of text.split("\n")) {
      if (/^#{1,6} /.test(line)) anchors.add(slug(line.replace(/^#+ /, "")));
      // An explicit anchor, as the gap list uses: <a id="g-27"></a>
      for (const explicit of line.matchAll(/<a\s+id="([^"]+)"/g))
        anchors.add(explicit[1] ?? "");
    }
    anchorCache.set(path, anchors);
    return anchors;
  };

  for (const file of tracked) {
    // Fenced blocks are stripped: a link inside an example is illustration.
    const prose = readFileSync(join(root, file), "utf8").replace(
      /^```[\s\S]*?^```/gm,
      "",
    );

    for (const link of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = link[1] ?? "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // an absolute URL or mailto

      const [targetPath = "", anchor] = href.split("#");
      const target = targetPath
        ? resolve(join(root, dirname(file)), targetPath)
        : join(root, file);

      // The read is the check: asking whether the target exists and reading it
      // afterwards is a race, and the error says which of the two cases it is.
      let text: string;
      try {
        text = readFileSync(target, "utf8");
      } catch (error) {
        // A directory is a legitimate link target, and carries no anchors.
        if ((error as NodeJS.ErrnoException).code === "EISDIR") continue;
        // Anything else is a link the reader cannot follow either.
        errors.push(`${file}: link to missing ${href}`);
        continue;
      }
      if (!anchor) continue;
      if (!anchorsOf(target, text).has(anchor))
        errors.push(
          `${file}: anchor #${anchor} not found in ${relative(root, target)}`,
        );
    }
  }

  return { files: tracked.length, errors };
}

/** Lint the repository named by argv[0], or this one, and say what was found. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const { files, errors } = lintLinks(argv[0] ?? REPOSITORY);
  if (errors.length > 0) {
    output.err(
      `link lint: ${errors.length} error(s)\n` +
        errors.map((e) => `  - ${e}\n`).join(""),
    );
    return 1;
  }
  output.out(`link lint: ${files} files clean\n`);
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
