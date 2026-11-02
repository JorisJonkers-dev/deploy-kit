---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-09
normative: spec/v1/14-platform-intent.md#engines
rests-on: ["0002", "0005"]
---

# An engine states no move method: the method image, `breaksOn` and `reverse` left the Platform document with the Move

An engine's entry in the Platform document names its backup method and, where
it applies one, its catalog method, and nothing about moving its data
([chapter 14](../../../spec/v1/14-platform-intent.md#engines)). While the model
derived a Move ([0094](0094-a-move-is-derived-from-one-authored-edit.md)),
the entry also carried an optional `move`: the image that performed each step,
`breaksOn`, the component of the engine's version whose change made a Move
rather than a switchover, and `reverse`, when the method could replicate back.
The Move is removed, and the field, its refusals and the version shape it
required of an engine's image went with it
([#807](https://github.com/JorisJonkers-dev/deploy-kit/issues/807)). The
sections below record why it was built that way.

## Rests on

A backup method is already an image the platform names and the images lock
pins, with a fixed set of inputs
([chapter 14](../../../spec/v1/14-platform-intent.md#engines)); a move method
is the same kind of thing, so the same shape carries it. Whether a change
derives a Move must be a function of declared facts
([0005](0005-derivation-is-total.md)), and the substrate gives the method
nothing it would not give any Job ([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)).

**False if:** an engine's sync, fence or reverse needs an input the fixed
contract does not hand the image, or `breaksOn` cannot tell a change that needs
a Move from one that does not for an engine in the estate. **Settled by:** the
Postgres method image passing the
[0094](0094-a-move-is-derived-from-one-authored-edit.md) drill with only the
fixed inputs, and a 17.1 to 17.2 bump of `platform-postgres` deriving a
switchover while 16 to 17 derives a Move.

## Why

**The mechanism differs per engine, the derivation does not.** PostgreSQL syncs
by logical replication and must copy sequences at the fence; MySQL and MariaDB
by binary-log replication with `super_read_only` as the fence; Valkey by
`REPLICAOF` and `CLIENT PAUSE WRITE`; RabbitMQ by Federation, drained rather
than caught up. The survey that found these, with sources, is
[`docs/research/provider-moves.md`](../../research/provider-moves.md#a-move-method-per-engine).
All of that belongs in an image, versioned and digested; the derivation needs
only two facts, and only those are written as data.

**`reverse` is the fact that varies most and is checked least.** Forward sync
across a version is documented for every engine surveyed; the reverse is
blocked by a one-way gate in most: MySQL, MariaDB and Valkey replicate only
upward, RabbitMQ feature flags cannot be disabled, MongoDB's compatibility
version must come down first. Stating it per engine, and defaulting an
unrehearsed engine to `never`, keeps a rollback from promising what the engine
cannot do.

**The version is read, never authored.** A digest does not say whether 17
follows 16, so the images lock records the version the digest was resolved from
for an engine's image. Bumping it is moving the digest, the owner's one edit.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A step list per engine written in the Platform document | readable in one place | a shell command in authored YAML, which [0014](0014-file-shaped-configuration-is-an-asset.md) refuses |
| Every version change is a Move | no `breaksOn` | a full copy of the data for a patch release |
| The method image decides at run time whether a Move is needed | no version in the lock | a live decision in a pinned derivation ([0006](0006-pinned-inputs.md)) |
| One Move method for every engine (a generic file copy) | one image | no engine can be copied consistently while it serves |
| Engines without a method refused outright | nothing undefined | an engine whose data never needs to move would need a method it never runs |

## Reversibility

Undo cost today: three optional fields restored from git history and a method
image per engine built and rehearsed: weeks. No method image was ever built.

## Consequences

- An engine's image may record its version in any shape, as every other image
  does ([0114](0114-every-images-lock-entry-records-its-version.md)).
- Adding an engine to the vocabulary needs no method beyond its backup.
