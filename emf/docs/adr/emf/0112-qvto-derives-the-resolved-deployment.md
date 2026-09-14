---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#transformation
rests-on: ["0106"]
---

# QVT-Operational derives the Resolved Deployment

> **Amended 2026-09-14.** Aligned with the revised project proposal
> ([#102](https://github.com/JorisJonkers-dev/deploy-kit/pull/102)). The transformation targets the model-driven Resolved Deployment metamodel,
> which holds typed resources, so its output is not compared with
> `resolved.json`. The two implementations are compared on the resolved
> dependency edges and on the generated files instead, as the proposal names
> them.

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that every derivation and assignment chapter 20 defines, including the
ones over the whole composed union, is expressible as QVTo mappings and helpers
run by the standalone executor. False if: a derivation needs Java black-box
code for anything but hashing, or the transformation's output yields dependency
edges or generated files different from the committed ones. Settled by: the
dependency-edge and rendered parity suites green for every case under
`spec/v1/examples/`.

## Why
The course teaches ATL and QVT-Operational for model-to-model transformation.
The Resolved Deployment is derived mostly by computation over the whole input,
not by matching one element to one element: the path plan, collision detection,
the Reconcile Unit graph and the release gate inputs all read the composed
union. QVTo is imperative, which fits that; ATL's rule matching fits a
structural mapping and pushes the global derivations into helpers anyway.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| ATL | The most course examples | Global derivations end up as helper code outside the rule model |
| ATL for mapping, QVTo for derivations | Shows both taught tools | Two transformation runtimes to build and keep in parity |
| Java over the generated model | Fastest to write | The course grades a transformation language |

## Reversibility
Undo cost today: nothing exists. Becomes irreversible once: never; deleted with
`emf/`.

## Consequences
- Hashing for `renderHash` and content-hashed Assets is a black-box Java helper,
  the one allowed. Paid once.
- A derivation the transformation lacks shows up as a dependency-edge or
  rendered parity failure, not a silent default. Paid by the author of the derivation.
