// Which bucket a tracked path belongs to, for the pull request shape comment
// (scripts/pr-report.ts). Nine buckets, the set issue #33 named: production
// code, tests, specification, decision records, documentation, examples,
// tooling, CI, generated. `bucketOf` returns `null` for a path none of them
// claims, which is the fallback test/change-buckets.test.ts exists to keep
// empty: a renamed directory that stops matching every rule falls into that
// `null` case rather than silently joining the nearest bucket.
//
// Order matters: a rule is checked top to bottom, and the first match wins,
// so a more specific prefix (docs/adr/, spec/**/examples/) is listed before
// the broader one it sits inside (docs/, spec/).

export const BUCKETS = [
  "production code",
  "tests",
  "specification",
  "decision records",
  "documentation",
  "examples",
  "tooling",
  "CI",
  "generated",
] as const;

export type Bucket = (typeof BUCKETS)[number];

// Root-level files with no directory of their own, cited by exact name
// rather than by prefix.
const ROOT_DOCUMENTATION_FILES = new Set([
  "README.md",
  "CONTRIBUTING.md",
  "CONTEXT.md",
  "VERSIONING.md",
  "SECURITY.md",
  "CLAUDE.md",
  "AGENTS.md",
  "LICENSE",
  "CHANGELOG.md",
]);

const ROOT_TOOLING_FILES = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.js",
  "vitest.config.ts",
  "vitest.mutation.config.ts",
  "stryker.config.json",
  ".dependency-cruiser.cjs",
  ".nvmrc",
  ".prettierrc.json",
  ".prettierignore",
  ".editorconfig",
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".gitleaks.toml",
  ".npmrc",
  ".mcp.json",
  "release-please-config.json",
  ".release-please-manifest.json",
  "renovate.json",
]);

// emf/ (docs/adr/emf/0107) is the coursework's own Java build: its own
// decision register, docs, source, tests and Maven/Tycho plumbing, deleted
// with the directory at the course's sunset. It gets the same nine buckets
// as the rest of the tree, checked in the same specific-before-general
// order, rather than a tenth bucket of its own.
const EMF_PRODUCTION_EXTENSIONS = [
  ".java",
  ".xtext",
  ".mwe2",
  ".ecore",
  ".ocl",
  ".genmodel",
  ".xmi",
  ".mtl",
  ".qvto",
];

function bucketOfEmfPath(rest: string): Bucket {
  if (rest.startsWith("docs/adr/")) return "decision records";
  if (rest.startsWith("docs/") || rest === "README.md") return "documentation";
  if (rest.startsWith("scripts/")) return "tooling";
  if (rest.includes("/src/test/") || rest.endsWith("Test.java")) return "tests";
  if (EMF_PRODUCTION_EXTENSIONS.some((extension) => rest.endsWith(extension)))
    return "production code";
  // Everything else is Maven/Tycho/PDE plumbing: pom.xml, mvnw, .mvn/,
  // .java-version, plugin.xml, plugin.properties, build.properties,
  // META-INF/MANIFEST.MF, the target platform, a launch configuration.
  return "tooling";
}

/**
 * The bucket `path` (relative to the repository root, forward-slashed)
 * belongs to, or `null` when no rule claims it.
 */
export function bucketOf(path: string): Bucket | null {
  if (path.startsWith(".github/")) return "CI";
  if (path.startsWith("emf/"))
    return bucketOfEmfPath(path.slice("emf/".length));

  // No generator exists yet (docs/adr/README.md, issue #21): nothing in the
  // tracked tree matches this today, and the rule is here so the first
  // generated artifact (a JSON Schema, a diagnostic catalogue, a rendered
  // example tree) lands in its own bucket rather than the fallback.
  if (
    /\.generated\./.test(path) ||
    path.startsWith("generated/") ||
    path.includes("/generated/")
  )
    return "generated";

  if (path.startsWith("docs/adr/")) return "decision records";
  if (path.startsWith("spec/") && path.includes("/examples/"))
    return "examples";
  if (path.startsWith("spec/")) return "specification";
  if (path.startsWith("docs/")) return "documentation";

  if (path.startsWith("test/") || path.endsWith(".test.ts")) return "tests";
  if (path.startsWith("src/")) return "production code";

  if (path.startsWith("scripts/")) return "tooling";
  if (path.startsWith("templates/")) return "tooling";
  if (path.startsWith(".claude/") || path.startsWith(".agents/"))
    return "tooling";

  if (path.startsWith("review/")) return "documentation";

  if (!path.includes("/")) {
    if (ROOT_DOCUMENTATION_FILES.has(path)) return "documentation";
    if (ROOT_TOOLING_FILES.has(path)) return "tooling";
  }

  return null;
}

/** How many changed files, and how many added/removed lines, fall in each bucket. */
export interface BucketTotals {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
}

export interface ChangedFile {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
}

/**
 * `files` grouped by bucket. A path `bucketOf` cannot place is grouped under
 * `null` rather than dropped, so a caller can still notice it happened
 * instead of the count quietly going missing.
 */
export function bucketTotals(
  files: readonly ChangedFile[],
): ReadonlyMap<Bucket | null, BucketTotals> {
  const totals = new Map<Bucket | null, BucketTotals>();
  for (const file of files) {
    const bucket = bucketOf(file.path);
    const previous = totals.get(bucket) ?? {
      files: 0,
      additions: 0,
      deletions: 0,
    };
    totals.set(bucket, {
      files: previous.files + 1,
      additions: previous.additions + file.additions,
      deletions: previous.deletions + file.deletions,
    });
  }
  return totals;
}
