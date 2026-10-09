---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-09
normative: spec/v1/55-delivery.md#moves
rests-on: ["0001", "0005", "0006"]
---

# A Move is derived from one authored edit, and the Release Gate runs it as sync, lag, fence, flip, unfence and reverse inside the provider's release

A provider's owner edits one thing: the engine version its image is locked at,
the Project it is declared in, or the placement its data must satisfy. When the
data cannot follow that edit in place, composition derives a **Move** from the
active Instance ClusterState records to a new one, and nothing about it is
authored. The Release Gate runs it inside the provider's release as Jobs, each
under a move identity that exists only while the Move is open: the write pause
runs from the fence to the unfence, bounded by the platform's timeout, and the
source is kept with the target replicating back into it for the platform's
retention, after which composition derives its retirement. A Move that cannot
replicate back is refused unless the owner acknowledges it. What derives a
Move and what layer 2 carries for it are
[chapter 20](../../../spec/v1/20-resolved-deployment.md#the-move)'s; the steps
are [chapter 55](../../../spec/v1/55-delivery.md#moves)'s.

## Rests on

Whether a change needs a Move is a function of facts already pinned: the
images lock's version, the engine's catalog entry, the namespace the Process
resolves to, and the active Instance in ClusterState
([0005](0005-derivation-is-total.md), [0006](0006-pinned-inputs.md)). One
maintainer edits the providers and watches each release land
([0001](0001-estate-scale-and-ownership.md)), so a Move can be run inside one
release, by the one controller that already holds releases.

**False if:** a provider change that needs its data carried renders as a plain
switchover, a Move's write pause exceeds the platform's timeout without the
source being put back, or a rollback inside the retention window loses a write
the target accepted. **Settled by:** a lab drill that moves `platform-postgres`
from 16 to 17 under a writing consumer, records the write pause and the
consumer errors, rolls back inside the window and compares row counts with the
target's.

## Why

**The edit was already the decision.** Bumping a datastore's major version, or
moving it to another Project, is what the owner means; everything after it was
procedure. An earlier draft of this decision had the owner declare a second
Instance and switch an `active` field across files, which is the procedure
written as configuration. Deriving the Move from the edit keeps the authored
surface at the size of the intent, which is what
[0021](0021-runtime-mechanics-derive-from-cutover.md) did for rollout strategy.

**A datastore cannot serve beside itself.** A `ReadWriteOnce` volume holds one
copy of the data, and two copies that both accept writes diverge, so
expand-and-contract does not apply to a datastore's version
([chapter 50](../../../spec/v1/50-lifecycle.md#a-provider-that-moves)). What
does apply is the shape every engine documents for a version change: fill a new
copy while the old serves, stop writes, let the last of them cross, switch the
name. AWS RDS Blue/Green Deployments run the same sequence, with the same
guardrails, timeout and read-only old copy
([`docs/research/provider-moves.md`](../../research/provider-moves.md#the-closest-analogue-rds-bluegreen)).

**The Fence, not the flip, moves consumers.** A DNS alias flips new
connections; a pooled connection stays on the old copy for as long as its pool
keeps it. Closing the source's connections at the fence is what sends every
consumer to the target, which is why reconnecting is a consumer's obligation
([0093](0093-a-provider-is-reached-through-its-stable-address.md)).

**Reverse replication, because a rollback must not lose writes.** After the
flip the target takes writes the source has never seen; a rollback that
returned to the source would drop them. Replicating back during the retention
window makes a rollback a Move in the other direction whose sync is already
running. Where the engine cannot replicate to an older version, the promise
cannot be kept, and the owner's `rollback: forward-only` says so in the release
that needs it, the same way `cutover` names a promise rather than a mechanism.

**Jobs, so the gate's privileges do not grow.** Every step needs engine-admin
rights on both copies. A Job per step under its own identity confines those
rights to the Move's life, and the gate keeps writing `suspend` and its record
and nothing else ([0052](0052-an-application-is-the-release-unit.md)).

**Across Projects without a pairing field.** Declaring the Application in the
new Project before removing it from the old is the whole procedure: while both
declare it, the declaration outside the active Instance's namespace is the
target, and the old Project keeps rendering the source until its retirement
([chapter 40](../../../spec/v1/40-composition.md#an-application-moving-between-projects)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The owner declares the second Instance and an `active` switch | explicit, no derivation | procedure written as configuration, across files, for every move |
| Flip automatically at a platform-declared window rather than at lag 0 | the write pause lands at a quiet hour | a second scheduling fact for a pause of seconds; the drill decides whether it is needed |
| Forward-only always, no reverse replication | one step fewer per engine | a rollback after the flip loses every write since it |
| Refuse every Move whose engine cannot replicate back | no acknowledgement field | a MySQL or Valkey major upgrade would have no path at all |
| Run the steps inside the Release Gate itself | fewer objects | the gate would hold engine-admin credentials for every datastore |
| A replication operator per engine (CloudNativePG and the like) | the operator does the work | one operator per engine and its CRDs, and none moves an Application between Projects |

## Reversibility

Undo cost today: the derivation, the gate's steps and one field: a week.
Becomes irreversible once: a provider has been moved under the model and its
retired source deleted, since the record of where its data came from is then
only the Move's.

## Consequences

- A provider's version bump can now pause its writes, for as long as the final
  lag and the flip take, paid by its consumers in retries.
- Every engine that wants Moves needs a method image and two catalog facts
  ([0095](0095-each-engine-states-how-its-data-moves.md)), paid by the platform
  owner once per engine.
- Retention costs a second copy of the data and a running replication for the
  platform's window, paid in storage.
- A retired source's claim leaves the render but, carrying
  [0018](0018-durability-class-derives-a-backup.md)'s prune-disabled mark,
  stays bound until deleted by hand, paid in node storage until someone does.
- Neither implementation carries Moves until
  [#324](https://github.com/JorisJonkers-dev/deploy-kit/issues/324) lands.
