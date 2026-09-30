---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/60-setup.md#node-facts
rests-on: ["0004", "0005", "0006"]
---

# Node facts are authored once in the node contract, nix imports them, and a node may publish media no Process may ask for

One YAML file per node is the source of its facts: `site`, `allocatable` cpu and
memory (total minus a reserve declared in the same file), `gpus[]` with `class`
and `memory_mib`, and `disks[]` with `media` and `usable_gib`. The node
contract, the k3s label set and the nix host configuration are generated from
it; nix reads generated data rather than authoring labels. The contract's
medium vocabulary is a superset of what a Process may request: it publishes
`sdcard`, which no `placement.disk.media` value names.

## Rests on

Every node fact the host build needs can be read from generated data at nix
evaluation time, and every placement match reads declared facts, never a live
read ([0005](0005-derivation-is-total.md), [0006](0006-pinned-inputs.md)). The
platform states what a node has and the Application states what it needs
([0004](0004-contention-decides-authority.md)), so the two vocabularies are
related by matching, not by being one list.

**False if:** a host configuration needs a fact the node contract cannot carry,
or every medium a node holds is one a Process could sensibly request.
**Settled by:** for all seven hosts, `nix eval` of the applied node labels diffed
against the generated contract with `nix flake check` green; and the committed
contract publishing `sdcard` with the placement match still total.

## Why

**Each node was declared three times by hand**, in three casings, with a drift
check and an audit script existing only to police the disagreement. The
generated contract emitted 110 labels for 7 nodes: the same 55 twice, one set
named after an archived repository that rejects pushes. One source ends that,
and retiring the dead prefix goes through the generated contract rather than a
`kubectl label` that drifts back on the next reconcile.

**Placement makes the shape load-bearing.** Matching reads structure, not labels
([0017](0017-placement-is-hard-dimensions.md)): two nodes both advertise
`nvidia`, and only `memory_mib: 2048` on one card separates them.

**A fact the model must not request still has to be stated.** Three nodes boot
from SD cards. Adding `sdcard` to what a Process may ask for invites a request
nobody should make; publishing the card as `ssd`, or omitting it, makes the
contract lie about a node, the one thing it exists not to do. A medium only the
contract names never matches a declared dimension, which is the correct outcome.
`tailscale`, present on all seven nodes, is likewise not a capability: a filter
that excludes nothing teaches authors that filters do nothing.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep three hand-authored declarations with a drift check | nothing moves | every node change is three edits in two casings |
| One medium vocabulary for both sides | one enumeration | admits a request nobody may make, or makes the contract lie |
| Publish no disks for a node with unaskable media | smallest contract | the node reads as having no storage for volume sizing |
| The medium as a free string | nothing to keep in step | a free placement string was wrong in every observed case |

## Reversibility

Undo cost today: re-adding the inventory and the hand-authored labels: a day.
Becomes irreversible once: `nix-config/inventory/` is deleted and every host
reads generated data, or a Process declares a medium only the contract
publishes.

## Consequences

- A node change is one file edit and a regeneration, paid by the platform owner.
- The nix build depends on a generated file, so a generator failure blocks a
  host rebuild, paid at build time.
- Retiring the archived label prefix is a generated-contract change, rolled out
  with the next host build.
