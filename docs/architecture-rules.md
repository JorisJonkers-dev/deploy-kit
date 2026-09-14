# Rule ledger

This is not [`docs/requirements.md`](requirements.md). That ledger lists the
behaviours **a person depends on**: a sentence a contributor or a consumer can
rely on, keyed to the test that fails the moment it stops being true. This one
lists the rules **a tool enforces**: a dependency-cruiser check, an ESLint rule,
a gate script, each keyed to the enforcer that runs it and to the fixture that
proves it fires. A behaviour can rest on several rules, and one rule can serve
several behaviours, so the two ledgers stay separate on purpose, and their id
spaces (`REQ-NNN` and `RULE-NNN`) never overlap.

A rule can stop being enforced without anything saying so: a
dependency-cruiser entry deleted, an ESLint rule turned off, a negative fixture
rewritten past the case it was written for. The suite stays green either way,
because a rule that no longer fires breaks nothing.
[`scripts/lint-rules.ts`](../scripts/lint-rules.ts) is what holds this document
honest: every row parses and carries a declared family; every enforced row's
enforcer resolves against the tree; every enforced row names a real test file
that mentions the literal its fixture asserts on; every pending row carries a
ticket and a reason and names no fixture; every rule this repository configures
by name is claimed by exactly one enforced row; the stated counts match what the
document holds; and every `RULE-NNN` cited anywhere in the tracked tree resolves
to a row here.

## The id

`RULE-NNN`, a flat estate-wide sequence, three digits, in a namespace of its
own so a grep for `RULE-017` finds the rule and a grep for `REQ-004` finds the
behaviour. The family is a **column, not a prefix**: a rule's family is a
reading aid that can be revised, and an id that encoded it would become a lie
the first time a rule was reclassified. The id is what a failure quotes, so it
has to outlive every opinion about where the rule belongs.

## Families

Eleven, the set [issue #21](https://github.com/JorisJonkers-dev/deploy-kit/issues/21)
named, each normalised to one word. None was added and none dropped: what this
repository's own enforcement changed is which families have members today
(`layering`, `purity`, `graph`, `dependencies`, `tests`, `toolchain` and
`gates`) and which are entirely pending until the compiler exists (`naming`,
`cli`, `registry`, `diagnostics`). A family declared here and used by no rule
fails the gate, so the taxonomy cannot grow entries nothing stands behind.

| family | covers |
|---|---|
| layering | which ring may import which, on the module graph |
| purity | ambient capability: what a ring may reach for beyond its own imports |
| graph | the graph's shape: cycles, orphans, reachability, resolution |
| dependencies | what may be imported from outside the tree |
| naming | how modules, files and types are named |
| tests | what a test may do, and must do |
| toolchain | the compiler options, the lint presets, the coverage ratchet |
| cli | the outermost ring's own conventions |
| registry | the registries: adapters, and the estate-wide invariants |
| diagnostics | the shape of a failure and the codes it carries |
| gates | this repository's own documents and pipeline |

## Rules

This ledger holds **63** rules, **12** of them pending.

A row is enforced or pending, never both. An enforced row names its enforcer as
`kind:value`: `depcruise:` a rule in
[`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs), `eslint:` a rule id in
[`eslint.config.js`](../eslint.config.js), `npm:` a script in `package.json`,
`file:` a file that carries the rule itself. Its proof names the fixture and,
in backticks, the **witness**: the literal that fixture asserts on. Delete the
case and the witness goes with it, which is what makes the proof column
checkable rather than decorative.

A pending row reads `pending (#NNN): reason`, or `pending (n/a): reason` when no
ticket will bring it because it waits on something outside this repository's
plan. It names no fixture: pending may never read as proven. And because every
rule this repository configures by name must be claimed by an **enforced** row,
moving a live rule to pending fails the gate rather than quietly retiring it.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-001 | layering | The domain imports nothing outside `src/domain/`: what it needs from the world arrives through a port it declares | `depcruise:domain-is-pure` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `domain-is-pure` |
| RULE-002 | layering | The domain never imports Zod: the authoring shape is not the model, and a mapper stands between them | `depcruise:domain-does-not-know-the-wire` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `domain-does-not-know-the-wire` |
| RULE-003 | layering | The wire layer parses and maps inward only: it renders nothing and orchestrates nothing | `depcruise:wire-maps-inward-only` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `wire-maps-inward-only` |
| RULE-004 | layering | The typed Kubernetes object model imports nothing from the compiler: it is a shape, not a participant | `depcruise:objects-are-data` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `objects-are-data` |
| RULE-005 | layering | No adapter imports another adapter; shared code goes to `src/adapters/shared/` | `depcruise:adapters-do-not-read-each-other` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `adapters-do-not-read-each-other` |
| RULE-006 | layering | A use-case takes ports, never a concrete infrastructure implementation | `depcruise:application-takes-ports-not-adapters` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `application-takes-ports-not-adapters` |
| RULE-007 | layering | Infrastructure implements ports: it does not orchestrate, parse or render | `depcruise:infrastructure-implements-ports-only` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `infrastructure-implements-ports-only` |
| RULE-008 | layering | Nothing inside imports the CLI ring | `depcruise:nothing-depends-on-the-cli` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `nothing-depends-on-the-cli` |
| RULE-009 | layering | Shipped code never imports a test file or anything under `dist/` | `depcruise:shipped-code-imports-no-test-or-build-output` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `shipped-code-imports-no-test-or-build-output` |
| RULE-010 | purity | The domain reaches for no filesystem, network, clock, environment, process or crypto: hashing arrives through a port | `depcruise:domain-reads-nothing-ambient` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `domain-reads-nothing-ambient` |
| RULE-011 | purity | An adapter renders only: documents in, attributed Deliverables out, with no ambient read and no outward import | `depcruise:adapters-render-only` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `adapters-render-only` |
| RULE-012 | purity | Environment, clock, randomness, console, spawning and synchronous filesystem calls are allowed only in the infrastructure and CLI rings | `eslint:no-restricted-syntax` | [test/seams.test.ts](../test/seams.test.ts) `no-restricted-syntax: RULE-012` |
| RULE-013 | purity | Exiting the process and writing to stdout or stderr happen only in `src/cli/boundary.ts`, the one file excluded from coverage | `eslint:no-restricted-properties` | [test/seams.test.ts](../test/seams.test.ts) `RULE-013: the process is touched only in src/cli/boundary.ts` |
| RULE-014 | graph | No import cycle between modules | `depcruise:no-circular` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `no-circular` |
| RULE-015 | graph | No orphan module: every module but an entry point is imported by something | `depcruise:no-orphans` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `no-orphans` |
| RULE-016 | graph | Every module is reachable from an entry point, which is the half a coverage gate cannot see | `depcruise:unreachable-from-an-entry-point` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `unreachable-from-an-entry-point` |
| RULE-017 | graph | Every relative import in shipped code resolves to a file on disk; a bare specifier is the package manager's and the type checker's to answer for | `depcruise:no-unresolvable-import` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `no-unresolvable-import` |
| RULE-018 | graph | No cycle between directories, which a module-level cycle check cannot see | pending (#105): needs a collapsed-graph pass over `src/`, which the module-level cycle check cannot express | pending |
| RULE-019 | graph | No computed dynamic import: a specifier the graph cannot read is an edge no gate can check | pending (#105): an AST check over `src/`, and `no-restricted-syntax` already carries RULE-012 | pending |
| RULE-020 | dependencies | Shipped code never imports a devDependency | `depcruise:no-dev-dependency-in-src` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `no-dev-dependency-in-src` |
| RULE-021 | dependencies | No deprecated Node builtin: a deprecated import is a migration already overdue | `depcruise:not-to-deprecated-core` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `not-to-deprecated-core` |
| RULE-022 | dependencies | No package an architecture decision already rejected: the Kubernetes client, a second JSON Schema validator, a Zod-to-JSON-Schema converter, or a text template engine | `depcruise:no-denied-dependency` | [test/boundary-contract.test.ts](../test/boundary-contract.test.ts) `no-denied-dependency` |
| RULE-023 | dependencies | A Node builtin is imported under its `node:` prefix | pending (#105): no configured lint rule reads an import specifier's prefix | pending |
| RULE-024 | naming | A module file is named in kebab-case | pending (#105): no configured lint rule reads file names | pending |
| RULE-025 | naming | No `I`-prefixed interface name: the interface is the noun, and the implementation carries the adjective | `eslint:@typescript-eslint/naming-convention` | [test/seams.test.ts](../test/seams.test.ts) `RULE-025 refuses an I-prefixed interface` |
| RULE-026 | naming | A type-only import is written `import type`, so erasure is visible in the file rather than inferred | `eslint:@typescript-eslint/consistent-type-imports` | [test/seams.test.ts](../test/seams.test.ts) `RULE-026 refuses a type-only import` |
| RULE-027 | tests | No committed `.only`: a focused test is a suite that is green for the wrong reason | `eslint:vitest/no-focused-tests` | [test/harness.test.ts](../test/harness.test.ts) `vitest/no-focused-tests` |
| RULE-028 | tests | No committed `.skip`: a disabled test proves nothing and reads as covered | `eslint:vitest/no-disabled-tests` | [test/harness.test.ts](../test/harness.test.ts) `vitest/no-disabled-tests` |
| RULE-029 | tests | No test without an assertion: a test that asserts nothing passes for ever | `eslint:vitest/expect-expect` | [test/harness.test.ts](../test/harness.test.ts) `vitest/expect-expect` |
| RULE-030 | tests | No fixed sleep through a timer global: slow when it passes, flaky when the machine is busy | `eslint:no-restricted-globals` | [test/harness.test.ts](../test/harness.test.ts) `no-restricted-globals` |
| RULE-031 | tests | No fixed sleep through the timers module either, which is the same defect under another import | `eslint:no-restricted-imports` | [test/harness.test.ts](../test/harness.test.ts) `no-restricted-imports` |
| RULE-032 | tests | No test reaches the network: the capability is removed, and using it fails the test that tried | `file:test/setup.ts` | [test/harness.test.ts](../test/harness.test.ts) `tried to reach` |
| RULE-033 | tests | A test never imports another test: a shared fixture belongs in `test/support/` | pending (#105): wants a graph pass over `test/`, which the boundary gate does not run | pending |
| RULE-034 | tests | The rendered tree is compared byte for byte against a committed golden tree, and a double render inside one process and in a fresh one agrees with it | pending (n/a): there is no renderer to render anything, and issue #21 puts the golden tree out of scope until one exists | pending |
| RULE-035 | toolchain | A TypeScript suppression carries a description and may never silence a whole file | `eslint:@typescript-eslint/ban-ts-comment` | [test/eslint-rules.test.ts](../test/eslint-rules.test.ts) `@typescript-eslint/ban-ts-comment` |
| RULE-036 | toolchain | No `any`: a value the compiler cannot describe is a check nobody runs | `eslint:@typescript-eslint/no-explicit-any` | [test/eslint-rules.test.ts](../test/eslint-rules.test.ts) `@typescript-eslint/no-explicit-any` |
| RULE-037 | toolchain | No unused binding, unless it is named with a leading underscore to say so | `eslint:@typescript-eslint/no-unused-vars` | [test/eslint-rules.test.ts](../test/eslint-rules.test.ts) `@typescript-eslint/no-unused-vars` |
| RULE-038 | toolchain | No object or nullable interpolated into a template literal: a number has one sensible string form, and those do not | `eslint:@typescript-eslint/restrict-template-expressions` | [test/eslint-rules.test.ts](../test/eslint-rules.test.ts) `@typescript-eslint/restrict-template-expressions` |
| RULE-039 | toolchain | The recommended and `strictTypeChecked` presets apply to every TypeScript file with type information, so a floating promise or an empty catch fails lint without this repository naming either rule | `file:eslint.config.js` | [test/eslint-rules.test.ts](../test/eslint-rules.test.ts) `@typescript-eslint/no-floating-promises` |
| RULE-040 | toolchain | Coverage is a ratchet over an explicit include list, and no ignore comment exempts a line from it | `file:vitest.config.ts` | [test/harness.test.ts](../test/harness.test.ts) `an ignore is slack nobody decided` |
| RULE-041 | toolchain | No default export outside a tool configuration file | `eslint:no-restricted-exports` | [test/seams.test.ts](../test/seams.test.ts) `RULE-041 refuses a default export` |
| RULE-042 | toolchain | Shipped code is ESM, and the one CommonJS file is the dependency-cruiser configuration that cannot be anything else | pending (#105): stated by `type: module`; no configured rule refuses a second CommonJS file | pending |
| RULE-043 | toolchain | Generated artifacts are committed, and CI fails when regenerating one produces a diff | pending (#38): the first generator is the JSON Schema #38 derives from the Project Intent metamodel, and its diff check lands with it | pending |
| RULE-044 | cli | The CLI prints help on `--help` and `-h`, data on stdout and diagnostics on stderr, emits only data under `--json`, maps failures through one exit-code enum, honours `NO_COLOR`, and never prompts | pending (#105): each clause needs a process-level test, and the CLI ring does not exist yet | pending |
| RULE-045 | registry | Every registered adapter satisfies the adapter port, attributes every Deliverable to itself, and renders deterministically | pending (#97): the adapter contract suite arrives with the first adapter | pending |
| RULE-046 | registry | Every estate-wide invariant is registered with its code, its spec anchor and its test, so an unregistered one is detectable rather than merely absent | pending (#44): the invariant registry is that ticket's deliverable | pending |
| RULE-047 | diagnostics | Every diagnostic carries a code, a document path, a message and a non-empty hint, enforced by its type rather than by review | pending (#38): the `Diagnostic` type is the enforcement, and it lands with the first parser | pending |
| RULE-048 | diagnostics | Every `E_` code the specification defines is exercised by a test or a negative example, or listed as pending with a reason, and a code used in the tree that the specification does not define fails | `npm:lint:codes` | [test/codes-lint.test.ts](../test/codes-lint.test.ts) `exercised by no test, and not pending` |
| RULE-049 | gates | Every decision record satisfies the frontmatter, register, citation and normative-anchor contract | `npm:lint:adrs` | [test/adr-lint-negative.test.ts](../test/adr-lint-negative.test.ts) `missing frontmatter block` |
| RULE-050 | gates | Every relative link and heading anchor in tracked Markdown resolves | `npm:lint:links` | [test/link-contract.test.ts](../test/link-contract.test.ts) `anchor #the-old-name not found` |
| RULE-051 | gates | Every rendered example object validates against its pinned Kubernetes or CRD schema | `npm:lint:manifests` | [test/manifest-contract.test.ts](../test/manifest-contract.test.ts) `no rendered examples found` |
| RULE-052 | gates | Every behaviour ledger row parses, names a real non-empty test, matches the stated count, and is cited by no dangling id | `npm:lint:requirements` | [test/requirements-lint-negative.test.ts](../test/requirements-lint-negative.test.ts) `ledger missing` |
| RULE-053 | gates | Every script, path, coverage number and Node version README.md and CONTRIBUTING.md name matches the repository | `npm:lint:docs` | [test/docs-contract.test.ts](../test/docs-contract.test.ts) `is not a script in package.json` |
| RULE-054 | gates | Every rule ledger row parses, resolves its enforcer, names a fixture that mentions its witness, and every configured rule is claimed by exactly one enforced row | `npm:lint:rules` | [test/rules-lint-negative.test.ts](../test/rules-lint-negative.test.ts) `ledger missing` |
| RULE-055 | gates | The npm package ships nothing outside `docs/adr/` and `spec/`, checked against what npm would really pack | `file:scripts/check-package-contents.ts` | [test/package-contents-contract.test.ts](../test/package-contents-contract.test.ts) `ship files outside docs` |
| RULE-056 | gates | A pull request title and every commit in it use a conventional-commit type release-please reads | `file:scripts/check-pr-title.ts` | [test/pr-title-contract.test.ts](../test/pr-title-contract.test.ts) `is not a Conventional Commit` |
| RULE-057 | gates | No pull request title, body or commit carries agent attribution: no trailer, no banner, no link back to a session | `file:scripts/check-pr-title.ts` | [test/pr-title-contract.test.ts](../test/pr-title-contract.test.ts) `google-labs-jules` |
| RULE-058 | gates | No em-dash enters tracked text outside `docs/mde/` and `CHANGELOG.md` | `file:test/emdash.test.ts` | [test/emdash.test.ts](../test/emdash.test.ts) `contains an em-dash` |
| RULE-059 | gates | A gate's npm script and the CI job that runs it land together, or the script is listed pending with a reason | `file:test/pipeline-wiring.test.ts` | [test/pipeline-wiring.test.ts](../test/pipeline-wiring.test.ts) `every script either runs in some workflow` |
| RULE-060 | gates | No committed secret matching the default gitleaks ruleset or this repository's own allowlist, checked locally by the same command CI runs | `npm:lint:secrets` | [test/secret-scan-contract.test.ts](../test/secret-scan-contract.test.ts) `secret scan: could not run` |
| RULE-061 | gates | A workflow step that runs the Maven wrapper runs it in a directory holding a POM and the wrapper, and the model-driven reactor names only modules on disk | `file:test/emf-wiring.test.ts` | [test/emf-wiring.test.ts](../test/emf-wiring.test.ts) `which names a POM that does not exist` |
| RULE-062 | gates | CodeQL analyses the model-driven implementation's Java without a build, ignoring build output and generated sources | `file:.github/codeql/codeql-config.yml` | [test/emf-wiring.test.ts](../test/emf-wiring.test.ts) `'language': 'java-kotlin'` |
| RULE-063 | gates | A CodeQL finding of any severity fails `Pipeline Complete`, unless the finding is filtered in the CodeQL configuration | `file:.github/workflows/codeql.yml` | [test/pipeline-wiring.test.ts](../test/pipeline-wiring.test.ts) `'name': 'Fail on any finding'` |

## Considered and rejected

Proposing one of these again starts from the argument, not from scratch.

| rule | why not |
|---|---|
| A maximum file length, or a maximum function length | A number nobody can defend at the boundary. The rules that matter here are about edges in a graph, which have a truth value; a 41-line function does not |
| Inline suppressions for boundary rules, the way an `eslint-disable` comment works | An exemption a reviewer never sees is an exemption nobody decided. Where an exception is genuinely needed it belongs in the ruleset, named, with the reason beside it, which is the form every rule above already takes |
| One ESLint rule per layer, instead of the dependency-cruiser ruleset | ESLint sees one file at a time, so it can catch an import but never a cycle, an orphan or an unreachable subtree ([0069](adr/architecture/0069-boundaries-enforced-on-the-graph.md)). The fast local signal stays; the authority is the graph |
| Folding this ledger into `docs/requirements.md` | A rule and a behaviour answer different questions, and merging them would make the per-rule enforcer story and the per-behaviour test story compete for one row ([0103](adr/architecture/0103-a-behaviour-ledger-names-what-a-test-proves.md)) |
| A severity column, with `warn` as a value | A warning in CI is a rule nobody enforces. Every row above is an error, and a rule not worth failing a build for is a rule not worth a row |
