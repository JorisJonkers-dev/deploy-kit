---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#the-parity-contract
rests-on: ["0003", "0006"]
---

# Two hand-written implementations meet at committed oracle files, and neither is generated from or tested against the other

> **Amended 2026-09-14.** Aligned with the revised project proposal
> ([#102](https://github.com/JorisJonkers-dev/deploy-kit/pull/102)): the TypeScript code is the production implementation and `emf/` the
> model-driven implementation. They are compared on validation, dependency
> resolution, errors and generated resources. `resolved.json` binds the
> production implementation only, because the model-driven target metamodel
> holds the Resolved Deployment and the typed resources as one model; a new
> dependency-edge oracle carries the part of resolution both must agree on.

## Rests on
The three layers give three points where a run's state is a complete, closed
document, and pinned inputs make each of those documents a function of the
input, so two independent implementations can be compared through a committed
file at each layer without either running beside the other. False if: some
layer's content depends on how an implementation orders or identifies things
in a way canonical JSON cannot normalise, so two correct implementations
disagree byte for byte. Settled by: both implementations green against every
oracle file of every case under `spec/v1/examples/`, with no oracle carrying an
implementation-specific field.

## Why
The course this repository is coursework for rejected the proposal to build
the compiler in TypeScript alone (`docs/mde/task-0-proposal/Sections/07-tooling.tex`
asked for that substitution and flagged that it needed approval). The graded
work has to use Ecore, Xtext, OCL, QVT-Operational and Acceleo. The TypeScript
compiler stays the long-lived implementation, so for the length of the course
there are two.

Generating one from the other was the obvious way to keep them equal, and it
was ruled out: the course grades the modelling artifacts as authored work, and
the TypeScript types generated from Ecore, or Ecore generated from Zod, would
make one side a derivative the other cannot be checked against. Two hand-written
implementations can drift, so equality has to be proven.

It is proven at the layer boundaries the model already has
([0003](../model/0003-three-layer-meta-model.md)). A parsed intent, a Resolved
Deployment and a Deliverable Set are each a whole document, and
[0006](../model/0006-pinned-inputs.md) makes each a function of pinned inputs,
so a committed canonical copy of each is an oracle both sides can be held to
separately. A failure then names the side that is wrong, which a diff between
two runs never does. `spec/v1/examples/` already carries hand-rendered
Deliverable Sets and refused cases; the contract adds the two intermediate
documents, the diagnostics of each refused case and the metamodel's structure.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Generate TypeScript from Ecore, or Ecore from TypeScript | No parity tests for structure at all | The course grades the modelling artifacts as authored work, and a generated side cannot fail independently of its source |
| Run both implementations and diff their outputs in CI | No committed intermediate files | A red diff does not say which side is wrong, and neither suite can run alone |
| Only the rendered tree as oracle | Uses what already exists | A resolution bug and a rendering bug look the same, and the metamodel and validation parities have nothing to compare |

## Reversibility
Undo cost today: deleting the contract section and the oracle files nobody has
written yet. Becomes irreversible once: never; at the second implementation's
sunset the oracle files stay as the TypeScript compiler's own golden files and
only the Java side of each check is deleted.

## Consequences
- Every behaviour change touches an oracle file, and both implementations stay
  red until both are fixed. Paid by whoever changes the model, in two
  implementations, for as long as there are two.
- Diagnostics carry a stable code and a JSON Pointer in both implementations,
  so a refusal's location becomes contract rather than presentation. Paid once
  per constraint, in the constraint ledger.
- Canonical JSON is a new serialisation both sides must produce exactly. Paid
  once per implementation, and kept afterwards as the TypeScript golden format.
- The architecture decisions that assume one implementation
  ([0065](0065-one-hexagon-domain-mirrors-the-layers.md),
  [0066](0066-wire-shape-is-not-the-domain.md),
  [0100](0100-tests-run-in-process-on-vitest.md),
  [0102](0102-the-gate-grows-with-the-code.md)) are scoped to the TypeScript
  tree; the Java tree's decisions live in `emf/docs/adr/` and are deleted with
  it.
