---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-01
normative: spec/v1/20-resolved-deployment.md#the-collector
rests-on: ["0001", "0006"]
---

# The ClusterState Collector runs in the cluster, reads only, and commits the snapshot when it changes

The ClusterState snapshot ([0034](0034-cluster-state-is-a-pinned-input.md)) is
captured by the **Collector**, a declared Application of the `delivery` project
running in the cluster on a schedule. It holds get and list on the objects the
snapshot enumerates and nothing else. It commits `cluster-state.yml` to the
Estate repository through a GitHub App installed on that repository alone, and
only when the facts it captured differ from the committed snapshot
([chapter 20](../../../spec/v1/20-resolved-deployment.md#the-collector)).

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)), so a cluster fact enters the render only as a
committed, digested document. The estate is one cluster
([0001](0001-estate-scale-and-ownership.md)), so one Collector sees every fact
there is.

**False if:** the snapshot is committed when no binding or placement changed,
or the Collector's identity can change anything in the cluster. **Settled by:**
run the Collector twice against an unchanged cluster and observe one commit at
most; then read its ServiceAccount's permissions with `kubectl auth can-i
--list` and find only get and list.

## Why

**The cluster's facts are inside the cluster.** Composition runs in the Estate
repository's CI ([chapter 60](../../../spec/v1/60-setup.md#the-estate-repository)),
which holds no credential for the cluster and should not: delivery is pull, and
no deploy credential exists outside the cluster
([0050](0050-delivery-is-part-of-the-model.md)). Reading the cluster from CI would
need exactly such a credential. A Collector inside reads with a ServiceAccount
and pushes only a document, outward, to one repository.

**Read-only, because it is not an applier.** The Collector's ServiceAccount can
get and list PersistentVolumes, PersistentVolumeClaims and pods. It cannot
write, so a compromised Collector can leak those facts and change nothing.

**Commit on change, because the history is then the fact log.** A commit per run
would put a timestamp change in the Estate repository every hour and a new
`clusterStateDigest` in every lock. Committing only a changed fact keeps the
digest stable while the cluster is, which is what
[0034](0034-cluster-state-is-a-pinned-input.md) asks of two captures of an
unchanged cluster.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Capture from the composition workflow | no in-cluster component | a cluster credential in CI, which pull delivery exists to avoid |
| A controller that writes the snapshot into a ConfigMap | no GitHub App | composition runs in CI and cannot read the cluster to fetch it |
| Commit on every run | simplest | a new digest and a deploy-log entry every hour from nothing changing |
| A human captures it | no machinery | the snapshot goes stale exactly when a PV rebinds after a failure |

## Reversibility

Undo cost today: one CronJob and one GitHub App, an afternoon. Nothing depends on
who captures the snapshot, only on the document.

## Consequences

- The `delivery` project carries the Collector, built and released like any
  first-party Application, paid once in its repository.
- A GitHub App installation with write access to the Estate repository's
  contents exists, its key held in the Secret Store, paid in one more key.
- The first composition runs with an empty snapshot, before the Collector is
  delivered, which is a valid snapshot with a digest.
