---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#metamodels
rests-on: ["0106"]
---

# Each model document has a hand-written Ecore metamodel, and its Java is generated at build time

> **Amended 2026-09-14.** Vocabulary renamed by
> [0116](../../../../docs/adr/model/0116-project-application-process.md): Domain is now Project,
> Service is Application, Workload is Process, and Service Intent is Project
> Intent. The decision is unchanged.

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that Project Intent, Platform Intent, the Resolved Deployment and the
Deliverable Set each fit one Ecore package whose structure, exported as the
parity descriptor, equals the structure the Zod schemas in `src/` declare.
False if: the descriptor exported from Ecore cannot equal the committed
descriptor without a type, multiplicity or vocabulary that the TypeScript side
does not have. Settled by: the descriptor parity suite green in both
implementations.

## Why
The course grades metamodelling as its first task, and the metamodel is what
every later tool reads: the grammar imports it, the constraints annotate it,
the transformation maps between its packages, and the templates walk it. It is
written by hand because the course grades authored metamodels and because
generating it from Zod would make its structure unfalsifiable against Zod.

One package per document follows the model's own layering
([0003](../../../../docs/adr/model/0003-three-layer-meta-model.md)), with
Platform Intent separate because it is a separately authored document.
Cross-document references are Ecore references, so the transformation navigates
them rather than joining strings.

Java is generated from the `.genmodel` during the build rather than committed:
the tools work on typed models most smoothly, and committed generated code is a
second copy that goes stale.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Dynamic EMF, no generated Java | No code generation step | Every test and helper works through reflection, and the course's material assumes generated model code |
| Commit the generated Java | Navigable without a build | Large diffs on every metamodel change and a stale copy the moment someone forgets to regenerate |
| OCLinEcore or Xcore as the source | One textual file per layer | The `.ecore` is what every tool and the grader reads, so a second source format adds a translation |

## Reversibility
Undo cost today: nothing exists. Becomes irreversible once: never; deleted with
`emf/`.

## Consequences
- A model change is an `.ecore` edit and a Zod edit, and the descriptor suite
  fails until both match. Paid by whoever changes the model.
- Class diagrams for the course report are drawn from the `.ecore` files, not
  maintained separately. Paid by nobody.
