# Repository contracts

A behaviour of this repository's own tree: its decision records, links, documents, module boundaries, test harness, coverage, ledgers, specification codes and the frozen `emf/` wiring.

| id | a contributor or a consumer can rely on | proved by |
|---|---|---|
| REQ-001 | Every decision record under `docs/adr/` and `emf/docs/adr/` satisfies its frontmatter, register and citation contract, and no number is used in both | [test/adr-contract.test.ts](../../test/adr-contract.test.ts) |
| REQ-002 | Every relative link and heading anchor in Markdown git does not ignore, outside the frozen `emf/`, resolves to a real target | [test/link-contract.test.ts](../../test/link-contract.test.ts) |
| REQ-003 | Every rendered Kubernetes manifest in the worked examples validates against its pinned schema | [test/manifest-contract.test.ts](../../test/manifest-contract.test.ts) |
| REQ-004 | The compiler's layer boundaries and module reachability are enforced on the dependency graph, not on review alone | [test/boundary-contract.test.ts](../../test/boundary-contract.test.ts) |
| REQ-006 | No em-dash enters tracked text outside `docs/mde/` and `CHANGELOG.md` | [test/emdash.test.ts](../../test/emdash.test.ts) |
| REQ-007 | A test that reaches the network, is committed focused or skipped, sleeps a fixed duration, or asserts nothing never reaches a green build | [test/harness.test.ts](../../test/harness.test.ts) |
| REQ-008 | Coverage is a ratchet: no `v8`, `c8` or `istanbul` ignore comment exempts a line from it | [test/harness.test.ts](../../test/harness.test.ts) |
| REQ-010 | A gate's npm script and the CI job that runs it land in the same pull request, so neither can drift from the other unnoticed | [test/pipeline-wiring.test.ts](../../test/pipeline-wiring.test.ts) |
| REQ-011 | Every script, path, coverage number and Node version README.md and CONTRIBUTING.md name matches the repository they describe | [test/docs-contract.test.ts](../../test/docs-contract.test.ts) |
| REQ-013 | `npm run verify` runs the same secret scan CI runs, failing on a committed secret rather than only after a push | [test/secret-scan-contract.test.ts](../../test/secret-scan-contract.test.ts) |
| REQ-014 | Every rule this repository enforces has a ledger row with a greppable id and a fixture that proves it fires, and a rule not enforced yet is listed as pending with a ticket and a reason rather than dropped | [test/rules-contract.test.ts](../../test/rules-contract.test.ts) |
| REQ-015 | The model-driven build CI runs is the build in the tree: no workflow runs the Maven wrapper where there is no build, the reactor names no missing module, and CodeQL scans its Java | [test/emf-wiring.test.ts](../../test/emf-wiring.test.ts) |
| REQ-016 | A code scanning finding of any severity fails `Pipeline Complete`, so it blocks the merge rather than only landing in the Security tab | [test/pipeline-wiring.test.ts](../../test/pipeline-wiring.test.ts) |
| REQ-017 | Every error code the specification defines is exercised by a test, or pending on the ticket that will exercise it, and no code the specification does not define is used in the tree | [test/codes-lint.test.ts](../../test/codes-lint.test.ts) |
| REQ-018 | The compiler's inner rings cannot read the environment, the clock, randomness, a child process or the filesystem synchronously, and only `src/cli/boundary.ts` exits the process or writes output | [test/seams.test.ts](../../test/seams.test.ts) |
| REQ-028 | A term the model retired is checked outside a quotation, and a stated count is checked against the real collection it claims to count | [test/meaning-contract.test.ts](../../test/meaning-contract.test.ts) |
| REQ-032 | AGENTS.md names every npm script package.json defines, verbatim, so a script added there cannot go undocumented | [test/agents-contract.test.ts](../../test/agents-contract.test.ts) |
