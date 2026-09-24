---
tier: decision
status: proposed
claim: settled
date: 2026-09-24
normative: spec/v1/10-project-intent.md#prepare-processes
rests-on: ["0005"]
---

# A prepare Process is forward-only setup that runs after the migration and before the new version, and serves nothing

`lifecycle` gains `prepare`: a Process that runs to completion, once per
Application revision, after the Application's migration and before any new
version of it starts. It is idempotent and forward-only: nothing undoes it. It
declares an image, resources and a run deadline, and nothing a serving Process
has. The rules are
[chapter 10](../../../spec/v1/10-project-intent.md#prepare-processes)'s and the
order is [chapter 55](../../../spec/v1/55-delivery.md#release-order)'s.

## Rests on

The derivation is total ([0005](0005-derivation-is-total.md)): what a prepare
Process renders as, when it runs and how long it may take follow from its
lifecycle and its `startupBudget`, so nothing about the run is authored.

**False if:** a setup step in the estate must run between two others, or must
be undone when a release fails. **Settled by:** the estate's one-shot setup
steps (the garage bootstrap, the hermes bootstrap, the Vault auth setup) each
written as one idempotent prepare Process, with no ordering between them and no
undo.

## Why

**Not a migration.** A migration has an up and a down, a schema, an owner role
and a compatibility proof ([0130](0130-migration-is-declared-on-the-application.md)).
A bootstrap has none of those, and modelling both as one kind of Process made
the difference a combination of fields. Setup is a Process, because it is a
program with an image, an identity and resources; a migration is not.

**After the migration.** A seed may write rows the new schema defines, so the
schema moves first. Prepare steps then run in parallel, because an ordering
among them is a dependency a single image can hold, and a list the model treats
as a set would otherwise gain an order.

**Serves nothing, and cuts over nothing.** A step that listens, reports
readiness or scales is a service, and belongs to the switchover. Refusing those
declarations keeps the one-shot shape honest, and a `cutover` shared from above
does not reach it, because it has nothing to cut over.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep setup inside the application image (`self`-style) | no new lifecycle | a step that must finish before any new pod starts cannot run inside those pods |
| Ordered prepare steps | several small images instead of one | an order among list entries is a second meaning for a list that is a set everywhere else |
| Retry a failed step within a revision | absorbs flakes | a step that is not idempotent is corrupted by a retry; a new revision is the retry |

## Reversibility

Undo cost today: drop one literal and one refusal from both implementations,
an hour. Becomes expensive once the estate's bootstraps run as prepare Processes
and their old ConfigMap scripts are deleted.

## Consequences

- The three ConfigMap-hosted bootstrap scripts become images run as prepare
  Processes, paid by joris, as chapter 00's open item on executable Assets
  already requires.
- A failed prepare step holds the release and nothing is undone, paid by the
  author, who must keep every step idempotent.
