---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-09
normative: spec/v1/14-platform-intent.md#move-methods
rests-on: ["0002", "0005"]
---

# Each engine states how its data moves: a method image, which version change breaks the data in place, and when it can replicate back

An engine's entry in the Platform document carries, beside its backup method,
an optional `move`: the image that performs each step of a Move, `breaksOn`,
the component of the engine's version whose change makes a Move rather than a
switchover, and `reverse`, when the method can replicate from the new Instance
back to the old. The fields and the fixed contract of the image are
[chapter 14](../../../spec/v1/14-platform-intent.md#move-methods)'s.

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

Undo cost today: three optional fields and a version in the lock: hours.
Becomes irreversible once: a Move has run with a method image, since its steps
are then what the estate's data history depends on.

## Consequences

- Each engine that supports Moves needs a method image, built and rehearsed,
  paid by the platform owner once per engine.
- An engine's image in the images lock must record its version, paid by
  whatever writes the lock.
- An engine whose reverse is unrehearsed refuses rollback by replication until
  its drill runs, paid by the owners of its Processes as `rollback:
  forward-only` acknowledgements.
- The engine vocabulary stays the four values chapter 10 lists until an engine
  gains a method; adding MySQL, MariaDB or MongoDB is a vocabulary change in the
  same pull request as its method.
