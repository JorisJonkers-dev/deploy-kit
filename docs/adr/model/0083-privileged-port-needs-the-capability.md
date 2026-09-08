---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#a-privileged-port-needs-the-capability-that-binds-it
rests-on: ["0005"]
---

# A privileged port under non-root is refused, and the escape is the existing exception

## Rests on
Every Workload in this estate can listen above 1024, or can declare the
capability that lets it listen below, so no rendered pod needs a silent
capability. False if: an image the estate must run binds a privileged port, has
no configuration for a different one, and declaring the exception is judged
worse than the silence. Settled by: rendering the estate with no Workload
declaring a port below 1024 except those carrying
`allow: capability:NET_BIND_SERVICE` with a reason, and every one of those
appearing in the exception inventory.

## Why
`auth-ui` declares port 80, takes the `restricted` class, relaxes only
`writableRootFilesystem`, and therefore renders a pod that cannot bind its own
port: non-root plus `capabilities.drop: [ALL]` removes `CAP_NET_BIND_SERVICE`.
The render is internally consistent and the workload cannot start. Either the
port is wrong or the exception set is, and the model said nothing either way.

Refusing it is the reading that keeps two existing decisions honest. The
exception list is the estate's inventory of what it cannot harden, and chapter 10
keeps it explicit precisely so its length stays visible — no
`hardening: privileged` shorthand, one entry per relaxed control, a reason on
each. Deriving `NET_BIND_SERVICE` wherever a low port appears would re-add a
dropped capability for every Workload that happens to declare one, and the
inventory would stop recording the thing it exists to record.

The escape therefore needs no new vocabulary: `allow: capability:NET_BIND_SERVICE`
is already expressible, already requires a reason, and already lands in the
inventory. An image that genuinely cannot be reconfigured stays deployable, and
the estate can count how many such images it has.

For `auth-ui` the answer is to listen on 8080, and the reason that costs nothing
is [0018](0018-exposure-by-audience.md)'s: a route names a **surface**, not a
number. The container port is invisible to consumers, to the rendered
IngressRoute and to the Gatus check; only the Service object's `targetPort`
moves.

Rewriting the port silently — deriving a high `targetPort` while the Service
keeps 80 — was the third option and it is the worst. The pod must actually listen
where the platform decided, which no image obeys, so it would be a decision taken
during serialisation that the process then contradicts.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Derive `NET_BIND_SERVICE` where a low port is declared | Nothing in any domain file changes | Silently re-adds a capability the class dropped, and the exception inventory stops recording the Workloads that have it |
| Derive an unprivileged `targetPort` | Nothing authored changes and nothing is refused | The process still listens where its image says, so the rendered object and the running pod disagree |
| Leave it to review | No new error code | The render is internally consistent, so review has nothing to notice; the failure appears as a crash-looping pod |

## Reversibility
Undo cost today: one check. Becomes irreversible once: never — the check
constrains authoring, and removing it would only make more documents legal.

## Consequences
- R10 closes, and `auth-ui` must change its port or declare the capability
  before it renders — paid by its owner, once, at build time rather than in a
  crash loop.
- Every low port in the estate becomes visible as either a change or an entry in
  the exception inventory, which is a count the estate did not have — paid in
  honesty.
- A Workload declaring `allow: capability:NET_BIND_SERVICE` widens its own
  capability set, so the exception is not free; the inventory is where that shows
  — paid by whoever declares it.
