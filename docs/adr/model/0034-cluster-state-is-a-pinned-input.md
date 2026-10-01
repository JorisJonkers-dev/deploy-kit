---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/20-resolved-deployment.md#cluster-state
rests-on: ["0006"]
---

# The ClusterState snapshot is a pinned, digested input holding PV bindings and current placements, and node capacity is a node-contract fact

A read-only collector, running in the cluster
([0086](0086-the-collector-runs-in-the-cluster.md)), captures two cluster facts: the node holding each bound
PersistentVolume, and where each Process currently runs. The snapshot is
digested and pinned like every other input. Assignments read the snapshot and
never the live cluster. What a node can hold is not in it: capacity is authored
once per node in the node contract ([0048](0048-node-facts-are-authored-once.md)).
A render that reproduces a recorded lock reads the snapshot that lock names,
never a fresh capture; a changed cluster fact is a new lock.

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)). A PV binding and a current placement are facts
only the cluster has, so they enter as a pinned input or not at all.

**False if:** two captures minutes apart from an unchanged cluster yield
different digests, or an assignment reads node capacity from the snapshot.
**Settled by:** the collector run twice, ten minutes apart, against an idle
cluster, with the two digests compared; the collector does not exist yet, so the
test is to be written, owned by joris.

## Why

**Observed capacity is free capacity.** It depends on whatever else was
scheduled when the collector ran, so the same Process would be eligible at 03:00
and ineligible at 09:00 with no input of its own changed. Declared requirements
against declared allocatable are eligibility and a pure function
([0017](0017-placement-is-hard-dimensions.md)).

**The snapshot holds what only the cluster knows.** A `local-path` volume binds
to one node, and nothing declares that binding. Recording it lets placement
follow the data; a `disk` dimension contradicting it is
`E_DISK_BINDING_CONFLICT` rather than a silent move.

**Re-render from the recorded snapshot.** A re-render mismatch is a lock defect.
A fresh capture after a node failure would make a rebound PV read as one with
every digest identical, exactly when diagnosis matters.

**Live health stays separate.** Flux readiness, observed image digests and
Gatus status move on every reconcile and hold neither bindings nor node facts.
One document cannot answer both "what is true" and "what was true when we
decided".

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Capacity observed in the snapshot | eligibility counts what is scheduled | the build result depends on the hour |
| Read the live cluster at render time | no collector | a rebound PV reads as a lock defect during a node failure |
| Fold observed facts into the Platform document | one fewer input | a human-paced document gates a machine-paced fact |
| One document for health and bindings | one collector | its digest moves on every reconcile |

## Reversibility

Undo cost today: no collector exists and nothing reads the snapshot: hours.
Becomes irreversible once: locks carrying `clusterStateDigest` are published and
reproduced, because removing it makes historical locks impossible to re-render.

## Consequences

- A read-only collector with estate-wide read over PersistentVolumes, nodes and
  pods becomes a prerequisite of every render, paid in pipeline time.
- Eligibility can pass three Processes the scheduler cannot all fit; the
  scheduler refuses the third at apply, until
  [chapter 20's arbitration item](../../../spec/v1/20-resolved-deployment.md#open-in-this-chapter)
  closes.
- A PV rebound after a node failure produces a new lock someone lands, paid by
  the on-call operator.
- Every byte-identity claim is conditional on `clusterStateDigest` too.
