# The compiler's structure

Normative for **code**, the way [`spec/v1`](../spec/v1/00-overview.md) is
normative for the model. Decisions recorded in
[`docs/adr/architecture/`](adr/architecture/README.md) point their `normative:`
field at sections of this document, and `scripts/lint-adrs.ts` checks that the
anchor exists. Adding or renaming a `## ` heading here therefore breaks the
anchor check for any ADR that names it; change both together.

The boundary with the model is absolute: nothing here can change what the model
means. Where this document and a spec chapter appear to disagree about a model
rule, the chapter wins and this document is what gets fixed.

Sections are written as the compiler acquires them. A heading with no content
below it is a section not yet decided, and an ADR may not point at one.

## Layers

The compiler is a chain of typed models
([0056](adr/architecture/0056-the-compiler-is-a-chain-of-typed-models.md)):
Project Intent and Platform Intent are read, the lowering writes the Effective
Intent, resolution writes the Resolved Deployment, and the adapters write the
Deliverable Set, which one serializer turns into bytes. Each arrow is a
**step**, a pure function from one typed model to the next, in its own
directory. The graph is checked rather than described:
[`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) encodes every rule
below, and `npm run lint:boundaries` fails on a violation.

| directory | holds | may import |
|---|---|---|
| `model/` | every metamodel in the chain (the Zod schemas of the authored documents and of layer 2, the Effective Intent's types) and their pure queries; `Diagnostic`; the ports the core declares | `zod` only |
| `read/` | step: text in, the source model out (YAML, the env files, the schema) | `model/`, `yaml` |
| `check/` | step: the constraints, one function per code, named as the Complete OCL invariant | `model/` |
| `lower/` | step: Project Intent to the Effective Intent | `model/` |
| `resolve/` | step: the Effective Intent and the pinned inputs to the Resolved Deployment | `model/` |
| `objects/` | the typed Kubernetes object model the adapters build | nothing |
| `adapters/` | step: the registered adapters, one directory each, shared code in `adapters/shared/` | `model/`, `objects/`, `adapters/shared/` |
| `application/` | the use-cases: run the steps in order, pass each model on, perform no IO of their own | every step, `model/` |
| `infrastructure/` | port implementations: hashing, canonical JSON, the serializer, the writer | `model/`, `objects/` |
| `cli/` | argument parsing, diagnostic rendering, exit codes, wiring | everything |

A directory exists once it holds a module: `objects/`, `adapters/` and `cli/`
land with the slice that first needs them, and their rules wait with them.
`resolve/` holds the derivations the worked cases exercise so far; a family whose
derivation has not landed (a volume, a kv grant, an Asset, a managed migration,
a placeholder other than `${identity:…}`) stops the resolution with an error that
names it, rather than resolving without it. Four rules exist for a reason worth stating once.

**No step imports another step.** A step receives the previous model as a
value from the use-case. One that imported another step would turn evaluation
order into semantics, and would let an adapter read another adapter's output,
which makes attribution and path-collision detection unprovable.

**The chain reads nothing ambient.** No filesystem, network, clock,
environment or crypto in a metamodel or a step. Hashing arrives through a
port, which is what keeps `renderHash` a pure function of the pinned inputs
rather than of the machine.

**Queries live with their metamodel.** A query both a check and the lowering
need, such as the lowest level's answer to a Shared Intent question, lives in
`model/` beside the type it navigates, the way an OCL `def:` lives with its
context class.

**Nothing depends on the CLI.** Diagnostic rendering and exit-code mapping are
the outermost ring; a use-case that reached them could not be called by a test.

## Ports

Two use-cases, one core. `publish` runs in any repository that authors intent (
a project, or the platform) validates the Intent Fragment and pushes it by
digest, and renders nothing; `compose` runs centrally over the composed union
and is where every adapter runs
([0047](adr/model/0047-one-publication-path.md)). They share the model, and
neither performs an effect directly: everything that touches the world arrives
as a port the model declares and the CLI supplies.

| port | what it hides | production implementation |
|---|---|---|
| `PinnedInputSet` | resolving every Intent Fragment (the project files and the Platform document) the node contract, the locks and the ClusterState snapshot into parsed, validated, digested documents | filesystem plus OCI |
| `FragmentSource` / `FragmentPublisher` | reading and publishing Intent Fragments by digest | a directory: the CLI reads pulled fragments from one and writes a packed fragment to another, and the workflow around it runs `oras pull`, `oras push` and `oras resolve` |
| `Hasher` | the hash primitive | `node:crypto`, so the chain imports no crypto |
| `DeliverableWriter` | putting bytes on disk | staging directory plus atomic rename |

Two properties are load-bearing rather than tidy.

**One port resolves the whole pinned input set**, so the digests are computed in
one place and "the input set is closed"
([0006](adr/model/0006-pinned-inputs.md)) is expressed by a single type.
Widening it is one visible edit. That type is `PinnedSet` in
`src/model/resolution.ts`. `resolveIntentSet` takes the authored files as
values, as `checkIntentSet` does, and digests each input itself through the
`Hasher` it is handed; the CLI reads them from the directories a workflow
pulled them into, and `composeEstate` hands them on.

**Hashing is a port.** `renderHash` is a pure function of the recorded input
digests, and a model that imported `node:crypto` could reach for a clock or an
environment variable through the same door.

The adapter port is the third contract and belongs to layer 3: parsed documents
in, attributed Deliverables out, deterministic, no ambient reads, a path claimed
twice is a build error ([0037](adr/model/0037-six-registered-adapters-satisfy-one-port.md),
[chapter 30](../spec/v1/30-deliverables.md#the-adapter-port)). Unlike the ports
above it is a published compatibility surface: an out-of-tree adapter pins it,
so narrowing it later is a major release.

## The process boundary

Only the infrastructure and CLI rings read ambient state: the environment, the
clock, randomness, a child process, or the filesystem synchronously. Everything
further in receives what it needs as a value or through a port, so a derivation
cannot depend on when or where it runs
([0061](adr/architecture/0061-the-process-lives-in-one-boundary-file.md)).

Only `src/cli/boundary.ts` exits the process, sets its exit code, or writes to
stdout or stderr, the console included. It holds no decision: it takes the
result the CLI computed and performs it. It is the one file coverage excludes,
because a line that ends the process cannot be observed from inside it, and
every line worth covering sits outside it.

## The wire boundary

Zod schemas declare what a human writes, one per document family. They are the
single source of the runtime check, the TypeScript type and the generated JSON
Schema, so an editor's completion list and the loader's error come from the
same declaration.

The schema's output **is** the source model
([0057](adr/architecture/0057-the-authored-shape-is-the-source-model.md)): the
reader validates a document against it, and every later step reads that shape
in the authored vocabulary `CONTEXT.md` defines. A route or a scrape names its
Process and surface as written; the checks prove each name resolves inside its
Application, so the lowering and everything after it look the name up rather
than holding a second, renamed copy of the document. When a second
`schemaVersion` enters the supported range, the older schema gets a pure
function that lifts it to the current one, at the reader, and the steps keep
one shape ([0007](adr/model/0007-schema-version-separable.md)).

JSON Schema is generated from the **input** variant of each schema, because it
describes what a human writes rather than what validation leaves behind.

A schema states only what its generated JSON Schema states too, so a consumer
validating against a published schema refuses exactly what the model refuses.
A refinement, a transformation or a pipe would be dropped by the generator, so
none appears in `src/` (RULE-073). A rule the shape cannot carry but JSON
Schema can (a conditional, a requirement on what an array contains) is
declared once in `src/model/shape-rule.ts`'s form: the check zod runs and the
JSON Schema keywords stating the same rule, side by side.

## Error model

Every failure is a `Diagnostic`: a code, the document path it occurred at, a
message, and a hint. Use-cases return a `Result` over a diagnostic list, never
a thrown error, and every rule runs before the result is returned: one command
reports ten mistakes rather than the first one.

Exceptions are reserved for the compiler's own failures, never a defect in
what it was given, and each is an `InternalFailure` of one of three kinds
(RULE-074): `unsupported`, a construct the model accepts that the compiler does
not resolve or render yet; `unchecked`, an authored mistake that reached a later
step because no check refuses it yet; and `invariant`, a state the compiler's
own invariants rule out. The first two are known gaps, each closed by the
ticket that brings its renderer or its check; the third is a bug.

A refusal's code is one of a closed set, the `RefusalCode` type: every code a
chapter defines and `schema`. A code no chapter defines fails the typecheck,
and a code a chapter defines that the type lacks fails `npm run lint:codes`.

The codes are the spec's: `E_PATH_COLLISION`, `E_RENDER_NONDETERMINISTIC`,
`E_AMBIENT_INPUT_FORBIDDEN`, `E_UNSAFE_OUTPUT_PATH` and the rest live in the
chapters that define the rules they enforce. A code is what CI asserts on, so a
test proving an invariant fires matches a code and never a message.

The estate-wide invariants ([chapter
40](../spec/v1/40-composition.md#the-estate-wide-invariants)) are a registry:
each is a pure function from the composed intent to a diagnostic list,
registered with its code. The registry is enumerable, so a rule with no test or
no spec anchor is detectable rather than merely absent.

Every code a chapter defines is exercised by a test, or pending on the ticket
that will exercise it, and no code a chapter does not define is used in the
tree; `npm run lint:codes` holds both
([0067](adr/architecture/0067-every-spec-error-code-is-proved-by-a-test.md)). A
test exercises a code by naming it, whether in a TypeScript test, a Java test
of the model-driven implementation, or a refused case's committed
`diagnostics.json`.

The CLI renders diagnostics for a human by default, emits the array verbatim
under `--json`, and maps failure classes to distinct exit statuses.

## Generated files

A file a tool derives from another committed file is committed too, and CI
regenerates it and fails on a diff, from the pull request that brings its
generator: the JSON Schema derived from the metamodel, and the diagnostic
catalogue. A reader sees the artifact without running anything, and a change
to the source cannot land without the artifact that depends on it
([0068](adr/architecture/0068-two-implementations-meet-at-the-parity-table.md)).

An oracle file is the opposite. The rendered example trees, `intent.json`,
`resolved.json`, `dependencies.json`, `diagnostics.json` and the descriptor are
written and reviewed by hand, and no generator in CI writes into an oracle path,
because an oracle that an implementation regenerates proves only that the
implementation agrees with itself.

## The schema contract

Every committed JSON Schema under `spec/v1/schemas/` is a contract with a
reader outside this repository: an editor completing an authored file, or a
service generating its types from a document the toolkit writes. What holds a
schema to that contract is its **corpus**, not the bytes the generator writes
([0088](adr/architecture/0088-the-committed-schemas-and-their-corpus-are-the-contract.md)).

Each schema has one corpus file beside it, `spec/v1/schemas/corpus/<name>.corpus.json`,
written and reviewed by hand like any oracle file. It holds the schema's file
name and a list of cases. A case has:

- `name`: what the case is, unique within the corpus.
- `verdict`: `accept` or `refuse`.
- `breaks`, on a refused case: the kind of break it is, one of
  `unknown-field`, `missing-required`, `wrong-type`, `enum` (an enum or a
  constant), `union` (no branch of an `anyOf` or `oneOf` matches) or `rule`
  (a conditional or a dependency between fields).
- The document it starts from, exactly one of: `file`, a path relative to
  `spec/v1/` (JSON, or YAML read as the authored files are); `instance`, the
  document inline; or `case`, the name of an earlier case in the same corpus,
  whose document (after its own patch) this one starts from.
- `patch`, optional: a JSON Patch (RFC 6902) applied to that document, using
  `add`, `remove` and `replace` only.

An implementation conforms when the committed schema and its own model give
every case its verdict. A corpus accepts at least one case, and refuses at
least one case of every kind its schema can express: every schema can express
the first three kinds, and `enum`, `union` and `rule` wherever the schema
carries the keywords for them. A validator reading a committed schema treats
the authored schemas' `reference` and `entry` keywords as annotations.

The production implementation's generator is still checked byte for byte
against the committed schema ([Generated files](#generated-files)): that
proves its output is committed, and says nothing about another generator.

## Serialization

Adapters build **typed objects**, not text. The object model
([`src/objects/`](#layers)) declares only the fields this estate sets, so a
field the model cannot express cannot be set by an adapter: which is how
"layer 3 contains no decisions"
([0003](adr/model/0003-three-model-pipeline.md)) becomes a compile-time
property rather than a review question.

One serializer in the infrastructure ring turns those objects into bytes. It
owns key order, indentation, and the single permitted header line. Determinism
is therefore one module's responsibility instead of six, and an adapter test
asserts a field rather than whitespace.

Rendered output carries **no commentary** beyond one fixed `GENERATED` line,
emitted by the serializer as a constant and never by an adapter.

The writer assembles the whole Deliverable set, verifies it (path collision,
safe relative paths, ledger coverage) and only then writes, into a staging
directory that is renamed over the target. A failed render leaves the previous
tree untouched. Deliverables that a render no longer produces are **reported,
never deleted**: pruning is the applier's, in delivery
([chapter 55](../spec/v1/55-delivery.md)).

## Path authority

Layer 2 assigns every output path. Each object reaching layer 3 already carries
its owning adapter and its destination, and an adapter serializes what it is
handed rather than deciding where its output lands.

This is a model rule, so it is normative in
[chapter 20](../spec/v1/20-resolved-deployment.md#the-path-plan) and decided in
[0036](adr/model/0036-path-authority-is-layer-2.md), not here. The consequence
for code is the part that belongs in this document: path collision is detected
when the plan is built, before any adapter runs, and an adapter has no API with
which to choose a path.

## Testing

A test asserts external behaviour at a published boundary: documents in,
Deliverables or diagnostics out. It does not reach into a derivation rule, does
not mock a step, and does not compare whitespace. Four seams carry
the whole suite, and adding a fifth needs a reason.

| seam | what it proves | shape |
|---|---|---|
| the use-cases | derivation, every estate-wide invariant, version skew, overrides, `renderHash` | pinned input set in, `Result` out; in-memory |
| the adapter port | the port's own invariants, once, for every registered adapter | one table-driven contract suite, plus per-adapter object-graph assertions |
| the rendered tree | path layout, kustomization wiring, estate coverage | whole-tree byte diff against a committed golden tree |
| the CLI | exit statuses and `--json` | a handful of process-level tests |

Two checks live beside the golden diff rather than inside it: a **double
render** compared byte for byte, once inside one process and once in a fresh
one, which is the settling test
[chapter 20](../spec/v1/20-resolved-deployment.md#pinned-inputs) already names;
and validation of every rendered file against pinned upstream Kubernetes and
CRD schemas, so a file that parses but cannot apply fails the build.

Every gate carries negative fixtures. A check that has only ever run against a
clean tree is untested: nothing proves it would fail.

## The parity contract

This compiler has two implementations. The TypeScript code under `src/` is the
**production implementation**. The model-driven engineering course this
repository is coursework for requires Ecore, Xtext, OCL, QVT-Operational and
Acceleo, so a **model-driven implementation** in Java lives under
[`emf/`](../emf/README.md)
until its sunset condition holds
([0068](adr/architecture/0068-two-implementations-meet-at-the-parity-table.md)).
Everything about that implementation, its build, its checks and its decisions,
lives inside `emf/`. What lives here is the contract both implementations
answer to, because the contract outlives the model-driven implementation.

Neither implementation is generated from the other, and neither is the oracle
for the other. Each is tested on its own against committed oracle files, and
agreement between the two follows from both agreeing with the oracle.

The two are compared on what the project proposal names: validation, dependency
resolution, errors and generated resources. They are not required to agree on
anything else. In particular their intermediate models differ: the production
implementation keeps the Resolved Deployment and the typed object model its
adapters build as two things, while the model-driven implementation has one
target metamodel holding both, because a model-to-text template reads one model.

| oracle | where | compared as | binds |
|---|---|---|---|
| the parsed Project Intent (validation) | `spec/v1/examples/<case>/expected/intent.json` | canonical JSON, byte for byte | both |
| the diagnostics of a refused case (errors) | `<input>.diagnostics.json` beside the refused input, or the refused set of documents, in `refusals/` or `negative/` | a set of `(code, document, path)` triples | both |
| the resolved dependency edges (dependency resolution) | `spec/v1/examples/<case>/expected/dependencies.json` | canonical JSON, byte for byte | both |
| the Deliverable Set (generated resources) | `spec/v1/examples/<case>/rendered/` | the existing golden tree, byte for byte | both |
| the source metamodel's **authored** structure | `spec/v1/examples/expected/descriptor.json` | canonical JSON, byte for byte | both |
| the Effective Intent (the lowering) | `spec/v1/examples/<case>/expected/effective.json` | canonical JSON, byte for byte | both |
| the Resolved Deployment | `spec/v1/examples/<case>/expected/resolved.json` | canonical JSON, byte for byte | production only |
| the diagnostics of a file the reader refuses (code `schema`) | `<input>.diagnostics.json` beside the refused input, in `schema-refusals/` | a set of `(code, document, path)` triples | production only |

**A schema refusal binds the production implementation only.** The
model-driven implementation reads a file through a grammar, which refuses a
token where the production reader names the field the token belongs to, so the
two agree on the code and not on the place
([chapter 10](../spec/v1/10-project-intent.md#what-a-schema-refusal-reports)
fixes the place). The refused cases a rule answers, in `refusals/` and
`negative/`, bind both.

**The dependency edges** are, per Application, every dependency edge after
resolution: the consumer, the provider Application and Surface, the address the
consumer is given, and the policy peers that allow the connection. It is the
part of resolution both implementations must agree on before either renders.
The file is an object with one `applications` entry per Application, each an
`id` and its `edges`; an Application with no dependency carries an empty list.
The edge's own fields are fixed by the first case that has one.

**The Effective Intent** is what the lowering writes
([chapter 10](../spec/v1/10-project-intent.md#the-effective-intent)): the
authored document and the env files beside it, merged onto the Processes that
hold them. It is the one oracle that covers the env files at all, because they
are not part of the document `intent.json` fixes, and it is where the two
implementations' readers meet.

**The descriptor fixes the authored shape**, which is every class a document
holds. `env` is the one feature it leaves out of a class: an env file is a
directory beside the document rather than a key in it, so its own classes are
listed and the feature that would carry them is not. A shape a transformation writes and nobody authors is left out of it: the
Effective Intent's Project and Application are the two today
([0012](adr/model/0012-shared-intent-descends-and-is-lowered.md)), and what holds
them equal is the same thing that holds every other stage equal, the oracles
downstream of the lowering. An implementation that declared a lowered class where
the other did not would still render the same tree or fail the rendered oracle.

**The canonical writers** are `src/infrastructure/canonical-json.ts` and
`emf/bundles/metamodel`'s `CanonicalJson`, held to the same cases. An oracle file is exactly
its canonical text, with no final newline, and a test fails any committed oracle
that is not byte-identical to its own canonicalisation.

**Canonical JSON** is RFC 8785 (JSON Canonicalization Scheme): keys sorted,
numbers in their shortest form, no insignificant whitespace. An absent
optional field is absent, never `null`.

**A path** is an RFC 6901 JSON Pointer into the canonical intent document,
`/applications/0/observability/alertClass`. A diagnostic about a derived value
points at the authored value it derives from. Messages and hints are free per
implementation; the code, the document and the path are the contract.

**A set of documents** is read together when a refused case is a directory: its
`platform.intent.yml` and every `*.project.yml` in it. A diagnostic names the
`document` its path points into, by file name, so a check across documents
refuses at the element the author must change, whichever file holds it. A
refused single file names itself.

**The descriptor** lists every class of the source metamodel (Project Intent
and the Platform Intent it is resolved against) with its features, each
feature's type and multiplicity, and every closed vocabulary with its literals.
Target structures are compared through what they generate, not structurally.
The TypeScript side builds it from the Zod schemas with Zod's native
`z.toJSONSchema()` and a normaliser; the descriptor's shape is fixed here, not
by either source format:

- `classes`, sorted by name. Each carries its `name` and its `features`, sorted
  by name; a class the language writes as one word carries that word as
  `scalar`.
- A **feature** carries its `name`, the `types` it admits sorted by name,
  whether it is `required`, whether it holds `many` values, whether it is a
  `map` keyed by string, and whether it is a `reference`: a name the document
  writes that links to a model element, whose one type is the element's class.
  A map also names what one of its entries is, as `entry`, so a reference can
  point at a map's entries. A type is a class name, a vocabulary name, or one of
  `string`, `int` and `boolean`.
- A union is not a class: a feature whose value may be one of several classes
  names them all, so an abstract class on one side and a union on the other
  describe the same model.
- `vocabularies`, sorted by name, each with its `literals` in the order the
  model declares them.

**Constraint parity is checked by code, not kept in a ledger.** Every model
constraint is named by the diagnostic code it emits: the Complete OCL invariant
carries the code as its name, and the TypeScript check is one function per code
with the same name. A parity test lists every code three ways (the invariant,
the check, and the refused fixture whose diagnostics name it) and fails on any
gap ([0068](adr/architecture/0068-two-implementations-meet-at-the-parity-table.md)).

**Behaviour rows.** A row of the [behaviour ledger](requirements.md) whose
behaviour is the model's own (parse, validate, resolve, render) is proved in
both implementations. The row names the TypeScript test; the model-driven witness
for the same id is listed inside `emf/`, and `emf/`'s own gate fails when a model
row has no witness there.

**Whichever implementation lands a case first commits its reviewed oracle,
and the other matches it.** The first oracles are written by hand: `minimal`'s
parsed intent and dependency edges, and `minimal`'s and `knowledge`'s
`resolved.json` beside the metamodel that gives them a shape.

A `resolved.json` is held to the chapter as well as to the metamodel.
[Chapter 20](../spec/v1/20-resolved-deployment.md#worked-example-knowledges-projection)'s
worked projection shows part of `knowledge`'s, with its digests elided, and a
test requires everything the chapter shows to appear in the oracle with the same
value. The chapter is the readable half and the oracle is the complete one;
neither may say something the other contradicts.

An oracle file changes in the pull request that changes the behaviour it
records, and both implementations go red together until both are fixed. CI
never regenerates an oracle file from either implementation: a tool may write a
candidate, and the committed file is the reviewed copy of it. A
case without every oracle file is not yet a parity case, and the ledger that
lists cases says so rather than skipping it silently.

## Gates

Twenty gates hold the structure, and each exists because its absence has already
cost something in the generation this compiler replaces. Gates are grouped
into CI jobs, aggregated by one required check that fails when any gate job fails,
is cancelled, or is skipped
([0060](adr/architecture/0060-boundaries-enforced-on-the-graph.md)); a new
gate's script and its job land in the same pull request, and
[0064](adr/architecture/0064-a-gate-is-a-script-or-a-named-job.md) is the test that
proves the two never drift apart.

| gate | command | catches |
|---|---|---|
| lint | `npm run lint` | ESLint's `strictTypeChecked` rules, the test-file rules from the harness, and every project-specific rule this repository adds |
| format | `npm run format:check` | Prettier drift |
| types | `npm run typecheck` | `strict` violations; `@ts-nocheck` is an ESLint error and `@ts-expect-error` needs a description |
| boundaries | `npm run lint:boundaries` | a layer reaching outward, an adapter reading another adapter, a cycle, a module reachable from no entry point |
| decisions | `npm run lint:adrs` | frontmatter, register integrity, citations, normative anchors per domain |
| links | `npm run lint:links` | relative links and heading anchors across every tracked Markdown file |
| manifests | `npm run lint:manifests` | every rendered example object against pinned Kubernetes and CRD schemas |
| requirements | `npm run lint:requirements` | a behaviour ledger row that no longer parses, names a missing or empty test, drifts from its stated count, or is cited by an id no row carries |
| rules | `npm run lint:rules` | a [rule ledger](architecture-rules.md) row whose enforcer no longer exists, whose fixture no longer asserts on its witness, or that is pending with no ticket and no reason, and a rule the ruleset or the lint configuration enforces that no row claims |
| codes | `npm run lint:codes` | a specification `E_` code no test exercises and no ticket holds pending, a pending code a test already exercises, and a code used in the tree that no chapter defines |
| docs | `npm run lint:docs` | a script, path, coverage number or Node version README.md or CONTRIBUTING.md name that no longer matches the repository |
| agents | `npm run lint:agents` | a script `package.json` gains that AGENTS.md does not name verbatim |
| meaning | `npm run lint:meaning` | a retired term used outside a quotation, a stated count that no longer matches what it counts |
| tests | `npm run test:coverage` | behaviour, plus the coverage ratchet |
| mutation | `npm run test:mutation` | a change that keeps every line running but breaks what the line was for, which coverage alone rewards |
| package contents | `node scripts/check-package-contents.ts` | `npm pack` shipping a file outside `docs/adr/`, `spec/` and the JavaScript under `dist/`, the boundary the package's `files` field states but does not enforce on its own |
| actionlint | a pinned `actionlint` binary | invalid workflow syntax, an undefined `${{ }}` expression, a shellcheck finding inside a `run:` step |
| secret scan | `npm run lint:secrets` | a committed secret matching the default ruleset, or this repository's own allowlist entries |
| code scanning | CodeQL, called from `ci.yml` as the `codeql` job | any finding, of any severity, in JavaScript, TypeScript, workflow logic or the Java under `emf/`; a wrong one is filtered in `.github/codeql/codeql-config.yml` with its reason |
| model-driven build | `./mvnw -B -ntp verify` in `emf/` | every gate the [model-driven implementation](../emf/docs/architecture.md#gates) holds itself to: toolchain versions, compiler warnings, tests, coverage and mutation floors, formatting |

Decisions, links, manifests, requirements, rules, codes, docs, agents and
meaning share one CI job, `contracts`: all nine check a document against a
rule rather than code against a graph.
Boundaries runs alone as `architecture`, because it is the one gate that
speaks for `docs/architecture.md` itself rather than for a document beside it.
The model-driven build runs alone as `emf`, on its own JDK and Maven, and is
deleted with `emf/`.

Every rule these gates enforce is written down once, with a greppable id, in
the [rule ledger](architecture-rules.md)
([0066](adr/architecture/0066-every-enforced-rule-has-an-id-a-row-and-a-fixture.md)).
A row names the enforcer that runs the rule and the fixture that proves it
fires; a rule not enforced yet is listed as pending with a ticket and a reason,
and stops being allowed to say that the moment something enforces it.

Coverage is a ratchet ([0063](adr/architecture/0063-coverage-and-mutation-are-ratchets.md)).
The thresholds in `vitest.config.ts` sit on what the suite reaches, over an
explicit include list so a file no test reaches counts as zero, and they only
rise: a change that reaches more raises them in the same pull request, and
lowering one is a line in a diff that has to be argued. Coverage-ignore
comments are counted, and the count is held at zero.

The mutation break score is measured, not assumed
([0063](adr/architecture/0063-coverage-and-mutation-are-ratchets.md)),
and only rises like the coverage ratchet does. It holds `src/**/*.ts` today;
`scripts/**/*.ts` joins once its own gates can be exercised inside Stryker's
sandbox, which two defect classes keep several of them from yet.

The reachability half of the boundary gate is the one worth naming. Coverage
alone rewards a module for having tests: chapter 30 records 1,967 lines of dead
renderer that survived a `--lines 90` gate because its own test files imported
it. Reachability asks a different question (does anything real call this)
and the two together are what coverage was mistaken for.

Every gate here carries negative fixtures.
A gate that has only ever run against a clean tree is untested: nothing proves
it would fail.

## The published package

The npm package ships three trees: the decision record (`docs/adr/`), the
specification (`spec/`), and the command, built
([0089](adr/architecture/0089-the-package-ships-the-command-built-when-it-is-packed.md)).

The command is built when the package is packed, never before. `prepack` runs
`tsc` over `src/` alone and writes JavaScript to `dist/`, and the package's
`bin` names `dist/cli/index.js`. `dist/` is not committed and nothing in the
repository reads it: the tests, the gates and a clone run `src/` directly, as
[Tooling](#tooling) says. The build decides nothing. It strips the types and
rewrites each relative import's extension, so the JavaScript that runs under
`node_modules` is the TypeScript the suite ran, file for file.

Two checks hold it. The package-contents gate asks npm what it would pack and
refuses anything outside the three trees, and anything under `dist/` that is
not JavaScript. A test packs the repository, installs the tarball into an empty
project and runs the installed `deploy-kit`, so a package whose command does
not start fails here and not in a consumer's workflow.

## Tooling

The gates and their tests are TypeScript, held to the same compiler options and
lint rules as the compiler, and Node runs them directly: Node 24 strips the
types, so nothing is built between editing a gate and running it
([0062](adr/architecture/0062-tests-run-in-process-on-vitest.md)). `.nvmrc`
pins the exact Node version, and CI reads the same file.

Each gate is a library first. It exports a function that takes a root and
returns what it found, and a one-line guard at the bottom runs it when Node
starts the file as a script. Tests call the function in-process, which is what
lets coverage and mutation testing see the lines that decide; a child process
would hide them from both. One process-level test per gate proves the guard
still runs it.

Tests run on Vitest. A shared setup fails any test that reaches the network,
and gives each test a temporary directory of its own that is removed after it.
Lint rejects a committed `.only` or `.skip`, a fixed sleep, and a test that
asserts nothing, and a test proves each of those rules fires.
