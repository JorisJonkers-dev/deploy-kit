---
tier: decision
status: proposed
claim: settled
date: 2026-09-16
normative: spec/v1/60-setup.md#node-facts
rests-on: ["0004"]
---

# A node publishes storage media no Process may ask for

## Rests on
The platform states what a node has and the Application states what its Process
needs ([0004](0004-contention-decides-authority.md)), so the two are separate
vocabularies and the platform's is the wider one. False if: every medium a node can hold is one a Process
could sensibly request, so one enumeration serves both sides of the comparison.
Settled by: the committed node contract publishing a medium that no
`placement.disk.media` value names, and the placement match still being total.

## Why
Placement is a set of hard dimensions matched against the facts the node
contract publishes ([0061](0061-placement-is-hard-dimensions.md)), and the two
halves of that comparison were assumed to share one vocabulary. They cannot.
Three of the estate's seven nodes boot from SD cards
([chapter 60](../../../spec/v1/60-setup.md#node-facts)), and `sdcard` is not one
of the `nvme`, `ssd`, `hdd` a Process may write in `placement.disk.media`
([chapter 10](../../../spec/v1/10-project-intent.md#placement)).

One vocabulary forces a choice between two wrong answers. Adding `sdcard` to the
Medium a Process may ask for invites a request nobody should make: an SD card is
where a Raspberry Pi keeps its root filesystem, not where a volume belongs, and
a vocabulary that admits it has to explain why. Publishing the Pi's disk as
something it is not, or omitting it, makes the contract lie about a node, which
is the one thing the contract exists not to do.

So the contract's medium vocabulary is a superset, and the asking vocabulary
stays the smaller one. A medium only the contract names can never match a
declared dimension, which is the correct outcome rather than a gap: a Process
that asks for `nvme` is not eligible for a Pi, and a Process that asks for
nothing is eligible for its disks by size alone.

The same asymmetry already holds elsewhere and was not named. A node advertises
`tailscale` on all seven nodes and it is deliberately not a capability, because
a filter that excludes nothing teaches authors that filters do nothing. The
contract publishes facts; layer 1 publishes what may be requested; the two are
related by matching, not by being the same list.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Add `sdcard` to the Medium a Process may ask for | One enumeration, one place to change | Invites a request that should never be granted, and the vocabulary then has to explain why the value it admits is one nobody may use |
| Publish a Pi's SD card as `ssd` | No new vocabulary at all | The contract states a fact about a node; a contract that rounds a fact to the nearest admissible word is a contract nobody can check against the machine |
| Publish no disks for a node whose media are unaskable | Smallest contract | The size comparison a volume needs ([0081](0081-volume-size-is-a-hard-dimension.md)) then reads a node as having no storage, so a Pi is ineligible for every volume for the wrong reason |
| Type the contract's medium as a free string | Nothing to keep in step | The estate already priced a free-form placement string: `platform.layer` was wrong in 100% of observed cases, which is what closed vocabularies exist to prevent |

## Reversibility
Undo cost today: one enumeration and the disks of three nodes, hours. Becomes
irreversible once: a Process declares a medium that only the contract publishes,
because collapsing the two vocabularies then changes which nodes that Process is
eligible for.

## Consequences
- The node contract can state every node's storage truthfully, including the
  three whose medium no Process may request, paid by carrying two enumerations
  rather than one.
- A Process declaring `placement.disk.media` is never eligible for a Pi, which
  is what the estate already does by accident and now does by construction,
  paid by nobody.
- A Process declaring no `disk` dimension is still eligible for a Pi's disk by
  size, so an SD card is a candidate for a small volume unless something else
  excludes it, paid by whoever discovers that a 20Gi claim landed on a 64GiB SD
  card.
- Every future fact the contract publishes must be graded the same way, asked
  or only published, paid once per fact, at the moment it is added.
