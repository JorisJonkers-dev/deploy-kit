---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-09
normative: spec/v1/50-lifecycle.md#a-provider-that-moves
rests-on: ["0001", "0005", "0006"]
---

# The model carries no provider's data between Instances: the derived Move that did so while the estate left its old delivery path is removed

A provider's data stays with the Instance that holds it. A change the data
cannot follow in place (an engine version its data does not load, another
Project, a placement away from the bound volume) is the owner's to carry, by
hand, from the provider's backups, and the model only refuses the placement it
cannot honour; what remains is
[chapter 50](../../../spec/v1/50-lifecycle.md#a-provider-that-moves)'s.

From 2026-10-09 the model derived a **Move** for such a change instead: the
owner edited one thing, composition compared it with the active Instance
ClusterState recorded, and the Release Gate ran sync, lag, fence, flip, unfence
and reverse as Jobs inside the provider's release, keeping the source for a
retention window. It existed to carry data across the migration off the
previous delivery path, a consequence of the old deployment method rather than
a lasting part of the model (the maintainer, 2026-10-30). Every Project is on
the estate path, so it is removed with its refusals, its Platform document
fields and the ClusterState records it read
([#807](https://github.com/JorisJonkers-dev/deploy-kit/issues/807)). The
sections below record why it was built that way.

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

Undo cost today: restoring the derivation, the gate's steps and the fields
from git history, and building the method images the Move never had: weeks.
No provider was moved under the model, so no data's history depends on it.

## Consequences

- A provider's major version bump, a Project change or a placement away from
  its data is a manual migration from backups, with the outage it takes, paid
  by the owner per change.
- The Stable Address stays: Flux keeps its target current, and a consumer
  still reaches a provider that changes Project by one name
  ([0093](0093-a-provider-is-reached-through-its-stable-address.md)).
- A claim left in an old namespace stays bound, carrying
  [0018](0018-durability-class-derives-a-backup.md)'s prune-disabled mark,
  until deleted by hand, paid in node storage until someone does.
