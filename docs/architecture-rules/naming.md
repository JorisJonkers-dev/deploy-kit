# The `naming` family

Rules on how modules, files and types are named.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-024 | naming | A module file is named in kebab-case | `eslint:deploy-kit/kebab-case-filename` | [test/code-rules.test.ts](../../test/code-rules.test.ts) `is not named in kebab-case` |
| RULE-025 | naming | No `I`-prefixed interface name: the interface is the noun, and the implementation carries the adjective | `eslint:@typescript-eslint/naming-convention` | [test/seams.test.ts](../../test/seams.test.ts) `RULE-025 refuses an I-prefixed interface` |
| RULE-026 | naming | A type-only import is written `import type`, so erasure is visible in the file rather than inferred | `eslint:@typescript-eslint/consistent-type-imports` | [test/seams.test.ts](../../test/seams.test.ts) `RULE-026 refuses a type-only import` |
