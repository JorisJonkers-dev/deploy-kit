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

This ledger holds **35** rows. The compiler's behaviours join it as they land.

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
| REQ-015 | The model-driven build CI runs is the build in the tree: no workflow runs the Maven wrapper where there is no build, the reactor names no missing module, and CodeQL scans its Java | [test/emf-wiring.test.ts](../test/emf-wiring.test.ts) |
| REQ-016 | A code scanning finding of any severity fails `Pipeline Complete`, so it blocks the merge rather than only landing in the Security tab | [test/pipeline-wiring.test.ts](../test/pipeline-wiring.test.ts) |
| REQ-017 | Every error code the specification defines is exercised by a test, or pending on the ticket that will exercise it, and no code the specification does not define is used in the tree | [test/codes-lint.test.ts](../test/codes-lint.test.ts) |
| REQ-018 | The compiler's inner rings cannot read the environment, the clock, randomness, a child process or the filesystem synchronously, and only `src/cli/boundary.ts` exits the process or writes output | [test/seams.test.ts](../test/seams.test.ts) |
| REQ-019 | Every committed oracle file is byte-identical to its own RFC 8785 canonicalisation, so a hand edit cannot leave one in a form the other implementation would not produce | [test/oracles.test.ts](../test/oracles.test.ts) |
| REQ-020 | The production implementation's canonical JSON writer sorts keys by UTF-16 code units, formats numbers as ECMAScript does, and refuses null, non-finite numbers, non-JSON values and lone surrogates, on the same cases as the model-driven writer | [test/canonical-json.test.ts](../test/canonical-json.test.ts) |
| REQ-021 | An authored Project Intent file parses to its committed intent oracle byte for byte, and YAML outside the one-document, anchor-free subset or a field outside the language is refused with a diagnostic rather than guessed at | [test/model/project-intent.test.ts](../test/model/project-intent.test.ts) |
| REQ-022 | Every module under `src/` is mutation-tested, and a surviving mutant that takes the score below the measured threshold fails the build | [test/mutation-contract.test.ts](../test/mutation-contract.test.ts) |
| REQ-023 | The Project Intent metamodel's structure is committed as a descriptor both implementations are held to, and the JSON Schema an editor completes a project file against regenerates from the metamodel without a diff | [test/model/descriptor.test.ts](../test/model/descriptor.test.ts) |
| REQ-024 | A Project Intent document, or a set of intent documents read together, that breaks a model constraint is refused with the code, the document and the JSON Pointer its committed diagnostics oracle names, and every refusal fixture carries one | [test/model/refusals.test.ts](../test/model/refusals.test.ts) |
| REQ-025 | Every file a pull request changes falls into a named shape bucket (production code, tests, specification, decision records, documentation, examples, tooling, CI, generated), and a file no rule claims fails the bucket test rather than silently joining one | [test/change-buckets.test.ts](../test/change-buckets.test.ts) |
| REQ-026 | A pull request's shape-and-coverage comment is updated in place on a second push, rather than posted again | [test/pr-report.test.ts](../test/pr-report.test.ts) |
| REQ-027 | A pull request's release candidate version sorts above the current release and below any version release-please could choose next | [test/rc-version.test.ts](../test/rc-version.test.ts) |
| REQ-028 | A citation to a decision record marked superseded is checked for its successor in the same sentence, a term the model retired is checked outside a quotation, and a stated count is checked against the real collection it claims to count | [test/meaning-contract.test.ts](../test/meaning-contract.test.ts) |
| REQ-029 | A route's and a scrape's `process` and `surface` link to the Process and surface they name inside their Application, and a name that links to nothing is refused with `E_UNKNOWN_PROCESS` or `E_UNKNOWN_SURFACE` at the pointer of the route or scrape | [test/model/links.test.ts](../test/model/links.test.ts) |
| REQ-030 | An authored Platform Intent file parses to its committed intent oracle byte for byte, and a tier that carries `authenticated` with no `forwardAuth` endpoint is refused with `E_NO_FORWARD_AUTH_ENDPOINT` at the tier | [test/model/platform-intent.test.ts](../test/model/platform-intent.test.ts) |
| REQ-031 | A Platform document and the Project documents read with it are checked together, and a tier proxy, audience, engine, durability class or at-rest secret delivery the Platform cannot satisfy is refused in the document that must change | [test/model/intent-set.test.ts](../test/model/intent-set.test.ts) |
| REQ-032 | AGENTS.md names every npm script package.json defines, verbatim, so a script added there cannot go undocumented | [test/agents-contract.test.ts](../test/agents-contract.test.ts) |
| REQ-033 | Chapter 20's worked projection validates against the Resolved Deployment metamodel, no key of that metamodel is a Kubernetes or Traefik field name, and each of the four defects the projection carried is refused if it is put back | [test/model/resolved-deployment.test.ts](../test/model/resolved-deployment.test.ts) |
| REQ-034 | The node contract publishes the seven nodes chapter 60 enumerates, with the capability counts it states, and a storage medium a node may hold that no Process may ask for | [test/model/node-contract.test.ts](../test/model/node-contract.test.ts) |
| REQ-035 | Every committed `resolved.json` validates against the Resolved Deployment metamodel and says the same thing as chapter 20's worked projection, and knowledge's resolved edges match its dependency oracle | [test/model/resolved-deployment.test.ts](../test/model/resolved-deployment.test.ts) |
