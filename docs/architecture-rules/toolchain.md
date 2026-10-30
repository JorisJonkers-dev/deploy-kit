# The `toolchain` family

Rules on the compiler options, the lint presets, the coverage ratchet.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-035 | toolchain | A TypeScript suppression carries a description and may never silence a whole file | `eslint:@typescript-eslint/ban-ts-comment` | [test/eslint-rules.test.ts](../../test/eslint-rules.test.ts) `@typescript-eslint/ban-ts-comment` |
| RULE-036 | toolchain | No `any`: a value the compiler cannot describe is a check nobody runs | `eslint:@typescript-eslint/no-explicit-any` | [test/eslint-rules.test.ts](../../test/eslint-rules.test.ts) `@typescript-eslint/no-explicit-any` |
| RULE-037 | toolchain | No unused binding, unless it is named with a leading underscore to say so | `eslint:@typescript-eslint/no-unused-vars` | [test/eslint-rules.test.ts](../../test/eslint-rules.test.ts) `@typescript-eslint/no-unused-vars` |
| RULE-038 | toolchain | No object or nullable interpolated into a template literal: a number has one sensible string form, and those do not | `eslint:@typescript-eslint/restrict-template-expressions` | [test/eslint-rules.test.ts](../../test/eslint-rules.test.ts) `@typescript-eslint/restrict-template-expressions` |
| RULE-039 | toolchain | The recommended and `strictTypeChecked` presets apply to every TypeScript file with type information, so a floating promise or an empty catch fails lint without this repository naming either rule | `file:eslint.config.js` | [test/eslint-rules.test.ts](../../test/eslint-rules.test.ts) `@typescript-eslint/no-floating-promises` |
| RULE-040 | toolchain | Coverage is a ratchet over an explicit include list, and no ignore comment exempts a line from it | `file:vitest.config.ts` | [test/harness.test.ts](../../test/harness.test.ts) `an ignore is slack nobody decided` |
| RULE-041 | toolchain | No default export outside a tool configuration file | `eslint:no-restricted-exports` | [test/seams.test.ts](../../test/seams.test.ts) `RULE-041 refuses a default export` |
| RULE-042 | toolchain | Shipped code is ESM, and the one CommonJS file is the dependency-cruiser configuration that cannot be anything else | `eslint:deploy-kit/esm-only` | [test/code-rules.test.ts](../../test/code-rules.test.ts) `is CommonJS; this package is ESM` |
| RULE-043 | toolchain | Generated artifacts are committed, and CI fails when regenerating one produces a diff | `file:src/model/json-schema.ts` | [test/model/descriptor.test.ts](../../test/model/descriptor.test.ts) `regenerates without a diff` |
| RULE-073 | toolchain | A schema in `src/` states only what its generated JSON Schema states too: no `refine`, `superRefine`, `check`, `overwrite`, `transform`, `preprocess`, `pipe` or `custom`, outside the one module that pairs a zod check with the JSON Schema keywords stating the same rule | `eslint:deploy-kit/no-unstated-rule` | [test/code-rules.test.ts](../../test/code-rules.test.ts) `RULE-073 refuses a rule the published JSON Schema drops` |
