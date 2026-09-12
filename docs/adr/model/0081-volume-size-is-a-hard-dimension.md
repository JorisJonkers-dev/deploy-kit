---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#storage-and-durability
rests-on: ["0004"]
---

# A volume declares its size; the platform decides whether it fits

## Rests on
How much data a volume holds is knowable only to its owner, and whether that
much fits is knowable only from the node contract, so the two halves belong to
different sides. False if: a capacity the estate needs cannot be stated as a
quantity (a volume that must grow to whatever the disk has), or the node
contract's published figures are too coarse to decide eligibility. Settled by:
rendering the estate's fourteen PVCs with a capacity on every one, each matched
against its node's `usable_gib`, and no `storage: null` anywhere in the tree.

## Why
Chapter 10 said storage class and volume capacity do not appear, because they
draw on finite node disk and are assigned. Half of that is right and the half
that is wrong renders `storage: null`: a PVC that parses and cannot apply.
Capacity is **contended**, so by
[0004](0004-contention-decides-authority.md) the platform arbitrates it; but
nothing in the pinned input set says how much any volume needs, and no rule
allocates from the `disks[].usable_gib` the node contract publishes. An
arbitrator with no request to arbitrate assigns nothing.

The resolution is the shape [0061](0061-placement-is-hard-dimensions.md) already
uses for the other contended quantities. `memory` and `cpu` are authored as hard
dimensions and matched against `allocatable`; the Service states the requirement
and the platform decides eligibility. A volume's `size` is the same kind of fact:
20Gi of vault clone is a property of the data, and whether a node can hold it is
a property of the estate. `E_STORAGE_UNSATISFIABLE` is the storage twin of
`E_PLACEMENT_UNSATISFIABLE`.

A size class per engine or Durability Class was the alternative, and this estate
has already priced that mistake twice. The health timeout class was a four-row
table that contradicted a declared budget inside one Service, and
`rollbackTargetRetention` was a value every Service declared identically and no
renderer read. A table of guesses about how big a database is would be the third.

`placement.disk.size` becomes **derived** (the sum of the Workload's volume
sizes), because the same quantity was otherwise authored twice, and chapter 16's
single-authority property forbids exactly that. The two figures could disagree
today with nothing detecting it. `disk.media` stays authored, because which media
a Workload needs is not implied by how much it needs: `platform-postgres` wants
NVMe for latency, not for room.

`storageClassName` genuinely is assigned and stays absent: everything takes
k3s's default `local-path`, and there is no second class to choose from.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A size class per engine or Durability Class | Nothing new authored, and no author asks for 500Gi on a whim | A table of guesses about data size, which is what the deleted health-timeout class and `rollbackTargetRetention` both were |
| Reuse `placement.disk.size` as the capacity | No new field at all | A Workload with two volumes has one disk request and no way to say which volume gets what |
| Keep both figures and check they agree | Nothing changes shape; the filter stays explicit | Two declaring sites for one quantity with a rule papering over it, which is the pattern single authority forbids |
| Drop `size` from `placement.disk` and check after binding | Smallest vocabulary | Placement could then put a Workload on a node that cannot hold its volumes, and the failure is a pending PVC rather than a build error |

## Reversibility
Undo cost today: one authored field and one derivation, hours. Becomes
irreversible once: PVCs are applied with these capacities, because a
`local-path` PVC cannot be resized in place on this cluster, so changing the
number later means a data move rather than a re-render.

## Consequences
- R8 closes, and `storage: null` stops being renderable at all, paid by every
  volume author, in one field.
- A volume larger than any eligible node's `usable_gib` fails the render, so a
  20Gi request on a cluster of 16GiB disks is a build error rather than a pod
  stuck `Pending`, paid at build time, deliberately.
- Capacity is now part of the eligible-node computation, so a Workload's node set
  can narrow when a volume grows, exactly as it does when memory grows, paid by
  whoever grows the volume, visibly.
- `placement.disk.size` disappearing is a schema change to layer 1, so every
  domain file declaring it must drop it; the sum is derived and cannot be
  overridden without a reason, paid once, per repository.
- A `local-path` PVC cannot be resized on this cluster, so the first number is
  load-bearing and growing a volume is a data move; the model states the size
  rather than making it feel adjustable, paid by whoever guesses low.
