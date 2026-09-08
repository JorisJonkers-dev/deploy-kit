---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/40-composition.md#references
rests-on: ["0005"]
---

# An edge resolves against the union or the unmanaged register, and the register carries coordinates

> **Amended 2026-09-08.** The register this ADR extended is split
> ([0095](0095-platform-intent-is-the-second-authored-document.md)). A target the
> estate *depends on* — `stalwart` with an address and surfaces — is a
> **provider**, a fact in the Platform document
> ([chapter 14](../../../spec/v1/14-platform-intent.md#providers)), and that is
> what an edge resolves against; the error for a missing address is
> `E_PROVIDER_WITHOUT_COORDINATES`. The Registered Unmanaged Surface ledger
> keeps only hostnames nobody deploys and nobody depends on. The decision this
> ADR records — an edge has two namespaces and the second carries coordinates —
> is unchanged; the second namespace is providers rather than the ledger, so an
> edge resolves against facts and never against exemptions.

## Rests on
Every provider a Workload depends on is either deployed by this model or
registered as something the estate runs and does not deploy, so an edge has
exactly two namespaces to resolve against and no third case. False if: a
Workload legitimately depends on something in neither — an internet endpoint
that belongs in no register — often enough that registering it is the wrong
shape. Settled by: rendering the estate with `auth`'s SMTP edge deriving an
egress rule to `stalwart`'s registered address, and no rendered policy missing a
rule for any declared edge.

## Why
`E_UNRESOLVED_SERVICE` already refuses an edge naming a Service that is not in
the union, so the silent case is subtler and worse: an edge naming something the
estate **has** but the model does not deploy. `{service: stalwart, surface:
smtp}` is the live example. Nothing resolved, so nothing derived — no
coordinates, therefore no egress rule — and the result is a *valid* policy that
is short one rule. The on-call sees a connection timeout; no gate goes red. The
absence is invisible precisely because default-deny makes absence the enforcement
mechanism.

[0019](0019-registered-unmanaged-surfaces.md) already carries the namespace this
needs. Every hostname the model does not deploy is a Registered Unmanaged Surface
with an owner, a reason and a review date — `samba` as a NixOS module, `wolf`
deployed in neither target, host-level daemons with no cluster presence. Making
an edge resolvable against that register turns "the provider is outside the
model" from silence into a lookup.

What the register lacked is **coordinates**. An unmanaged target has no pod
selector, so a derived rule has nothing to select; the entry therefore carries
the address the provider answers on and the ports it serves, keyed by surface
name, and an entry an edge targets without them is
`E_UNMANAGED_SURFACE_WITHOUT_COORDINATES`. They are platform data by
[0004](0004-contention-decides-authority.md) — an estate-unique endpoint drawing
on shared network — so they sit with the rest of the Platform Intent, and moving
`stalwart` to another host is one republish rather than an edit in every
consumer.

Letting the consumer name a host or CIDR was the alternative and it fails twice:
an address is a mechanism, which layer 1 excludes, and the same endpoint would be
written once per consumer — the shape chapter 16 already cites as a derivation
waiting to happen, where `auth-api` hand-maintains nine hostnames in
`AUTH_CORS_ALLOWED_ORIGINS`.

Treating an external provider as not-an-edge was the other alternative. `auth`
depends on `stalwart` for SMTP in fact; a model in which that dependency exists
nowhere is the model that lost the rule in the first place.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Union Services only; an external provider is not an edge | Keeps the edge set purely internal | The dependency exists in fact and would exist nowhere in the model — the condition that produced R18 |
| A raw host or CIDR in the edge | Derivable with no lookup | An address is a mechanism, and the same endpoint gets written into every consumer that needs it |
| No coordinates: widen egress to the node network for such edges | Always works, nothing to declare | A blanket allow to the node network is the east-west openness default-deny exists to close |
| Warn on an unresolved target and continue | Nothing blocks | A warning is a log line here, and the failure it describes is already invisible on-call |

## Reversibility
Undo cost today: the register gains a field and the resolver gains a namespace —
both deletable while nothing depends on the derived rules. Becomes irreversible
once: policies are enforced and consumers reach unmanaged providers through
derived rules, because removing the namespace then cuts live traffic.

## Consequences
- R18 closes: a declared edge either derives a rule or fails the render, so a
  rendered policy is no longer silently short — paid by nobody, and it removes a
  class of on-call timeout.
- The register becomes an input to derivation rather than a ledger of
  exemptions, so an entry's coordinates going stale breaks traffic the way any
  wrong platform fact does — paid by whoever moves a host, and the review date
  each entry already carries is now load-bearing.
- Every unmanaged surface an edge targets needs an address before the estate
  renders, so `stalwart`'s SMTP coordinates are one of the Platform Intent inputs
  the example set still owes — paid once, per surface.
- An edge to an unmanaged surface derives egress and **no ingress**, because the
  provider is not a pod this model selects; the provider's own firewall is
  outside the model and stays so — paid in an asymmetry worth knowing about.
- A register entry with no edge pointing at it stays a pure ledger entry, so the
  two roles coexist in one document — paid in one document doing two jobs, which
  0019 already accepted when it made the register a ledger.
