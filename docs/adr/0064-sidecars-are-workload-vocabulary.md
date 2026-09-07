---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#workload
rests-on: ["0005"]
---

# A Workload may hold sidecars, and a sidecar carries what a container carries

## Rests on
Every multi-container pod in this estate is expressible as one Workload plus
sidecars, and no sidecar needs a node dimension of its own. False if: a sidecar
must be placed differently from the Workload it runs beside — which a shared pod
makes impossible — or a live sidecar's resources or hardening cannot be stated
at the sidecar. Settled by: the three live cases — `postgres` with
`postgres-exporter` on 9187, `stalwart` with `stalwart-apply`, `agent-runner`
carrying the `agent-gateway` jar — rendered from a declaration and diffed
against the live pod specs.

## Why
A Workload holding more than one container is not an edge case here. It happens
three times, and the estate has already paid for having no vocabulary for it:
`agent-gateway` sits in the accepted-drift ledger as *"a sidecar jar inside
agent-runner pods, not a workload of its own"* — a real container excused from
attribution because the model could not name it. `postgres-exporter` is worse
than unnamed: `platform-postgres` declares `provides: {metrics: 9187}` and the
container that actually serves 9187 has no declaration at all.

The open half was never whether sidecars exist but what a sidecar carries, and
Kubernetes answers it cleanly because the split is already in the API.
`nodeSelector` and affinity are **pod**-level; `resources` and `securityContext`
are **container**-level. So the node dimensions — `arch`, `site`, `disk`, `gpu`,
`capabilities` — stay on the Workload and describe the pod, while `memory`,
`cpu` and `hardening` belong to each container and a sidecar declares its own.
Splitting the field by where Kubernetes already puts it means the derivation
needs no rule of its own: it follows the target.

Eligibility then sums. A node must fit the Workload's containers together, so
the placement check adds the sidecars' `memory` and `cpu` to the Workload's
before matching against allocatable
([0061](0061-placement-is-hard-dimensions.md)). This is the one place the
addition matters and it is easy to get wrong: `postgres` at 2Gi with a 64Mi
exporter needs a node with 2112Mi free, not 2Gi, and on the 4096Mi Pis that
difference is a fifth of what is left after the reserve.

A sidecar's `image` is an alias resolved through the images lock, for the same
reason a Workload's is: a tag would put a mutable reference in a Deliverable
that `E_FLOATING_IMAGE` exists to refuse.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A sidecar is a Workload of its own | Its own identity, ServiceAccount, Vault role, probes and release semantics — and it would then be independently referencable, which is false: `agent-gateway` cannot be deployed or scaled apart from `agent-runner` | The pod is the unit that shares a lifecycle, a network namespace and a node; modelling co-located containers as peers denies the one fact that makes them sidecars |
| Sidecars inherit the Workload's `hardening` and quantities | One number to write; no per-container vocabulary | `postgres-exporter` and `postgres` are different images with different needs — the exporter meets `restricted` while postgres does not, and inheriting would force the Workload's exception onto a container that never needed it, widening the estate's own inventory of what it cannot harden |
| Leave it ungraded and keep using the drift ledger | Nothing to write now | The ledger entry says the model cannot see the container; a ledger is for accepted holes, not for missing vocabulary, and [0055](0055-bidirectional-ledgers.md) requires every entry to be a deferred fix rather than a permanent exemption |

## Reversibility
Undo cost today: three declarations across three repositories, plus the renderer
branch that emits additional containers — under a day, no data movement, no live
object renamed. Becomes irreversible once: a sidecar serves a surface another
Service depends on, because the consumer's edge then resolves to a port the
Workload's own container does not open — `platform-postgres`'s `metrics: 9187`
is already exactly that shape.

## Consequences
- The `agent-gateway` accepted-drift entry can close: the container becomes
  declarable and therefore attributable, so it stops being an object no adapter
  claims — paid by whoever writes the declaration, once.
- Placement eligibility sums across containers, so a Workload's node set narrows
  when a sidecar is added and a previously-placeable Workload can become
  `E_PLACEMENT_UNSATISFIABLE` without its own quantities changing — paid by the
  author adding the sidecar, at build time rather than at apply time.
- A surface may be served by a sidecar rather than by the Workload's own
  container, and `provides` does not say which. The port is on the pod, so
  nothing breaks; but a reader of `provides` alone cannot tell which process
  answers — paid by whoever debugs 9187, in one extra file to open.
- Two more places to state a hardening exception, and the estate's inventory of
  what it cannot harden grows by the sidecars that need one — paid in honesty:
  the exceptions were always there and were invisible.
- `probes` stay on the Workload. A sidecar publishes no readiness signal of its
  own, so a failing exporter cannot hold its Workload out of service — the
  right default for a metrics sidecar, and wrong for any sidecar that becomes
  load-bearing, which is a decision to revisit when one does — paid by the
  Workload's owner, who must notice.
