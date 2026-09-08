---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#storage-and-durability
rests-on: ["0004"]
---

# A Durability Class derives a backup, from platform terms and a method keyed by engine

## Rests on
Everything a backup needs beyond the class itself is either contended or a
property of the engine, so nothing else has to be authored. False if: two
volumes of one class and one engine legitimately need different schedules,
retentions or destinations often enough that the override is the normal case
rather than the exception. Settled by: rendering the estate's fourteen PVCs and
finding every non-`reconstructible` volume with a `CronJob`, a sweep and — for
`irreplaceable` — an off-cluster copy, with no volume needing an override to be
correct.

## Why
[0015](0015-durability-class-per-volume.md) makes every volume declare what its
data is worth, and chapter 10 says what each class derives. Nothing derives it.
No adapter reads the field, and the three values a backup needs — when, how many
to keep, where the off-cluster copy goes — have no declaring site anywhere in the
model. The class has been a label.

It cannot be fixed with a snapshot. Storage is `local-path`, all fourteen PVCs
are `ReadWriteOnce`, and
[workspace ADR-0011](https://github.com/JorisJonkers-dev/workspace/blob/main/docs/decisions/ADR-0011-backup-coverage-gaps.md)
records that PVC-level snapshots are impossible here: no VolumeSnapshot CRDs and
no CSI snapshot support. An application-level job is the only mechanism, which is
why the missing pieces are a schedule and a command rather than a
`VolumeSnapshotClass`.

The terms are platform-assigned by the contention test
([0004](0004-contention-decides-authority.md)). A backup window is one node's IO
on a seven-node cluster where every stateful Workload is pinned to the machine
holding its PV; an off-cluster destination is one remote target with one
credential. Both are shared finite resources, so the Platform Intent carries one
policy per class and the volume declares only the class. Authoring the terms per
volume would put a mechanism in layer 1 and let two Services claim the same
window with nothing arbitrating. A volume needing different terms restates one
with a reason, which [0031](0031-derived-overrides-with-reason.md) already
allows.

The method is keyed by the Workload's `engine`
([0078](0078-engine-is-workload-vocabulary.md)) and **is an image**: one
purpose-built image per engine, named in the Platform document and resolved
through the images lock ([0097](0097-authored-values-name-model-concepts.md)).
What it does — `pg_dump` for `postgres`, a definitions export for `rabbitmq`, a
file-level copy for `files` — is the image's entrypoint, versioned and digested.
It has to be platform-owned because the alternative is an authored script, and
[0012](0012-assets-not-code.md) forbids an executable Asset — a `backup.sh` in
an Asset is exactly the case that decision exists to refuse.

Two smaller consequences follow from rules already made. The `CronJob` comes from
the `kubernetes` adapter, because that kind is already its and the object is
Service-scoped; splitting one kind across two adapters is what made a path
collision undetectable before. And the credential for the destination is a
**derived** grant rather than an authored one: the platform chose the
destination, so making a datastore owner author a grant against a platform path
they did not choose means a wrong path is discovered at 03:00. It is recorded in
the projection ([0033](0033-assignments-published-back.md)) and appears in the
derived Vault policy ([0073](0073-vault-policy-is-a-deliverable.md)), so it is
privilege nobody has to take on trust.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Author schedule, retention and destination per volume | The owner sees the terms beside the class | A schedule and a destination are mechanisms, which layer 1 excludes, and two Services could contend for one window with nothing arbitrating |
| Author retention only, platform-assign the rest | Splits the tuple along the contention line exactly | A second authored field whose legal values are per-class anyway, and a 90-day claim on a snapshot-less cluster is what the deleted `rollbackTargetRetention` already asserted falsely |
| Let each Service declare a backup Workload of its own | Fully general, no new vocabulary, nothing derived | Every datastore owner reimplements retention and off-cluster copy, and the Durability Class derives nothing — 0015 reduced to a label, which is the state this decision ends |
| A hand-written backup stack, delivered as a fixture | Nothing to derive | Which objects are needed follows from which volumes declare which class, so the fixture is a superset that drifts — the objection that ruled out fixture Middlewares |

## Reversibility
Undo cost today: one per-class policy in the context, one derivation, and the
`CronJob` branch in one adapter — a day, nothing applied. Becomes irreversible
once: an `irreplaceable` volume's only copy is the one this derivation produces,
because the class then rests on the derivation being right and changing it is a
data-safety change rather than a refactor.

## Consequences
- R5 closes, and the restore rehearsal chapter 60 requires before an
  `irreplaceable` volume's first production apply finally has something to
  rehearse — paid by whoever runs the rehearsal, which was previously impossible
  rather than merely unscheduled.
- Every non-`reconstructible` volume adds two objects, so the estate's object
  count grows by roughly twice the number of backed-up volumes — paid in render
  size and in one more thing that can fail at 03:00, which is the point.
- The platform now owns a credential with write access to an off-cluster
  destination, and that identity's blast radius is the destination — paid by the
  platform, and visible in the derived policy rather than in someone's memory.
- A volume whose engine has no method in the catalog cannot derive a backup, so
  adding a datastore engine to the estate is a platform change before it is a
  Service change — paid by whoever adds the engine, at the moment they add it.
- `E_ENGINE_WITHOUT_DURABILITY` and `E_DURABILITY_WITHOUT_ENGINE` make the pair
  mandatory together, so a datastore that declares a class and forgets the engine
  fails the render rather than silently deriving nothing — paid by the author,
  once.
