---
tier: decision
status: proposed
claim: settled
owner: joris
date: 2026-09-14
normative: docs/architecture.md#toolchain
rests-on: ["0106"]
---

# Maven builds `emf/`, with Tycho resolving p2-only bundles against a pinned target platform, on JDK 21, with no Eclipse IDE

> **Amended 2026-09-14, settled by the walking skeleton (#81).** `mvnw verify`
> ran all five tools headless, each through its standalone API: an `.ecore`
> loaded and an instance validated, a Complete OCL invariant fired, a generated
> Xtext parser read a three-line document, a QVT-Operational identity
> transformation ran, and an Acceleo 4 template wrote a file. What the attempt
> changed:
>
> - Every bundle, EMF and Xtext included, resolves from one p2 repository: the
>   2026-06 simultaneous release at its dated build, with each unit pinned to
>   an exact version in `emf/emf.target`. Maven Central carries a newer Xtext
>   than the release the OCL and QVT-Operational bundles were built against, so
>   taking EMF and Xtext from Central would have mixed two releases. The one
>   Central artifact left is the ANTLR 3 generator the Xtext generator calls,
>   which is not published to p2.
> - A module that needs a p2 bundle is an Eclipse bundle (`eclipse-plugin`,
>   with a manifest), because Tycho resolves p2 dependencies only for bundles.
>   Its tests still run on a plain classpath through Maven Surefire, outside
>   OSGi, so the standalone APIs CI checks are the ones a command-line user
>   gets.
> - The Xtext generator runs as an MWE2 workflow in `generate-sources`, writing
>   every Java file, stubs included, under `target/`.

> **Amended 2026-09-14.** No Eclipse IDE is needed to build, and CI never
> uses one. The projects must still be loadable in Eclipse Modeling Tools for
> the course's examiners, as the Task 0 proposal now promises: they import as
> existing Maven projects, the metamodels open, the Xtext-generated editor
> reports OCL constraint violations while editing, and committed launch
> configurations run the
> QVT-Operational transformation and the Acceleo generator. Keeping that
> working is part of this decision; the Maven build stays the only path CI
> checks.

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim here is that every tool the course requires runs headless from one Maven
build: EMF, Xtext, Eclipse OCL, QVT-Operational and Acceleo 4 all resolve from
Maven Central or a pinned p2 site and run without an OSGi workspace. False if:
any of them needs the Eclipse IDE, a launch configuration or a manual step to
produce what CI checks. Settled by: the walking skeleton's `mvn verify` green
in CI from a clean runner cache.

## Why
The course teaches these tools inside the Eclipse IDE. The estate works in
IntelliJ and CI, and a build a grader cannot reproduce with one command is a
build nobody can check. So the IDE is out, and the question is which build tool
reaches the tools.

Gradle was the preference and was dropped: the EMF-family tools that publish
only to p2 have no maintained Gradle route, and the Eclipse projects themselves
build with Maven and Tycho. Tycho exists to resolve p2 repositories from Maven,
with the target platform as one file pinned to exact versions, which is the
same pinning discipline the rest of the repository applies to CI binaries.
JDK 21 is the current LTS the Eclipse releases target.

The claim was open until resolution had been tried, which is why the walking
skeleton was the first EMF-dependent change to `emf/`; the amendment above
records what it found.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Gradle | The estate's preferred build tool, existing templates | p2-only bundles need unmaintained plugins or hand-vendored jars, and every tool's documented headless route is Maven |
| Plain Maven with vendored jars | No Tycho conventions | Transitive bundles resolved by hand and upgraded by hand |
| The Eclipse IDE, as taught | Matches the lectures | Not reproducible in CI, not the estate's editor |

## Reversibility
Undo cost today: nothing exists. Becomes irreversible once: never; the build is
deleted with `emf/`.

## Consequences
- CI gains a JDK and a Maven cache for one job. Paid in pipeline minutes.
- Modules that consume p2 bundles follow Tycho's packaging conventions. Paid
  once per module.
- A tool that turns out not to run headless stops Task 1 early rather than in
  October. Paid by the skeleton, in a day.
