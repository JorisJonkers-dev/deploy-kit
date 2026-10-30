# The `dependencies` family

Rules on what may be imported from outside the tree.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-020 | dependencies | Shipped code never imports a devDependency | `depcruise:no-dev-dependency-in-src` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `no-dev-dependency-in-src` |
| RULE-021 | dependencies | No deprecated Node builtin: a deprecated import is a migration already overdue | `depcruise:not-to-deprecated-core` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `not-to-deprecated-core` |
| RULE-022 | dependencies | No package an architecture decision already rejected: the Kubernetes client, a second JSON Schema validator, a Zod-to-JSON-Schema converter, or a text template engine | `depcruise:no-denied-dependency` | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) `no-denied-dependency` |
| RULE-023 | dependencies | A Node builtin is imported under its `node:` prefix | `eslint:deploy-kit/node-builtin-prefix` | [test/code-rules.test.ts](../../test/code-rules.test.ts) `RULE-023: import "node:` |
| RULE-071 | dependencies | Every dependency in `package.json` is one exact version: no caret, tilde, wildcard, tag or range, so an install resolves to the version a reviewer saw | `file:test/supply-chain.test.ts` | [test/supply-chain.test.ts](../../test/supply-chain.test.ts) `not an exact version; pin it` |
| RULE-072 | dependencies | No install runs a dependency's lifecycle script: every workflow and action installs with `--ignore-scripts`, and `.npmrc` sets `ignore-scripts` for a local install | `file:test/supply-chain.test.ts` | [test/supply-chain.test.ts](../../test/supply-chain.test.ts) `add --ignore-scripts` |
