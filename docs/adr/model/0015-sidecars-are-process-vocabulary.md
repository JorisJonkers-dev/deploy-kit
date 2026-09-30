---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/10-project-intent.md#sidecars
rests-on: ["0005"]
---

# A Process may hold sidecars, and a sidecar declares its name, image, memory and cpu

A sidecar is a container in the Process's pod. It declares `name`, `image`,
`memory` and `cpu`. Node dimensions stay on the Process, because they describe
the pod. A sidecar authors no hardening: every container meets the one platform
posture ([0020](0020-hardening-is-one-platform-posture.md)). Probes stay on the
Process.

## Rests on

Every multi-container pod in this estate is expressible as one Process plus
sidecars, and no sidecar needs a node dimension of its own.

**False if:** a sidecar must be placed differently from its Process, or a live
sidecar's resources cannot be stated at the sidecar. **Settled by:** the three
live cases (`postgres` with `postgres-exporter` on 9187, `stalwart` with
`stalwart-apply`, `agent-runner` carrying `agent-gateway`) rendered from a
declaration and diffed against the live pod specs.

## Why

**The estate already paid for having no vocabulary.** `agent-gateway` sat in the
accepted-drift ledger as a container the model could not name, and
`platform-postgres` declared `metrics: 9187` while the container serving 9187
had no declaration at all.

**The split follows the target.** Kubernetes puts `nodeSelector` and affinity
on the pod and `resources` on the container. So node dimensions stay on the
Process and quantities belong to each container. The derivation needs no rule
of its own.

**Eligibility sums.** A node must fit the Process's containers together, so the
placement check adds the sidecars' `memory` and `cpu` before matching
allocatable ([0017](0017-placement-is-hard-dimensions.md)): `postgres` at 2Gi
with a 64Mi exporter needs 2112Mi free, a fifth of what a 4096Mi Pi has left
after its reserve.

**A sidecar's image is an alias** resolved through the images lock, for the
same reason a Process's is: a tag would be a mutable reference in a
Deliverable.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A sidecar is a Process of its own | its own identity, probes and release semantics | it cannot be deployed or scaled apart from its pod; the pod is the unit that shares a lifecycle and a node |
| A sidecar declares its own hardening | a per-container exception vocabulary | hardening has no exception surface; a container that cannot meet the posture is refused with its Process |
| Keep using the drift ledger | nothing to write | a ledger is for accepted holes, not missing vocabulary ([0038](0038-bidirectional-ledgers.md)) |

## Reversibility

Undo cost today: three declarations across three repositories and one renderer
branch: under a day. Becomes irreversible once: a sidecar serves a surface
another Application depends on.

## Consequences

- The `agent-gateway` drift entry closes, paid by whoever writes the
  declaration, once.
- Adding a sidecar can make a placeable Process `E_PLACEMENT_UNSATISFIABLE`
  without its own quantities changing, caught at build time.
- `provides` does not say which container serves a surface, paid by whoever
  debugs 9187, in one extra file to open.
- A sidecar publishes no readiness of its own, which is right for a metrics
  sidecar and wrong for one that becomes load-bearing; revisit when one does.
