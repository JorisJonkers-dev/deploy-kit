---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#witnesses
rests-on: ["0106"]
---

# Every model behaviour in the behaviour ledger has a JUnit witness, listed inside `emf/`

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that the behaviours a unit test proves in `src/` about parsing,
validation, resolution and rendering can each be proved by a JUnit test here,
and that a list inside `emf/` can be checked against the root ledger without
the root knowing about it. False if: a model behaviour row can only be proved
in one implementation, or keeping the list requires a column in the root
ledger. Settled by: the witness check in `emf/tests/parity` green, and failing on a
fixture that removes one witness.

## Why
The oracle files prove agreement on what the examples exercise. A unit test
proves a behaviour the examples may not reach, such as an error raised for an
input no worked example contains. Without a rule, one implementation tests it
and the other never does, and the parity contract says nothing.

The list lives in `emf/` so the root ledger stays the TypeScript ledger it is,
and the sunset deletes the list with nothing to edit in the root.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A witness column in the root ledger | One table | The root gains an EMF dependency, and the sunset edits every row |
| Parity only through the examples | No list to maintain | Unit-level behaviour can diverge wherever no example reaches |
| A separate EMF requirements ledger with its own ids | Clean separation | Two ledgers can disagree about which behaviours exist |

## Reversibility
Undo cost today: nothing exists. Becomes irreversible once: never; deleted with
`emf/`.

## Consequences
- A model behaviour row lands with a JUnit witness or the `emf` job fails. Paid
  by its author, in the same pull request.
- **Amended when the test tier was ported to Kotlin
  ([0122](0122-bundles-and-tests-are-separate-tiers.md)).** This decision said
  "Java" because every module was Java when it was taken. The rule is unchanged:
  a witness is a JUnit test, in whichever language its module is written. Three
  of the six witnesses are now Kotlin functions of `tests/parity` and three are
  Java methods of a bundle, so `Ledgers.checkWitnesses` reads a `.kt` function
  and a `.java` method alike, and a witness row names the function as it is
  written, backticks and spaces included. Nothing here is reversed; the word
  that changed is "Java", not the rule.
- The check needs to know which rows are model behaviours; the TypeScript tests
  that prove them live under `test/model/`, and that path is the marker. Paid
  once, when the first model test lands.
