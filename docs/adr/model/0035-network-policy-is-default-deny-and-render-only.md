---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/16-dependencies.md#network-policy
rests-on: ["0002", "0003", "0005"]
---

# Network policy is default-deny, derived from the edge set by one `networking` adapter, rendered but not promoted until a CNI with an audit stage is chosen

Every project gets one namespace-wide default-deny, and every Process a policy
whose allow set is derived from its declared edges, its surfaces, its routes,
its grants and a fixed platform baseline no Application authors (DNS on UDP/53
for every policy carrying Egress, the Secret Store for grant holders). One
adapter, `networking`, emits every NetworkPolicy in the estate. The policy set
moves through three stages, render-only, audit and enforce, and v1 is at
render-only: the tree is complete and reviewable, and promotion waits on the
choice of a CNI whose policy stage can observe without dropping
([chapter 16](../../../spec/v1/16-dependencies.md#audit-before-enforce)). The
candidate is Cilium, to be evaluated
([chapter 60](../../../spec/v1/60-setup.md#cni)).

## Rests on

The flows a Process legitimately needs are its declared edges plus the
baseline, and the edge set is complete
([0024](0024-dependency-edges-resolve-against-the-union.md)), so the allow set
is derived ([0005](0005-derivation-is-total.md)) on the substrate kept for its
enforcement boundary ([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)).
Rendering the set has value without enforcing it: the tree is diffable, and the
model's obligation is discharged at layer 3 ([0003](0003-three-model-pipeline.md)).

**False if:** a flow observed during the audit window matches no edge and no
baseline rule yet is legitimate; a rendered-but-unenforced set misleads someone
into believing the estate is segmented; or Cilium's agent displaces Processes on
the single control-plane host. **Settled by:** the conftest assertion that every
rendered policy carrying `Egress` also matches UDP/53, with `networking` the only
producer of the kind; and a lab evaluation on the pinned k3s version (install
with `--flannel-backend=none --disable-network-policy`, 24 h of agent memory and
CPU, and an undeclared connection that succeeds and appears as a would-be-deny),
owned by joris.

## Why

**Opt-in enforcement lost.** Three NetworkPolicy objects existed for roughly
thirty Processes, so the cluster was open east-west. Default-deny is expressible
only because the edge set is complete.

**The baseline is not optional.** The replaced generation emitted an egress rule
to the provider's pod and nothing else, so the consumer could not resolve the
service name the coordinate derivation handed it, and failed with a DNS timeout
diagnosed as "Postgres is down". One producer makes the DNS rule a property of
one adapter.

**One producer per kind.** The default-deny is one object per project, not per
Application, so it fits no Application-keyed adapter; with path authority in
layer 2 ([0036](0036-path-authority-is-layer-2.md)) it has one owner and one
path.

**Audit is a dependency, not a mitigation.** `networking.k8s.io/v1` has no audit,
dry-run or log-only mode, and k3s's bundled kube-router controller has none; a
policy is enforced the moment it selects a pod. Enforcing `data-system`'s
policies on day one would cut five live consumers off the datastore. So the
render does not wait on the CNI; the promotion does. For the length of the
render-only stage the estate is segmented on paper and open east-west in fact,
stated rather than hidden.

**Whether a delivered render applies the policy set is open.** Flux applies each
Project's share of the render ([0050](0050-delivery-is-part-of-the-model.md)),
and a policy file listed in an applied kustomization is enforced on first sync.
Keeping the set out of every applied kustomization until promotion is the
proposal awaiting the maintainer's decision.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Opt-in policies per Application | nothing enforced unless asked | three of thirty adopted it |
| Enforce from the first apply | segmentation on day one | cuts live consumers the audit would have found |
| Emit policies with a selector matching nothing | a tree that looks complete | a policy that lies about what is in force |
| Policy emitted by the route or workload adapter | fewer adapters | the default-deny is per project, and the DNS rule would span adapters |
| Wait for the CNI before rendering | nothing unenforced in the tree | puts a lab evaluation on the model's critical path |

## Reversibility

Undo cost today: the adapter and the baseline rules are one module: a day.
Becomes irreversible once: enforcement is promoted and Processes depend on the
allow set being complete, because relaxing it then reopens flows nobody declared.

## Consequences

- Every new flow needs a declared edge, or it is dropped once enforcement lands,
  paid by the Application author.
- The estate stays open east-west until the CNI evaluation and the audit window
  complete, paid in risk, stated in the tree.
- A CNI change replaces flannel and the bundled controller on every node, paid
  by joris in one maintenance window.
