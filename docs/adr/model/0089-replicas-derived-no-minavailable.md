---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#replicas-and-the-disruption-budget
rests-on: ["0002"]
---

# `replicas` derives as one, `minAvailable` is deleted, and a budget over one replica is not emitted

## Rests on
No Workload in this estate obtains availability from a replica count, so a
declared availability requirement could only ever be a request the substrate
cannot honour. False if: a stateless Workload's second replica measurably
survives an event that takes the first one down — which requires two nodes, a
shared-nothing workload and a load balancer that notices. Settled by: rendering
the estate with `replicas: 1` everywhere except the overrides that state a
capacity reason, and `kubectl drain` on the control-plane node completing rather
than blocking.

## Why
Two derivations existed, neither compared with the other, and the pair produces a
deadlock. `replicas` was said to derive "from `minAvailable`, bounded by the
eligible node set", and the PDB was `minAvailable` serialised. For `auth-api` the
eligible node set is **one node**, so the live two replicas are not reproducible
from any input; and `minAvailable: 1` against `replicas: 1` permits **zero**
voluntary evictions, so draining that node blocks forever. On this estate that
node is also the control plane.

`minAvailable` was never graded, and grading it against
[0002](0002-kubernetes-as-substrate.md) is what deletes it. Storage is
`local-path`, all fourteen PVCs are `ReadWriteOnce`, and a `local-path` volume
does not survive its node — so every stateful Workload is pinned to one machine
by construction. Rescheduling does not exist. Control-plane HA does not exist.
Two replicas on one node are two processes on one kernel. A field whose meaning
is "how many pods must stay up" cannot be honoured by a substrate where the
answer is decided by which machine is running, and 0002 forbids citing
rescheduling, HA or horizontal scale as justification for anything.

The estate's own case makes the point: `auth-api` runs two replicas, and chapter
00 records why — a capacity decision on freed Frankfurt budget, not an
availability requirement. Under this decision that is an **override with a
reason**, which is the truthful encoding of what it always was. The field is not
lost; the pretence is.

The budget is the operational half. Emitting a PDB only where `replicas` exceeds
one removes the deadlock class entirely, and expressing it as `maxUnavailable: 1`
rather than `minAvailable: replicas - 1` means a drain can always make progress
and the guarantee does not have to be recomputed when a count changes. A
single-replica Workload gets no budget, because a budget that forbids its only
eviction is not protection.

Emitting no PDB at all was tempting and slightly wrong: a two-replica stateless
Workload spread over seven nodes does benefit from not losing both at once, and
that is the one case a budget earns its place here.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep `minAvailable`, graded as an availability requirement | The six live PDBs stay derivable from a declaration | Grades a field whose meaning 0002 denies: no rescheduling, no HA control plane, one node per stateful volume |
| Replace it with an availability class (`single`, `multi`) | Reads as intent, hides the arithmetic | A two-value class table over a property the substrate cannot deliver, and two such tables were deleted this week already |
| `minAvailable: replicas - 1` | Stays in the vocabulary the live objects use | The arithmetic is per Workload, so a count change silently changes the budget's meaning, and `replicas: 1` still deadlocks unless special-cased |
| No PDB at all | Nothing to derive; every stateful Workload is pinned anyway | Loses the one case a budget earns here — a multi-replica stateless Workload losing both pods to one drain |

## Reversibility
Undo cost today: `replicas` and the PDB are both mutable on live objects, and
re-introducing an authored field is a schema addition. Becomes irreversible
once: never — every value here is patchable, which is precisely why the deadlock
was survivable and the undecidedness was not.

## Consequences
- R16 closes, and the drain deadlock closes with it: no rendered PDB can forbid
  the eviction of a Workload's only pod — paid by nobody, and it was reachable
  on the control-plane node.
- `auth-api` needs an override to keep its second replica, so the capacity
  decision becomes a recorded reason instead of a number nobody can source —
  paid by its owner, once.
- The estate's six live PDBs are not all re-derivable: any over a single-replica
  Workload will not be rendered, so adoption drops them, which is the intended
  correction and will look like a removal in the first diff — paid at adoption,
  deliberately.
- The last ungraded field in chapter 10 is gone, so "still to be graded" shrinks
  to one item, `self-renew` × `file` — paid by nobody.
- If a second production cluster ever appears, this decision is one of those
  0001 re-opens: replica-count availability starts meaning something the moment
  rescheduling does — paid by whoever adds the cluster, and 0002 already says so.
