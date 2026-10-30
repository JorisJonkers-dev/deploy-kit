# The `purity` family

Rules on ambient capability: what a ring may reach for beyond its own imports.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-010 | purity | The metamodels and the steps reach for no filesystem, network, clock, environment, process or crypto: hashing arrives through a port | `depcruise:the-chain-reads-nothing-ambient` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `the-chain-reads-nothing-ambient` |
| RULE-011 | purity | An adapter renders only: documents in, attributed Deliverables out, with no ambient read and no outward import | `depcruise:adapters-render-only` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `adapters-render-only` |
| RULE-012 | purity | Environment, clock, randomness, console, spawning and synchronous filesystem calls are allowed only in the infrastructure and CLI rings | `eslint:no-restricted-syntax` | [test/seams.test.ts](../../test/seams.test.ts) `no-restricted-syntax: RULE-012` |
| RULE-013 | purity | Exiting the process and writing to stdout or stderr happen only in `src/cli/boundary.ts`, the one file excluded from coverage | `eslint:no-restricted-properties` | [test/seams.test.ts](../../test/seams.test.ts) `RULE-013: the process is touched only in src/cli/boundary.ts` |
