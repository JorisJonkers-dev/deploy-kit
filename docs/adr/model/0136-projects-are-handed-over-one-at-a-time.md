---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-24
normative: spec/v1/60-setup.md#handing-over-one-project-at-a-time
rests-on: ["0001"]
---

# Projects are handed over to the estate path one at a time, recorded in a ledger, and never delivered by both paths

The move from `fleet-infra`'s `deploy/production` branch to the estate
repository's pins happens one Project per step. The Platform document's
`handover` ledger names the path each Project is on, and the documents are
refused when a Project is on both paths or on neither. A `legacy` Project is
composed and diffed but never delivered. The old path is removed on the
ledger's `retireBy` date. The steps are
[chapter 60](../../../spec/v1/60-setup.md#handing-over-one-project-at-a-time)'s;
the pin is [0133](0133-a-project-is-delivered-as-a-signed-artifact-pinned-by-digest.md)'s.

## Rests on

The estate is one maintainer on one cluster
([0001](0001-estate-scale-and-ownership.md)). One person hands over one Project
at a time and can watch each step land, so a ledger in the one document every
composition already reads is enough coordination. No migration service is
needed.

**False if:** a Project is applied by both `fleet-infra` and its estate pin in
the same reconcile, or a Project's objects are deleted and recreated during its
handover. **Settled by:** hand over `data` and observe the live Postgres pod's
UID unchanged across the step, and the `fleet-infra` Kustomization no longer
listing it.

## Why

**Two sources prune each other.** A Project applied by two Flux sources has two
owners of the same objects. Each source deletes what the other added the moment
their contents disagree, so the only safe number of paths per Project is one.

**A ledger, because a convention is invisible.** "Only move one Project at a
time" is a rule nothing checks. A ledger in the Platform document is read by
every composition, so a Project on both paths or on neither fails the same build
that would have delivered it.

**Composed while legacy, so the handover is a no-op.** A `legacy` Project's
fragment still meets every invariant, and its render is diffed against the live
objects. By the time it moves, the render already reproduces what runs, and the
handover step changes only which source applies it.

**A retirement date, so the old path ends.** Without one, the last few
Projects stay on the old path indefinitely and the estate keeps two delivery
paths forever.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Move every Project in one cut-over | one step | one failed adoption blocks the whole estate, and a rollback is estate-wide |
| Track the handover outside the model, in the estate repository's README | no schema change | nothing checks it, and a Project can end up on both paths unnoticed |
| Let the estate path prune the old objects and recreate them | no orphaning step | every Process restarts at handover, and a stateful one can lose its claim |

## Reversibility

Undo cost today: supersede this record and delete the block, an hour. The
decision expires once `legacy` is empty, when the block is removed.

## Consequences

- Each handover is one reviewed change to the estate repository and one ledger
  edit, paid per Project by joris.
- A new project file must be named in the ledger while it exists, paid by its
  author in one line.
- The `retireBy` date is a commitment: moving it is a recorded decision.
