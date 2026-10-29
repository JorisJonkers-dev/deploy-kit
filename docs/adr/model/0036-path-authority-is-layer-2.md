---
tier: decision
status: accepted
claim: settled
date: 2026-10-29
normative: spec/v1/30-deliverables.md#path-allocation
rests-on: ["0003"]
---

# An adapter writes its own paths through one set of shared directory helpers, and the render refuses a path claimed twice

## Rests on
Layer 3 holds no decisions ([0003](0003-three-model-pipeline.md)), and where a
Deliverable lands follows from whose it is: the Project and the Application the
projection already names, and whether the object is an Application's, a
Project's or the estate's. False if: a path can only be chosen from something
the projection does not carry, or two adapters must agree on a path that no
shared helper spells. Settled by: every worked project rendering with each root
spelled by `src/adapters/shared/paths.ts`, and `E_PATH_COLLISION` firing on the
assembled Deliverable set in the render tests.

## Why
An earlier form of this record moved path authority up a layer: the Resolved
Deployment would carry a path plan, one assignment per rendered object, and an
adapter would serialise what it was handed. Nothing ever computed that plan.
Every adapter writes `apps/<project>/<application>/…` from the projection's
`project` and `id`, through the directory helpers every adapter shares, and the
published schema's `pathPlan` was a required field that no render produced and
no adapter read
([JorisJonkers-dev/deploy-kit#690](https://github.com/JorisJonkers-dev/deploy-kit/issues/690)).
A published field nothing fills is a promise the artifact cannot keep, so the
plan goes, and this record states what decides a path instead.

A path needs no plan because it is not a choice. The two cases that once
motivated the plan are answered by scope rather than by assignment. A
per-project object, `namespace.yaml` or the namespace-wide default-deny, is
written once in its Project's directory, not once per Application: `data` has
three Applications and one Namespace. An estate-scoped object is written under
`estate/`, never in a Project's share, so it no longer lands in whichever
namespace the emitting adapter keyed off. The roots are spelled once, in the
shared helpers, so no two adapters can disagree about where a Project's share
begins; an adapter names only its file below them.

The two roots never meet. A Project's share is everything under
`apps/<project>/`, its routes and its Vault documents among it, and what is
estate-scoped (the catalog of a datastore the old path still runs) is under
`estate/`. While the estate-scoped directories sat under `apps/` beside the
Projects', the directory `apps/edge/` was both the routes' and the directory of
a Project named `edge`, and the estate has one: its whole render was attributed
to the estate-scoped artifact, and the Project could never be published or
pinned as itself. A path's first segment now says whose it is, with no name a
Project has to avoid.

A collision is still refused, at the one place every path is known: the
assembled Deliverable set, once every adapter has run and before anything is
written. Two adapters claiming one path, two Vault documents of one name and two
objects of one ServiceAccount are each `E_PATH_COLLISION`, reported against the
paths rather than left to the writer, where the second write would silently win.

An Adapter still declares a `defaultPath` in the registry
([0037](0037-six-registered-adapters-satisfy-one-port.md)). It states where the
adapter's output lands, for a reader of the registry; nothing reads it to place
a file.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A path plan on the Resolved Deployment, one assignment per rendered object | every path visible in the projection; a collision decidable before any adapter runs | the earlier form of this record: nothing computed it, so it was a required published field with no producer, and a second statement of what the helpers already decide |
| Each adapter spells its own roots | no shared module | two adapters can disagree about where a Project's share begins, which is how one per-project object once rendered at three paths |
| A layout policy module consulted by both layers | an explicit seam, testable alone | a component holding decisions while sitting outside the three layers is the unnamed middle the three-model pipeline exists to prevent |
| Keep the estate-scoped directories under `apps/`, and reserve their names | no path moves; `edge` and `vso-secrets` join the names no Project may take | the estate's own edge Project is named `edge`, so the reservation refuses a name already in use, and every later estate-scoped directory reserves another |
| Let the writer resolve collisions by precedence | nothing to design; deterministic given an order | encodes authority as evaluation order, which is invisible in every artifact a reviewer reads, and makes adding an adapter a change to what an existing one emits |

## Reversibility
Undo cost today: the helpers are one module the adapters call, so bringing a
plan back is a schema field, a resolver step and a parameter on the adapter
port: days. Becomes irreversible once: a consumer outside this repository reads
paths back from a published projection, which removing `pathPlan` now, before
any does, keeps from happening.

## Consequences
- The Resolved Deployment schema loses `pathPlan`, a change to a published
  schema, paid once, now, while no consumer reads the field.
- A moved path shows in the rendered tree's diff rather than in the
  projection's, paid by a reviewer who reads the tree, which every Project's
  handover diff already is.
- `E_PATH_COLLISION` is decided after the adapters run rather than before, and
  still before anything is written, paid by nobody.
- A new Adapter places its output through the shared helpers, so where it
  belongs follows from whose its objects are, paid by its author, deliberately.
