---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#concrete-syntax
rests-on: ["0106"]
---

# The Xtext grammar parses the authored YAML files themselves, into the imported metamodel

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that the YAML subset every authored example uses can be parsed by an
Xtext grammar with synthetic indentation tokens, producing instances of the
hand-written Service Intent and Platform Intent metamodels. False if: an
authored example needs YAML the grammar cannot parse without ambiguity, or the
parsed model serialises to an `intent.json` different from the committed one.
Settled by: the parsed-intent parity suite green for every authored file under
`spec/v1/examples/`.

## Why
Parse parity is only direct when both implementations read the same bytes. A
new textual syntax for the Java side would double every fixture and add a
third failure mode, drift between a YAML file and its twin.

Importing the metamodel instead of letting Xtext infer one keeps a single
layer-1 metamodel: the parser's output is what OCL validates and QVTo reads.
The price is that the grammar has to fit the metamodel's shape, so YAML keys
become keywords, and YAML the examples do not use is refused rather than
supported.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A new DSL with paired YAML and DSL fixtures | A cleaner grammar to present | Every fixture written twice, and pairs drift |
| An inferred metamodel mapped to the hand-written one | The grammar is free of the metamodel's shape | A third metamodel and an extra transformation to keep in parity |
| A plain YAML loader instead of Xtext | Full YAML support | The course requires Xtext |

## Reversibility
Undo cost today: nothing exists. Becomes irreversible once: never; deleted with
`emf/`.

## Consequences
- A YAML construct new to the examples needs a grammar change before the Java
  side can read it. Paid by whoever introduces it, and visible as a failing
  parse parity case.
- The grammar refuses flow sequences, anchors and multi-document files unless
  an example needs them. Paid by nobody while examples avoid them.
