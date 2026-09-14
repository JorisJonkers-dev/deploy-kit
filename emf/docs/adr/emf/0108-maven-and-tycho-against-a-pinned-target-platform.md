---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#toolchain
rests-on: ["0106"]
---

# Maven builds `emf/`, with Tycho resolving p2-only bundles against a pinned target platform, on JDK 21, with no Eclipse IDE

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

The claim is open because resolution has not been tried. The walking skeleton
is the first change to `emf/` for that reason.

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
