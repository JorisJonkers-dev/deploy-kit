---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/30-deliverables.md#ledgers
rests-on: ["0003"]
---

# Every accepted hole is a bidirectional ledger: an unlisted gap fails the build, and so does an entry that no longer matches

An accepted gap between what the render produces and what the estate runs is an
entry in a ledger. Each entry is a predicate over the cluster inventory (kind,
namespace, a name or name pattern) with an owner, a reason and a review date.
The check fails on a live object no adapter produced and no entry matches
(`E_UNATTRIBUTED_OBJECT`), on an entry that matches nothing
(`E_LEDGER_ENTRY_STALE`), and on a review date in the past
(`E_LEDGER_REVIEW_OVERDUE`). Registered Unmanaged Surfaces
([0024](0024-dependency-edges-resolve-against-the-union.md)), participant
dormancy ([0043](0043-participants-list-staleness.md)) and the bootstrap set
([0046](0046-the-foundation-is-declared.md)) take this shape, and so does a
Process the model cannot yet serve, such as a Kubernetes-API consumer
([0031](0031-identity-per-process.md)).

## Rests on

Layer 3 is a total function of the Resolved Deployment
([0003](0003-three-model-pipeline.md)), so every live object the render does not
produce can be named as a predicate over the inventory and matched by machine.

**False if:** an accepted hole exists whose excuse cannot be written as such a
predicate. **Settled by:** the ledger check run against the pinned inventory
twice, once with one live entry deleted (it must fail with
`E_UNATTRIBUTED_OBJECT`) and once with a fabricated entry appended (it must fail
as stale), on every ledger.

## Why

**The design already ran in the estate.** The replaced generation's drift
ledger failed on anything absent from it and on an entry that no longer matched
anything, "so the list cannot quietly outlive the thing it excuses". This
decision generalises it to every accepted gap.

**Both halves are load-bearing because the gaps are meant to shrink.** Of 450
live objects, 364 were derivable from Project Intent, 41 were pack-delivered and
45 were authored content; the pack-delivered set is now declared, and the
content classes are assigned owners. A list failing only on absence would carry
entries after the adapters closing them land, and no build would say so. The
stale half makes the ledger shrink on its own.

**A review date needs a consequence.** A date in the past fails the build like an
unmatched entry; with one human across three identities, the build failure, not
the review, is what enforces the deadline.

**Some objects are outside any declarative model.** `agents-api` creates and
destroys per-runner Applications at runtime. The ledger is where such objects
belong, with a reason rather than silence.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One-way allowlist, failing only on the unlisted | the check minus one comparison | entries survive their own causes; finding out costs a manual audit |
| No ledger: every unattributed object fails the build | every gap closed before v1 renders | blocks v1 on work v1 is not about |
| Exemptions as annotations on live objects | one `kubectl annotate` | no owner, no review date, never in a diff |

## Reversibility

Undo cost today: the ledger files and the check that reads them; the stale half
is one set comparison: under an hour. Becomes irreversible once: the ledgers hold
more entries than anyone reads in one sitting, because removing the stale half
then leaves no way to tell a deferred fix from a permanent exemption.

## Consequences

- Accepting a hole costs an owner, a reason and a review date at acceptance,
  paid by whoever takes the exception.
- Closing a hole is two changes, register and delete, and forgetting the second
  breaks the build.
- The check reads the pinned ClusterState snapshot
  ([0034](0034-cluster-state-is-a-pinned-input.md)), so a verdict is exactly as
  fresh as that snapshot.
