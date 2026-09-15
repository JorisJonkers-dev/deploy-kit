import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "scripts/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // The gate suites start real tools: git, dependency-cruiser, a stand-in
    // kubeconform. On a loaded machine one of those takes seconds, and the
    // default five-second budget would turn a slow test into a flaky one.
    testTimeout: 30_000,
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      // An explicit include, so a file no test reaches counts as zero rather
      // than being absent from the report.
      include: ["scripts/**/*.ts", "src/**/*.ts"],
      // RULE-013: the one file that touches the process, holding no decision.
      exclude: ["**/*.test.ts", "src/cli/boundary.ts"],
      // lcov carries per-line hits, which a pull request report needs to say
      // whether the lines a change added are covered.
      reporter: ["text", "json-summary", "lcov"],
      // A ratchet, per docs/adr/architecture/0101-coverage-is-a-ratchet.md:
      // set from what the suite reaches, and only ever raised.
      //
      // Measured 2026-09-15, after the pull request report
      // (scripts/pr-report.ts, issue #33) and the release candidate publish
      // (scripts/rc-publish.ts, issue #34) landed alongside the pure
      // scripts/lib modules each reads: change buckets (including emf/'s own
      // nine-bucket mapping), coverage summaries, lcov, patch coverage, the
      // comment itself, and the version and eligibility rule. Every one of
      // those, and the two CLI scripts themselves, reaches full branch
      // coverage through a real git fixture repository and stand-in
      // `gh`/`npm` binaries, the same shape scripts/lint-secrets.ts already
      // uses for gitleaks; all four metrics rose over the Project Intent
      // metamodel's 98.67 / 94.3 / 100 / 98.58. Two runs of one tree,
      // identical both times: statements 1292/1305, branches 777/809,
      // functions 192/192, lines 1192/1205. What is left uncovered is the
      // one-line command guard at the bottom of each pre-existing gate and
      // the branches for a tool that cannot be started at all.
      thresholds: {
        statements: 99,
        branches: 96.04,
        functions: 100,
        lines: 98.92,
      },
    },
  },
});
