// The docs contract, executed.
//
// README.md and CONTRIBUTING.md are the first documents a reader opens, and
// prose goes stale silently: a renamed script, a moved coverage threshold, a
// pinned Node version that changed, a path that no longer exists all read
// exactly as well wrong as right. lint-docs.ts extracts each of those claims
// and checks it against the file that is actually true; these fixtures prove
// it fires, on a tree where only one thing is deliberately wrong.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  coverageClaims,
  isPathLike,
  lintDocs,
  main,
  nodeVersionClaims,
  pathClaims,
  scriptClaims,
} from "../scripts/lint-docs.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

interface Thresholds {
  readonly statements?: number;
  readonly branches?: number;
  readonly functions?: number;
  readonly lines?: number;
}

const DEFAULT_SCRIPTS = {
  test: "vitest run",
  verify: "npm run test",
  "lint:adrs": "node scripts/lint-adrs.ts",
};
const DEFAULT_THRESHOLDS = {
  statements: 96.55,
  branches: 86.05,
  functions: 100,
  lines: 96.53,
};
const DEFAULT_NVMRC = "24.21.0";

/** A `vitest.config.ts` source text whose thresholds block carries `thresholds`. */
function vitestConfig(thresholds: Thresholds): string {
  const entries = Object.entries(thresholds)
    .map(([metric, value]) => `        ${metric}: ${value ?? 0},`)
    .join("\n");
  return [
    "export default {",
    "  test: {",
    "    coverage: {",
    "      thresholds: {",
    entries,
    "      },",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n");
}

/**
 * A fixture repository: package.json, vitest.config.ts and .nvmrc holding
 * what is actually true, plus whichever of README.md and CONTRIBUTING.md the
 * caller supplies claiming things about it. `docs/adr/` and `CHANGELOG.md`
 * exist in every fixture, so a document can make a true path claim about
 * them without every test having to create its own.
 */
function repo(options: {
  readme?: string;
  contributing?: string;
  scripts?: Readonly<Record<string, string>>;
  thresholds?: Thresholds;
  nvmrc?: string;
  noThresholdsBlock?: boolean;
}): string {
  const root = mkdtempSync(join(temporary(), "docs-lint-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "0.0.0",
      scripts: options.scripts ?? DEFAULT_SCRIPTS,
    }),
  );
  writeFileSync(
    join(root, "vitest.config.ts"),
    options.noThresholdsBlock
      ? "export default { test: { coverage: {} } };\n"
      : vitestConfig({ ...DEFAULT_THRESHOLDS, ...options.thresholds }),
  );
  writeFileSync(join(root, ".nvmrc"), options.nvmrc ?? DEFAULT_NVMRC);
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n");
  if (options.readme !== undefined)
    writeFileSync(join(root, "README.md"), options.readme);
  if (options.contributing !== undefined)
    writeFileSync(join(root, "CONTRIBUTING.md"), options.contributing);
  return root;
}

// One document naming a real claim of every kind lintDocs checks.
const README_ALL_CLAIMS = [
  "# Fixture",
  "",
  "`npm run verify` runs the gates.",
  "",
  "See `docs/adr/` for the decision record.",
  "",
  "Coverage: statements 96.55%, branches 86.05%, functions 100%, lines 96.53%.",
  "",
  "Install Node 24.21.0, pinned in `.nvmrc`.",
  "",
].join("\n");

describe("scriptClaims", () => {
  it("reads npm run <script>, deduplicated", () => {
    expect(
      scriptClaims("`npm run verify` and again `npm run verify`"),
    ).toStrictEqual(["verify"]);
  });

  it("reads bare npm test as the test script", () => {
    expect(scriptClaims("run `npm test` first")).toStrictEqual(["test"]);
  });

  it("finds nothing in prose naming no script", () => {
    expect(scriptClaims("nothing to see here")).toStrictEqual([]);
  });
});

describe("isPathLike", () => {
  it("accepts a file with an extension", () => {
    expect(isPathLike("CHANGELOG.md")).toBe(true);
  });

  it("accepts a directory with a trailing slash", () => {
    expect(isPathLike("docs/adr/")).toBe(true);
  });

  it("refuses a bare word with neither a slash nor a dot", () => {
    expect(isPathLike("deploy-config-schema")).toBe(false);
  });

  it("refuses a span with a space", () => {
    expect(isPathLike("npm run verify")).toBe(false);
  });

  it("refuses a span with a colon", () => {
    expect(isPathLike("normative:")).toBe(false);
  });
});

describe("pathClaims", () => {
  it("reads only the backtick spans that look like paths", () => {
    expect(
      pathClaims(
        "See `docs/adr/` and `deploy-config-schema`, run `npm run verify`.",
      ),
    ).toStrictEqual(["docs/adr/"]);
  });

  // A fenced block's opening and closing triple backtick are not a pair.
  // Reading them as one swallows the block whole, and then pairs every
  // backtick after it with the wrong partner for the rest of the document:
  // this fixture reproduces the real README.md, which has one such fence.
  it("does not let a fenced code block's triple backticks reshuffle every pairing after it", () => {
    const text = [
      "```bash",
      "npm run verify",
      "```",
      "",
      "See `docs/adr/` for detail.",
      "",
    ].join("\n");
    expect(pathClaims(text)).toStrictEqual(["docs/adr/"]);
  });
});

describe("coverageClaims", () => {
  it("reads every metric a document quotes", () => {
    expect(
      coverageClaims("statements 96.55%, branches 86.05%, functions 100%"),
    ).toStrictEqual([
      { metric: "statements", value: 96.55 },
      { metric: "branches", value: 86.05 },
      { metric: "functions", value: 100 },
    ]);
  });

  it("finds nothing when no metric is named", () => {
    expect(coverageClaims("coverage is good")).toStrictEqual([]);
  });
});

describe("nodeVersionClaims", () => {
  it("reads a semver following the word Node", () => {
    expect(nodeVersionClaims("Install Node 24.21.0 first")).toStrictEqual([
      "24.21.0",
    ]);
  });

  it("finds nothing when no version is named", () => {
    expect(nodeVersionClaims("Install the version in .nvmrc")).toStrictEqual(
      [],
    );
  });
});

describe("lintDocs", () => {
  it("passes a document naming a real claim of every kind, and counts them", () => {
    const result = lintDocs(repo({ readme: README_ALL_CLAIMS }));
    expect(result.errors).toStrictEqual([]);
    expect(result.claims).toBeGreaterThan(0);
    expect(result.byKind).toStrictEqual({
      script: 1,
      number: 4,
      version: 1,
      path: 2,
    });
  });

  it("has real claims to check, not an empty list, on a clean tree", () => {
    const result = lintDocs(repo({ readme: README_ALL_CLAIMS }));
    expect(result.claims).toBe(8);
  });

  it("fails a renamed script, naming the document and the claim", () => {
    const root = repo({
      readme: "`npm run verify` runs the gates.\n",
      scripts: { test: "vitest run" },
    });
    const { errors } = lintDocs(root);
    expect(errors).toStrictEqual([
      "README.md: names `npm run verify`, which is not a script in package.json",
    ]);
  });

  it("fails a path the document names that does not exist", () => {
    const root = repo({ readme: "See `nowhere/at/all.md` for detail.\n" });
    const { errors } = lintDocs(root);
    expect(errors).toStrictEqual([
      "README.md: names `nowhere/at/all.md`, which does not exist",
    ]);
  });

  it("fails a coverage number that no longer matches the ratchet", () => {
    const root = repo({
      readme: "Coverage: statements 96.55%.\n",
      thresholds: { statements: 97.1 },
    });
    const { errors } = lintDocs(root);
    expect(errors).toStrictEqual([
      "README.md: quotes statements coverage as 96.55%, but vitest.config.ts sets it to 97.1%",
    ]);
  });

  it("fails a coverage number for a metric the config no longer thresholds", () => {
    const root = repo({
      readme: "Coverage: branches 86.05%.\n",
      noThresholdsBlock: true,
    });
    const { errors } = lintDocs(root);
    expect(errors).toStrictEqual([
      "README.md: quotes branches coverage as 86.05%, but vitest.config.ts sets no such threshold",
    ]);
  });

  it("fails a Node version that no longer matches .nvmrc", () => {
    const root = repo({
      readme: "Install Node 24.21.0 first.\n",
      nvmrc: "22.10.0",
    });
    const { errors } = lintDocs(root);
    expect(errors).toStrictEqual([
      "README.md: names Node 24.21.0, but .nvmrc pins 22.10.0",
    ]);
  });

  it("checks CONTRIBUTING.md too, and independently of README.md", () => {
    const root = repo({
      readme: "# Fine\n",
      contributing: "`npm test` is how a change is checked.\n",
      scripts: { verify: "npm run test" },
    });
    const { errors } = lintDocs(root);
    expect(errors).toStrictEqual([
      "CONTRIBUTING.md: names `npm run test`, which is not a script in package.json",
    ]);
  });

  it("passes a tree with neither document, since that failure belongs elsewhere", () => {
    const result = lintDocs(repo({}));
    expect(result).toStrictEqual({
      claims: 0,
      byKind: { script: 0, number: 0, version: 0, path: 0 },
      errors: [],
    });
  });

  it("passes this repository's own README.md and CONTRIBUTING.md", () => {
    const result = lintDocs(REPOSITORY);
    expect(result.errors).toStrictEqual([]);
    expect(result.claims).toBeGreaterThan(0);
  });
});

describe("the command", () => {
  it("says how many claims were clean, broken down by kind, and exits 0", () => {
    const output = collect();
    expect(main([repo({ readme: README_ALL_CLAIMS })], output)).toBe(0);
    expect(output.text()).toBe(
      "docs lint: 8 claim(s) clean (scripts 1, numbers 4, versions 1, paths 2)\n",
    );
  });

  it("lists every broken claim under a count, and exits 1", () => {
    const output = collect();
    const root = repo({ readme: "`npm run gone` runs nothing.\n" });
    expect(main([root], output)).toBe(1);
    expect(output.text()).toBe(
      "docs lint: 1 error(s)\n" +
        "  - README.md: names `npm run gone`, which is not a script in package.json\n",
    );
  });

  it("checks this repository when no tree is named", () => {
    expect(main([], collect())).toBe(0);
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    const run = spawnSync(
      process.execPath,
      [
        join(REPOSITORY, "scripts", "lint-docs.ts"),
        repo({ readme: "`npm run gone` runs nothing.\n" }),
      ],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("names `npm run gone`");
  });
});
