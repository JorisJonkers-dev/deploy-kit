---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-16
normative: docs/architecture.md#parity
rests-on: ["0106"]
---

# The parity suite reaches the pipeline through its file interface, and holds no EMF type

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that everything the parity contract compares is already a file, so a
suite that calls no EMF type can still prove every case under
`spec/v1/examples/`. False if: a parity case exists that cannot be decided from
the pipeline's own output files and its exit code, and can only be decided by
reading an in-memory model. Settled by: the parity module building as a plain
jar with no dependency on the target platform, green on every case the three
course tasks land.

## Why
Today `parity/` imports `Pipeline`, `Parsed`, `Diagnostic` from the `cli`
module and `Descriptor`, `ProjectIntentPackage` from `metamodel`. Those are EMF
types, resolved from p2, so the test module has to be an Eclipse bundle to see
them. It is one: `parity/pom.xml` declares `eclipse-plugin` packaging, while
[the architecture](../../architecture.md#toolchain) says modules that need no p2
bundle, like `parity/`, stay plain jars. The drift is not a typo. One suite
reaching past the pipeline's own interface pulled the whole Eclipse toolchain
into the module whose job is to be independent of it.

The pipeline's real interface is narrower than its Java types: input files and
arguments in; an exit code, diagnostics and a rendered tree out. That is the
interface [0105](../../../../docs/adr/architecture/0105-two-implementations-meet-at-committed-oracles.md)
already compares the two implementations across, because an oracle file is a
file and nothing else. Two things are compared today through Java instead: the
metamodel descriptor and the parsed intent. Both are values the pipeline can
write, so both can cross the same interface as everything else.

Moving the suite onto that interface pays three times. The test module loses
every p2 dependency and becomes a plain jar. A parity failure then names an
output a person can open, not a Java field a person has to reconstruct. And the
suite exercises what a run of the pipeline leaves behind, which is what a grader
sees from `mvn verify` and what an examiner sees from a launch configuration, so
a case that passes in CI is a case either of them can reproduce.

Losing every p2 dependency is also what lets the module be written in a language
the target platform does not carry, which is
[0121](0121-bundles-and-tests-are-separate-tiers.md)'s subject. This decision
stands on its own (the drift it closes is live today), but that is the order the
two are taken in.

The module keeps `Ledgers` in its `src/main`: it is a helper the suites call,
not a test, and it touches no EMF. `CanonicalJson` does not stay: the pipeline
now writes what the suite used to serialise, so the writer moves down to
`metamodel/`, the lowest module that writes a canonical file, and the suites
compare bytes instead of serialising anything.

It costs the ability to assert on anything the pipeline does not write. That is
the point: a value worth asserting on is a value worth emitting, and one that
is not emitted is not evidence of parity.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Leave `parity/` an Eclipse bundle and fix the architecture's sentence instead | Nothing to build; the drift closes by rewriting the doc | Keeps the toolchain inside the module that exists to be free of it, and keeps the widest interface in the tree as the test surface |
| Keep the Java calls, but add a second, file-level suite beside them | Both surfaces proven | Two suites decide the same cases, and the narrow one is never trusted while the wide one exists |
| Make the pipeline a separate process the suite runs | The strictest seam, exit code included | Costs a packaged, runnable artifact and process plumbing for no case the in-process file interface cannot decide; revisit if one appears |
| Export only the descriptor, keep `Parsed` in Java | One less thing to serialise | The parsed intent is the Task 1 evidence, so it is exactly the thing that must be readable as a file |

## Reversibility
Undo cost today: restoring the Java calls and the `eclipse-plugin` packaging,
half a day, and the serialisers stay useful either way. Becomes irreversible
once: never; deleted with `emf/`.

## Consequences
- The pipeline writes the parsed intent and the diagnostics as canonical JSON,
  and the metamodel writes its descriptor as a build artifact. Paid by the
  pull request that moves the suite.
- `parity/pom.xml` becomes `jar` packaging and loses its `META-INF/MANIFEST.MF`
  and its `build.properties`, the two PDE artifacts, so it builds without the
  target platform. Paid in the same pull request.
- **The module rules stop enforcing unless they are given their classes and a
  non-empty guard.** `ArchitectureTest` is `@AnalyzeClasses(packages =
  "dev.jorisjonkers.deploykit.emf")`, so it sees the other modules only because
  `parity/META-INF/MANIFEST.MF` requires them. Dropping that dependency, which
  this decision mandates, leaves the importer with parity's own classes; every
  other layer is then empty, `withOptionalLayers(true)` excuses it, and
  `EMF-010` and `EMF-011` pass while proving nothing. The suite reads the
  class directories the build wrote, by path, **and** asserts every module whose
  classes the build wrote is in the import, so an empty import fails loudly
  instead of passing. A module with no class of its own yet, which `resolve/`
  and `render/` are until their stage lands, is empty in the tree rather than
  missing from the import, and is not reported. Paid in the same pull request,
  as `EMF-017`, and shown by a fixture that empties the import.
- A module that declares no dependency is ordered by its position in the
  reactor alone, so `-T`, `-pl` or an IDE can run the suite before the bundles
  wrote their classes and output files. Each case asserts its expected output
  file exists before comparing it, and a missing one fails as a missing file
  rather than as a skipped case. That is a different absence from a case with no
  committed oracle, which is still listed as not yet a parity case: one is the
  pipeline failing to write what it owes, the other is a case nobody has pinned
  yet. Paid in the same pull request.
- `EMF-010` and `EMF-011` keep their rows but gain the fixture
  [0104](../../../../docs/adr/architecture/0104-every-enforced-rule-has-an-id-a-row-and-a-fixture.md)
  requires, since a rule that has only ever run clean is untested and these two
  would be the first to pass vacuously. Paid in the same pull request.
- The module table's dependency rule changes shape: the parity module depends on
  no module, only on the files the build writes. That is a row in
  [the architecture](../../architecture.md#modules), a row in
  [the rule ledger](../../rules.md) for `EMF-010`, **and** the rule's own
  enforcement: `MODULES_DEPEND_ONLY_ON_MODULES_ABOVE_THEM` in
  `ArchitectureTest` currently names `parity` in five `mayOnlyBeAccessedByLayers`
  chains, so it would keep permitting exactly what this decision forbids. The
  layer and those five entries go together with the imports.
- A stage that wants a new parity assertion must first make the pipeline emit
  the value. Paid by Task 2 and Task 3.
