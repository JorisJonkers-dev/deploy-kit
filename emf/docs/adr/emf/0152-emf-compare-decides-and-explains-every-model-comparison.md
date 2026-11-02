---
tier: decision
status: accepted
claim: settled
date: 2026-11-02
normative: docs/architecture.md#stage-tests
rests-on: ["0070"]
---

# EMF Compare decides and explains every comparison of two models in the tests, pairing objects by natural key

Every test that compares two models, an XMI golden of the stage harness, an
oracle distance, or a resolution held against a hand-written model, asks EMF
Compare. Two models are equal only when it reports no difference, and each
difference it reports is one line at the object's keyed path, in the stage
harness's own format. The rules for the key and the report are in
[Stage tests](../../architecture.md#stage-tests).

## Rests on

The model is expressible in the EMF toolchain
([0070](0070-the-model-is-expressible-in-the-emf-toolchain.md)), and EMF Compare
is part of that toolchain's simultaneous release: the 2026-06 build the target
already pins ([0072](0072-maven-and-tycho-against-a-pinned-target-platform.md))
carries EMF Compare 3.3.28, whose core needs only EMF and Guava, both already
resolved there.

## Why

**An index walk reports where a list shifted, not what changed.** The resolved
model links by index fragment and the walk it replaces paired list items by
index, so an insertion, a deletion or a reordering moved every item after it
and every reference into it. Breaking the largest resolve golden on purpose,
the walk reported 130 lines for two Applications swapped, 60 for a removed
process, 12 for a moved environment entry and 9 for an inserted one; EMF Compare
keyed by natural key reported 1, 10 (the process and each reference to it), 1
and 1.

**A whole-model dump says nothing.** `ResolutionTest`'s checks failed by
printing the resolved model's whole XMI, up to 250 lines with no word of where
it differed. The same failure through EMF Compare is two lines: the input digest
that moved and the hash that follows it.

**One tool should decide and explain.** Keeping `EcoreUtil.EqualityHelper` as
the verdict and EMF Compare as the explanation would leave two definitions of
equal, and a failure whose explanation is empty. With EMF Compare deciding, a
difference is reported exactly when it fails a test. The one thing it does not
tell apart on its own, an unsettable feature unset beside one set to its default,
the comparison adds, because an XMI file does.

**The key is the model's own, not the metamodel's IDs.** Only three classes
declare an `iD` attribute, and EMF Compare's default matcher, keyed by those and
by similarity elsewhere, still paired keyless objects across Deliverables when
two Applications swapped, because similarity weighs a reference by its target's
index fragment. Keying each list item by the attribute that names it, a pair of
them where one is not unique, or a reference to a keyed object, pairs what a
reader would pair, and leaves similarity to the items that have no name.

**It is fast and stays test-only.** A resolve golden compares in 0 to 4 ms and
reports the same lines every run. The bundle is on the `cli` bundle's
classpath through `additional.bundles`, never in a manifest, so nothing a module
ships can need it, and the coverage and mutation gates, which measure shipped
classes, see nothing new.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep `EcoreUtil.EqualityHelper` and the index walk | nothing to add | the reports above; a reordering reads as every later item changed |
| `EqualityHelper` decides, EMF Compare explains a failure | two notions of equal, kept in agreement by hand | a failure whose explanation is empty is possible, and nothing says which of the two is right |
| Key the walk by name as the YAML half already does | a hand-written move detection and no answer for items without a name | EMF Compare already pairs by similarity, detects moves and moves across containers |
| EMF Compare with its default matcher | no key function to keep | similarity weighs index fragments, so a swap pairs unrelated objects elsewhere in the model |

## Reversibility

Undo cost today: one test class, `ModelDiff`, and the two call sites that use it,
plus one target unit and two `build.properties` lines; going back to an equality
check is an hour. Becomes irreversible once: nothing, since no shipped class may
depend on it (`EMF-021`).

## Consequences

- A line names a list item by its key, `[name="api"]`, where it named it by index, paid by the comparison's own tests, which hold every kind of line, and by each golden that fails, whose report changes shape.
- A key that changes reads as one item removed and one added, or as one item changed where similarity pairs them, paid by the line's path, which names both.
- An item with no key is paired by similarity, which may pair it with a different item than a reader would, paid by the marker on every such line and by `ModelDiffTest`, which asserts that no real difference compares equal however the items are paired.
- The target carries a unit the course does not require, paid by its version moving with the rest of the release in one change, as every unit does.
