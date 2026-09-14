# Behaviour ledger

This is not [`docs/architecture-rules.md`](architecture-rules.md). That ledger
lists the rules a tool enforces: a dependency-cruiser check, an ESLint rule, a
gate script, each keyed to its enforcer and to the fixture that proves it
fires. This one lists the behaviours a person depends on: a sentence a
contributor or a consumer can rely on, keyed to the test that fails the moment
it stops being true. A behaviour can rest on several rules, and one rule can
serve several behaviours, so the two ledgers stay separate on purpose.

A behaviour can lose its proof without anything saying so: the coverage
ratchet notices a line that stops running, but not a test file that was
renamed, emptied or deleted while the code it covered stayed in place. Every
id below is greppable, and a comment naming one resolves to a row rather than
to nothing.
[`scripts/lint-requirements.ts`](../scripts/lint-requirements.ts) is what
holds this document honest: every row parses; every named file exists, is a
test file and holds at least one test; ids are unique; the count this
document states matches the number of rows it holds; and every id cited
anywhere in the tracked tree resolves to a row here.

This ledger holds **14** rows. The compiler's behaviours join it as they land.

| id | a contributor or a consumer can rely on | proved by |
|---|---|---|
| REQ-001 | Every decision record under `docs/adr/` and `emf/docs/adr/` satisfies its frontmatter, register and citation contract, and no number is used in both | [test/adr-contract.test.ts](../test/adr-contract.test.ts) |
| REQ-002 | Every relative link and heading anchor in tracked Markdown resolves to a real target | [test/link-contract.test.ts](../test/link-contract.test.ts) |
| REQ-003 | Every rendered Kubernetes manifest in the worked examples validates against its pinned schema | [test/manifest-contract.test.ts](../test/manifest-contract.test.ts) |
| REQ-004 | The compiler's layer boundaries and module reachability are enforced on the dependency graph, not on review alone | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) |
| REQ-005 | A pull request title and its commits use a conventional-commit type release-please reads | [test/pr-title-contract.test.ts](../test/pr-title-contract.test.ts) |
| REQ-006 | No em-dash enters tracked text outside `docs/mde/` and `CHANGELOG.md` | [test/emdash.test.ts](../test/emdash.test.ts) |
| REQ-007 | A test that reaches the network, is committed focused or skipped, sleeps a fixed duration, or asserts nothing never reaches a green build | [test/harness.test.ts](../test/harness.test.ts) |
| REQ-008 | Coverage is a ratchet: no `v8`, `c8` or `istanbul` ignore comment exempts a line from it | [test/harness.test.ts](../test/harness.test.ts) |
| REQ-009 | The npm package ships nothing outside `docs/adr/` and `spec/`, checked against what npm would really pack rather than the advisory `files` field | [test/package-contents-contract.test.ts](../test/package-contents-contract.test.ts) |
| REQ-010 | A gate's npm script and the CI job that runs it land in the same pull request, so neither can drift from the other unnoticed | [test/pipeline-wiring.test.ts](../test/pipeline-wiring.test.ts) |
| REQ-011 | Every script, path, coverage number and Node version README.md and CONTRIBUTING.md name matches the repository they describe | [test/docs-contract.test.ts](../test/docs-contract.test.ts) |
| REQ-012 | A pull request's title, body and every commit in it carry no agent attribution: no Co-Authored-By trailer naming a coding agent, no "generated with" banner naming one, no link back to an agent session | [test/pr-title-contract.test.ts](../test/pr-title-contract.test.ts) |
| REQ-013 | `npm run verify` runs the same secret scan CI runs, failing on a committed secret rather than only after a push | [test/secret-scan-contract.test.ts](../test/secret-scan-contract.test.ts) |
| REQ-014 | Every rule this repository enforces has a ledger row with a greppable id and a fixture that proves it fires, and a rule not enforced yet is listed as pending with a ticket and a reason rather than dropped | [test/rules-contract.test.ts](../test/rules-contract.test.ts) |
