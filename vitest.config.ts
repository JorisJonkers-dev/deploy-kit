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
      // Measured 2026-09-14, after the Service Intent metamodel
      // (src/wire/service-intent/, src/domain/service-intent/) and its gate
      // (scripts/lint-intent.ts) landed on top of the rule ledger
      // (scripts/lint-rules.ts) and the local secret scan
      // (scripts/lint-secrets.ts). Every module under src/ reaches 100% of its
      // statements, lines and functions: the metamodel is exercised by every
      // worked example, every refusal fixture and one mutation per registered
      // rule, and the mapper is reached at the use-case seam rather than
      // directly. All four metrics rose again over the rule ledger's
      // 98.31 / 92.43 / 100 / 98.19. Two runs of one tree, identical both
      // times: statements 1053/1066, branches 533/566, functions 218/218,
      // lines 976/989. What is left uncovered is the one-line command guard at
      // the bottom of each gate and the branches for a tool that cannot be
      // started at all.
      thresholds: {
        statements: 98.78,
        branches: 94.16,
        functions: 100,
        lines: 98.68,
      },
    },
  },
});
