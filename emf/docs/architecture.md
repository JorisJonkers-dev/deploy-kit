# The coursework implementation's structure

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
| Task 1: metamodelling | 2026-09-25 | Ecore metamodels for all three layers and Platform Intent, the Xtext grammar, the OCL constraints; parity on the parsed intent, the descriptor and refused cases |
| Task 2: transformations | 2026-10-16 | the QVT-Operational transformation into the Resolved Deployment; parity on `resolved.json` |
| Task 3: code generation | 2026-10-30 | the Acceleo templates rendering the Deliverable Set; parity on `rendered/` |

The tree is deleted in one pull request when both of these hold:

1. the final grade for the course project is recorded;
2. the TypeScript suite is green on every parity case with the `emf` CI job
   removed from `Pipeline Complete`.

What that pull request keeps: every oracle file under `spec/v1/examples/`, the
constraint ledger without its OCL column, and the descriptor check. What it
deletes: this directory; the `emf` CI job and the `ADR contract (emf)` step in
`.github/workflows/ci.yml`; the `emf` domain entry in `scripts/lint-adrs.ts`
and the two `emf/` cases in `test/adr-contract.test.ts`; and the `emf/`
mentions in `docs/requirements.md`, `docs/adr/README.md` and `CLAUDE.md`.

## Toolchain

Maven, with Eclipse Tycho resolving the bundles that are published only to p2
update sites, against one target platform file pinned to exact versions. Plain
Maven Central coordinates are used wherever a tool publishes there. JDK 21.
No Eclipse IDE, workspace or launch configuration is part of the build: every
step a grader or CI runs is `mvn verify` from `emf/`.

The first change to this tree is a walking skeleton that proves each tool runs
headless in CI before any model work depends on it: an `.ecore` loads, an OCL
invariant fires, the Xtext parser reads a three-line document, a QVTo identity
transformation runs, and an Acceleo template writes one file.

## Modules

One Maven module per pipeline stage, under one parent `pom.xml` that owns the
Tycho configuration and the target platform.

| module | holds | graded in |
|---|---|---|
| `metamodel/` | `.ecore` and `.genmodel` per layer, Complete OCL `.ocl` per layer, the descriptor exporter | Task 1 |
| `syntax/` | the Xtext grammar for the authored YAML subset | Task 1 |
| `resolve/` | the QVTo transformation from Project Intent and Platform Intent to the Resolved Deployment | Task 2 |
| `render/` | the Acceleo 4 templates from the Resolved Deployment to the Deliverable Set | Task 3 |
| `cli/` | the pipeline entry point: files in, canonical JSON, diagnostics and rendered files out | Task 1 onward |
| `parity/` | JUnit suites asserting each stage against the committed oracles, and the witness ledger check | Task 1 onward |

A module may depend on the modules above it in this table and on nothing
below.

## Metamodels

One Ecore metamodel per document the model defines: Project Intent, Platform
Intent, Resolved Deployment and Deliverable Set. Each is hand-written `.ecore`
XMI, committed, with names taken unchanged from
[`CONTEXT.md`](../../CONTEXT.md). Cross-document references are Ecore
references across packages, not strings.

Typed Java for each metamodel is generated from its `.genmodel` during the
Maven build into `target/`, and never committed.

The descriptor exporter walks each `EPackage` reflectively and writes the
descriptor the parity contract fixes. It is the only place the Ecore structure
is compared with anything.

## Constraints

Every constraint lives in a Complete OCL file beside the metamodel it
constrains, one file per layer, evaluated by Eclipse OCL standalone. An
invariant's name is the diagnostic code it emits, so a failed invariant maps to
a diagnostic without a lookup table.

An invariant failure becomes a diagnostic whose path is the JSON Pointer of the
offending object, computed from its containment chain: each containing feature's
name, and the index for a many-valued feature. Validation reports every failed
invariant, never only the first.

The constraint ledger's OCL column lives in `emf/`: a table mapping each
`CONS-NNN` id to the OCL invariant that enforces it. `parity/` fails when a
ledger constraint has no invariant, or an invariant names a code no ledger row
carries.

## Concrete syntax

The Xtext grammar parses the same authored `.project.yml` and
`platform.intent.yml` files the TypeScript compiler reads. It covers the YAML
subset those files use, with indentation handled by synthetic block tokens, and
refuses anything outside the subset with a diagnostic rather than a guess.

The grammar imports the hand-written Project Intent and Platform Intent
metamodels, so the parser produces instances of the graded metamodel directly.
There is no inferred syntax metamodel and no mapping step between parsing and
validation.

## Transformation

A QVT-Operational transformation derives the Resolved Deployment from the
parsed Project Intent and Platform Intent, run through the standalone
transformation executor. Every derivation `spec/v1/20-resolved-deployment.md`
names is a mapping or a helper in it; a derived value with no mapping is a gap
the parity case for it exposes.

## Text generation

Acceleo 4 templates render the Deliverable Set from the Resolved Deployment,
run through Acceleo's standalone API. Output is compared byte for byte with the
committed `rendered/` tree, so whitespace, key order and the `GENERATED` header
are template decisions made to match the oracle, not presentation.

## Witnesses

A behaviour ledger row whose behaviour is the model's own is proved in both
implementations. `emf/docs/witnesses.md` lists, for each such `REQ-NNN` id, the
JUnit test that proves it here. `parity/` fails when a model row in
`docs/requirements.md` has no witness in that file, or a witness names a test
that does not exist or an id that no row carries.

## Gates

One CI job, `emf`, runs `mvn verify` in `emf/` on JDK 21 and is required by
`Pipeline Complete`. It runs every JUnit suite, the parity suites and the
ledger checks above. The ADR lint for `emf/docs/adr/` runs in the existing
`contracts` job, as `node scripts/lint-adrs.ts emf`.
