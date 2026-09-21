# Decision register: the model-driven implementation

The decisions that shape the EMF implementation under `emf/`. Every one is
deleted with this directory
([0107](emf/0107-emf-is-coursework-scoped-and-self-contained.md)), and none of
them can change what the model means: the model's decisions are in
[`docs/adr/`](../../../docs/adr/README.md), and the contract this
implementation shares with the production implementation is
[0105](../../../docs/adr/architecture/0105-two-implementations-meet-at-committed-oracles.md).

The contract every ADR here satisfies is the root register's, unchanged:
frontmatter schema, one falsifiable claim per premise, `rests-on` naming
premises only, the Alternatives table and the citation rule. `normative:`
pointers name sections of [`emf/docs/architecture.md`](../architecture.md).
`node scripts/lint-adrs.ts emf` enforces all of it.

Numbers come from the one estate-wide sequence shared with `docs/adr/`. Before
taking a number, check both registers.

## Domains

| directory | holds | `normative:` pointers resolve against | linted |
|---|---|---|---|
| [`emf/`](emf/) | the EMF implementation: toolchain, metamodels, constraints, grammar, transformation, templates, witnesses | `emf/docs/architecture.md` | yes |

## Premises

| # | title | claim | normative |
|---|---|---|---|
| [0106](emf/0106-the-model-is-expressible-in-the-emf-toolchain.md) | The v1 model is expressible in the EMF toolchain without changing the model | open | architecture.md#scope-and-sunset |

## Decisions

| # | title | claim |
|---|---|---|
| [0107](emf/0107-emf-is-coursework-scoped-and-self-contained.md) | The EMF implementation is coursework-scoped, lives entirely under `emf/`, and is deleted when two conditions hold | open |
| [0108](emf/0108-maven-and-tycho-against-a-pinned-target-platform.md) | Maven builds `emf/`, with Tycho resolving p2-only bundles against a pinned target platform, on JDK 21, with no Eclipse IDE | settled |
| [0109](emf/0109-source-and-target-metamodels-are-hand-written.md) | The source and target metamodels are hand-written in Ecore, and their Java is generated at build time | open |
| [0110](emf/0110-constraints-are-complete-ocl-named-by-code.md) | Constraints are Complete OCL invariants named by the diagnostic code they emit | open |
| [0111](emf/0111-xtext-parses-the-authored-yaml-into-the-metamodel.md) | The Xtext grammar parses the authored YAML files themselves, into the imported metamodel | open |
| [0112](emf/0112-qvto-derives-the-resolved-deployment.md) | QVT-Operational derives the Resolved Deployment | open |
| [0113](emf/0113-acceleo-4-renders-the-deliverable-set.md) | Acceleo 4 renders the Deliverable Set, byte for byte against the committed tree | open |
| [0114](emf/0114-model-behaviours-have-a-java-witness.md) | Every model behaviour in the behaviour ledger has a Java witness, listed inside `emf/` | open |
| [0115](emf/0115-the-emf-gates-are-estate-shaped.md) | The model-driven build carries the gates the estate's JVM repositories enforce, plus Java-shaped equivalents, and measures its thresholds | open |
| [0121](emf/0121-parity-crosses-the-cli-file-interface.md) | The parity suite reaches the pipeline through its file interface, and holds no EMF type | open |
| [0122](emf/0122-bundles-and-tests-are-separate-tiers.md) | The tree splits into an Eclipse bundle tier and a test tier, and only the bundle tier is Java | open |
| [0126](emf/0126-the-env-files-are-read-not-parsed-by-xtext.md) | The env files are read by a hand-written reader, not by a second Xtext grammar | settled |
