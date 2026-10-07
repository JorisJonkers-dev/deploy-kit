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
`CronJob` on platform terms, running the method image the Process's `engine`
keys, which keeps the class's `retain` newest copies and prunes the rest. It
runs as the Process's own backup identity, `<process>-backup`, writes its copies
to a derived claim of the volume's size, `<claim>-backup`, and for
`irreplaceable` also copies off-cluster with a credential only that identity
holds. The volume's claim and its backup claim carry the prune-disabled mark, so
the applier never deletes either
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
mark. **Settled by:** every non-`reconstructible` volume rendered with a
`CronJob`, a backup claim and (for `irreplaceable`) an off-cluster copy;
`data/rendered/apps/data/platform-postgres/pvc.yaml` carrying the mark on both
its claims and `platform-valkey/pvc.yaml` on none; and a live run, owned by
joris: remove a Process holding a backed-up claim from a delivered render and
observe the claim still bound after the next reconcile.

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

**The method is an image, and it keeps the count.** One purpose-built image per
engine, named in the Platform document and resolved through the images lock.
What it does (`pg_dump` for `postgres`, a definitions export for `rabbitmq`, a
file copy for `files`) is its entrypoint, versioned and digested. An authored
`backup.sh` would be an executable Asset
([0014](0014-file-shaped-configuration-is-an-asset.md)). Pruning is part of the
same run: `retain` is how many copies are kept, so the image that writes a copy
is the one that knows which are oldest, and a second schedule for a sweep would
be a window nothing declares.

**A backup runs as its own identity and writes to its own claim.** The serving
Process never needs the off-cluster credential, so it never holds it: the
backup identity does, and the derived Vault policy shows the two apart. The
copies land on a claim derived beside the volume, the same size, because
`recoverable` keeps no copy anywhere else.

**The destination credential is derived.** The platform chose the destination,
so the grant is derived, recorded in the projection
([0032](0032-the-resolved-deployment-is-a-versioned-artifact.md)) and visible in
the derived Vault policy ([0040](0040-vault-policy-is-a-deliverable.md)).

**A method that dumps over the network is told where, and logs in with a
derived credential.** It is handed the Process's Service and the port of the
surface its engine names, under one pair of names every method reads, so the
renderer knows no engine's own variables. It logs in with a credential at a path
derived from the Process, one per Process, held by the backup identity alone:
two servers of one engine never share a login, and the serving Process never
holds what dumps it.

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
| A separate sweep `CronJob` on its own schedule | pruning visible as its own object | a second window per class that no policy declares, and a sweep that cannot tell a copy from a half-written one |
| `retain` as an age in days | matches a `find -mtime` sweep | a failing backup then deletes the last good copies on schedule; a count keeps them |
| Run the backup as the serving Process | one identity fewer | the long-running Process holds the off-cluster credential it never uses |
| Copy off-cluster only, for every backed-up class | no on-cluster claim | `recoverable` gains a destination and a credential it was defined not to need |
| One dump credential per engine, named in the Platform document | explicit, one field | every Process of one engine shares one login, which two servers of that engine cannot |
| A dynamic database role the backup identity reads itself | short-lived credentials | `postgres` only; a broker's management API still needs a static one |
| Each engine's own variables (`PGHOST`, a management URL) | an image reads its tool's names unchanged | the renderer learns every engine's names, and a new engine is a renderer change |

## Reversibility

Undo cost today: one policy per class, one derivation, one `CronJob` branch, one
identity, one claim and one annotation: a day. Becomes irreversible once: an `irreplaceable` volume's
only copy is the one this derivation produces, or a backed-up claim has left a
delivered render and the mark is the only thing that kept it.

## Consequences

- Every non-`reconstructible` volume adds a `CronJob` and a claim, and its
  Process a backup `ServiceAccount`, paid in render size and in one more thing
  that can fail at 03:00, which is the point. A backup claim doubles the
  volume's footprint on its node.
- Every method image must prune to `retain` after a run, paid by whoever writes
  one for a new engine.
- The platform owns a credential that writes to an off-cluster destination, and
  its blast radius is visible in the derived policy.
- Whoever runs a datastore writes its dump credential at the derived path
  before its first backup runs; until then the method fails, loudly, at 03:00.
- A volume whose engine has no method cannot derive a backup, so a new datastore
  engine is a platform change first.
- A backed-up claim that leaves the render stays bound until deleted by hand,
  and renaming one gives the Process a new, empty claim; moving the data is a
  manual step, paid by whoever renames.
- `E_ENGINE_WITHOUT_DURABILITY` and `E_DURABILITY_WITHOUT_ENGINE` make `engine`
  and a backed-up class mandatory together
  ([0019](0019-engine-is-process-vocabulary.md)).
