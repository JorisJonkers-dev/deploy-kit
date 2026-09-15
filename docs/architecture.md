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

Seven directories under `src/`, innermost first. A layer may reach inward and
may not reach outward, and the graph is checked rather than described:
[`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) encodes every rule
below, and `npm run lint:boundaries` fails on a violation.

| directory | holds | may import |
|---|---|---|
| `domain/` | layer 1 aggregates, layer 2 derivation, the ports the core declares | itself only |
| `objects/` | the typed Kubernetes object model layer 3 builds | nothing |
| `wire/` | Zod schemas per document family per `schemaVersion`, and the mappers into the domain | `domain/`, `zod` |
| `adapters/` | the registered adapters, one directory each, shared code in `adapters/shared/` | `domain/`, `objects/`, `adapters/shared/` |
| `application/` | the use-cases; orders derivation, performs no IO of its own | `domain/`, `wire/`, `adapters/`, `objects/` |
| `infrastructure/` | port implementations: filesystem, `oras`, hashing, the serializer, the writer | `domain/`, `objects/` |
| `cli/` | argument parsing, diagnostic rendering, exit codes, wiring | everything |

Four of those rules exist for a reason worth stating once.

**The domain reads nothing ambient.** No filesystem, network, clock,
environment or crypto. Hashing arrives through a port, which is what keeps
`renderHash` a pure function of the pinned inputs rather than of the machine.

**The domain does not know the wire shape.** Zod declares what a human writes;
the domain is a different shape, reached through an explicit mapper. This is
what lets two `schemaVersion`s coexist without the core carrying both.

**No adapter reads another adapter.** An adapter that consumes another's output
turns evaluation order into semantics, and attribution and path-collision
detection stop being provable. Shared code goes to `adapters/shared/`.

**Nothing depends on the CLI.** Diagnostic rendering and exit-code mapping are
the outermost ring; a use-case that reached them could not be called by a test.

## Ports

Two use-cases, one core. `publish` runs in any repository that authors intent (
a project, or the platform) validates the Intent Fragment and pushes it by
digest, and renders nothing; `compose` runs centrally over the composed union
and is where every adapter runs
([0098](adr/model/0098-one-publication-path.md)). They share the domain, and
neither performs an effect directly: everything that touches the world arrives
as a port the domain declares and the CLI supplies.

| port | what it hides | production implementation |
|---|---|---|
| `PinnedInputSet` | resolving every Intent Fragment (the project files and the Platform document) the node contract, the locks and the ClusterState snapshot into parsed, validated, digested documents | filesystem plus OCI |
| `FragmentSource` / `FragmentPublisher` | reading and publishing Intent Fragments by digest | `oras push` then `oras resolve`, and a filesystem implementation for tests |
| `Hasher` | the hash primitive | `node:crypto`, so the domain imports no crypto |
| `DeliverableWriter` | putting bytes on disk | staging directory plus atomic rename |

Two properties are load-bearing rather than tidy.

**One port resolves the whole pinned input set**, so the digests are computed in
one place and "the input set is closed"
([0006](adr/model/0006-pinned-inputs.md)) is expressed by a single type.
Widening it is one visible edit.

**Hashing is a port.** `renderHash` is a pure function of the recorded input
digests, and a domain that imported `node:crypto` could reach for a clock or an
environment variable through the same door.

The adapter port is the third contract and belongs to layer 3: parsed documents
in, attributed Deliverables out, deterministic, no ambient reads, a path claimed
twice is a build error ([0053](adr/model/0053-adapter-port-contract.md),
[chapter 30](../spec/v1/30-deliverables.md#the-adapter-port)). Unlike the ports
above it is a published compatibility surface: an out-of-tree adapter pins it,
so narrowing it later is a major release.

## The process boundary

Only the infrastructure and CLI rings read ambient state: the environment, the
clock, randomness, a child process, or the filesystem synchronously. Everything
further in receives what it needs as a value or through a port, so a derivation
cannot depend on when or where it runs
([0117](adr/architecture/0117-the-process-lives-in-one-boundary-file.md)).

Only `src/cli/boundary.ts` exits the process, sets its exit code, or writes to
stdout or stderr, the console included. It holds no decision: it takes the
result the CLI computed and performs it. It is the one file coverage excludes,
because a line that ends the process cannot be observed from inside it, and
every line worth covering sits outside it.

## The wire boundary

Zod schemas declare what a human writes, one set per document family per
`schemaVersion`. They are the single source of the runtime check, the
TypeScript type and the generated JSON Schema, so an editor's completion list
and the loader's error come from the same declaration.

The inferred type is **not** the domain model. An explicit mapper per document
family converts the authoring shape into domain objects, and the domain imports
no Zod. Two consequences make the extra code worth writing: two
`schemaVersion`s can coexist behind one core, upgraded by a pure function per
step ([0007](adr/model/0007-schema-version-separable.md)); and the authoring
vocabulary can be renamed without the core moving.

JSON Schema is generated from the **input** variant of each schema, because a
field with a platform default is optional in the file a human writes and
required only after validation.

## Error model

Every failure is a `Diagnostic`: a code, the document path it occurred at, a
message, and a hint. Use-cases return a `Result` over a diagnostic list, never
a thrown error, and every rule runs before the result is returned: one command
reports ten mistakes rather than the first one.

Exceptions are reserved for programmer error: a broken invariant inside the
compiler, not a defect in what it was given.

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
([0118](adr/architecture/0118-every-spec-error-code-is-proved-by-a-test.md)). A
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
([0119](adr/architecture/0119-generated-files-are-committed-and-diff-checked.md)).

An oracle file is the opposite. The rendered example trees, `intent.json`,
`resolved.json`, `dependencies.json`, `diagnostics.json` and the descriptor are
written and reviewed by hand, and no generator in CI writes into an oracle path,
because an oracle that an implementation regenerates proves only that the
implementation agrees with itself.

## Serialization

Adapters build **typed objects**, not text. The object model
([`src/objects/`](#layers)) declares only the fields this estate sets, so a
field the model cannot express cannot be set by an adapter: which is how
"layer 3 contains no decisions"
([0003](adr/model/0003-three-model-pipeline.md)) becomes a compile-time
property rather than a review question.

One serializer in the infrastructure ring turns those objects into bytes. It
owns key order, indentation, and the single permitted header line. Determinism
is therefore one module's responsibility instead of sixteen, and an adapter test
asserts a field rather than whitespace.

Rendered output carries **no commentary** beyond one fixed `GENERATED` line,
emitted by the serializer as a constant and never by an adapter.

The writer assembles the whole Deliverable set, verifies it (path collision,
safe relative paths, ledger coverage) and only then writes, into a staging
directory that is renamed over the target. A failed render leaves the previous
tree untouched. Deliverables that a render no longer produces are **reported,
never deleted**: pruning is delivery scope and is defined separately
([`docs/adr/deferred/`](adr/deferred/README.md)).

## Path authority

Layer 2 assigns every output path. Each object reaching layer 3 already carries
its owning adapter and its destination, and an adapter serializes what it is
handed rather than deciding where its output lands.

This is a model rule, so it is normative in
[chapter 20](../spec/v1/20-resolved-deployment.md#the-path-plan) and decided in
[0070](adr/model/0070-path-authority-is-layer-2.md), not here. The consequence
for code is the part that belongs in this document: path collision is detected
when the plan is built, before any adapter runs, and an adapter has no API with
which to choose a path.

## Testing

A test asserts external behaviour at a published boundary: documents in,
Deliverables or diagnostics out. It does not reach into a derivation rule, does
not mock a domain service, and does not compare whitespace. Four seams carry
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
([0105](adr/architecture/0105-two-implementations-meet-at-committed-oracles.md)).
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
| the diagnostics of a refused case (errors) | `<input>.diagnostics.json` beside the refused input in `refusals/` or `negative/` | a set of `(code, path)` pairs | both |
| the resolved dependency edges (dependency resolution) | `spec/v1/examples/<case>/expected/dependencies.json` | canonical JSON, byte for byte | both |
| the Deliverable Set (generated resources) | `spec/v1/examples/<case>/rendered/` | the existing golden tree, byte for byte | both |
| the source metamodel's structure | `spec/v1/examples/expected/descriptor.json` | canonical JSON, byte for byte | both |
| the Resolved Deployment | `spec/v1/examples/<case>/expected/resolved.json` | canonical JSON, byte for byte | production only |

**The dependency edges** are, per Application, every dependency edge after
resolution: the consumer, the provider Application and Surface, the address the
consumer is given, and the policy peers that allow the connection. It is the
part of resolution both implementations must agree on before either renders.
The file is an object with one `applications` entry per Application, each an
`id` and its `edges`; an Application with no dependency carries an empty list.
The edge's own fields are fixed by the first case that has one.

**The canonical writers** are `src/infrastructure/canonical-json.ts` and
`emf/parity`'s `CanonicalJson`, held to the same cases. An oracle file is exactly
its canonical text, with no final newline, and a test fails any committed oracle
that is not byte-identical to its own canonicalisation.

**Canonical JSON** is RFC 8785 (JSON Canonicalization Scheme): keys sorted,
numbers in their shortest form, no insignificant whitespace. An absent
optional field is absent, never `null`.

**A path** is an RFC 6901 JSON Pointer into the canonical intent document,
`/applications/0/observability/alertClass`. A diagnostic about a derived value
points at the authored value it derives from. Messages and hints are free per
implementation; the code and the path are the contract.

**The descriptor** lists every class of the source metamodel (Project Intent
and the platform data it is resolved against) with its features, each
feature's type and multiplicity, and every closed vocabulary with its literals.
Target structures are compared through what they generate, not structurally.
The TypeScript side builds it from the Zod schemas with Zod's native
`z.toJSONSchema()` and a normaliser; the descriptor's shape is fixed here, not
by either source format:

- `classes`, sorted by name. Each carries its `name` and its `features`, sorted
  by name; a class the language writes as one word carries that word as
  `scalar`.
- A **feature** carries its `name`, the `types` it admits sorted by name,
  whether it is `required`, whether it holds `many` values, and whether it is a
  `map` keyed by string. A type is a class name, a vocabulary name, or one of
  `string`, `int` and `boolean`.
- A union is not a class: a feature whose value may be one of several classes
  names them all, so an abstract class on one side and a union on the other
  describe the same model.
- `vocabularies`, sorted by name, each with its `literals` in the order the
  model declares them.

**The constraint ledger** gives every model constraint a `CONS-NNN` id, the
diagnostic code it emits, the check that enforces it in `src/`, and a refused
fixture that proves it fires. A constraint the ledger does not list is not part
of the model's validation, whichever implementation happens to enforce it.

**Behaviour rows.** A row of the [behaviour ledger](requirements.md) whose
behaviour is the model's own (parse, validate, resolve, render) is proved in
both implementations. The row names the TypeScript test; the model-driven witness
for the same id is listed inside `emf/`, and `emf/`'s own gate fails when a model
row has no witness there.

**Whichever implementation lands a case first commits its reviewed oracle,
and the other matches it.** The first oracles are written by hand: `minimal`'s
parsed intent and dependency edges. The first `resolved.json` lands with the
Resolved Deployment metamodel that gives it a shape (#42).

An oracle file changes in the pull request that changes the behaviour it
records, and both implementations go red together until both are fixed. CI
never regenerates an oracle file from either implementation: a tool may write a
candidate, and the committed file is the reviewed copy of it. A
case without every oracle file is not yet a parity case, and the ledger that
lists cases says so rather than skipping it silently.

## Gates

Eighteen gates hold the structure, and each exists because its absence has already
cost something in the generation this compiler replaces. Each runs as its own
CI job, aggregated by one required check that fails when any gate job fails,
is cancelled, or is skipped
([0069](adr/architecture/0069-boundaries-enforced-on-the-graph.md)); a new
gate's script and its job land in the same pull request, and
[0102](adr/architecture/0102-the-gate-grows-with-the-code.md) is the test that
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
| meaning | `npm run lint:meaning` | a citation to a superseded decision with no successor in the same sentence, a retired term used outside a quotation, a stated count that no longer matches what it counts |
| tests | `npm run test:coverage` | behaviour, plus the coverage ratchet |
| package contents | `node scripts/check-package-contents.ts` | `npm pack` shipping a file outside `docs/adr/` and `spec/`, the boundary the package's `files` field states but does not enforce on its own |
| actionlint | a pinned `actionlint` binary | invalid workflow syntax, an undefined `${{ }}` expression, a shellcheck finding inside a `run:` step |
| secret scan | `npm run lint:secrets` | a committed secret matching the default ruleset, or this repository's own allowlist entries |
| code scanning | CodeQL, called from `ci.yml` as the `codeql` job | any finding, of any severity, in JavaScript, TypeScript, workflow logic or the Java under `emf/`; a wrong one is filtered in `.github/codeql/codeql-config.yml` with its reason |
| model-driven build | `./mvnw -B -ntp verify` in `emf/` | every gate the [model-driven implementation](../emf/docs/architecture.md#gates) holds itself to: toolchain versions, compiler warnings, tests, coverage and mutation floors, formatting |

Decisions, links, manifests, requirements, rules, codes, docs and meaning
share one CI job, `contracts`: all eight check a document against a rule
rather than code against a graph.
Boundaries runs alone as `architecture`, because it is the one gate that
speaks for `docs/architecture.md` itself rather than for a document beside it.
The model-driven build runs alone as `emf`, on its own JDK and Maven, and is
deleted with `emf/`.

Every rule these gates enforce is written down once, with a greppable id, in
the [rule ledger](architecture-rules.md)
([0104](adr/architecture/0104-every-enforced-rule-has-an-id-a-row-and-a-fixture.md)).
A row names the enforcer that runs the rule and the fixture that proves it
fires; a rule not enforced yet is listed as pending with a ticket and a reason,
and stops being allowed to say that the moment something enforces it.

Coverage is a ratchet ([0101](adr/architecture/0101-coverage-is-a-ratchet.md)).
The thresholds in `vitest.config.ts` sit on what the suite reaches, over an
explicit include list so a file no test reaches counts as zero, and they only
rise: a change that reaches more raises them in the same pull request, and
lowering one is a line in a diff that has to be argued. Coverage-ignore
comments are counted, and the count is held at zero.

The reachability half of the boundary gate is the one worth naming. Coverage
alone rewards a module for having tests: chapter 30 records 1,967 lines of dead
renderer that survived a `--lines 90` gate because its own test files imported
it. Reachability asks a different question (does anything real call this)
and the two together are what coverage was mistaken for.

Every gate here carries negative fixtures.
A gate that has only ever run against a clean tree is untested: nothing proves
it would fail.

## Tooling

The gates and their tests are TypeScript, held to the same compiler options and
lint rules as the compiler, and Node runs them directly: Node 24 strips the
types, so nothing is built between editing a gate and running it
([0100](adr/architecture/0100-tests-run-in-process-on-vitest.md)). `.nvmrc`
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
