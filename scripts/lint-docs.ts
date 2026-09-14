// Docs contract: holds README.md and CONTRIBUTING.md to the repository they
// describe. Prose goes stale silently, and each of the four claims below
// reads exactly as well wrong as right: a renamed script, a coverage
// threshold that moved, a pinned Node version that changed, a path that no
// longer exists.
//
// The link lint (lint-links.ts) already proves that a Markdown link and its
// heading anchor resolve. This gate covers what that one cannot see: names,
// numbers and versions, most of which are never inside a link at all.
//
// A library first: tests call lintDocs() in-process against fixture trees,
// and `node scripts/lint-docs.ts [root]` is the command.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

const REPOSITORY = join(import.meta.dirname, "..");

// The documents this gate holds to the repository. Any other file that
// quotes a script, a number or a path is somebody else's problem.
const DOCUMENTS = ["README.md", "CONTRIBUTING.md"] as const;

const COVERAGE_METRICS = [
  "statements",
  "branches",
  "functions",
  "lines",
] as const;
type CoverageMetric = (typeof COVERAGE_METRICS)[number];

export type ClaimKind = "script" | "number" | "version" | "path";

/** How many claims of each kind the documents made, across both files. */
export type ClaimCounts = Readonly<Record<ClaimKind, number>>;

export interface DocsLintResult {
  readonly claims: number;
  readonly byKind: ClaimCounts;
  readonly errors: readonly string[];
}

/** Every `npm run <script>` and bare `npm test` a document names, deduplicated. */
export function scriptClaims(text: string): readonly string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g))
    found.add(match[1] ?? "");
  if (/\bnpm test\b/.test(text)) found.add("test");
  return [...found];
}

/**
 * Whether a backtick-quoted span reads as a file or directory reference
 * worth checking, rather than a command, a YAML field, or a bare word like a
 * package name. It must be a single token of path characters, and it must
 * carry a `/` or a `.`: `deploy-config-schema` is a repository name, not a
 * path, and this is what tells the two apart without a hand-kept list.
 */
export function isPathLike(candidate: string): boolean {
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/?$/.test(candidate))
    return false;
  return candidate.includes("/") || candidate.includes(".");
}

/**
 * Every backtick-quoted path a document names, deduplicated. A fenced code
 * block is stripped first: its triple backticks are not a pair, and reading
 * them as one would pair each one with a wrong partner for the rest of the
 * file, the same hazard lint-links.ts strips prose for before it reads links.
 */
export function pathClaims(text: string): readonly string[] {
  const prose = text.replace(/^```[\s\S]*?^```/gm, "");
  const found = new Set<string>();
  for (const match of prose.matchAll(/`([^`]+)`/g)) {
    const candidate = match[1] ?? "";
    if (isPathLike(candidate)) found.add(candidate);
  }
  return [...found];
}

/** Every coverage percentage a document quotes, one entry per metric named. */
export function coverageClaims(
  text: string,
): readonly { readonly metric: CoverageMetric; readonly value: number }[] {
  const claims: { metric: CoverageMetric; value: number }[] = [];
  for (const metric of COVERAGE_METRICS) {
    const match = new RegExp(`\\b${metric}\\s+([\\d.]+)%`, "i").exec(text);
    const value = match?.[1];
    if (value !== undefined) claims.push({ metric, value: Number(value) });
  }
  return claims;
}

/** Every `Node <semver>` a document names, deduplicated. */
export function nodeVersionClaims(text: string): readonly string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\bNode\s+v?(\d+\.\d+\.\d+)\b/g))
    found.add(match[1] ?? "");
  return [...found];
}

function packageScripts(root: string): Readonly<Record<string, string>> {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts ?? {};
}

/** The coverage ratchet in `vitest.config.ts`, parsed from its source text. */
function coverageThresholds(
  root: string,
): Readonly<Partial<Record<CoverageMetric, number>>> {
  const text = readFileSync(join(root, "vitest.config.ts"), "utf8");
  const block = /thresholds:\s*{([^}]*)}/s.exec(text)?.[1] ?? "";
  const thresholds: Partial<Record<CoverageMetric, number>> = {};
  for (const metric of COVERAGE_METRICS) {
    const value = new RegExp(`\\b${metric}:\\s*([\\d.]+)`).exec(block)?.[1];
    if (value !== undefined) thresholds[metric] = Number(value);
  }
  return thresholds;
}

function nvmrcVersion(root: string): string {
  return readFileSync(join(root, ".nvmrc"), "utf8").trim();
}

/**
 * Check every claim README.md and CONTRIBUTING.md make about `root`'s own
 * repository: every script exists, every path exists, every quoted coverage
 * number matches the ratchet, every quoted Node version matches `.nvmrc`.
 */
export function lintDocs(root: string): DocsLintResult {
  const errors: string[] = [];
  const byKind: Record<ClaimKind, number> = {
    script: 0,
    number: 0,
    version: 0,
    path: 0,
  };

  const scripts = packageScripts(root);
  const thresholds = coverageThresholds(root);
  const nvmrc = nvmrcVersion(root);

  for (const document of DOCUMENTS) {
    let text: string;
    try {
      text = readFileSync(join(root, document), "utf8");
    } catch {
      // Neither document is required to exist for this gate to run; a
      // repository missing one of them fails elsewhere.
      continue;
    }

    for (const script of scriptClaims(text)) {
      byKind.script += 1;
      if (!(script in scripts))
        errors.push(
          `${document}: names \`npm run ${script}\`, which is not a script in package.json`,
        );
    }

    for (const path of pathClaims(text)) {
      byKind.path += 1;
      if (!existsSync(join(root, path)))
        errors.push(`${document}: names \`${path}\`, which does not exist`);
    }

    for (const { metric, value } of coverageClaims(text)) {
      byKind.number += 1;
      const configured = thresholds[metric];
      if (configured === undefined)
        errors.push(
          `${document}: quotes ${metric} coverage as ${value}%, but ` +
            "vitest.config.ts sets no such threshold",
        );
      else if (configured !== value)
        errors.push(
          `${document}: quotes ${metric} coverage as ${value}%, but ` +
            `vitest.config.ts sets it to ${configured}%`,
        );
    }

    for (const version of nodeVersionClaims(text)) {
      byKind.version += 1;
      if (version !== nvmrc)
        errors.push(
          `${document}: names Node ${version}, but .nvmrc pins ${nvmrc}`,
        );
    }
  }

  const claims = byKind.script + byKind.number + byKind.version + byKind.path;
  return { claims, byKind, errors };
}

/** Lint the tree named by argv[0], or this repository, and say what was found. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const { claims, byKind, errors } = lintDocs(argv[0] ?? REPOSITORY);
  if (errors.length > 0) {
    output.err(
      `docs lint: ${errors.length} error(s)\n` +
        errors.map((e) => `  - ${e}\n`).join(""),
    );
    return 1;
  }
  output.out(
    `docs lint: ${claims} claim(s) clean ` +
      `(scripts ${byKind.script}, numbers ${byKind.number}, ` +
      `versions ${byKind.version}, paths ${byKind.path})\n`,
  );
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
