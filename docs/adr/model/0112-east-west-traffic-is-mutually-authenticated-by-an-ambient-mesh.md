---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-20
normative: spec/v1/60-setup.md#service-mesh
rests-on: ["0001", "0002", "0005"]
---

# East-west traffic is mutually authenticated by an ambient mesh, Istio's ztunnel on every node, and Kiali shows who reaches whom

Every connection between two enrolled Processes is mutual TLS, carrying the
SPIFFE identity of each side's ServiceAccount, without a sidecar in any
Process and without a change to what a consumer dials. Istio in ambient mode
supplies it: one `ztunnel` per node, istiod's built-in CA, and Kiali as the
view of which Process reaches which. The direction is fixed and the fit is
not: nothing is enrolled until the drills settle. The parts, the exclusions
and the settling test are
[chapter 60](../../../spec/v1/60-setup.md#service-mesh)'s; the evidence is
[`docs/research/service-mesh.md`](../../research/service-mesh.md).

## Rests on

One maintainer runs one cluster ([0001](0001-estate-scale-and-ownership.md)),
so one mesh, one trust domain and one CA cover the estate, and the cost that
matters is per node, not per Process. Kubernetes is kept for its
authorisation boundary and its single applier
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)): a ServiceAccount
is already the identity a Process runs as, so the mesh adds no second
identity, and a view-only Kiali leaves Flux the only writer of mesh objects.
The flows a Process needs are its declared edges
([0005](0005-derivation-is-total.md)), so an identity-based allow set can be
derived from the same edges the network policy is.

**False if:** ztunnel's working set on a Raspberry Pi over 24 h does not fit
the reserve the node contract publishes; an enrolled consumer reaching a
provider through its alias is not shown as mutual TLS; or an eligible
namespace still receives plaintext after 14 days in permissive mode.
**Settled by:** the five drills in
[`docs/research/service-mesh.md`](../../research/service-mesh.md#drills),
owned by joris.

## Why

**Nothing east-west carries an identity.** Network policy is rendered but not
enforced ([0035](0035-network-policy-is-default-deny-and-render-only.md)),
and even enforced it admits by pod address, not by who is calling. Bytes
between nodes already ride the nodes' Tailscale WireGuard tunnels, so the gap
is authentication, and confidentiality only for bytes that stay on one node.

**Ambient, because the cost is per node.** A sidecar mesh puts a proxy and an
injection restart into every Process; ztunnel is one agent per node, and
enrolment is a namespace label. On the 4 GiB Pis that is the difference
between one footprint and one per Process. The Pi 4 has no AES instructions
and ztunnel offers only AES-GCM, measured at about one core per 560 Mbit/s;
the Pis serve frontends and controllers, so that cost is accepted rather
than designed around.

**Istio, for the audit stage and the view.** ztunnel can evaluate an
authorisation policy in dry-run, which gives
[0035](0035-network-policy-is-default-deny-and-render-only.md) a second
candidate for the stage that observes before it enforces, without replacing
the CNI. Kiali draws the traffic graph with each edge's mutual-TLS state, the
view this decision exists to give.

**Not the indirection, and not the release gate.** The mesh changes nothing a
consumer dials: the [alias](0109-a-consumer-reaches-its-provider-by-its-application-id.md)
and the [Stable Address](0093-a-provider-is-reached-through-its-stable-address.md)
stay DNS, so the reason that record rejected a mesh as the indirection still
holds. The release barrier stays the small controller
[0052](0052-an-application-is-the-release-unit.md) chose over a mesh; ztunnel
carries bytes, it gates nothing.

**The built-in CA and OpenID, because they add nothing to run.** istiod's CA
needs no component in the issuance path; a Vault-signed intermediate or
cert-manager's istio-csr buys an off-cluster root that a single cluster does
not need yet. Kiali signs in through the API server's existing OIDC client
until the estate's identity Application replaces it, so access follows the
same RBAC as every other operator tool.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep plaintext and rely on the nodes' WireGuard | nothing to run | no identity on any connection, and nothing on bytes that stay on one node |
| Istio in sidecar mode | the same identity, L7 everywhere | a proxy and an injection restart in every Process, paid in memory on the Pis |
| Linkerd | a lighter sidecar mesh | still one proxy per Process, and stable releases are no longer published as open source |
| Cilium mutual authentication | arrives with the CNI [0035](0035-network-policy-is-default-deny-and-render-only.md) points at | authenticates out of band and leaves encryption to WireGuard, which the nodes already have, and waits on the CNI migration |
| Consul | a registry and a mesh | a second service registry beside the one the edge set already is |
| TLS terminated by each Application, certificates from cert-manager | no mesh component | every Application's owner configures and rotates TLS by hand, and nothing shows the graph |

## Reversibility

Undo cost today: nothing is enrolled, so removing the four charts and Kiali:
an hour. Becomes costly once: an Application authorises a caller by its mesh
identity instead of its own credentials, or the derived allow set lives only
in authorisation policies rather than beside the network policy, since
removing the mesh would then open what it closed.

## Consequences

- Before any namespace is enrolled, the `networking` adapter's allow set
  admits the mesh's tunnel port beside each application port, a change to
  [chapter 16](../../../spec/v1/16-dependencies.md#network-policy) that lands
  with the first enrolment.
- Chapter 16's statement that in-cluster HTTP surfaces carry no TLS between
  Processes stays true until then, and is rewritten in the same pull request
  that enrols the first namespace.
- An authorisation policy per edge, derived like the network policy, is the
  next decision this one opens; it is not taken here.
- The admission-webhook Processes and qBittorrent stay outside the mesh, and
  each one is a named exception in chapter 60, not a silent gap.
- Kiali's sign-in moves to the identity Application when that lands, a change
  to chapter 60's table and nothing else.
