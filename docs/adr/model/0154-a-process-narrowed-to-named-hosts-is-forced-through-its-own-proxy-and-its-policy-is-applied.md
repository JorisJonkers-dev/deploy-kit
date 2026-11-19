---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-11-19
normative: spec/v1/16-dependencies.md#host-narrowed-egress
rests-on: ["0002", "0005"]
---

# A Process narrowed to named hosts is forced through its own proxy, and its policy is applied

A Process may declare the hosts it reaches beyond its edges, with a reason. The
render derives an allowlisting forward proxy for it, a Process of its own on an
image the Platform document names, and a policy that lets the Process reach the
cluster's DNS, its edges and that proxy, and nothing else. The proxy's policy
lets it reach public IPv4 on the declared ports only, and its allow rules admit
the declared hosts and refuse every other request. Unlike the rest of the policy
set, these two policies are applied, not only rendered. Settled in
[Host-narrowed, enforced egress for a Process](https://github.com/JorisJonkers-dev/deploy-kit/issues/874).

## Rests on

The substrate is Kubernetes, kept for its enforcement boundary
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)), and the allow set
is derived from what a Process declares
([0005](0005-derivation-is-total.md)).

**False if:** a pod could reach a public address it did not declare, with its
policy loaded, by a path the proxy does not mediate; or the estate's CNI gained
policy by name and made the proxy a second mechanism for what one rule says.
**Settled by:** a container run of the rendered allowlist, from a client with no
route but the proxy, in which a declared host connects and an undeclared one
fails, and a rendered-policy test in which the Process's policy holds no rule to
an address; and, on the cluster, the same connection from the running pod,
owned by joris.

## Why

**The CNI cannot match names.** The estate runs flannel with k3s's embedded
policy controller (kube-router): the Platform document's `substrate` says so,
and the cluster agrees, with no Cilium or Calico object and no CNI beyond
flannel in `kube-system`. A `NetworkPolicy` there matches pods, namespaces and
address blocks. The options that name a host without changing the CNI are a
proxy the Process is forced through, and address sets refreshed from DNS, which
a CDN-fronted host (`github.com`, `api.github.com`) rotates faster than a
reconciler reads it and which cannot say which name an address was reached as.

**A proxy is a separate pod, never a sidecar.** A policy applies to a pod, so a
proxy in the Process's own pod would leave the Process able to dial out directly,
with the same address as the proxy. A Process of its own gives the proxy a
policy the Process does not share: the Process may reach it and nothing public,
and it may reach public addresses and nothing in the cluster.

**Two layers, so neither is trusted alone.** The proxy decides by name, on the
CONNECT or the request, and refuses a request that names an address, because a
destination matched by its reverse DNS would be the address owner's to name. The
proxy's policy decides by port and range, so a name that resolves to a private
or tailnet address is dropped by the network when it is not refused by the
proxy.

**Policy that is not loaded narrows nothing.** The `networking` adapter renders
every policy and applies none
([0035](0035-network-policy-is-default-deny-and-render-only.md)), to stay clear of
enforcing a default-deny that would cut live consumers off. A Process that
declares hosts has asked to be held to them. Its policy and its proxy's are
written to a file the kustomization lists, so the declaration is enforced where
the estate's controller already enforces every policy a kustomization loads
(`flux-system`, `data-system` and the legacy application sets run them today),
and the rest of the set stays where it was.

**The declaration is a form of `egress`, beside `to: internet`.** One field says
how a Process reaches beyond the cluster, with a reason either way; a closed
form of public names and ports cannot widen the way a pattern or an address
could.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Cilium `toFQDNs` or Calico DNS policy | policy by name in the CNI, no proxy to run | replaces flannel and the bundled controller on every node in one maintenance window, an owner action the model cannot make, and renders an object no other CNI honours |
| Per-host address sets refreshed from DNS | no proxy, a plain `ipBlock` | the set lags a rotation, admits every tenant behind a shared address, and needs a controller the estate does not run |
| A shared egress-gateway Process with one allowlist | one proxy for the estate | a source cannot be told by address from another's, so each Process would reach the union of every allowlist |
| A proxy sidecar in the Process's pod | no second Process | the pod's policy is one policy: the Process could dial out beside the proxy |
| Render the policy only, as the rest of the set | no change to what is applied | nothing enforces the declaration |
| Apply the whole policy set with the first narrowed Process | one decision | enforces default-deny on consumers nobody has audited |

## Reversibility

Cheap while few Processes narrow. The field and the platform block are optional,
and removing a declaration removes the proxy and returns the Process's policy to
the render-only file. It becomes irreversible once a Process's callers rely on
the allowlist's absence of a host.

## Consequences

- A Process that narrows its egress declares hosts by name, and a Platform
  document that names no `egressProxy` refuses it (`E_NO_EGRESS_PROXY`). The
  platform names a squid image the images lock pins, paid by joris once.
- Each such Process gains a Deployment, a Service and a ConfigMap, a pod's
  memory and CPU, and an applied policy pair. The proxy's name, `<process>-egress`,
  is the derived name of a Process of the Application.
- A client reaches the proxy through `HTTPS_PROXY` and its siblings. A client
  that ignores them cannot reach an address, which is the property, and a client
  that cannot be proxied (a protocol that is not HTTP over CONNECT) cannot reach
  its host.
- The Process keeps the cluster's DNS, so a name can still be resolved, and a
  covert channel in DNS queries stays open. Narrowing it means a resolver of the
  Process's own, a later decision.
- The Process's policy is applied whole: its ingress admits the proxies, the
  consumers and the probes the derivation names, and a caller the derivation
  does not name is dropped, paid by whoever declares the Process.
- A host's address block may be shared with a name not declared, so the proxy's
  name rule is what separates them, and the proxy image's allowlist behaviour is
  part of the Process's trust boundary.
- The estate's adoption of a promoted policy set stays a separate decision, and
  waits on the same audit as before.
