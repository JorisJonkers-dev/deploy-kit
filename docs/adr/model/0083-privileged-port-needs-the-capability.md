---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#a-privileged-port-needs-the-capability-that-binds-it
rests-on: ["0005"]
---

# A privileged port under non-root is refused

## Rests on
Every Workload in this estate can listen above 1024, so no rendered pod needs a
silent capability. False if: an image the estate must run binds a privileged
port and has no configuration for a different one, in which case it is refused
and carried in a Bidirectional Ledger until it is replaced
([0055](0055-bidirectional-ledgers.md)). Settled by: rendering the estate with
no Workload declaring a port below 1024.

## Why
`auth-ui` declared port 80 under the `restricted` class and therefore rendered a
pod that cannot bind its own port: non-root plus `capabilities.drop: [ALL]`
removes `CAP_NET_BIND_SERVICE`. The render was internally consistent and the
workload could not start. The model said nothing either way.

Refusing it is the reading that keeps the class honest. Deriving
`NET_BIND_SERVICE` wherever a low port appears would re-add a dropped capability
for every Workload that happens to declare one, silently, and the class would
mean less than it says.

There is no escape hatch, because [0016](0016-pod-hardening.md) deleted the
exception surface this record originally leant on. A capability relaxation
carried with a reason is an override under another name; an image that genuinely
cannot be reconfigured is refused and carried in a ledger with an owner, where
the estate can count how many such images it has.

For `auth-ui` the answer is to listen on 8080, and the reason that costs nothing
is [0018](0018-exposure-by-audience.md)'s: a route names a **surface**, not a
number. The container port is invisible to consumers, to the rendered
IngressRoute and to the Gatus check; only the Service object's `targetPort`
moves.

Rewriting the port silently (deriving a high `targetPort` while the Service
keeps 80) was the third option and it is the worst. The pod must actually listen
where the platform decided, which no image obeys, so it would be a decision taken
during serialisation that the process then contradicts.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Derive `NET_BIND_SERVICE` where a low port is declared | Nothing in any domain file changes | Silently re-adds a capability the class dropped, for every Workload that happens to declare a low port |
| Derive an unprivileged `targetPort` | Nothing authored changes and nothing is refused | The process still listens where its image says, so the rendered object and the running pod disagree |
| Leave it to review | No new error code | The render is internally consistent, so review has nothing to notice; the failure appears as a crash-looping pod |

## Reversibility
Undo cost today: one check. Becomes irreversible once: never. The check
constrains authoring, and removing it would only make more documents legal.

## Consequences
- R10 closes, and `auth-ui` moves to 8080 before it renders, paid by its owner,
  once, at build time rather than in a crash loop.
- Every low port in the estate becomes a change rather than a silent capability
  grant, which is a count the estate did not have, paid in honesty.
- An image that truly cannot be reconfigured is refused, and stays refused until
  it is rebuilt or entered in a ledger with an owner, paid by whoever owns it,
  which is the point.
