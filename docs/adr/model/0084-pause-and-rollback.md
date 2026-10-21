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
data the Project reaches, kept 7 days, and only once that backup has succeeded
records its target, which composition moves the pin to, the one move a paused
Project makes; it leaves the Project paused. Both are recorded as annotations on
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
newest schema, or a paused Project's pin moves anywhere but to the release its
Rollback names. **Settled by:** roll back a
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

**The backup runs through Flux, in two phases.** The workflow runs outside the
cluster and holds no credential to it, and giving it one would make the Estate
repository's Actions a second applier. So its first commit only asks: composition
renders one-shot backup Jobs beside the Project, Flux applies them, and the
Collector, which already commits what only the cluster can say, reports how
they ended. The workflow reads that and only then commits the Rollback itself.
The Jobs are estate-scoped, at the render the Project is pinned to, so asking
for a backup restarts nothing of the Project it protects.

**The Project's own database is dumped with its own credential, into a claim of
its own.** The Job runs in the Project's namespace as the identity that already
holds a credential to the Project's database, the owner's where one does, so it
reaches that one database and the Secret Store gains no path. The datastore's
backup claim is in another namespace no such Job can mount, and a Project with
a database often has no backup claim of its own, so the first Rollback creates
`<project>-rollback`, sized like the datastore's volume, and Flux keeps it after.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A Rollback is a revert in the application repository, as before | no new workflow | a revert is a new release, so it waits for CI and a release, and its migrations still run forward |
| Revert the pin commit | one commit | the next composition undoes it; break-glass only |
| Roll the schema back with the release | any release is a target | drops what the newer release wrote; the Release Gate's down exists for a release that never served |
| Offer any earlier release | more choice | a release not proven against the current schema may not start against it |
| No backup before a Rollback | faster | the one operation most likely to damage data has no undo of its own |
| The workflow runs the backup itself, with a cluster credential | one phase, no Collector change | a cluster credential in Actions, and a second applier beside Flux |
| The backup Jobs in the Project's own render | no estate-scoped unit | re-rendering with today's Platform document can roll the Project during its own backup |
| Dump the database in the datastore's namespace, into its backup claim, with its backup credential | no claim per Project, and the copy sits beside the Durability Class's own | that credential reaches every database, where the Project's own reaches its own |
| Stream the dump off-cluster only | no claim in the cluster | the off-cluster credential in the Project's namespace: a new Secret Store path |

## Reversibility

Undo cost today: three estate workflows and the pin annotations, a day.
Becomes expensive once the dashboard and notifications read the annotations.

## Consequences

- The estate repository carries pause, resume and rollback workflows, each one
  commit to a pin file, paid once.
- A Rollback reaches only one release back while the Migration Proof names one
  `testedAgainst`, paid by whoever wants an older one: they fix forward.
- Every Rollback costs one backup kept 7 days, paid in storage.
- A Project with a database keeps a `<project>-rollback` claim from its first
  Rollback on, paid in storage that holds nothing once its copies are a week old.
- A Rollback waits on Flux and on the Collector's next snapshot before its pin
  moves, up to 45 minutes, paid in time to recover: a backup that has not ended
  by then stops the Rollback and leaves the Project paused.
- A rolled-back Project stays paused until a human resumes it, so a forgotten
  Pause holds the Project back; the Pause's notification is the reminder.
