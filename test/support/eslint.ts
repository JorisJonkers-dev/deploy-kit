// The repository's own ESLint configuration, for a suite that lints probes
// from memory. The configuration is imported here rather than found on disk
// by ESLint, so the rules it loads are the same modules the suite measures:
// ESLint's own import of eslint.config.js would load a second copy, whose
// branches coverage cannot merge with this one.
import { join } from "node:path";
import { ESLint, type Linter } from "eslint";

const REPOSITORY = join(import.meta.dirname, "..", "..");
const CONFIG = join(REPOSITORY, "eslint.config.js");
// The configuration is JavaScript with no declaration file, so its type is
// stated here, once.
const { default: config } = (await import(CONFIG)) as {
  default: Linter.Config[];
};

/**
 * An ESLint that lints as this repository does, admitting `probes` (paths
 * that are not on disk) to the default project.
 */
export function repositoryEslint(probes: readonly string[]): ESLint {
  return new ESLint({
    cwd: REPOSITORY,
    overrideConfigFile: true,
    baseConfig: config,
    overrideConfig: {
      languageOptions: {
        parserOptions: {
          projectService: { allowDefaultProject: ["*.js", "*.cjs", ...probes] },
          tsconfigRootDir: REPOSITORY,
        },
      },
    },
  });
}
