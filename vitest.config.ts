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
      // (scripts/pr-report.ts, issue #33) landed alongside the pure
      // scripts/lib modules it reads: change buckets (including emf/'s own
      // nine-bucket mapping), coverage summaries, lcov and patch coverage,
      // and the comment itself. Every one of those, and the CLI script
      // itself, reaches full branch coverage through a real git fixture
      // repository and a stand-in `gh`, the same shape
      // scripts/lint-secrets.ts already uses for gitleaks; all four metrics
      // rose over the Project Intent metamodel's 98.67 / 94.3 / 100 / 98.58.
      // Two runs of one tree, identical both times: statements 1196/1209,
      // branches 697/729, functions 183/183, lines 1105/1118. What is left
      // uncovered is the one-line command guard at the bottom of each
      // pre-existing gate and the branches for a tool that cannot be started
      // at all.
      thresholds: {
        statements: 98.92,
        branches: 95.61,
        functions: 100,
        lines: 98.83,
      },
    },
  },
});
