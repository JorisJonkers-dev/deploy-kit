import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const SLEEP = "Use a fake timer or wait on a condition, not a fixed delay";

export default defineConfig(
  {
    // .claude holds agent worktrees: whole checkouts of this repository,
    // which would otherwise be linted a second time.
    ignores: [
      ".claude/**",
      ".github-workflows/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "reports/**",
      // Maven build output from the model-driven implementation under emf/.
      "**/target/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      ecmaVersion: "latest",
      globals: { ...globals.node },
      sourceType: "module",
      parserOptions: {
        // The tool configs are not in tsconfig.json's include, because they
        // are not the program. They are still linted, with types.
        projectService: { allowDefaultProject: ["*.js", "*.cjs"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: { "no-undef": "off" },
  },
  {
    rules: {
      // Deliberately stricter than deploy-config-schema, which set this to
      // "off" and accumulated @ts-nocheck in ten files under "strict": true.
      // docs/adr/model/0053-adapter-port-contract.md makes the ratchet a decision:
      // suppressions must carry a description and may not silence a file.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-nocheck": true,
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // strictTypeChecked rejects a number in a template literal, which means
      // String(count) at every interpolation. A number has one sensible string
      // form; objects and nullables stay banned, which is the half of the rule
      // that catches real mistakes.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    // A committed .only or .skip is a suite that is green for the wrong
    // reason, a test that asserts nothing passes for ever, and a fixed sleep
    // is slow when it passes and flaky when the machine is busy.
    files: ["test/**/*.ts", "**/*.test.ts"],
    plugins: { vitest },
    rules: {
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/expect-expect": [
        "error",
        { assertFunctionNames: ["expect", "expect.*"] },
      ],
      "no-restricted-globals": [
        "error",
        { name: "setTimeout", message: SLEEP },
        { name: "setInterval", message: SLEEP },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "node:timers/promises", message: SLEEP },
            { name: "timers/promises", message: SLEEP },
          ],
        },
      ],
    },
  },
  {
    // dependency-cruiser reads only CommonJS config, so this is the one
    // CommonJS file in an ESM package.
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
);
