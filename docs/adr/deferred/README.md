# Deferred: co-testing, and the retired delivery design

On 2026-09-07 the owner split delivery and co-testing out of the model. On
2026-09-24 delivery rejoined it
([0127](../model/0127-delivery-is-part-of-the-model.md), specified in
[chapter 55](../../../spec/v1/55-delivery.md)): Flux pulls a signed, pinned
render per Project and Flagger switches it. The parked design here was a push,
and most of it existed to make a second applier coexist with Flux, so it is
retired record by record rather than taken up. **Co-testing stays parked.**

Status of everything in this directory:

- Not in the model register ([../README.md](../README.md)), not linted, not
  normative. A record here is evidence, and the **fate** column below says what
  became of it.
- Co-testing, if it is ever taken up, gates the pin commit: that commit is the
  merge-shaped gate point [0008](0008-tested-equals-deployed-requires-push.md)
  argued pull delivery could not provide. The experiment that informs it is
  still [workspace#45](https://github.com/JorisJonkers-dev/workspace/issues/45).
- One item describes a **live defect whose fix proceeds regardless**: the
  unpinned foundation charts in [0048](0048-class-b-pinning.md).

## Inventory

| # | decides | one line | fate |
|---|---|---|---|
| [0008](0008-tested-equals-deployed-requires-push.md) | premise | tested-equals-deployed cannot be had from pull alone: untested, falsifiable via workspace#45 | re-graded: the pin commit is a gate point pull delivery has, so push is not required; stays parked with co-testing |
| [0041](0041-push-delivery-boundary.md) (superseded by [0127](../model/0127-delivery-is-part-of-the-model.md)) | delivery | class A pushed by aggregators, class B stays with Flux | superseded by [0127](../model/0127-delivery-is-part-of-the-model.md): one applier, pulling |
| [0042](0042-apply-before-prune-inventory.md) | delivery | apply first, prune last, from an inventory of rendered kinds | met by the applier: Flux applies, then garbage-collects from its own inventory |
| [0043](0043-delete-authority-durability-gate.md) | delivery | deletion gated by Durability Class; no automatic PVC deletes | taken up by [#158](https://github.com/JorisJonkers-dev/deploy-kit/issues/158): a claim whose class derives a backup is never pruned |
| [0044](0044-reconcile-cronjob.md) (superseded by [0127](../model/0127-delivery-is-part-of-the-model.md)) | delivery | reconciliation as an in-cluster CronJob per aggregator | superseded by [0127](../model/0127-delivery-is-part-of-the-model.md): Flux reconciles continuously |
| [0045](0045-break-glass-reporting.md) (superseded by [0127](../model/0127-delivery-is-part-of-the-model.md)) | delivery | break-glass exists, sticks, and reports itself | superseded by [0127](../model/0127-delivery-is-part-of-the-model.md): break-glass is a pin revert ([0133](../model/0133-a-project-is-delivered-as-a-signed-artifact-pinned-by-digest.md), [chapter 55](../../../spec/v1/55-delivery.md#rendered-artifacts-and-pins)) |
| [0046](0046-distinct-field-managers.md) (superseded by [0127](../model/0127-delivery-is-part-of-the-model.md)) | delivery | one field manager per applier, serialised by a lease | superseded by [0127](../model/0127-delivery-is-part-of-the-model.md): one applier; which objects Flagger owns, and the render therefore omits, is [#158](https://github.com/JorisJonkers-dev/deploy-kit/issues/158)'s |
| [0047](0047-namespace-per-deployer.md) (superseded by [0127](../model/0127-delivery-is-part-of-the-model.md)) | delivery | a namespace has exactly one deployer | superseded by [0127](../model/0127-delivery-is-part-of-the-model.md): there is one deployer |
| [0048](0048-class-b-pinning.md) | delivery | the foundation pinned like everything else, live defect today | live defect, fixed regardless; Flagger joins the foundation pinned ([#148](https://github.com/JorisJonkers-dev/deploy-kit/issues/148)) |
| [0049](0049-aggregator-owned-tests.md) | co-testing | system tests owned by the project that understands the relationship | parked |
| [0050](0050-exercises-and-deploys.md) | co-testing | exercises many-to-many, deploys exactly-one | parked |
| [0051](0051-vcluster-substrate.md) | co-testing | the test substrate is measured before it gates | parked |
| [0058](0058-delivery-machinery-observability.md) | delivery | the delivery machinery watches itself | taken up in part by [#152](https://github.com/JorisJonkers-dev/deploy-kit/issues/152): the Release Gate reports held releases |

## Joined this set on 2026-09-08

- **`flux-root`**: one Flux `Kustomization` per layer, with `dependsOn` and
  health checks, as one delivery mechanism's reading of the Reconcile Unit DAG
  that [chapter 20](../../../spec/v1/20-resolved-deployment.md#the-reconcile-unit)
  derives ([0098](../model/0098-one-publication-path.md)). **Fate:** taken up by
  [0133](../model/0133-a-project-is-delivered-as-a-signed-artifact-pinned-by-digest.md):
  each Reconcile Unit's Kustomization applies its own path in its Project's
  pinned artifact ([chapter 55](../../../spec/v1/55-delivery.md#rendered-artifacts-and-pins)).
- **Whether a Release Unit may span an ownership boundary.** Moved here from
  [chapter 50](../../../spec/v1/50-lifecycle.md#open-in-this-chapter). **Fate:**
  moot: pull delivery has one deployer, so there is no ownership boundary for a
  unit to span.
