---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/10-project-intent.md#placement
rests-on: ["0004", "0005", "0006"]
---

# Placement and volume size are hard dimensions the Application states and the platform matches against node allocatable

A Process declares what its pod needs as hard dimensions: `arch`, `site`,
`disk.media`, a structured `gpu` (`class`, `memory`), `capabilities`, and the
quantities `memory` and `cpu`. A list is a set of equally acceptable values,
with no ordering and no weight. Each volume declares its `size`, and
`placement.disk.size` derives as their sum. Eligibility is matched against each
node's **allocatable** (total minus a declared reserve) as the node contract
publishes it ([0048](0048-node-facts-are-authored-once.md)), never against live
free capacity. A `continuous` Process is eligible only on a node that fits two
copies of it, sidecars included, because its switchover runs the new copy beside
the old ([0021](0021-runtime-mechanics-derive-from-cutover.md)). No eligible node
is `E_PLACEMENT_UNSATISFIABLE`; a volume no eligible node can hold is
`E_STORAGE_UNSATISFIABLE`. This is eligibility, not bin-packing.

## Rests on

Contention decides who arbitrates, not who authors
([0004](0004-contention-decides-authority.md)): how much a Process or a volume
needs is knowable only to its owner, and whether it fits is knowable only from
the node contract. Matching reads pinned inputs only
([0006](0006-pinned-inputs.md)).

**False if:** a real Process needs to prefer a node without requiring it and
cannot restate that as a set of acceptable values, or a capacity cannot be
stated as a quantity. **Settled by:** every soft term the live estate carries
(`kubectl get deploy,sts,ds -A -o json | jq '..|.preferredDuringSchedulingIgnoredDuringExecution? // empty'`)
rewritten as a value set on one dimension, and the estate's fourteen PVCs
rendered with a capacity on every one, each matched against its node's
`usable_gib`.

## Why

**Nothing compared size to placement.** A named size class sat beside an
independent placement field, so a `size: l` Process pinned to a 4096Mi Pi passed
the build and went `Pending` at apply. Raw quantities make the comparison
arithmetic.

**Soft terms fail silently.** No node advertised `gpu-model-gtx960m`; the
preference naming it was dropped by the scheduler with no event, and it read as
GPU-aware placement while doing nothing. Every dimension is therefore hard, and
`arch: [arm64, amd64]` recovers a fallback without a term that can vanish.

**A GPU is not a flat capability.** `nvidia` is on two of seven nodes, one a
2048MiB Maxwell; `jellyfin` avoided it only because an unrelated filter matched
one node. `gpu` is structured as `class` and `memory`.

**A volume's size belongs to its owner.** Chapter 10 once said capacity was
assigned, which rendered `storage: null`: a PVC that parses and cannot apply. A
size class per engine would be a table of guesses about data size. The volume
states its size, the platform decides fit, and `disk.size` derives as the sum,
because the same quantity authored twice would disagree with nothing detecting
it. `disk.media` stays authored: `platform-postgres` wants NVMe for latency, not
room. `storageClassName` stays absent: everything takes `local-path`.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Capabilities as flat labels, required and preferred | two shapes, one of which fails silently | the `gtx960m` preference did nothing, visibly to nobody |
| A named size class beside placement | two fields answering one question | the comparison needs a join, and the gap stays open |
| Scored best-match | an unmet term still places the pod | hands back the silence |
| A size class per engine or Durability Class | nothing new authored | a table of guesses about data size |
| `placement.disk.size` as the only capacity | no new field | a Process with two volumes cannot say which gets what |

## Reversibility

Undo cost today: the schema block, the matcher and the request and limit
derivation: an afternoon. Becomes irreversible once: PVCs are applied with these
capacities, because a `local-path` PVC cannot be resized in place, and once
thirty repositories carry raw numbers chosen per Process.

## Consequences

- `memory` and `cpu` are required on every Process, so BestEffort stops being
  the standing QoS class, paid by the one maintainer in one edit per Process.
- A retune (every JVM Process from 768Mi to 1Gi) is an edit in every repository
  holding one, not one table row.
- A fallback to another site must be written down as a second value, not
  weighted.
- A volume larger than any eligible node's disk fails the render instead of a
  PVC stuck `Pending`, and growing a volume later is a data move, paid by
  whoever guesses low.
- Nothing stops an author writing `memory: 8Gi`; the scheduler refusing to place
  it is the only arbitration, until an arbitration step exists.
