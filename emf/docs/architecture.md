# The model-driven implementation's structure

Normative for the code under `emf/`, the way
[`docs/architecture.md`](../../docs/architecture.md) is normative for `src/`.
Decisions in [`docs/adr/emf/`](adr/README.md) point their `normative:` field at
sections of this document, and the ADR lint checks that the anchor exists.

This implementation answers to the model in [`spec/v1`](../../spec/v1/00-overview.md)
and to the [parity contract](../../docs/architecture.md#the-parity-contract),
and to nothing in `src/`. Where this document and either of those disagree,
they win and this document is what gets fixed.

## Scope and sunset

This tree implements the whole compiler: parse, validate, resolve and render,
for every case under `spec/v1/examples/`. It is built in the order the course
grades it.

| course task | due | lands here |
|---|---|---|
| Task 1: metamodelling | 2026-09-25 | the two Ecore metamodels, the Xtext grammar and its editor, the OCL constraints; parity on the parsed intent, the descriptor and refused cases |
| Task 2: transformations | 2026-10-16 | the QVT-Operational transformation into the Resolved Deployment; parity on the resolved dependency edges |
| Task 3: code generation | 2026-10-30 | the Acceleo templates rendering the Deliverable Set; parity on `rendered/` |

The tree is deleted in one pull request when both of these hold:

1. the final grade for the course project is recorded;
2. the TypeScript suite is green on every parity case with the `emf` CI job
   removed from `Pipeline Complete`.

What that pull request keeps: every oracle file under `spec/v1/examples/`, the
constraint ledger without its OCL column, and the descriptor check. What it
deletes: this directory; the `emf` CI job and the `ADR contract (emf)` step in
`.github/workflows/ci.yml`; the `java-kotlin` entry in
`.github/workflows/codeql.yml`; `test/emf-wiring.test.ts`, with `RULE-061`,
`RULE-062` and `REQ-015`; the `emf` domain entry in `scripts/lint-adrs.ts` and
the two `emf/` cases in `test/adr-contract.test.ts`; the `emf` exclusion in
`release-please-config.json`, the `emf maven` rule in `renovate.json`, the
`/emf/` line in `.github/CODEOWNERS` and the `mvnw` line in `.gitattributes`;
and the `emf/` mentions in `docs/architecture.md`, `docs/requirements.md`,
`docs/adr/README.md`, `README.md`, `CONTEXT.md` and `CLAUDE.md`.

## Toolchain

Maven, with Eclipse Tycho resolving every EMF-family bundle from one p2
repository: the Eclipse simultaneous release at a dated build, named in
`emf.target` with each unit at an exact version, so EMF, Xtext, OCL,
QVT-Operational and Acceleo arrive at versions released together. The one
Maven Central artifact outside the test libraries is the ANTLR 3 generator the
Xtext generator calls. JDK 21.
No Eclipse IDE, workspace or launch configuration is part of the build: every
step CI runs is `mvn verify` from `emf/`. The projects are nonetheless kept
loadable in Eclipse Modeling Tools for the course's examiners: they import as
existing Maven projects, the metamodels open, the Xtext-generated editor reports
OCL constraint violations while a source file is edited, and committed launch
configurations run the transformation and the generator.

A module that needs a p2 bundle is an Eclipse bundle: a `META-INF/MANIFEST.MF`
naming the bundles it requires, and `eclipse-plugin` packaging. A manifest
switches on the parent's `bundle` profile, which runs the module's tests
through Maven Surefire on a plain classpath, outside OSGi, so every tool is
exercised through the standalone API a command-line run uses. Modules that
need no p2 bundle, like `parity/`, stay plain jars.

The first change to this tree is the **EMF scaffold**: the Maven reactor, the
wrapper, the gates and the `emf` CI job, with no EMF dependency and one module,
`parity`, holding the canonical JSON writer and the ledger checks. The second is
the **walking skeleton**, which proves each tool runs headless in CI before any
model work depends on it: an `.ecore` loads, an OCL
invariant fires, the Xtext parser reads a three-line document, a QVTo identity
transformation runs, and an Acceleo template writes one file. Its smoke tests
sit in the module each tool belongs to, and each is deleted by the stage ticket
whose suite covers that tool.

## Modules

One Maven module per pipeline stage, under one parent `pom.xml` that owns the
Tycho configuration and the target platform.

| module | holds | graded in |
|---|---|---|
| `metamodel/` | the source and target `.ecore` and `.genmodel`, Complete OCL `.ocl` for the source metamodel, the descriptor exporter | Task 1 |
| `syntax/` | the Xtext grammar for the authored YAML subset, and the generated editor bundles that run the OCL validators | Task 1 |
| `resolve/` | the QVTo transformation from Project Intent and Platform Intent to the Resolved Deployment | Task 2 |
| `render/` | the Acceleo 4 templates from a Resolved Deployment model to the Deliverable Set's files | Task 3 |
| `cli/` | the pipeline entry point: files in, the parsed intent, diagnostics and rendered files out | Task 1 onward |
| `parity/` | JUnit suites asserting each stage against the committed oracles, and the witness ledger check | Task 1 onward |

A module may depend on the modules above it in this table and on nothing
below.

## Metamodels

Two hand-written Ecore metamodels, as the project proposal defines them. Both
are committed `.ecore` XMI, with names taken unchanged from
[`CONTEXT.md`](../../CONTEXT.md).

| metamodel | role | holds |
|---|---|---|
| Project Intent | source | the authored Project, Application and Process with everything layer 1 declares, and the Platform document the source is resolved against |
| Resolved Deployment | target | every derived value of layer 2 together with the typed Kubernetes and extension resources, identities and output paths the templates write |

The Deliverable Set is not a metamodel: it is the files Acceleo generates from
a Resolved Deployment model. The target metamodel is deliberately not the shape
of the production implementation's Resolved Deployment, which keeps layer 2 in
model words and builds typed objects separately; a model-to-text template reads
one model, so here the two are one package. This is why the parity contract
compares the two implementations through dependency edges and generated files
rather than through `resolved.json`.

Cross-document references, including those from a Project into the Platform
document, are Ecore references, not strings.

Typed Java for each metamodel is generated from its `.genmodel` during the
Maven build into `target/`, and never committed: an MWE2 workflow runs EMF's
`EcoreGenerator` in `generate-sources`, and the generated packages are left out
of formatting, coverage and mutation.

The descriptor exporter walks the source `EPackage` reflectively and writes the
descriptor the parity contract fixes. It is the only place the Ecore structure
is compared with anything. Two shapes it normalises: an abstract class is a
union, so it is not listed and a feature that points at one names its concrete
classes; and a map entry is not a class, so the feature that holds the entries
is a map.

## Constraints

Every constraint lives in a Complete OCL file beside the source metamodel,
evaluated by Eclipse OCL standalone in the build and by the Xtext-generated
editor while a file is edited. An
invariant's name is the diagnostic code it emits, so a failed invariant maps to
a diagnostic without a lookup table.

An invariant failure becomes a diagnostic whose path is the JSON Pointer of the
offending object, computed from its containment chain: each containing feature's
name, and the index for a many-valued feature. Validation reports every failed
invariant, never only the first.

Two consequences of evaluating OCL over Ecore, both recorded here because they
shaped the metamodel. The constraints import the metamodel by its `nsURI`, not
by file, so they bind to the classes the parser instantiates rather than to a
second copy. And EMF reads an unset enumeration as its first literal, so a
vocabulary an invariant tests for absence carries a literal with no spelling:
`Engine::absent` is what an unset `engine` reads as, a document cannot write it,
and the descriptor leaves it out because a literal the language cannot write is
not part of the vocabulary.

The constraint ledger's OCL column lives in `emf/`: a table mapping each
`CONS-NNN` id to the OCL invariant that enforces it. `parity/` fails when a
ledger constraint has no invariant, or an invariant names a code no ledger row
carries.

## Concrete syntax

The Xtext grammar parses the same authored `.project.yml` and
`platform.intent.yml` files the TypeScript compiler reads. It covers the YAML
subset those files use, with indentation handled by synthetic block tokens, and
refuses anything outside the subset with a diagnostic rather than a guess.

The grammar imports the hand-written source metamodel, so the parser produces
instances of the graded metamodel directly. A union in the model is a union in
the grammar: a probe is HTTP or TCP, a probe policy is a block or the word
`none`, and a grant is keyed by its engine, which a grant that has one writes
first. The language binds the `.yml` extension, because EMF resolves a resource
factory by the last extension alone; which document a file holds is the file
name's to say, and that lands with the Platform document. There is no inferred syntax
metamodel and no mapping step between parsing and validation.

Indentation is not the grammar's concern: a token source turns the block
structure into the synthetic `BEGIN` and `END` tokens the rules read, and folds
a scalar written over several lines into one token. A line
indented further than the one before it opens a block, a dash opens one around
the item that follows it, and a flow collection opens and closes one on a single
line, so `{ path: /, match: prefix }` and the same keys written as an indented
block parse through one rule. The rules themselves are unordered groups, because
the order of keys in a mapping is not meaning.

The generated editor is configured to run the OCL validators and to mark each
constraint violation on the source line it concerns, with the diagnostic code as
its message. It is built by the same Maven and Tycho build as an Eclipse plugin;
CI builds it but never runs it.

## Transformation

A QVT-Operational transformation derives a Resolved Deployment model from the
parsed Project Intent model, run through the standalone transformation
executor. Every derivation `spec/v1/20-resolved-deployment.md` names is a mapping
or a helper in it; a derived value with no mapping is a gap a parity case
exposes, through the dependency edges or the generated files. The resolved
dependency edges are exported from the target model as canonical JSON and
compared with `expected/dependencies.json`.

## Text generation

Acceleo 4 templates generate the Deliverable Set's YAML and JSON files from a
Resolved Deployment model, run through Acceleo's standalone API. Until the
transformation covers a case, a template test reads a hand-written Resolved
Deployment model kept inside `emf/`; it is test input, never an oracle. Output is compared byte for byte with the
committed `rendered/` tree, so whitespace, key order and the `GENERATED` header
are template decisions made to match the oracle, not presentation.

## Witnesses

A behaviour ledger row whose behaviour is the model's own is proved in both
implementations. `emf/docs/witnesses.md` lists, for each such `REQ-NNN` id, the
JUnit test that proves it here. `parity/` fails when a model row in
`docs/requirements.md` has no witness in that file, or a witness names a test
that does not exist or an id that no row carries.

## Gates

One CI job, `emf`, runs `./mvnw -B -ntp verify` in `emf/` on the JDK named by
`emf/.java-version` and is required by `Pipeline Complete`. The wrapper
downloads the Maven distribution pinned by checksum; no wrapper jar is
committed. The job writes one line to its summary: tests, line coverage and
mutation score, from `scripts/summary.sh`. The ADR lint for `emf/docs/adr/` runs
in the existing `contracts` job, as `node scripts/lint-adrs.ts emf`.

`verify` runs these gates, in this order, and fails on the first that does not
hold ([0115](adr/emf/0115-the-emf-gates-are-estate-shaped.md)):

| gate | plugin | fails when |
|---|---|---|
| toolchain | `maven-enforcer-plugin` | the JDK is not 21, Maven is not 3.9, a plugin version is unpinned, dependency versions do not converge outside a bundle, or anything declares a distribution target |
| compile | `maven-compiler-plugin`, or `tycho-compiler-plugin` in a bundle | any `-Xlint:all` warning, or in a bundle any warning the JDT compiler reports |
| tests | `maven-surefire-plugin` | a JUnit test fails, including the ArchUnit module rules and the ledger checks |
| format | `spotless-maven-plugin` | Java source differs from palantir-java-format; `./mvnw spotless:apply` fixes it |
| coverage | `jacoco-maven-plugin` | line or branch coverage of a module's hand-written classes falls below the floor in `emf/pom.xml` |
| mutation | `pitest-maven` | the mutation score of a module's hand-written classes falls below the threshold in `emf/pom.xml` |

Every rule these gates enforce is listed in [the rule ledger](rules.md), and
every model behaviour's Java proof in [the witness list](witnesses.md).

CodeQL analyses the Java under `emf/` as `java-kotlin` with no build, ignoring
build output and generated sources; `test/emf-wiring.test.ts` at the root holds
that configuration and the `emf` job to the tree they describe.
