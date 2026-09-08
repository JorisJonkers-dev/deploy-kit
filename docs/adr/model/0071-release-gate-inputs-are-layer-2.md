---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/20-resolved-deployment.md#the-release-gate
rests-on: ["0005"]
---

# The release gate is derived into layer 2, and nothing is rendered for it

## Rests on
Every mechanism that could perform a Service-scoped switchover needs the same
three inputs — the member list, each member's readiness reference, and one
deadline — and all three are derivable from declared intent. False if: a
candidate mechanism needs an input no declaration carries, or needs an applied
object to exist before it can gate. Settled by: writing the switchover
mechanism against a `ResolvedService` projection alone, with no object added to
the rendered tree.

## Why
Chapter 50 fixes the rule — no member's new version receives traffic until
every member's new version is healthy — and assigns *performing* it to delivery,
which is defined separately. What was missing is what the model owes so that any
delivery definition can perform it, and the render surface's answer today is
nothing: `app.kubernetes.io/instance: auth` is on every object and no controller
consumes it, the kustomize `Kustomization` groups a file set and has no notion
of a gate, and the Flux `Kustomization`'s health checks are evaluated *after*
apply — after traffic has already moved. No rendered object has the identity
"the Service".

The three candidate mechanisms differ in machinery and agree on inputs. Holding
traffic at the edge needs to know which Workloads must be healthy and how long
to wait. Paused ReplicaSets plus a selector flip needs the same. A gate outside
Kubernetes needs the same. So the inputs are the model's obligation and the
machinery is not, which is exactly where the 2026-09-07 boundary falls.

They belong in layer 2 because they are decisions. A member list is the Service
boundary; a readiness reference is a projection of a declaration; a deadline is
derived. Delivery must read a pinned lock anyway
([0006](0006-pinned-inputs.md)), so it reads them where every other decision
already is, and a Service owner sees the gate their Service will be held to in
the projection they already read back ([0033](0033-assignments-published-back.md)).

Rendering an object instead would repeat the defect being fixed. An applied
ConfigMap that no controller consumes is the same shape as the label nothing
reads: it looks like a mechanism and is inert. Rendering a Flux `Kustomization`
per Service would be worse — it puts a delivery object inside the v1 render
surface while providing no atomicity, since its health checks run after apply.

The deadline is `max` over the members of `progressDeadlineSeconds`. This also
deletes a contradiction rather than adding a rule: the health timeout class was
a table over `stateful` and `lifecycle` — `stateless: 5m`, `stateful: 10m`,
`control-plane: 15m`, `job: 10m` — and it is a second derivation over the same
declaration as the deadline. For `auth-api` the two disagree by 25 minutes: a
600-second budget derives 1800 seconds and the class gives up at 300. One input
gets one derivation; the class table goes.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Render a per-Service descriptor object | Visible to anyone reading the tree, and the substrate is retained as a declarative object store | Nothing consumes it, which is the exact shape of the label nothing reads; and a decision serialised into layer 3 is recorded in no lock |
| Render a Flux `Kustomization` per Service with health checks and a timeout | Uses the mechanism that delivers the estate today, and the fields already exist | Its checks evaluate after apply, so it holds the inputs without providing the property; and it puts a delivery object in v1's render surface, which 0059 scopes out |
| Let delivery derive the gate from Intent itself | Nothing to add to layer 2 | Puts a derivation outside layer 2, where the model forbids one, and two delivery implementations could compute different deadlines from one declaration |
| Keep the health timeout class beside the deadline | No spec deletion; today's renderer keeps working | Two derivations over one input, already disagreeing by 25 minutes on a live Workload — the next contradiction is only a matter of which number drifts |

## Reversibility
Undo cost today: the fields are three entries in a schema and one derivation;
deleting them is a schema change and a code deletion, hours. Becomes
irreversible once: a delivery mechanism reads them from a published projection,
because the projection is then a contract another repository's pipeline depends
on.

## Consequences
- R1 stops gating the render: the model's obligation is discharged in layer 2,
  and the mechanism remains open for the delivery definition to choose — paid by
  whoever writes that definition, who inherits inputs rather than a design.
- A Service with `probes: none` on every Workload cannot be gated, so
  `E_RELEASE_UNIT_NO_READINESS` fires at composition time rather than at apply
  time — paid by the author, at the earliest possible moment.
- The gate deadline is as long as the Service's slowest Workload, so a genuinely
  stuck fast member holds the unit for the slow member's budget — 1800 seconds
  for `auth`, where `auth-ui` alone would have been 90 — paid in time-to-detect,
  which is the cost of atomicity and not a defect in the derivation.
- The health timeout class is deleted, so anything that read it — the Flux
  `Kustomization` timeout in the tree today — must read the gate deadline
  instead; G-27 closes with it — paid once, in the adapter that emits it.
- No object in the cluster names a Service, so a human debugging cannot find the
  Release Unit by selector alone; `part-of` makes the members selectable and the
  gate itself is only visible in the projection — paid by whoever debugs, in one
  extra file to open.
