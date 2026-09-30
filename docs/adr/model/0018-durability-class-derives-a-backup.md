---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/10-project-intent.md#storage-and-durability
rests-on: ["0004", "0005", "0006"]
---

# Every volume declares a Durability Class, a class derives its backup, and a claim whose class derives a backup is never pruned

Every volume declares one Durability Class: `reconstructible`, `recoverable` or
`irreplaceable`. A class other than `reconstructible` derives a backup: a
`CronJob` and its sweep on platform terms, a method keyed by the Process's
`engine`, and for `irreplaceable` an off-cluster copy. The claim of such a
volume carries the prune-disabled mark, so the applier never deletes it
([chapter 30](../../../spec/v1/30-deliverables.md#flagger-ready-objects)).
Nothing refuses at build time when a backed-up claim leaves the render.

## Rests on

The class is the one declared fact that separates a cache from a personal vault,
and derivation covers the estate from declared intent
([0005](0005-derivation-is-total.md)). Everything a backup needs beyond the
class is either contended, so platform-assigned
([0004](0004-contention-decides-authority.md)), or a property of the engine.
The applier reconciles towards a render of pinned inputs
([0006](0006-pinned-inputs.md)) and prunes what the render omits, so the
protection must be written into the render.

**False if:** two volumes of one class and engine legitimately need different
backup terms often enough to be the normal case, Flux deletes a backed-up claim
after its Process leaves the render, or a `reconstructible` claim carries the
mark. **Settled by:** the fourteen PVCs rendered with a `CronJob`, a sweep and
(for `irreplaceable`) an off-cluster copy on every non-`reconstructible` volume;
`data/rendered/apps/platform-postgres/pvc.yaml` carrying the mark and
`platform-valkey/pvc.yaml` not; and a live run, owned by joris: remove a Process
holding a backed-up claim from a delivered render and observe the claim still
bound after the next reconcile.

## Why

**The class cannot be observed.** Storage is `local-path`, every claim is
`ReadWriteOnce`, and no snapshot exists: the cluster has no VolumeSnapshot CRDs
and no CSI snapshot support
([workspace ADR-0011](https://github.com/JorisJonkers-dev/workspace/blob/main/docs/decisions/ADR-0011-backup-coverage-gaps.md)).
A cache and a vault look the same to the platform, so every volume says what its
data is worth.

**An application-level job is the only mechanism.** A backup window is one
node's IO on a seven-node cluster, and an off-cluster destination is one target
with one credential. Both are shared, so the Platform document carries one
policy per class and the volume declares only its class.

**The method is an image.** One purpose-built image per engine, named in the
Platform document and resolved through the images lock. What it does (`pg_dump`
for `postgres`, a definitions export for `rabbitmq`, a file copy for `files`) is
its entrypoint, versioned and digested. An authored `backup.sh` would be an
executable Asset ([0014](0014-file-shaped-configuration-is-an-asset.md)).

**The destination credential is derived.** The platform chose the destination,
so the grant is derived, recorded in the projection
([0032](0032-the-resolved-deployment-is-a-versioned-artifact.md)) and visible in
the derived Vault policy ([0040](0040-vault-policy-is-a-deliverable.md)).

**The class that orders the backup forbids the delete.** Flux deletes an object
a new render no longer names; a Process leaving the render, a renamed claim or a
moved claim all look like a delete. A derived mark on the claim stops it, from
the one place the applier reads, and the same class decides both, so they cannot
disagree.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Author schedule, retention and destination per volume | the owner sees the terms beside the class | those are mechanisms, and two Applications could contend for one window with nothing arbitrating |
| Each Application declares its own backup Process | fully general | every owner reimplements retention and off-cluster copy, and the class derives nothing |
| Refuse a backed-up claim leaving the render, against the previous lock | nothing vanishes without a recorded plan | layer 2 reads its own previous output, a retired Project stalls every composition, and no plan schema exists |
| `persistentVolumeReclaimPolicy: Retain` and let Flux prune claims | bytes survive on the node | a recreated claim binds a fresh, empty volume; the Process comes back empty and healthy |
| Prune nothing, ever | no data deleted by the applier | withdrawn routes and grants outlive their Application |

## Reversibility

Undo cost today: one policy per class, one derivation, one `CronJob` branch and
one annotation: a day. Becomes irreversible once: an `irreplaceable` volume's
only copy is the one this derivation produces, or a backed-up claim has left a
delivered render and the mark is the only thing that kept it.

## Consequences

- Every non-`reconstructible` volume adds two objects, paid in render size and
  in one more thing that can fail at 03:00, which is the point.
- The platform owns a credential that writes to an off-cluster destination, and
  its blast radius is visible in the derived policy.
- A volume whose engine has no method cannot derive a backup, so a new datastore
  engine is a platform change first.
- A backed-up claim that leaves the render stays bound until deleted by hand,
  and renaming one gives the Process a new, empty claim; moving the data is a
  manual step, paid by whoever renames.
- `E_ENGINE_WITHOUT_DURABILITY` and `E_DURABILITY_WITHOUT_ENGINE` make `engine`
  and a backed-up class mandatory together
  ([0019](0019-engine-is-process-vocabulary.md)).
