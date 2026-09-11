---
tier: decision
status: proposed
claim: settled
date: 2026-09-08
normative: spec/v1/14-platform-intent.md#the-document
rests-on: ["0004"]
---

# Platform Intent is the second authored document, published as an Intent Fragment

## Rests on
Every platform-side value the render reads is either a fact about the estate or
a policy the estate applies uniformly, and the contention test sorts every value
between the Service's document and the platform's with no residue. False if: a
value turns up that neither a Service could state for itself nor the platform can
state once for the estate: something per-Service that only the platform knows.
Settled by: composing the worked domains with the Platform document as a
participant and finding every field of the former Cluster Context assigned to
exactly one of the two authored kinds, with no third document.

## Why
Ten decisions in one week added fields to a document no chapter defined. Tiers
gained a forward-auth endpoint ([0076](0076-middleware-has-one-producer.md)), a
durability policy per class appeared ([0077](0077-durability-derives-a-backup.md)),
then engine methods, a receiver mapping and rule catalog
([0079](0079-alert-class-derives-from-a-rule-catalog.md)), probe cadence
([0088](0088-startup-probe-targets-liveness.md)), an ephemeral default
([0092](0092-writable-paths-are-declared.md)), and coordinates on the unmanaged
register ([0090](0090-edges-resolve-against-the-register.md)). Each was right
on its own terms and each landed in "the Cluster Context", whose only schema was
a hand-written example. The platform half of the DSL existed as sentences.

Naming it as what it is fixes three things at once. It is **authored**, not
observed (a tier's audiences and a class's retention are decisions somebody
wrote down), so it is layer 1 and held to the layer-1 rule: facts and policy,
never mechanisms. It has a **single criterion** for membership, which is the
contention test [0004](0004-contention-decides-authority.md) already states: a
value that must be unique across the estate or draws on a shared finite resource
is the platform's to declare. And it has a **schema to derive from**, which is
what an editor, a validator and a lock all need.

Publication follows from the same move. A domain enters composition as an
Intent Fragment by OCI digest ([0037](0037-composition-oci-fragments.md)); the
Cluster Context entered by a separate side channel, also by digest, for no
reason other than history. One mechanism, one lock, and the platform becomes a
**required participant** whose staleness the participants list can name: a
render against a stale platform document is `E_PARTICIPANT_STALE`, where before
it was a digest nobody compared to a clock.

Two things deliberately stay out. Foundation components are Services in domain
files the platform owns ([0096](0096-the-foundation-is-declared.md)), because a
second way to declare a Service is the duplicate vocabulary
[0003](0003-three-layer-meta-model.md) exists to end. The node contract stays
its own pinned input ([0056](0056-node-facts-single-source.md)), because nix
reads it and would otherwise read a deployment-model document.

The unmanaged register splits along the same line. A provider the estate depends
on (`stalwart` with an address and an SMTP port) is a **fact** and lives here,
resolvable by an edge; a hostname nobody deploys and nobody depends on is a
**hole** and stays a ledger entry with a review date. 0090 had made one list do
both, and an edge should resolve against facts, never against exemptions.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Give the Cluster Context a chapter and leave it a separate pinned input | Preserves today's diagram; smallest edit | Two publication paths for two documents obeying one rule, and a participant no participants list can declare missing |
| One Platform document holding facts and foundation components | One file to find | Invents a second way to declare a Service: the platform's Vault written differently from a tenant's Postgres |
| Fold the node contract in | Every estate fact in one document | nix imports a deployment-model document, or the facts exist twice; 0056 was decided to prevent the second |
| Keep providers in the unmanaged register with optional coordinates | One list, as 0090 left it | A dependency the estate relies on filed as an accepted hole, with a review date threatening the build for something not going away |

## Reversibility
Undo cost today: a rename and a chapter; the fields are the same fields. Becomes
irreversible once: repositories author against `kind: Platform` and the
participants list requires it, because the side channel would then have to be
reintroduced as a schema change.

## Consequences
- The layer-1 rule now has two documents to hold to, and the contention test is
  the only thing deciding which one a field enters, paid by every future
  decision that adds a platform value, in one explicit choice.
- The Cluster Context ceases to exist as a term; `CONTEXT.md` records the rename
  and the reason, paid once, in the glossary.
- The pinned input set loses one kind and gains a participant, so `E_PARTICIPANT_STALE`
  can now fire for the platform, paid by the platform owner, who republishes on
  a cadence like everyone else.
- Providers and unmanaged surfaces are different lists with different
  lifecycles; a provider that is retired becomes a ledger entry on its way out,
  paid in one more distinction authors learn.
- Chapter 60's "platform facts" table moves to chapter 14, leaving chapter 60 to
  bootstrap and adoption, paid in one pointer.
