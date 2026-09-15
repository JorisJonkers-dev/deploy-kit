// The pull request report, executed: the collecting (git, the coverage
// report, the cached baseline) and the posting (`gh api`), covered the way
// test/secret-scan-contract.test.ts covers lint-secrets.ts's gitleaks
// wrapper: real git against a fixture repository, and a stand-in `gh`, so
// no network call and no real pull request need to exist for the test.
//
// REQ-025 (docs/requirements.md): the pull request shape-and-coverage
// comment reflects the real diff and the real coverage report.
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildComment,
  changedFiles,
  diffText,
  listComments,
  main,
  readBaseline,
  report,
  upsertComment,
  type Config,
} from "../scripts/pr-report.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** A tiny repository with one commit changing a covered file and a doc file. */
function fixtureRepo(): { root: string; base: string; head: string } {
  const root = mkdtempSync(join(temporary(), "pr-report-repo-"));
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: root, encoding: "utf8" },
    ).trim();

  mkdirSync(join(root, "scripts"), { recursive: true });
  git("init", "-q");
  writeFileSync(join(root, "scripts", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "notes.md"), "notes\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD");

  writeFileSync(
    join(root, "scripts", "a.ts"),
    "export const a = 1;\nexport const b = 2;\n",
  );
  writeFileSync(join(root, "notes.md"), "notes\nmore notes\n");
  git("add", "-A");
  git("commit", "-q", "-m", "head");
  const head = git("rev-parse", "HEAD");

  return { root, base, head };
}

/** A stand-in `gh` that logs every invocation to `log` and answers `api` calls. */
function fakeGh(options: {
  listBody?: string;
  failList?: boolean;
  failWrite?: boolean;
  missing?: boolean;
}): { bin: string; log: string } {
  const dir = mkdtempSync(join(temporary(), "gh-bin-"));
  const bin = join(dir, "gh");
  const log = join(dir, "log.txt");
  if (options.missing) return { bin: join(dir, "definitely-not-here"), log };

  const listBody = options.listBody ?? "[]";
  writeFileSync(
    bin,
    "#!/bin/sh\n" +
      `printf '%s\\n' "$*" >> "${log}"\n` +
      'if [ "$2" = "--method" ]; then\n' +
      (options.failWrite ? "  exit 1\n" : "  exit 0\n") +
      "fi\n" +
      'if [ "$3" = "-f" ]; then\n' +
      (options.failWrite ? "  exit 1\n" : "  exit 0\n") +
      "fi\n" +
      // printf, not echo: dash's builtin echo interprets a literal `\n`
      // inside the marker's own newline escapes as a real newline, which
      // breaks the JSON printf leaves untouched.
      (options.failList ? "exit 1\n" : `printf '%s' '${listBody}'\nexit 0\n`),
  );
  chmodSync(bin, 0o755);
  return { bin, log };
}

function coverageFixtures(root: string): { summary: string; lcov: string } {
  const dir = mkdtempSync(join(root, "coverage-"));
  const summary = join(dir, "coverage-summary.json");
  const metric = (pct: number) => ({
    total: 10,
    covered: pct,
    skipped: 0,
    pct,
  });
  writeFileSync(
    summary,
    JSON.stringify({
      total: {
        statements: metric(95),
        branches: metric(90),
        functions: metric(100),
        lines: metric(95),
      },
    }),
  );
  const lcov = join(dir, "lcov.info");
  writeFileSync(
    lcov,
    ["SF:scripts/a.ts", "DA:1,1", "DA:2,1", "end_of_record", ""].join("\n"),
  );
  return { summary, lcov };
}

describe("changedFiles", () => {
  it("reports each changed file with its added and removed line counts", () => {
    const { root, base, head } = fixtureRepo();
    const files = changedFiles(root, base, head);
    const script = files.find((file) => file.path === "scripts/a.ts");
    expect(script).toStrictEqual({
      path: "scripts/a.ts",
      additions: 1,
      deletions: 0,
    });
    expect(files.some((file) => file.path === "notes.md")).toBe(true);
  });

  it('reports zero additions and deletions for a binary file, where git prints "-"', () => {
    const root = mkdtempSync(join(temporary(), "pr-report-binary-"));
    const git = (...args: string[]): string =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=test",
          "-c",
          "user.email=test@example.invalid",
          "-c",
          "commit.gpgsign=false",
          ...args,
        ],
        { cwd: root, encoding: "utf8" },
      ).trim();
    git("init", "-q");
    git("commit", "-q", "--allow-empty", "-m", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(
      join(root, "logo.png"),
      Buffer.from([0x00, 0x01, 0x02, 0x00]),
    );
    git("add", "-A");
    git("commit", "-q", "-m", "add a binary file");
    const head = git("rev-parse", "HEAD");

    const files = changedFiles(root, base, head);
    expect(files).toStrictEqual([
      { path: "logo.png", additions: 0, deletions: 0 },
    ]);
  });
});

describe("diffText", () => {
  it("is a zero-context diff naming the new file and its added line", () => {
    const { root, base, head } = fixtureRepo();
    const text = diffText(root, base, head);
    expect(text).toContain("+++ b/scripts/a.ts");
    expect(text).toContain("+export const b = 2;");
  });
});

describe("readBaseline", () => {
  it("is null when the file does not exist", () => {
    expect(readBaseline(join(temporary(), "absent.json"))).toBeNull();
  });

  it("is null when the file is not valid JSON", () => {
    const path = join(temporary(), "bad.json");
    writeFileSync(path, "not json");
    expect(readBaseline(path)).toBeNull();
  });

  it("is null when the document is missing commit or coverage", () => {
    const path = join(temporary(), "shapeless.json");
    writeFileSync(path, JSON.stringify({ commit: "abc" }));
    expect(readBaseline(path)).toBeNull();
  });

  it("reads a well-formed baseline", () => {
    const path = join(temporary(), "baseline.json");
    const coverage = coverageFixtures(temporary());
    const parsed = JSON.parse(
      readFileSync(coverage.summary, "utf8"),
    ) as unknown;
    writeFileSync(
      path,
      JSON.stringify({
        commit: "abc1234",
        coverage: (parsed as { total: unknown }).total,
      }),
    );
    const baseline = readBaseline(path);
    expect(baseline?.commit).toBe("abc1234");
    expect(baseline?.coverage.statements.pct).toBe(95);
  });
});

describe("listComments", () => {
  it("parses the comments gh api reports", () => {
    const { bin } = fakeGh({ listBody: '[{"id":1,"body":"hello"}]' });
    expect(listComments(bin, "org/repo", 5)).toStrictEqual([
      { id: 1, body: "hello" },
    ]);
  });

  it("throws when gh api fails", () => {
    const { bin } = fakeGh({ failList: true });
    expect(() => listComments(bin, "org/repo", 5)).toThrow(
      /gh api \(list comments\) failed/,
    );
  });

  it("throws when gh cannot be started at all", () => {
    const { bin } = fakeGh({ missing: true });
    expect(() => listComments(bin, "org/repo", 5)).toThrow(/could not run/);
  });
});

describe("upsertComment", () => {
  it("creates a new comment when no existing id is given", () => {
    const { bin, log } = fakeGh({});
    expect(() => {
      upsertComment(bin, "org/repo", 5, null, "hello");
    }).not.toThrow();
    expect(readFileSync(log, "utf8")).toContain("-f body=hello");
  });

  it("updates the existing comment by PATCHing its id", () => {
    const { bin, log } = fakeGh({});
    expect(() => {
      upsertComment(bin, "org/repo", 5, 9, "hello");
    }).not.toThrow();
    const logged = readFileSync(log, "utf8");
    expect(logged).toContain("--method PATCH");
    expect(logged).toContain("issues/comments/9");
  });

  it("throws when the write fails", () => {
    const { bin } = fakeGh({ failWrite: true });
    expect(() => {
      upsertComment(bin, "org/repo", 5, null, "hello");
    }).toThrow(/gh api \(create comment\) failed/);
    expect(() => {
      upsertComment(bin, "org/repo", 5, 9, "hello");
    }).toThrow(/gh api \(update comment\) failed/);
  });

  it("throws when gh cannot be started at all", () => {
    const { bin } = fakeGh({ missing: true });
    expect(() => {
      upsertComment(bin, "org/repo", 5, null, "hello");
    }).toThrow(/could not run/);
  });
});

describe("buildComment", () => {
  it("renders shape and coverage from a real diff and a real coverage report", () => {
    const { root, base, head } = fixtureRepo();
    const coverage = coverageFixtures(root);
    const config: Config = {
      root,
      baseSha: base,
      headSha: head,
      repository: "org/repo",
      prNumber: 1,
      coverageSummaryPath: coverage.summary,
      lcovPath: coverage.lcov,
      baselinePath: join(root, "absent-baseline.json"),
      ghBin: "gh",
    };
    const body = buildComment(config);
    expect(body).toContain("## Shape");
    expect(body).toContain("## Coverage");
    expect(body).toContain("| tooling | 1 |");
    expect(body).toContain("No baseline is cached from `main` yet.");
    // scripts/a.ts's added line 2 is instrumented and hit once in the fixture.
    expect(body).toContain(
      "Lines this pull request changed: 1/1 covered (100.00%).",
    );
  });

  it("omits patch coverage when the tree carries no lcov report", () => {
    const { root, base, head } = fixtureRepo();
    const coverage = coverageFixtures(root);
    const config: Config = {
      root,
      baseSha: base,
      headSha: head,
      repository: "org/repo",
      prNumber: 1,
      coverageSummaryPath: coverage.summary,
      lcovPath: join(root, "absent-lcov.info"),
      baselinePath: join(root, "absent-baseline.json"),
      ghBin: "gh",
    };
    expect(buildComment(config)).toContain(
      "This pull request changed no covered line.",
    );
  });
});

describe("report", () => {
  function config(overrides: Partial<Config> = {}): Config {
    const { root, base, head } = fixtureRepo();
    const coverage = coverageFixtures(root);
    return {
      root,
      baseSha: base,
      headSha: head,
      repository: "org/repo",
      prNumber: 7,
      coverageSummaryPath: coverage.summary,
      lcovPath: coverage.lcov,
      baselinePath: join(root, "absent-baseline.json"),
      ghBin: "gh",
      ...overrides,
    };
  }

  it("posts a new comment when none carries the marker yet", () => {
    const { bin, log } = fakeGh({ listBody: "[]" });
    const output = collect();
    expect(report(config({ ghBin: bin }), output)).toBe(0);
    expect(output.text()).toMatch(/posted the comment on #7/);
    expect(readFileSync(log, "utf8")).not.toContain("--method");
  });

  it("updates the existing comment on a second run", () => {
    const { bin, log } = fakeGh({
      listBody:
        '[{"id":42,"body":"<!-- deploy-kit:pr-report:v1 -->\\n\\nold"}]',
    });
    const output = collect();
    expect(report(config({ ghBin: bin }), output)).toBe(0);
    expect(output.text()).toMatch(/updated the comment on #7/);
    expect(readFileSync(log, "utf8")).toContain("issues/comments/42");
  });

  it("tolerates a coverage report it cannot read, and still returns 0", () => {
    const output = collect();
    const code = report(
      config({ coverageSummaryPath: join(temporary(), "absent.json") }),
      output,
    );
    expect(code).toBe(0);
    expect(output.text()).toMatch(/could not build the comment/);
  });

  it("tolerates gh failing to post, printing the body it could not send", () => {
    const { bin } = fakeGh({ failList: true });
    const output = collect();
    const code = report(config({ ghBin: bin }), output);
    expect(code).toBe(0);
    expect(output.text()).toMatch(/could not post the comment/);
    expect(output.text()).toContain("## Shape");
  });
});

describe("main", () => {
  it("fails softly, and returns 0, when a required environment variable is missing", () => {
    const output = collect();
    expect(main({}, output)).toBe(0);
    expect(output.text()).toMatch(/PR_BASE_SHA is required/);
  });

  it("builds a Config from the environment and runs the report", () => {
    const { root, base, head } = fixtureRepo();
    const coverage = coverageFixtures(root);
    const { bin } = fakeGh({ listBody: "[]" });
    const output = collect();
    const code = main(
      {
        PR_REPORT_ROOT: root,
        PR_BASE_SHA: base,
        PR_HEAD_SHA: head,
        GITHUB_REPOSITORY: "org/repo",
        PR_NUMBER: "3",
        COVERAGE_SUMMARY_PATH: coverage.summary,
        COVERAGE_LCOV_PATH: coverage.lcov,
        COVERAGE_BASELINE_PATH: join(root, "absent.json"),
        GH_BIN: bin,
      },
      output,
    );
    expect(code).toBe(0);
    expect(output.text()).toMatch(/posted the comment on #3/);
  });

  it("falls back to <root>/coverage, <root>/.coverage-baseline and gh on PATH when unset", () => {
    const { root, base, head } = fixtureRepo();
    const output = collect();
    const code = main(
      {
        PR_REPORT_ROOT: root,
        PR_BASE_SHA: base,
        PR_HEAD_SHA: head,
        GITHUB_REPOSITORY: "org/repo",
        PR_NUMBER: "9",
      },
      output,
    );
    expect(code).toBe(0);
    // Nothing was placed at the default coverage path, so building the
    // comment fails cleanly rather than finding a coverage-summary.json.
    expect(output.text()).toMatch(/could not build the comment/);
  });

  it("takes gh from PATH and this repository's own root by default", () => {
    vi.stubEnv("PATH", "");
    const output = collect();
    // No PR_BASE_SHA in process.env by default, so this exercises the
    // required-env failure path through the real defaults rather than a
    // fixture, proving REPOSITORY and processOutput are reachable too.
    const code = main(process.env, output);
    expect(code).toBe(0);
  });
});

describe("the entrypoint guard", () => {
  // The bottom-of-file `if (isEntrypoint(...))` line, driven for real the way
  // test/secret-scan-contract.test.ts drives lint-secrets.ts's: reload the
  // module with process.argv pointed at it so v8 sees the guard fire. The
  // environment carries no PR_BASE_SHA, so main() takes its immediate
  // required-env failure and never reaches out to git or gh at all.
  it("runs main and sets process.exitCode when Node starts this module", async () => {
    const modulePath = join(REPOSITORY, "scripts", "pr-report.ts");
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [process.argv[0] ?? "node", modulePath];
    vi.stubEnv("PR_BASE_SHA", "");
    vi.resetModules();
    try {
      await import("../scripts/pr-report.ts");
      expect(process.exitCode).toBe(0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "pr-report.ts")],
      {
        encoding: "utf8",
        env: { ...process.env, PR_BASE_SHA: "" },
      },
    );
    expect(run.status).toBe(0);
    expect(run.stderr).toMatch(/PR_BASE_SHA is required/);
  });
});
