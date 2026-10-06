// The suites that exercise src/, which is all Stryker mutates. The gate suites
// read the git index and the tool binaries, neither of which exists in
// Stryker's sandbox, and none of them reaches src/.
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";

// Stryker stops at a mutant's first failing test, so the order of the suites
// is the length of the run. Three tiers, cheapest killer first; vitest's own
// order runs the slowest file first, the opposite.

// A schema is built when its module loads, so Stryker cannot tell which test
// reaches a mutant in one and runs every suite in order until one fails. These
// four suites kill three quarters of those mutants, and a suite that runs
// after the others pays for every suite before it, once per mutant.
const SCHEMA_SUITES = [
  "/test/model/descriptor.test.ts",
  "/test/model/resolved-deployment.test.ts",
  "/test/adapters/contract.test.ts",
  "/test/published-schemas.test.ts",
];

// The suites under test/application/ and test/cli/ run the whole pipeline end
// to end, so most mutants they kill a model suite kills sooner.
const END_TO_END = /\/test\/(application|cli)\//;

const tier = (moduleId: string): number => {
  const schema = SCHEMA_SUITES.findIndex((suite) => moduleId.endsWith(suite));
  if (schema !== -1) return schema;
  return SCHEMA_SUITES.length + Number(END_TO_END.test(moduleId));
};

class CheapestFirst extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return Promise.resolve(
      [...files].sort(
        (a, b) =>
          tier(a.moduleId) - tier(b.moduleId) ||
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
      "test/application/images-lock-shares.test.ts",
      // The CLI in process; its process-level runs reach no instrumented code.
      "test/cli/main.test.ts",
      "test/cli/index.test.ts",
      "test/cli/conventions.test.ts",
      "test/adapters/contract.test.ts",
      "test/adapters/flux-source.test.ts",
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
