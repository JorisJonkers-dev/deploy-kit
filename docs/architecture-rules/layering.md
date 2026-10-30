# The `layering` family

Rules on which ring may import which, on the module graph.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-001 | layering | The metamodels import nothing else of the compiler: every step shares them, so they reach for no step | `depcruise:model-is-pure` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `model-is-pure` |
| RULE-002 | layering | Zod is imported only by the metamodels and the reader: the schema is the authored metamodel, and a step past the reader reads its types | `depcruise:zod-is-the-metamodel-and-the-reader` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `zod-is-the-metamodel-and-the-reader` |
| RULE-003 | layering | No step imports another step: the reader, the checks, the lowering, resolution and the generator each import the model and their own directory, and the use-case passes each model on | `depcruise:no-step-imports-another-step` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `no-step-imports-another-step` |
| RULE-004 | layering | The typed Kubernetes object model imports nothing from the compiler: it is a shape, not a participant | `depcruise:objects-are-data` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `objects-are-data` |
| RULE-005 | layering | No adapter imports another adapter; shared code goes to `src/adapters/shared/` | `depcruise:adapters-do-not-read-each-other` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `adapters-do-not-read-each-other` |
| RULE-006 | layering | A use-case takes ports, never a concrete infrastructure implementation | `depcruise:application-takes-ports-not-adapters` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `application-takes-ports-not-adapters` |
| RULE-007 | layering | Infrastructure implements ports: it does not orchestrate, parse or render | `depcruise:infrastructure-implements-ports-only` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `infrastructure-implements-ports-only` |
| RULE-008 | layering | Nothing inside imports the CLI ring | `depcruise:nothing-depends-on-the-cli` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `nothing-depends-on-the-cli` |
| RULE-009 | layering | Shipped code never imports a test file or anything under `dist/` | `depcruise:shipped-code-imports-no-test-or-build-output` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `shipped-code-imports-no-test-or-build-output` |
