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
      // Measured 2026-09-15, after the meaning lint (scripts/lint-meaning.ts)
      // landed on top of the pull request report and release candidate
      // publish (issues #33/#34). Two runs of one tree, identical both
      // times: statements 1437/1451, branches 836/870, functions 222/222,
      // lines 1324/1338. What is left uncovered is the one-line command
      // guard at the bottom of each gate and the branches for a tool that
      // cannot be started at all.
      thresholds: {
        statements: 99.03,
        branches: 96.09,
        functions: 100,
        lines: 98.95,
      },
    },
  },
});
