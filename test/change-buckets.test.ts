// The pull request shape comment's bucket classification.
//
// REQ-025 (docs/requirements.md): every tracked file falls into a named
// bucket, or the fallback test below fails.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUCKETS,
  bucketOf,
  bucketTotals,
  type ChangedFile,
} from "../scripts/lib/change-buckets.ts";

const REPOSITORY = join(import.meta.dirname, "..");

describe("bucketOf", () => {
  it("places one representative path in each named bucket", () => {
    const examples: Record<(typeof BUCKETS)[number], string> = {
      "production code": "src/domain/service.ts",
      tests: "test/change-buckets.test.ts",
      specification: "spec/v1/10-service-intent.md",
      "decision records": "docs/adr/model/0003-three-layer-meta-model.md",
      documentation: "docs/architecture.md",
      examples: "spec/v1/examples/auth/auth.domain.yml",
      tooling: "scripts/lint-rules.ts",
      CI: ".github/workflows/ci.yml",
      generated: "src/schema.generated.ts",
    };
    for (const bucket of BUCKETS)
      expect(bucketOf(examples[bucket]), examples[bucket]).toBe(bucket);
  });

  it("places agent tooling under .claude/ or .agents/", () => {
    expect(bucketOf(".claude/settings.json")).toBe("tooling");
    expect(bucketOf(".agents/skills/new-rule/SKILL.md")).toBe("tooling");
  });

  it("places a test file named anywhere by its .test.ts suffix", () => {
    expect(bucketOf("scripts/odd.test.ts")).toBe("tests");
  });

  it("places a root documentation file by its exact name", () => {
    expect(bucketOf("README.md")).toBe("documentation");
    expect(bucketOf("CONTRIBUTING.md")).toBe("documentation");
  });

  it("places a root tooling file by its exact name", () => {
    expect(bucketOf("package.json")).toBe("tooling");
    expect(bucketOf(".nvmrc")).toBe("tooling");
  });

  it("prefers decision records over the wider documentation bucket", () => {
    expect(bucketOf("docs/adr/README.md")).toBe("decision records");
  });

  it("prefers examples over the wider specification bucket", () => {
    expect(bucketOf("spec/v1/examples/RENDER-GAPS.md")).toBe("examples");
  });

  it("returns null for a path no rule claims", () => {
    expect(bucketOf("mystery/unclaimed.xyz")).toBeNull();
    expect(bucketOf("unclaimed-root-file.xyz")).toBeNull();
  });

  it("keeps every file this repository tracks inside a named bucket", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: REPOSITORY,
      encoding: "utf8",
    })
      .split("\0")
      .filter((path) => path !== "");
    expect(tracked.length).toBeGreaterThan(100);

    const unclassified = tracked.filter((path) => bucketOf(path) === null);
    expect(unclassified).toStrictEqual([]);
  });
});

describe("bucketTotals", () => {
  it("sums files, additions and deletions per bucket", () => {
    const files: ChangedFile[] = [
      { path: "src/a.ts", additions: 3, deletions: 1 },
      { path: "src/b.ts", additions: 2, deletions: 0 },
      { path: "test/a.test.ts", additions: 5, deletions: 5 },
    ];
    const totals = bucketTotals(files);
    expect(totals.get("production code")).toStrictEqual({
      files: 2,
      additions: 5,
      deletions: 1,
    });
    expect(totals.get("tests")).toStrictEqual({
      files: 1,
      additions: 5,
      deletions: 5,
    });
    expect(totals.get("documentation")).toBeUndefined();
  });

  it("groups an unclassified path under the null key rather than dropping it", () => {
    const totals = bucketTotals([
      { path: "mystery/unclaimed.xyz", additions: 1, deletions: 0 },
    ]);
    expect(totals.get(null)).toStrictEqual({
      files: 1,
      additions: 1,
      deletions: 0,
    });
  });

  it("returns an empty map for no changed files", () => {
    expect(bucketTotals([]).size).toBe(0);
  });
});
