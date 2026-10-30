# The `graph` family

Rules on the graph's shape: cycles, orphans, reachability, resolution.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-014 | graph | No import cycle between modules | `depcruise:no-circular` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `no-circular` |
| RULE-015 | graph | No orphan module: every module but an entry point is imported by something | `depcruise:no-orphans` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `no-orphans` |
| RULE-016 | graph | Every module is reachable from an entry point, which is the half a coverage gate cannot see | `depcruise:unreachable-from-an-entry-point` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `unreachable-from-an-entry-point` |
| RULE-017 | graph | Every relative import in shipped code resolves to a file on disk; a bare specifier is the package manager's and the type checker's to answer for | `depcruise:no-unresolvable-import` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `no-unresolvable-import` |
| RULE-018 | graph | No cycle between directories, which a module-level cycle check cannot see | `depcruise:no-circular-folders` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `no-circular-folders` |
| RULE-019 | graph | No computed dynamic import: a specifier the graph cannot read is an edge no gate can check | `eslint:deploy-kit/no-computed-dynamic-import` | [test/code-rules.test.ts](../../test/code-rules.test.ts) `RULE-019: a dynamic import names its module literally` |
