// The suites that exercise src/, which is all Stryker mutates. The gate suites
// read the git index and the tool binaries, neither of which exists in
// Stryker's sandbox, and none of them reaches src/.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/model/**/*.test.ts",
      "test/canonical-json.test.ts",
      "test/simplification-contract.test.ts",
    ],
    setupFiles: ["./test/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
