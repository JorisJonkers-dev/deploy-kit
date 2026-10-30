---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-30
normative: spec/v1/30-deliverables.md#flagger-ready-objects
rests-on: ["0002"]
---

# Every namespace the render writes is never pruned, whatever it holds

Every `Namespace` the render writes carries the same prune-disabled mark a kept
claim does: each Project's, the node agents' and the Stable Addresses'. The
rule is in
[Flagger-ready objects](../../../spec/v1/30-deliverables.md#flagger-ready-objects),
beside the claim's. Settled in
[A rendered namespace is pruned with everything in it, kept claims included](https://github.com/JorisJonkers-dev/deploy-kit/issues/744).

## Rests on

Kubernetes is the substrate for one applier, and server-side apply gives each
field one owner
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)): a field the
applier's own render does not name is dropped on its next apply, so a mark
another source put on a rendered object lasts only until that apply.

**False if:** a namespace applied by the estate path keeps an annotation its
render does not name, or deleting a namespace leaves its claims in place.
**Settled by:** the committed trees, whose every `namespace.yaml` carries the
mark; and `data-system` keeping `prune: disabled` after the data handover's
first estate-path apply.

## Why

**A claim's mark holds only inside a namespace that is never deleted.**
[0018](0018-durability-class-derives-a-backup.md) keeps a claim whose class
derives a backup from ever being pruned. Deleting its namespace deletes the
claim anyway, with every object in it: the claims a controller creates, the
Secrets the operator syncs, the primaries Flagger generates. Without the mark on
the namespace, one prune (a Rollback to a release from before the Project, a render that stops
naming a Project) undoes every claim mark beneath it.

**The old path's mark does not survive the handover.** fleet-infra marks
`data-system` itself. The estate path's `kustomize-controller` applies the same
namespace with the same field manager, so the annotation the render does not
name is dropped on the first apply. Only a mark the render writes is one the
applier keeps.

**Every namespace, not only one that holds a kept claim.** A namespace's
contents change between releases. A mark derived from them would come and go
with a claim, and the release that removes the last kept claim would also be
the one that unmarks the namespace, exactly when a mistake in that release
costs the most. A namespace also holds what the render cannot see: claims
another controller creates and objects another applier owns. And a namespace
is never the thing a release means to delete. Retiring a Project is a
deliberate act, not a side effect of a render that stops naming it, so the
one cost, an emptied namespace left behind, is a cost worth paying.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Mark only a namespace that holds a claim whose class derives a backup | none on a stateless Project | the mark flips with the contents, and is gone in the release that removes the last kept claim; blind to claims a controller creates |
| Keep the old path's mark through a field manager of its own | a second writer of the namespace | the second applier [chapter 55](../../../spec/v1/55-delivery.md) refuses, and one that no render records |
| Rely on the claims' marks and `Retain` reclaim policy | none | a namespace delete still removes the claims and every controller's objects; `Retain` keeps a volume, not the datastore that ran on it |
| Mark every object the render writes | none | the applier could prune nothing, and a removed Process would leave its Deployment behind |

## Reversibility

Cheap in the render, one annotation on three writers. Removing it is not: the
moment a namespace is unmarked, the next prune can delete everything in it, so
undoing this needs every kept claim moved out first.

## Consequences

- The kubernetes adapter writes `kustomize.toolkit.fluxcd.io/prune: disabled` on
  each Project's namespace, the node agents' and `estate-system`.
- A Project that leaves the render leaves its namespace behind, emptied of what
  the applier pruned; deleting it is the maintainer's step.
- A handover that marked a namespace on the old path keeps the mark across the
  flip, because the render writes the same one.
