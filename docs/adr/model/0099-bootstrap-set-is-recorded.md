---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-08
normative: spec/v1/14-platform-intent.md#the-bootstrap-set
rests-on: ["0002"]
---

# The bootstrap set is a recorded, enumerated table: k3s, the Flux source, Vault's unseal, and the CRDs

## Rests on
Four things must exist before the first rendered object can apply, and nothing
else does. False if: a declared Service turns out to need something applied before
it that is neither in this table nor derivable from the Reconcile Unit ordering.
Settled by: standing up a fresh cluster from the bootstrap set alone and applying
the full rendered tree in Reconcile Unit order, with no object failing for want of
a prerequisite.

## Why
A render cannot apply itself. Once the foundation is declared
([0096](0096-the-foundation-is-declared.md)) the question is what remains that
the model can describe but not produce, and the answer has to be a short table
rather than a habit, because every item in it is an object the invariants never
see.

k3s is in the table because it is what applies. The Flux source is in it because
it pulls the tree everything else is in — the source, not the per-layer
`Kustomization`s, which encode an ordering that changes and are delivery's to
define ([0098](0098-one-publication-path.md)). Vault's unseal is in it because
the model must never hold that secret. The CRDs are in it because they are
cluster-scoped schema that must exist before any object of their kind can apply;
the components that *use* them — VSO, Traefik, Prometheus — are declared
Services, and the CRDs are pinned by version the way an image is pinned by
digest.

The table is a Bidirectional Ledger in shape
([0055](0055-bidirectional-ledgers.md)): an entry nothing needs fails the build,
and a component that should be declared and is not is `E_UNATTRIBUTED_OBJECT`.
Growing the set is therefore a decision with a diff, not a convenience.

The claim is `open` because its settling test is a fresh-cluster stand-up, which
[0057](0057-datastore-and-restore.md)'s restore rehearsal already requires and
nobody has run. Both settle together.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| The whole foundation stays bootstrap | Honest about today | Leaves the CVEs and CRD upgrades chapter 00 names outside the model, which is where they hurt |
| Declare everything, including the Flux source and Vault's unseal | Purest | The render cannot apply itself; the description would be aspirational rather than checkable |
| Include the per-layer Flux `Kustomization`s in the bootstrap set | They rarely change | They encode the Reconcile Unit ordering, which changes on the first new edge |

## Reversibility
Undo cost today: a table. Becomes irreversible once: never — the set can grow or
shrink by decision at any time, which is the point of making it a table.

## Consequences
- Four items are outside every invariant and the table says so, in one place —
  paid in honesty, and it replaces 41 objects that were outside them silently.
- A CRD upgrade is a bootstrap-set edit with a version, so it appears in review
  before any object depending on it renders — paid by whoever upgrades, visibly.
- The restore rehearsal chapter 60 requires now also settles this claim — paid
  once, in a rehearsal that was already owed.
