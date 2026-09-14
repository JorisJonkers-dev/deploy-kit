---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#metamodels
rests-on: ["0106"]
---

# The source and target metamodels are hand-written in Ecore, and their Java is generated at build time

> **Amended 2026-09-14.** Aligned with the revised project proposal
> ([#102](https://github.com/JorisJonkers-dev/deploy-kit/pull/102)). This decision originally gave each model document its own package: Project
> Intent, Platform Intent, Resolved Deployment and Deliverable Set. The
> proposal defines two metamodels, so there are two packages: a source
> metamodel holding Project Intent and the Platform document, and a target
> metamodel holding the Resolved Deployment with its typed Kubernetes and
> extension resources. The descriptor covers the source metamodel only.

> **Amended 2026-09-14.** Vocabulary renamed by
> [0116](../../../../docs/adr/model/0116-project-application-process.md): Domain is now Project,
> Service is Application, Workload is Process, and Service Intent is Project
> Intent. The decision is unchanged.

## Rests on
Resting on [0106](0106-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that the source metamodel (Project Intent, with the Platform document
it is resolved against) fits one Ecore package whose structure, exported as the
parity descriptor, equals the structure the Zod schemas in `src/` declare, and
that the target metamodel (the Resolved Deployment with its typed resources)
fits a second package the templates can walk.
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

The proposal defines two metamodels, a source and a target, and the course
grades them as such. The model's three layers
([0003](../../../../docs/adr/model/0003-three-layer-meta-model.md)) still hold:
the Deliverable Set is the generated files, so it has no metamodel, and the
target metamodel carries layer 2 together with the typed resources the files
are written from, because an Acceleo template reads one model. The Platform
document is part of the source package because the transformation resolves a
Project against it.
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
