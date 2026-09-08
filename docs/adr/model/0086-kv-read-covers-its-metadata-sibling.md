---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#secrets
rests-on: ["0009"]
---

# A KV-v2 read grant covers the document's metadata sibling

## Rests on
KV-v2 splitting one document across `secret/data/<path>` and
`secret/metadata/<path>` is an implementation detail of the engine, not two
objects with two reader sets. False if: a reader legitimately needs the values of
a document while being denied knowledge of its version history. Settled by: a
reader listing its own document's versions against a policy derived from one
declaration, with no second grant written anywhere in the estate.

## Why
[0009](0009-vault-read-is-per-path.md) settles that a KV-v2 `read` returns the
whole document at a path, which is why the grant unit is the path and why `keys:`
confers nothing. The same engine puts version listing and soft-delete at a
**sibling** path, `secret/metadata/<path>`, and no grant names it. Every reader
in the estate is therefore denied its own document's metadata: version listing
and soft-delete are unavailable to the identity that already holds every value in
the document.

Since the reader already holds the values, denying the version list protects
nothing. It withholds the ability to see *when* a value changed from the
principal that can read the value — which is exactly backwards for auditing a
rotation. So one declaration derives both stanzas: `read` on
`secret/data/<path>` and `read` plus `list` on `secret/metadata/<path>`.

The author still writes one path, so the grant unit is unchanged and 0009's
per-path rule is untouched. Nothing about the reader set moves, because it is the
same document.

Soft-delete stays out. Deleting a version is a **write**, and the tiers already
distinguish reading from writing; a reader that should be able to soft-delete is
declaring a different intent and needs its own tier, which is a separate decision
if the estate ever wants one.

Declaring metadata access explicitly was the most literal reading of least
privilege, and it would make every reader in the estate write two declarations
for one document, with the second one's absence surfacing as a denial at runtime.
That is a worse trade than the one this makes.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| The author declares metadata access explicitly | Nothing is granted that was not asked for | Two declarations per document for every reader in the estate, and forgetting the second is a runtime denial rather than a build error |
| Leave it denied | Zero change; the rolling CronJob uses `patch` and needs no listing | It is already a recorded gap because someone hit it, and a document whose versions cannot be listed by its own reader cannot be audited |
| Grant metadata read **and** delete from one declaration | Covers soft-delete, which some rotations want | Deleting a version is a write, and collapsing read and write into one tier is the distinction the tier table exists to keep |

## Reversibility
Undo cost today: one stanza in the derivation. Becomes irreversible once: a
workload or a human process depends on listing versions, because removing the
stanza then breaks an audit path rather than narrowing an unused one.

## Consequences
- R21 closes, and version listing works for every reader without a second
  declaration — paid by nobody.
- Every derived KV policy doubles its stanza count, so a policy document is
  longer and a reviewer reads two paths per grant — paid in policy size, which
  is generated rather than written.
- A reader can see the version history of a document it reads, which includes
  timestamps of rotations performed by other principals; that is metadata about
  someone else's action, and it is information the value itself already implies —
  paid deliberately, and stated so nobody has to rediscover the reasoning.
- Soft-delete remains unavailable, so a rotation process that wants to prune old
  versions needs a tier that does not exist yet — paid when the estate wants
  pruning, as its own decision.
