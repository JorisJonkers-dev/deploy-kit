---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/14-platform-intent.md#the-foundation-is-declared
rests-on: ["0002", "0003"]
---

# The foundation is declared as Applications, nothing hand-written enters the render, and what must exist first is a recorded bootstrap table

Vault, VSO, Traefik, Prometheus, Flagger, the Release Gate and Gatus are declared
as Applications in platform-owned project files, in the same vocabulary as any
other. No Helm chart is rendered and no raw manifest passes through an adapter.
What must exist before the first rendered object can apply is the **bootstrap
set**, a recorded, enumerated table: k3s, the Flux controllers and source,
Vault's unseal, and the CRDs the render's kinds need, each pinned by version
([chapter 14](../../../spec/v1/14-platform-intent.md#the-bootstrap-set)).

## Rests on

Every foundation component can be stated in the Project Intent vocabulary, and
what a chart adds beyond that is either a default a declaration replaces or a
CRD the bootstrap set pins ([0003](0003-three-model-pipeline.md)). A render
cannot apply itself: the substrate and its applier must already run
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)).

**False if:** a component the estate needs has configuration no field of chapter
10 or 14 can express and no derivation can produce, or a declared Application
needs something applied before it that is neither in the table nor derivable
from the Reconcile Unit ordering. **Settled by:** rendering the foundation from
platform-owned project files and diffing against what runs, every difference
explained by a decision; and standing up a fresh cluster from the bootstrap set
alone and applying the rendered tree in Reconcile Unit order, owned by joris
together with the restore rehearsal
([0049](0049-datastore-and-restore.md)).

## Why

**Two paths into the render defeated the model.** Blueprint packs delivered 41
objects, nine percent of the estate, as hand-written Kubernetes copied from a
git ref that was recorded and never verified, and a raw-manifest pass-through
had unbounded shape. No estate-wide invariant saw either, and the foundation is
the part carrying the CVEs and the CRD upgrades.

**The alternative to a pack is a declaration.** Vault is a Process with an
`irreplaceable` volume and an `engine`. Traefik is two Applications, each the
proxy for one tier. Prometheus and Gatus take their configuration as an inbound
derivation of every scrape surface and exposure in the union.

**Helm dissolves into two parts.** A chart's defaults are what a declaration
replaces. A chart's CRDs are cluster-scoped schema that must exist first, so they
are pinned in the bootstrap set. A chart-shaped source would bring back a
hand-maintained values surface every invariant reading a Deployment would miss,
and a chart version pinned beside it would be a second thing to keep in step.

**The bootstrap set is a table, not a habit.** Every item in it is an object the
invariants never see. It is a Bidirectional Ledger in shape
([0038](0038-bidirectional-ledgers.md)): an entry nothing needs fails the build,
and an undeclared component is `E_UNATTRIBUTED_OBJECT`. The per-layer Flux
Kustomizations are not in it, because they encode the Reconcile Unit ordering,
which changes on the first new edge.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Blueprint packs by pinned checkout | the foundation arrives as upstream wrote it | 41 objects outside every invariant |
| Render Helm charts with pinned versions | upstream defaults for free | a values surface nobody checks |
| The whole foundation stays bootstrap | honest about today | leaves the CVEs and CRD upgrades outside the model |
| Declare the Flux source and Vault's unseal too | purest | the render cannot apply itself |
| Include the per-layer Kustomizations in the bootstrap set | they rarely change | they encode an ordering that changes |

## Reversibility

Undo cost today: re-admitting a pack path is an adapter pass-through and a
chapter section: a day. Becomes irreversible once: the packs are deleted and the
foundation runs from its declarations.

## Consequences

- Every foundation upgrade is a declaration diff a reviewer reads, paid by the
  platform owner.
- A CRD upgrade is a bootstrap-set edit with a version, paid once per upgrade.
- A component whose configuration the vocabulary cannot express waits for a
  vocabulary change, paid by whoever needs it.
