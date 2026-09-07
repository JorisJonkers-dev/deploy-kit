import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".github-workflows/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      globals: { ...globals.node },
      sourceType: "module",
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
      // docs/adr/0053-adapter-port-contract.md makes the ratchet a decision:
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
    },
  },
);
