---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#witnesses
rests-on: ["0070"]
---

# Every model behaviour in the behaviour ledger has a JUnit witness, listed inside `emf/`


The list has a **pending** state, for a model behaviour row this implementation
cannot prove yet. `REQ-033`, `REQ-034` and `REQ-035` are layer-2
and node-contract behaviours whose Ecore half lands with
[#87](https://github.com/JorisJonkers-dev/deploy-kit/issues/87), and until it
does there is no target metamodel here to validate against. The alternatives
were to drop the rows from the gate, which loses them, or to witness them
against a test that proves something else, which is the gate reporting an
agreement nobody established. A pending row names its ticket, still has to
name a real model row, may not also be witnessed, and is counted separately,
so what is owed stays visible. It is the state the
[rule ledger](../../rules.md) already carries for a rule not enforced yet
([0066](../../../../docs/adr/architecture/0066-every-enforced-rule-has-an-id-a-row-and-a-fixture.md)).

## Rests on
Resting on [0070](0070-the-model-is-expressible-in-the-emf-toolchain.md), the
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
- A witness is a JUnit test in whichever language its module is written: Kotlin
  functions of `tests/parity` and Java methods of a bundle alike
  ([0081](0081-bundles-and-tests-are-separate-tiers.md)), and a witness row names
  the function as it is written, backticks and spaces included.
- The check needs to know which rows are model behaviours; the TypeScript tests
  that prove them live under `test/model/`, and that path is the marker. Paid
  once, when the first model test lands.
