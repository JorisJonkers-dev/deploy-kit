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
      exclude: ["**/*.test.ts"],
      // lcov carries per-line hits, which a pull request report needs to say
      // whether the lines a change added are covered.
      reporter: ["text", "json-summary", "lcov"],
      // A ratchet, per docs/adr/architecture/0101-coverage-is-a-ratchet.md:
      // set from what the suite reaches, and only ever raised.
      //
      // Measured 2026-09-14, after the requirements ledger gate's own tests
      // covered its citation-ordering branches (and, like the other gates,
      // left only its bottom-of-file entrypoint guard uncovered), two runs
      // of one tree, identical both times: statements 390/400, branches
      // 214/241, functions 62/62, lines 356/366. What is left uncovered
      // elsewhere is mostly the one-line command guard at the bottom of each
      // other gate and the branches for a tool that cannot be started at
      // all.
      thresholds: {
        statements: 97.5,
        branches: 88.79,
        functions: 100,
        lines: 97.26,
      },
    },
  },
});
