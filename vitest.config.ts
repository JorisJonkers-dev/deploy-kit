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
      // Measured 2026-09-15, after AGENTS.md's script-list gate
      // (scripts/lint-agents.ts) landed on top of the linking step (#39,
      // issue #32). Two runs of one tree, identical both times: statements
      // 1500/1515, branches 872/907, functions 244/244, lines 1381/1396.
      // The new gate's own file sits at 96%/94.73%/100%/95.83%, in the same
      // range as several already-landed gates (scripts/lint-boundaries.ts,
      // scripts/lint-manifests.ts); its one uncovered line is the same
      // one-line command guard at the bottom of every gate that a
      // same-process test cannot exercise.
      thresholds: {
        statements: 99,
        branches: 96.14,
        functions: 100,
        lines: 98.92,
      },
    },
  },
});
