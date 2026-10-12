---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-09
normative: spec/v1/15-infrastructure-intent.md#one-cluster-written-down
rests-on: ["0001"]
---

# Multi-cluster and multi-tenant estates are parked: v1 writes its one cluster down as a seam, and records what a second cluster or a second tenant would require

v1 models one cluster and one tenant. Infrastructure Intent holds the cluster
as the container of the nodes, with exactly one instance
([chapter 15](../../../spec/v1/15-infrastructure-intent.md#one-cluster-written-down)),
so that a second cluster would be a second instance rather than a new model.
Nothing else is built. This record keeps the questions a second cluster or a
second tenant would raise, what the research found for each, and what would
unpark them.

## Rests on

One maintainer runs one production cluster
([0001](../model/0001-estate-scale-and-ownership.md)). Every mechanism the
model carries is justified at that scale, and a multi-cluster or multi-tenant
mechanism justified only by a scale the estate does not have is the failure
that premise exists to prevent.

**False if:** a second production cluster, or a second party whose data and
dashboards must be isolated from the first, appears before the 0001 horizon.
**Settled by:** the 0001 horizon review on 2028-08-31, or the day either is
proposed.

## Why

**Evaluated, to learn its lessons, not to build.** The survey is
[`docs/research/infrastructure-and-tenancy.md`](../../research/infrastructure-and-tenancy.md),
and its findings shape the questions below.

**Tenancy is a stack, and each layer above the namespace costs a control
plane.** A namespace per tenant (Capsule's `Tenant`, Flux's multi-tenancy
lockdown) is cheap and shares the kernel and the API server; a virtual control
plane per tenant (vcluster, Kamaji) costs one control plane each; only a
cluster per tenant isolates the data plane. HNC and KubeFed are archived and
are not a basis.

**The questions a second cluster or tenant would force:**

1. **Is a Tenant above the Project?** If so, it owns namespaces, Secret Store
   paths, Flux Kustomizations, a Grafana organisation and perhaps a DNS zone.
   Capsule's group of namespaces inheriting policy is the closest shape.
2. **Where does a cluster enter?** As a further instance of Infrastructure
   Intent's `Cluster`, with placement choosing among clusters as it chooses
   among nodes, rather than as a separate placement mechanism (OCM's
   `Placement`, Karmada's `PropagationPolicy`).
3. **How does an edge cross clusters?** A Stable Address is an `ExternalName`
   that resolves only where the cluster DNS reaches its target
   ([0093](../model/0093-a-provider-is-reached-through-its-stable-address.md)).
   Across clusters it needs a shared name domain (the Multi-Cluster Services
   API's `clusterset.local`, Cilium's same-name global services) or a published
   endpoint, and the model must stay the source of truth for where a provider
   serves.
4. **What does a tenant see of observability?** A Grafana organisation per
   tenant isolates dashboards and data sources and shares nothing; a Mimir or
   Loki tenant needs an authenticating proxy that sets `X-Scope-OrgID` on every
   path.
5. **Which single-cluster assumptions break?** One Secret Store with one
   Kubernetes auth mount, one Flux root holding cluster-admin, one Release
   Gate, `ExternalName` addresses, and namespace-scoped default-deny policy,
   which says nothing about traffic between clusters.
6. **Delivery stays pull.** OCM's agents pull their work as Flux pulls its pin;
   a push model would move the trust boundary.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Model clusters and tenants now | ready for growth | machinery for a scale the estate does not have, the root cause 0001 records |
| Leave the cluster implicit | nothing written | a second cluster becomes a new model rather than a second instance |
| A cluster dimension on placement now | small | a dimension that can only ever match one value teaches authors that filters do nothing |

## Reversibility

Undo cost today: this record. Becomes irreversible once: a second cluster or
tenant exists, at which point each question above is a decision with a record
of its own.

## Consequences

- A second cluster or tenant starts from these questions and the research,
  not from scratch, paid by whoever proposes it.
- `Cluster` is written in Infrastructure Intent with one instance, and a
  second is a schema refusal until this record is unparked.
