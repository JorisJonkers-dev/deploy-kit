---
tier: premise
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/00-overview.md#substrate
---

# Kubernetes stays as the substrate for one applier, for its authorisation boundary and its field ownership

## Rests on

The two properties that earn Kubernetes hold with one applier. First, the API
server bounds what each in-cluster writer may change: Flux's applying
ServiceAccount can write what the render carries, and no deploy credential
exists outside the cluster. Second, server-side-apply field ownership names
which of Flux and Flagger owns each field of a rendered object. A field both
write, or a field a human edits, is therefore visible rather than silent.

**False if:** a field both Flux and Flagger write shows a single manager in its
`managedFields`, or Flux's ServiceAccount can write a kind or a namespace no
render carries and cannot be narrowed. **Settled by:** two observations, both
still to be run, owned by joris. First, a provoked conflict: publish a
throwaway render that sets `replicas` on a `blue-green` Process's Deployment,
and observe `managedFields` name both Flux and Flagger for `spec.replicas`
while the count flaps; remove it, and observe one owner again. Second, a
`kubectl auth can-i` matrix for Flux's applying ServiceAccount: every kind ×
every namespace × create, patch and delete, compared against the kinds and
namespaces the render actually holds. Every `yes` beyond them is narrowed or
recorded.

## Why

**Nothing else earns it.** Rescheduling does not exist here: storage is
`local-path`, every PVC is `ReadWriteOnce`, and a volume does not survive its
node. Control-plane HA does not exist, because the estate has one control-plane
host. Horizontal scale is not exercised. The overhead is counted: about 405
rendered objects for about thirty Applications, 41 of them foundation, and the
foundation carries the CVEs and the CRD upgrades.

**One applier moves the boundary, it does not remove it.** Flux is the one
applier ([0050](0050-delivery-is-part-of-the-model.md)), so the boundary runs
around it: no deploy credential leaves the cluster, and the API server confines
what Flux's identity may write.

**Field ownership matters more with two controllers.** Flux resets what the
render says. Flagger rewrites what it manages. A field both believe is theirs
flaps until one loses ([0055](0055-the-render-leaves-flaggers-objects-to-flagger.md)).
Server-side apply is how that shows up.

**The model discharges its own half.** Every Deliverable is attributed to
exactly one adapter ([0037](0037-six-registered-adapters-satisfy-one-port.md)),
so there is always one answer to what should own a field, and the render omits
what Flagger generates. What remains is the substrate's half, which this
premise claims and the test measures.

**The rival substrate loses both properties.** The estate already runs Nix for
five host applications. Collapsing onto it would delete the foundation and its
upgrade treadmill. It would also delete the authorisation boundary and field
ownership, which a plain host does not provide.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Several appliers, each bounded by its own namespace and field manager | a deployer credential per aggregator, a namespace per deployer, a lease per applier | delivery is Flux pulling a pinned render; a second applier is exactly what the model refuses |
| Plain NixOS and systemd per node | rewrite every adapter as a module generator | loses both properties; nothing on a plain host names a field's owner or bounds an applier |
| Nomad | operate a second orchestrator nobody here knows | buys scheduling the estate does not use, and has no server-side-apply field ownership |

## Reversibility

Undo cost today: weeks, across the whole estate. Five of the six adapters emit
Kubernetes kinds, delivery is Flux and Flagger, and fourteen node-pinned
volumes must be re-homed by hand. The layer-1 documents survive, because
neither names a Kubernetes kind
([0011](0011-authored-values-name-model-concepts.md)). Becomes irreversible
once: project repositories author against a shipped v1 whose adapters and
delivery are Kubernetes-shaped, because a swap is then a v2 migration.

## Consequences

- The estate keeps paying orchestrator overhead for two properties, not for
  scheduling, paid by joris in operations time.
- Flux's applying ServiceAccount is narrowed to what the render carries, or its
  extra reach is recorded, paid by joris when the matrix runs.
- No design may cite rescheduling, HA or horizontal scale as a justification,
  paid by future decision authors in narrowed options.
- The render keeps omitting what Flagger generates, or the ownership signal
  becomes a flap, paid by the adapter's author.
