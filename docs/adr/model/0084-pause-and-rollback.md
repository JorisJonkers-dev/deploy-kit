---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-01
normative: spec/v1/55-delivery.md#pause-and-rollback
rests-on: ["0001", "0006"]
---

# A Pause freezes a Project's pin, and a Rollback re-composes an earlier proven release with the schema at its newest

A **Pause** freezes one Project's pin: composition still checks the Project and
Flux still reconciles the pinned render, but no pin commit moves it. A
**Rollback** re-composes the Project at the fragment of an earlier release,
named by its version, while the database schema stays at its newest. It is
offered only for a release proven against the current schema, the one the
current Migration Proof's `testedAgainst` names. It first takes a backup of the
data the Project reaches, kept 7 days, moves the pin only once that backup has
succeeded, and leaves the Project paused. Both are recorded as annotations on
the Project's pin file
([chapter 55](../../../spec/v1/55-delivery.md#pause-and-rollback)).

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)), so an earlier release is a set of digests that
re-compose to a known render. The estate is one maintainer
([0001](0001-estate-scale-and-ownership.md)), so a Rollback is a human act at a
human's pace, and a backup kept a week covers the time it takes to notice that
the Rollback itself was wrong.

**False if:** a Rollback to the release `testedAgainst` names fails against the
newest schema, or a paused Project's pin moves. **Settled by:** roll back a
Project with a database one release, read its data through the earlier release,
resume it, and check that the pin moved exactly twice and the pre-rollback
backup exists.

## Why

**No migration runs backwards in a Rollback.** A down is the Release Gate's, for
a held release whose new version never served
([chapter 55](../../../spec/v1/55-delivery.md#failure-and-undo)). Once a release
has served, its data has been written under the new schema; running the down
then would drop what that release wrote. So a Rollback keeps the schema, and the
only release that can run against it is one proven to: expand, then contract
makes the serving version's predecessor compatible, and the Migration Proof
records which release that was.

**Re-composing, not reverting a pin.** Reverting a pin commit puts the estate on
a render its current inputs no longer produce, and the next composition moves
it straight back. Re-composing the earlier fragment with today's Platform
document and today's toolkit gives a render the inputs do produce, which the
next composition keeps because the Project is paused.

**Paused afterwards, because the inputs still say otherwise.** The Project's
repository still publishes its newest release. Without the Pause, the next
composition would deploy exactly what the Rollback removed. Resuming is the
human's statement that the fix has landed.

**A backup first, because a Rollback is when data is most at risk.** The earlier
release reads data the newer one wrote, and a wrong guess about compatibility
costs that data. A backup taken immediately before, kept a week beside the
Durability Class's own copies, makes the Rollback itself undoable.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A Rollback is a revert in the application repository, as before | no new workflow | a revert is a new release, so it waits for CI and a release, and its migrations still run forward |
| Revert the pin commit | one commit | the next composition undoes it; break-glass only |
| Roll the schema back with the release | any release is a target | drops what the newer release wrote; the Release Gate's down exists for a release that never served |
| Offer any earlier release | more choice | a release not proven against the current schema may not start against it |
| No backup before a Rollback | faster | the one operation most likely to damage data has no undo of its own |

## Reversibility

Undo cost today: three estate workflows and the pin annotations, a day.
Becomes expensive once the dashboard and notifications read the annotations.

## Consequences

- The estate repository carries pause, resume and rollback workflows, each one
  commit to a pin file, paid once.
- A Rollback reaches only one release back while the Migration Proof names one
  `testedAgainst`, paid by whoever wants an older one: they fix forward.
- Every Rollback costs one backup kept 7 days, paid in storage.
- A rolled-back Project stays paused until a human resumes it, so a forgotten
  Pause holds the Project back; the Pause's notification is the reminder.
