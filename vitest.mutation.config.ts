// The suites that exercise src/, which is all Stryker mutates. The gate suites
// read the git index and the tool binaries, neither of which exists in
// Stryker's sandbox, and none of them reaches src/.
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";

// The suites under test/application/ and test/cli/ run the whole pipeline end
// to end, so most mutants they kill a model suite kills sooner. Stryker stops
// at a mutant's first failing test, so the model suites run first; vitest's
// own order runs the slowest file first, the opposite.
const END_TO_END = /\/test\/(application|cli)\//;

class CheapestFirst extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return Promise.resolve(
      [...files].sort(
        (a, b) =>
          Number(END_TO_END.test(a.moduleId)) -
            Number(END_TO_END.test(b.moduleId)) ||
          a.moduleId.localeCompare(b.moduleId),
      ),
    );
  }
}

export default defineConfig({
  test: {
    include: [
      "test/model/**/*.test.ts",
      "test/application/compose.test.ts",
      "test/application/fragment.test.ts",
      // The CLI in process; its process-level runs reach no instrumented code.
      "test/cli/main.test.ts",
      "test/cli/index.test.ts",
      "test/adapters/contract.test.ts",
      "test/adapters/spelling.test.ts",
      "test/canonical-json.test.ts",
      "test/published-schemas.test.ts",
      "test/schema-corpus.test.ts",
      "test/schema-refusals.test.ts",
      "test/simplification-contract.test.ts",
    ],
    sequence: { sequencer: CheapestFirst },
    setupFiles: ["./test/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
