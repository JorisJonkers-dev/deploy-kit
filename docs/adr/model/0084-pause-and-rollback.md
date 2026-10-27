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
current Migration Proof's `testedAgainst` names. It takes no backup of its own:
it relies on the scheduled backups each volume's Durability Class derives. One
commit pauses the Project and records its target, which composition moves the
pin to, the one move a paused Project makes; it leaves the Project paused. Both are recorded as annotations on
the Project's pin file
([chapter 55](../../../spec/v1/55-delivery.md#pause-and-rollback)).

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)), so an earlier release is a set of digests that
re-compose to a known render. The estate is one maintainer
([0001](0001-estate-scale-and-ownership.md)), so a Rollback is a human act at a
human's pace.

**False if:** a Rollback to the release `testedAgainst` names fails against the
newest schema, or a paused Project's pin moves anywhere but to the release its
Rollback names. **Settled by:** roll back a
Project with a database one release, read its data through the earlier release,
resume it, and check that the pin moved exactly twice.

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

**No backup of its own, because the scheduled ones already cover it.** What
an earlier release could damage is data written since the last scheduled
backup: the schema stays at its newest, migrations are forward-only and proven
against the release rolled back to, and a held release is undone by its `down`.
A backup of its own would add an estate-scoped unit, a report from the
Collector and a wait in the workflow, to save at most the writes since the last
scheduled copy. A Project whose data cannot afford that gap declares a stricter
Durability Class, which shortens the gap for every failure and not for a
Rollback alone. Without it, nothing a Rollback asks for is rendered outside the
Project's own share
([0116](0116-a-project-owns-every-object-it-delivers.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A Rollback is a revert in the application repository, as before | no new workflow | a revert is a new release, so it waits for CI and a release, and its migrations still run forward |
| Revert the pin commit | one commit | the next composition undoes it; break-glass only |
| Roll the schema back with the release | any release is a target | drops what the newer release wrote; the Release Gate's down exists for a release that never served |
| Offer any earlier release | more choice | a release not proven against the current schema may not start against it |
| A one-shot backup through Flux before the pin moves, estate-scoped, reported by the Collector | the writes since the last scheduled copy are kept | an estate-scoped unit no Project owns, a Collector report and a wait of up to 45 minutes, for a gap the Durability Class already bounds |
| The workflow runs the backup itself, with a cluster credential | one phase, no Collector change | a cluster credential in Actions, and a second applier beside Flux |
| The backup Jobs in the Project's own render | no estate-scoped unit | re-rendering with today's Platform document can roll the Project during its own backup |

## Reversibility

Undo cost today: three estate workflows and the pin annotations, a day.
Bringing a backup back is the estate-scoped unit, the Collector's report and
the workflow's wait, as they stood before, a few days.
Becomes expensive once the dashboard and notifications read the annotations.

## Consequences

- The estate repository carries pause, resume and rollback workflows, each one
  commit to a pin file, paid once.
- A Rollback reaches only one release back while the Migration Proof names one
  `testedAgainst`, paid by whoever wants an older one: they fix forward.
- A Rollback can lose the writes since its Project's last scheduled backup,
  paid by whoever rolls back; a stricter Durability Class narrows the gap.
- A pin still carrying `rollback-backup`, or a snapshot still listing
  `backups`, is refused by its schema, paid by whoever wrote it: the Rollback
  workflow and the Collector stopped writing both before their schemas dropped
  them.
- A rolled-back Project stays paused until a human resumes it, so a forgotten
  Pause holds the Project back; the Pause's notification is the reminder.
