---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-16
normative: docs/architecture.md#modules
rests-on: ["0106"]
---

# The tree splits into an Eclipse bundle tier and a test tier, and only the bundle tier is Java

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that the modules an examiner opens in Eclipse and the modules that
only ever run from Maven are two disjoint sets, and that the second set needs
nothing from the Eclipse toolchain. False if: a module has to be both, or a
test tier written outside Java cannot hold a gate this build already enforces.
Settled by: `./mvnw -B -ntp verify` green with `bundles/` built by Tycho, the
test tier built as a plain Kotlin jar, and every rule in
[the rule ledger](../../rules.md) still enforced.

## Why
Every module under `emf/` is an Eclipse bundle today, and the directory listing
says nothing about which of them a course examiner ever opens. Five of them are
the graded artefacts: the metamodels, the grammar, the transformation, the
templates and the pipeline that runs them. One, `parity/`, is this
repository's own evidence, built and run only by Maven, and by
[0120](0120-parity-crosses-the-cli-file-interface.md) it holds no EMF type at
all. Two audiences, two toolchains, one flat list.

The split names them: `bundles/` for what Tycho builds against `emf.target`
and Eclipse imports, `tests/` for what Maven builds as a plain jar. The boundary
answers a question every reader currently has to work out from a `pom.xml`: is
this file graded, and will a teacher open it. It says nothing about the
documents: `emf/docs/` keeps its architecture, its rule ledger, its witness list
and its register where they are, and a reader who finds them spread out is
finding a different problem than this one.

The boundary is also a language boundary. Ecore generates Java, Xtext's runtime
hooks are Java, and a bundle compiles through Tycho's JDT compiler against a
target platform that carries no Kotlin: putting Kotlin in a bundle means a
`kotlin-stdlib` unit in `emf.target`, a second compiler ahead of JDT, and an
examiner who needs the Kotlin Eclipse plugin to read the source. So `bundles/`
is Java, without exception.

The `cli` module is the one worth naming, because it looks like the exception.
It is not run from Eclipse the way the metamodels are read there, so it reads
like a candidate for Kotlin. It is not one: it calls the EMF, OCL, QVTo and
Acceleo standalone APIs, every one of them resolved from p2, so it is a bundle
by its dependencies whatever language it is written in, and it carries the
launch configurations an examiner runs. Kotlin reaches it only as a launcher
wrapping a Java pipeline, which buys argument parsing and pays a module for it.
The part with no teacher, no Eclipse and no p2 dependency is the test tier, and
that is the part this decision moves. `tests/` has none of those constraints and every
other JVM repository in the estate is Kotlin with a mature suite, so it is
Kotlin, and the estate's test idiom applies here rather than being reinvented
in Java.

The graded modules keep their short directory names. Tycho's convention is a
directory named for the bundle's symbolic name, but Eclipse names an imported
Maven project from its `artifactId` regardless, so the long names buy nothing
an import already gives and cost every path in the tree.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep the flat module list, document the split in prose | No moves, no path updates | The listing is what a reader sees first; a convention only a document knows is a convention that gets broken |
| Split by course task (`task1/`, `task2/`, `task3/`) instead | Matches the grading schedule exactly | The `cli` and the metamodels span every task, so the split would have to cut them; the deadline is a property of a row in the module table, not of a directory |
| Directories named for bundle symbolic names | Tycho and PDE convention, directory equals Eclipse project | Eclipse takes the project name from the `artifactId` anyway, so it buys a naming match nobody reads and costs 40-character paths |
| Kotlin in the bundles too, one language for the tree | One toolchain to learn | A p2 target platform with no Kotlin, a second compiler before JDT, and generated EMF Java that stays Java regardless |
| Kotlin for `cli` alone, the module no teacher runs as a project | The pipeline entry in the estate's language | `cli` calls four standalone APIs resolved from p2, so it is a bundle by its dependencies; Kotlin would reach only a launcher around the Java pipeline |
| Keep the test tier in Java | No second language in the build | Every other JVM repository in the estate is Kotlin, so a Java suite here is the one suite nobody has a pattern for |

## Reversibility
Undo cost today: moving six directories back and updating the paths that name
them. `grep -rIl -E 'emf/(metamodel|syntax|cli|resolve|render|parity)'` over the
tracked tree finds them; an afternoon. Becomes
irreversible once: never; deleted with `emf/`.

## Consequences
- The reactor's `<module>` entries become `bundles/…` and `tests/…`, and the
  root's `test/emf-wiring.test.ts` keeps holding them, since it reads the
  entries rather than assuming a depth. Paid by the moving pull request.
- The `bundle` profile in `emf/pom.xml`, which activates on a module's
  `META-INF/MANIFEST.MF`, now agrees with the directory it sits in. The file
  test stays: the directory is documentation, the manifest is the fact.
- Spotless with palantir-java-format covers `bundles/`; the test tier needs
  the formatter the estate's Kotlin repositories run. Paid by the pull request
  that ports the suite.
- PIT reports many equivalent mutants on Kotlin, so the mutation threshold of
  [0115](0115-the-emf-gates-are-estate-shaped.md) may not hold over the test
  tier at the number it holds over Java. Lowering it is a decision of its own,
  with its own record, and until one exists the threshold stands.
- `emf/README.md` gains the one table that says which artefact lives where and
  which task grades it, so the layout answers the navigation question without
  a search. Paid by the moving pull request.
- [0114](0114-model-behaviours-have-a-java-witness.md) says every model
  behaviour has a **Java** witness, and three of its six witnesses are
  `ParityTest` methods in the module this decision ports. The other three sit in
  bundles and stay Java. The wording that has to change is "Java", not the rule:
  a witness is a JUnit test, in whichever language its module is written. The
  pull request that ports the suite amends that decision to say so and carries
  the same edit into [the witness list](../../witnesses.md), `EMF-013`'s row in
  [the rule ledger](../../rules.md) and the sentence under
  [the gates](../../architecture.md#gates) that calls a witness a Java proof.
  `emf/docs/architecture.md`'s own
  [Witnesses](../../architecture.md#witnesses) section already says "the JUnit
  test", so it needs no edit. Nothing here reverses
  [0114](0114-model-behaviours-have-a-java-witness.md); if review reads the
  change as a reversal rather than an amendment, it supersedes it instead, with
  every citation naming the successor.
- Every document that names a module by its current path moves with it, in the
  same commit, `emf/docs/architecture.md` and `emf/README.md` included: [the rule ledger](../../rules.md), whose `EMF-010`, `EMF-011`,
  `EMF-013`, `EMF-014` and `EMF-016` rows each name a file under `parity/` and
  whose `EMF-014` check fails the build the moment a named file is not where its
  row says; [the witness list](../../witnesses.md);
  [the root architecture](../../../../docs/architecture.md); the refusal
  examples' README; and the two root tests that name a parity path in a comment
  and in a fixture string. The ledger is the one that breaks the build if it is
  forgotten.
