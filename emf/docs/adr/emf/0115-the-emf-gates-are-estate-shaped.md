---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#gates
rests-on: ["0106"]
---

# The model-driven build carries the gates the estate's JVM repositories enforce, plus Java-shaped equivalents, and measures its thresholds

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that the gates the estate's Gradle repositories run for JVM code have
Maven equivalents that hold over this build, including once Tycho and generated
EMF sources arrive. False if: a gate adopted here has to be switched off, or its
threshold lowered, to let the walking skeleton or a stage land. Settled by: the
`emf` job green with every gate in `emf/docs/rules.md` enforced after the Task 3
code generation work merges.

## Why
The estate's JVM repositories share one set of Gradle convention plugins. An
audit of fourteen of them found what they actually enforce: JDK 21 toolchains,
compiler warnings as errors, JaCoCo with a line-coverage floor wired into
`check`, JUnit with AssertJ and ArchUnit, Renovate, pinned CI actions and one
aggregating `Pipeline Complete` check. Their formatting and static analysis
(ktlint, detekt) are Kotlin-only.

This build ports the first group one for one: the enforcer for JDK and Maven
versions, `-Xlint:all -Werror`, JaCoCo bound to `verify`, JUnit 6 with AssertJ
and ArchUnit. It gives Java the equivalent the estate gives Kotlin, Spotless
with palantir-java-format, because Java would otherwise be the one language in
the estate nobody formats. It adds PIT mutation testing, which the root already
plans for the TypeScript gates and no estate JVM repository runs yet, because
the parity code here decides what counts as agreement between two
implementations and a line that runs is not a line that is checked.

The thresholds are set from the first measurement, not from a convention: the
first `mvn verify` over the canonical JSON writer and the ledger checks reached
100% line coverage, 100% branch coverage and 87 of 87 mutants killed, so those
are the floors, and they only rise. Equivalent mutants were removed by
restructuring the code, not by lowering the score.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| SpotBugs, Error Prone and NullAway | Stronger static analysis | No estate JVM repository runs any of them; Error Prone only reaches plain jar modules under Tycho, and CodeQL `security-and-quality` already scans the Java |
| An 80% line floor, the estate's default | Matches the Gradle conventions | The first measurement is 100%, and a floor below what the suite reaches is a floor that lets coverage fall |
| No mutation testing for a deprecated tree | Faster builds | Parity code that passes by accident makes two implementations look equal when they are not |
| SBOM and artifact signing | Supply-chain evidence | Nothing is published, and no estate JVM artifact carries either |

## Reversibility
Undo cost today: deleting plugin blocks and ledger rows, an hour. Becomes
irreversible once: never; deleted with `emf/`.

## Consequences
- Every generated source directory Tycho, Xtext or genmodel adds must be excluded
  from formatting, coverage and mutation in the pull request that adds it. Paid
  by the walking skeleton first.
- If PIT cannot run inside an OSGi test runtime, it is scoped to the plain jar
  modules and the scoping is recorded here. Paid by whichever stage meets it.
- Every build runs mutation testing, so `mvn verify` grows with the code. Paid in
  CI minutes, and revisited if the job passes ten minutes.
- A threshold change is a line in `emf/pom.xml` that has to be argued in review.
  Paid by whoever wants to lower one.
