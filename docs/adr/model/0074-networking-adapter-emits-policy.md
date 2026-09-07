---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/30-deliverables.md#the-registered-set
rests-on: ["0005"]
---

# A `networking` adapter owns every NetworkPolicy in the estate

## Rests on
Every rendered NetworkPolicy is derivable from the composed edge set, the
surfaces, the routes, the grants and the platform baseline, and one producer can
own all of them. False if: a policy the estate needs cannot be derived from
those five inputs, or the per-domain default-deny and the per-Workload policies
turn out to need different inputs rather than different paths. Settled by: the
conftest assertion holding over a full estate render — every rendered policy
carrying `Egress` in `policyTypes` also matches UDP/53 — with `networking` the
only adapter emitting the kind.

## Why
Network policy is the most completely specified derivation in the model and the
least produced. [0035](0035-network-policy-default-deny.md) and
[chapter 16](../../../spec/v1/16-dependencies.md#network-policy) give the allow
set rule by rule, the two baseline rules, and the three-stage
render-only/audit/enforce path. The only implementation is
`src/deployment/render/networkpolicy.ts`, in the generation
[0052](0052-registered-adapters-are-v1.md) deletes, and that implementation is
the evidence for why the baseline is not optional: `providerPolicy` emits an
egress rule to the provider's pod and nothing else, so the consumer cannot
resolve the `svc.cluster.local` name the coordinate derivation just handed it and
fails with a DNS timeout diagnosed as "Postgres is down".

So the producer has to be written, and the question is which adapter owns the
kind. It is its own adapter for two reasons that are about scope rather than
size. The namespace-wide default-deny is **one object per domain**, not per
Service, so it does not fit an adapter keyed off the Service; with path
authority in layer 2 ([0070](0070-path-authority-is-layer-2.md)) that object now
has one owner and one path, and the owner should be the adapter whose whole
subject is policy. And the DNS assertion is a property of the policy set: with
one producer it is a property of one adapter, checkable in one place, rather
than a rule every adapter emitting a policy would have to be held to
separately.

Splitting further — one adapter for per-Workload policies, another for the
per-domain baseline — would put the two baseline rules that must appear in
*every* policy in a different producer from the policies they must appear in.
The split that matters is by kind, and there is one kind.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Extend the `kubernetes` adapter | No registry change; every object a Service owns has one producer | The per-domain default-deny is not Service-scoped, so one adapter would own two path shapes, and a policy regression would be attributed identically to a Deployment regression |
| Two adapters, per-Workload and per-domain | Each adapter has exactly one path shape | The baseline rules belong in every policy, and this puts them in a different producer from most of the policies that need them |
| Keep the deleted generation's renderer | It exists and produces objects today | It is unregistered, consumes `ProjectModel` rather than an `AdapterContext`, and omits both baseline rules — porting it costs what writing the adapter costs |

## Reversibility
Undo cost today: one adapter and its registry entry, deletable before anything
is enforced. Becomes irreversible once: the policy set is loaded into a CNI's
non-enforcing stage and flows are being diffed against it, because the audit
window's evidence is then keyed to what this adapter emitted.

## Consequences
- 0052's set becomes eighteen, amended in place; `rbac` is not among them
  ([0075](0075-no-workload-rbac-in-v1.md)) — paid in one amendment, and the
  count keeps meaning what it meant.
- The DNS baseline becomes assertable against one producer, so the failure the
  deleted generation shipped is a test rather than a memory — paid by nobody.
- Every policy in the estate now has one owner, so the audit stage's diff is
  between observed flows and one adapter's output rather than between flows and
  a mixture of rendered and hand-written policies — paid by whoever runs the
  14-day audit, in a cleaner comparison.
- A typo in a `surface` name still narrows the allow set silently, because a
  name that resolves to nothing derives no rule; that is R18's row and this
  decision does not close it — paid on-call, as a timeout rather than an error
  code, until R18 is decided.
