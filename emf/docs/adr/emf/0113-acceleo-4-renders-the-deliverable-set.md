---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#text-generation
rests-on: ["0106"]
---

# Acceleo 4 renders the Deliverable Set, byte for byte against the committed tree

> **Amended 2026-09-14.** Aligned with the revised project proposal
> ([#102](https://github.com/JorisJonkers-dev/deploy-kit/pull/102)). The templates read a Resolved Deployment model of the target metamodel,
> which already holds the typed resources; the Deliverable Set itself has no
> metamodel.

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that Acceleo 4 templates run standalone can reproduce every committed
`rendered/` file exactly, whitespace and key order included. False if: a
rendered file cannot be matched without post-processing the template output
outside Acceleo. Settled by: the rendered parity suite green for every case
under `spec/v1/examples/`, with no formatter between the templates and the
comparison.

## Why
The course requires Acceleo for model-to-text, and code generation carries the
largest share of the project grade. Acceleo 4 is the maintained line, with AQL
queries and a standalone API; Acceleo 3 is in maintenance.

Byte equality is strict for a template language, and it is the contract the
TypeScript serializer already meets. Relaxing it for one implementation would
make the rendered oracle mean two things.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Acceleo 3 | Most tutorials | Maintenance mode, and its standalone launch goes through generated launchers |
| Compare parsed YAML, not bytes | Whitespace stops mattering | The TypeScript side is held to bytes, and determinism is part of the model |
| Templates plus a YAML formatter pass | Easy whitespace | The formatter, not the templates, would be doing the generation being graded |

## Reversibility
Undo cost today: nothing exists. Becomes irreversible once: never; deleted with
`emf/`.

## Consequences
- Whitespace control is a template concern throughout. Paid in template
  complexity.
- A rendered file changed in `spec/v1/examples/` fails here until the template
  matches. Paid by whoever changes it.
