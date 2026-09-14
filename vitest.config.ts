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
      // Measured 2026-09-14, after the local secret scan
      // (scripts/lint-secrets.ts) landed. Its file is small enough that the
      // bottom-of-file entrypoint guard every other gate leaves uncovered
      // would, left the same way, pull the suite under the previous
      // threshold; test/secret-scan-contract.test.ts's "the entrypoint guard"
      // covers it in-process instead, the way
      // test/package-contents-contract.test.ts already does for
      // check-package-contents.ts, and its two `??` fallbacks (the default
      // binary name, a signal-killed scan's null exit status) each get a
      // fixture of their own. Two runs of one tree, identical both times:
      // statements 523/534, branches 274/302, functions 84/84, lines
      // 482/493. What is left uncovered elsewhere is mostly the one-line
      // command guard at the bottom of each other gate and the branches for a
      // tool that cannot be started at all.
      thresholds: {
        statements: 97.94,
        branches: 90.72,
        functions: 100,
        lines: 97.76,
      },
    },
  },
});
