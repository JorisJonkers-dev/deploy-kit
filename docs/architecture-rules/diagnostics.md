# The `diagnostics` family

Rules on the shape of a failure and the codes it carries.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-047 | diagnostics | Every diagnostic carries a code, a document path, a message and a non-empty hint, enforced by its type rather than by review | pending (#38): the `Diagnostic` type is the enforcement, and it lands with the first parser | pending |
| RULE-048 | diagnostics | Every `E_` code the specification defines is exercised by a test or a negative example, or listed as pending with a reason, and a code used in the tree that the specification does not define fails | `npm:lint:codes` | [test/codes-lint.test.ts](../../test/codes-lint.test.ts) `exercised by no test, and not pending` |
| RULE-074 | diagnostics | Shipped code throws only an `InternalFailure` of a named kind (unsupported, unchecked or a broken invariant), never a bare `Error` or `TypeError`, so every way the compiler fails is one enumerable list | `eslint:deploy-kit/no-bare-throw` | [test/code-rules.test.ts](../../test/code-rules.test.ts) `RULE-074 refuses a bare error thrown in src/` |
