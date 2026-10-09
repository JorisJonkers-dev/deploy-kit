---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-09
normative: spec/v1/10-project-intent.md#availability
rests-on: ["0001", "0005"]
---

# Availability is declared on an engine Process as the owner's promise, and `replicated` is refused until an engine offers a mechanism for it

A Process with an `engine` answers `availability`: `single`, the default, or
`replicated`, a primary with replicas so that a node loss or an in-place
upgrade costs a switch of primary rather than an outage. No engine offers
`replicated` yet, so it is refused until the engine's entry in the Platform
document maps it to a mechanism. The values and their refusals are
[chapter 10](../../../spec/v1/10-project-intent.md#availability)'s.

## Rests on

What a Process derives must follow from what its owner declared
([0005](0005-derivation-is-total.md)), and whether a datastore must survive
the loss of its node is a fact only its owner knows. One maintainer on one
cluster of seven nodes ([0001](0001-estate-scale-and-ownership.md)) does not
need replication today, so the word can exist before any mechanism does.

**False if:** an engine Process's behaviour on a node loss cannot be read off
its declaration, or declaring the word before its mechanism forces a later
change to what owners have written. **Settled by:** every engine Process in
the worked set declaring or defaulting `single`, and the first engine to offer
`replicated` doing so by a Platform document change alone.

## Why

**Replication is the mainstream answer, and it answers a different question
than a Move.** A primary with streaming replicas survives a node drain and
upgrades its minor versions by switching primary with seconds of failed writes
and no lost data. It does not upgrade a PostgreSQL major version, because a
physical replica must run its primary's major; that remains a Move
([0094](0094-a-move-is-derived-from-one-authored-edit.md)). The two compose:
replication for node loss and minor upgrades, a Move for majors and
relocations.

**The word before the mechanism.** Choosing a replication operator (one per
engine, with its CRDs, which [0002](0002-kubernetes-is-the-substrate-for-one-applier.md)
counts as the expensive part of the substrate) is a separate decision with a
real cost. Fixing the vocabulary now means that decision changes the Platform
document, not every engine Process's declaration, and until it is taken,
`single` is written down rather than assumed.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Adopt CloudNativePG and replicate Postgres now | node loss and minor upgrades without an outage | an operator and its CRDs on a one-maintainer cluster, for a risk not yet observed |
| No availability concept | nothing to declare | a single point of failure stays implicit |
| A replica count on the Process | direct | a mechanism in layer 1 ([0011](0011-authored-values-name-model-concepts.md)), and replicas of a datastore are not interchangeable pods |

## Reversibility

Undo cost today: one optional field: an hour. Becomes irreversible once: an
engine offers `replicated` and a Process relies on it.

## Consequences

- Every engine Process states, or defaults to, being a single point of
  failure, visible in its declaration.
- Offering `replicated` for an engine is a Platform document change and a
  mechanism behind it, paid by the platform owner when the risk justifies it.
