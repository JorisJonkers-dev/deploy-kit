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
      // (scripts/lint-agents.ts) landed on top of the linking step (#39)
      // and the hierarchy-rename cleanup (#119) (issue #32). Two runs of
      // one tree, identical both times: statements 1501/1515, branches
      // 873/907, functions 244/244, lines 1382/1396. Unlike every other
      // gate script, this one's own entrypoint guard is covered too: a
      // same-process module reload drives it, the way
      // test/package-contents-contract.test.ts and
      // test/secret-scan-contract.test.ts already do for theirs, so the new
      // gate leaves nothing on the table for the ratchet to absorb.
      thresholds: {
        statements: 99.07,
        branches: 96.25,
        functions: 100,
        lines: 98.99,
      },
    },
  },
});
