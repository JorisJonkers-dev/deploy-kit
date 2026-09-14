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
      // Measured 2026-09-14, after the pull request attribution check
      // (scripts/check-pr-title.ts) landed. Its two `?? ""` capture-group
      // fallbacks were replaced by a cast each, the same way the docs
      // contract gate's were: a `.+` group cannot be absent once the outer
      // regex has matched, and once `messages` is filtered to non-empty
      // strings, splitting one always yields a first element. Like the other
      // gates, it left only its bottom-of-file entrypoint guard uncovered.
      // Two runs of one tree, identical both times: statements 508/519,
      // branches 260/288, functions 82/82, lines 467/478. What is left
      // uncovered elsewhere is mostly the one-line command guard at the
      // bottom of each other gate and the branches for a tool that cannot be
      // started at all.
      thresholds: {
        statements: 97.88,
        branches: 90.27,
        functions: 100,
        lines: 97.69,
      },
    },
  },
});
