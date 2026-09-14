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
      // Measured 2026-09-14, after the rule ledger gate
      // (scripts/lint-rules.ts) landed on top of the local secret scan
      // (scripts/lint-secrets.ts), with the tracked-tree helpers both the
      // rule ledger and the requirements gate use moved into
      // scripts/lib/tracked.ts. The new gate's negative fixtures reach every
      // branch that decides, so all four metrics rose again over the secret
      // scan's 97.94 / 90.72 / 100 / 97.76. Two runs of one tree, identical
      // both times: statements 701/713, branches 379/410, functions 107/107,
      // lines 652/664. What is left uncovered is the one-line command guard
      // at the bottom of each other gate and the branches for a tool that
      // cannot be started at all.
      thresholds: {
        statements: 98.31,
        branches: 92.43,
        functions: 100,
        lines: 98.19,
      },
    },
  },
});
