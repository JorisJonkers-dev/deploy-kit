---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-19
normative: spec/v1/14-platform-intent.md#gpus
rests-on: ["0004", "0005", "0006"]
---

# A GPU request is derived from the placement that selects the card, and the Platform document names each vendor's resource and runtime class

A Process asks for a GPU only through its `gpu` placement term, which can now
lock a card by `vendor` and `model` as well as by `class` and `memory`. The
render derives the rest: one share of the card's device resource on the
Process's container, and the runtime class that exposes the card to it. Both
come from the Platform document, which names them once per vendor.

## Rests on

Which resource a vendor's device plugin advertises and which runtime reaches the
card are facts of the substrate every GPU Process shares, so the platform states
them ([0004](0004-contention-decides-authority.md)). The request follows from
the placement and that statement, and is never authored a second time
([0005](0005-derivation-is-total.md)). The vendor is read from the cards of the
eligible nodes in the pinned node contract, not from the live cluster
([0006](0006-pinned-inputs.md)).

**False if:** one vendor needs two runtime classes on different nodes, or a
Process needs more than one share of a card. **Settled by:** jellyfin
transcoding on its T1000 with no GPU field but its placement.

## Why

**Selecting the node is half of it.** Today's GPU placement only filters nodes.
A pod placed on the T1000 still sees no card unless its container requests
`nvidia.com/gpu` and it runs under the `nvidia-cdi` runtime class. The live
jellyfin manifest writes both by hand. Without them in the model, jellyfin
cannot move onto the estate path at all.

**The placement already says which card.** The node contract records each
card's vendor and model, so a term that locks the model also fixes the vendor,
and the vendor fixes the resource and the runtime class. Writing the request
again on the Process would be a second statement that can disagree with the
first.

**One request names one vendor.** A Process whose eligible cards span two
vendors could land on either, and the request it carries would be wrong on one
of them. That is refused at build time, and the author locks the vendor or the
model.

**A share, not a card.** The device plugin time-slices each card into four
shares. A request is one of them, with no memory or fault isolation from the
other holders. The render does not count holders: eligibility is not a capacity
plan ([0017](0017-placement-is-hard-dimensions.md)), so a fifth holder waits as
a `Pending` pod.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A `gpu.resource` and `gpu.runtimeClass` on the Process | no Platform field | every GPU Process restates substrate facts, and a typo is a pod that never sees its card |
| One estate-wide resource and runtime class | one Platform field, not a map | the AMD card advertises `amd.com/gpu` and needs another runtime |
| Pick the first vendor when the eligible cards span two | no new refusal | the pod lands on the other vendor's node with a request no card there answers |
| A capability string such as `gpu-nvidia` | nothing new on `gpu` | a flat string cannot separate the T1000 from the Maxwell, which is the trap `gpu` is structured to avoid |

## Reversibility

Undo cost today: one Platform field, two optional terms on `gpu`, one resolved
field and two lines of render: a day. Becomes costly once: several GPU Projects
run on the estate path and each would need the request back in its own file.

## Consequences

- `gpu` carries `vendor` and `model` sets, and every term is optional
  ([chapter 10](../../../spec/v1/10-project-intent.md#placement)).
- The Platform document carries `gpus`, keyed by vendor
  ([chapter 14](../../../spec/v1/14-platform-intent.md#gpus)).
- A resolved Process carries its `gpu`, and the `kubernetes` adapter writes the
  limit and `runtimeClassName`
  ([chapter 30](../../../spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection)).
- `E_GPU_VENDOR_AMBIGUOUS` and `E_NO_GPU_POLICY` join the placement checks
  ([chapter 40](../../../spec/v1/40-composition.md#placement)).
- The driver, the container toolkit and the device plugin stay the node's,
  outside the render.
