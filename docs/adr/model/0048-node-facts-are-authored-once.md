---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-09
normative: spec/v1/15-infrastructure-intent.md#the-document
rests-on: ["0001", "0004", "0005", "0006"]
---

# Node facts are authored once, as Infrastructure Intent, the third authored document; the node contract, the k3s labels and the nix host data are generated from it, and a node may publish media no Process may ask for

One Infrastructure document is the source of every node fact: the one cluster,
its sites, and per node its `site`, `arch`, roles, totals and the reserve
subtracted from them, `gpus[]` with `class` and `memory_mib`, `disks[]` with
`media` and `usable_gib`, capabilities and taints, under one label prefix the
estate owns. It is a document with a metamodel of its own, composed like
Project and Platform Intent. The node contract placement reads, the k3s label
set and the nix host data are generated from it; nix reads generated data
rather than authoring labels. Its medium vocabulary is a superset of what a
Process may request: it publishes `sdcard`, which no `placement.disk.media`
value names. The model and the generated artefacts are
[chapter 15](../../../spec/v1/15-infrastructure-intent.md)'s; the node facts
the estate holds today are
[chapter 60](../../../spec/v1/60-setup.md#node-facts)'s.

## Rests on

Every node fact the host build needs can be read from generated data at nix
evaluation time, and every placement match reads declared facts, never a live
read ([0005](0005-derivation-is-total.md), [0006](0006-pinned-inputs.md)). The
platform states what a node has and the Application states what it needs
([0004](0004-contention-decides-authority.md)), so the two vocabularies are
related by matching, not by being one list. The estate is one cluster
([0001](0001-estate-scale-and-ownership.md)), so the document holds exactly
one.

**False if:** a host configuration needs a fact the document cannot carry,
every medium a node holds is one a Process could sensibly request, or a
placement result changes without the document or the contract generated from
it changing. **Settled by:** for all seven hosts, `nix eval` of the applied
node labels diffed against the contract generated from the document with
`nix flake check` green, and the committed contract publishing `sdcard` with
the placement match still total. Until
[#324](https://github.com/JorisJonkers-dev/deploy-kit/issues/324) lands the
reader, the per-node files remain the authored source and the claim stays open.

## Why

**Each node was declared three times by hand**, in three casings, with a drift
check and an audit script existing only to police the disagreement. The
generated contract emitted 110 labels for 7 nodes: the same 55 twice, one set
named after an archived repository that rejects pushes. One source ends that,
and retiring the dead prefix goes through the generated contract rather than a
`kubectl label` that drifts back on the next reconcile.

**A source with a model, because it is about to carry more.** One YAML file
per node ended the duplication but left the facts without a schema of their
own, outside composition, and with labels and taints handed to nix as strings.
Giving them a metamodel makes them checked the way the other two documents
are, puts the one cluster in the model where a second could later be written
([0097](../deferred/0097-multi-cluster-and-multi-tenancy-are-parked.md)), and
is the shape a later generator of NixOS host configuration needs. Node Feature
Discovery, Dynamic Resource Allocation and TOSCA all separate what a node has
from what a workload asks for, under a label namespace their owner controls
([`docs/research/infrastructure-and-tenancy.md`](../../research/infrastructure-and-tenancy.md#implications-for-an-infrastructure-metamodel));
the document follows them.

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
| Keep one YAML file per node with no model | nothing new to specify | unchecked facts, outside composition, and no place for the cluster |
| Fold node facts into Platform Intent | one document fewer | Platform Intent states what the platform offers, not what the machines are, and its owner is not the machines' |
| Discover node facts with Node Feature Discovery | no hand-written facts | a live read in a pinned derivation, and a GPU's class is a judgement no detector makes |
| One medium vocabulary for both sides | one enumeration | admits a request nobody may make, or makes the contract lie |
| The medium as a free string | nothing to keep in step | a free placement string was wrong in every observed case |

## Reversibility

Undo cost today: the chapter and this record; nothing reads the document yet:
hours. Becomes irreversible once: `nix-config/inventory/` is deleted and every
host reads data generated from the document, or a Process declares a medium
only the contract publishes.

## Consequences

- A node change is one edit to the document and a regeneration, paid by the
  platform owner.
- The nix build depends on a generated file, so a generator failure blocks a
  host rebuild, paid at build time.
- Retiring the archived label prefix is a generated-contract change, rolled out
  with the next host build.
- A generator from the document to NixOS modules, with typed labels and taints
  and a test that boots each generated host, is the direction the model is
  shaped for and is not built in v1.
