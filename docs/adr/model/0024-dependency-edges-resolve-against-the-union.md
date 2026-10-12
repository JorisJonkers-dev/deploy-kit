---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/16-dependencies.md#dependency-edges
rests-on: ["0004", "0005"]
---

# A dependency edge names the provider, the surface and necessity, and resolves against the union or a provider the Platform document records

A dependency edge is a triple: the provider (an Application Id, or a provider
the Platform document records), one surface the provider declares, and whether
the consumer requires it. It resolves against the composed union first, then
against the Platform document's providers, which carry an address and surfaces.
Never against an exemption. A provider without coordinates is
`E_PROVIDER_WITHOUT_COORDINATES`; a provider in neither namespace is
`E_UNRESOLVED_APPLICATION`. A hostname the model does not deploy and nobody
depends on is a **Registered Unmanaged Surface**, with an owner, a reason and a
review date, and composition asserts that estate reachability equals the
derived set plus the registered set exactly
([chapter 40](../../../spec/v1/40-composition.md#unmanaged-surfaces)).

## Rests on

Every cross-application connection in the live estate is expressible as that
triple, and every dependency derivation (coordinates, egress, ordering) is a
function of it ([0005](0005-derivation-is-total.md)). A hostname is unique
estate-wide, so it is contended and takes exactly one authoritative form; for a
host the model does not deploy, that form can only be a registration
([0004](0004-contention-decides-authority.md)).

**False if:** a live connection needs an address or port no `provides` entry or
provider record can name, a Process legitimately depends on something in
neither namespace often enough that recording it is the wrong shape, or a
hostname is neither derivable nor attributable to one owner. **Settled by:** the
host:port literals and endpoint-shaped keys of every first-party env file
matched to a `provides` entry; `auth`'s SMTP edge deriving an egress rule to
`stalwart`'s recorded address; and `derived ∪ registered` diffed against
`homelab-inventory/catalog/reachability.yml` with an empty symmetric difference.

## Why

**An id alone is not enough.** A dependency with no credential (`knowledge`
calling `auth-api` over HTTP) produced neither a policy nor a coordinate in the
replaced generation, and a consumer may not author the derived URL as a literal
([0013](0013-configuration-is-dotenv-at-three-scopes.md)). Naming the surface
gives the coordinate a home and puts the port in one place. One edge then derives
the coordinates, the NetworkPolicy egress
([0035](0035-network-policy-is-default-deny-and-render-only.md)) and the Reconcile
Unit ordering ([0033](0033-reconcile-unit-derived.md)).

**The silent case is a provider the estate has but does not deploy.**
`{application: stalwart, surface: smtp}` resolved against nothing, so nothing
derived: a valid policy short one rule, seen by on-call as a timeout. Default-deny
makes absence the enforcement mechanism, so the absence is invisible. Resolving
against recorded providers turns "outside the model" into a lookup.

**A provider is a fact, not an exemption.** What the estate depends on carries an
address and surfaces in the Platform document
([0045](0045-platform-intent-is-the-second-authored-document.md)). The register
keeps only hostnames nobody depends on (`samba`, `wolf`, host-level daemons), so
an edge never resolves against a hole in the ledger
([0038](0038-bidirectional-ledgers.md)).

**Registration bounds the remainder without modelling it.** Rendering NixOS
would be an order of magnitude larger v1, so Project Intent stays
Kubernetes-only. An unbounded remainder is how the seven-way split of one host
began; set equality against the reachability channel bounds it.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| An edge names only the provider id | fewer fields | a no-credential dependency gets neither a coordinate nor a policy |
| The consumer authors the address | direct | a derived value written as a literal |
| Resolve edges against the unmanaged register | one list | an edge would resolve against an exemption with no coordinates |
| Model NixOS and host-level applications | one model for everything | an order of magnitude larger v1 |
| Let unknown hostnames pass | nothing to register | an unbounded remainder is where drift went unchecked |

## Reversibility

Undo cost today: the edge shape is one authored block and three derivations:
days. Becomes irreversible once: consumers across repositories resolve
coordinates through `${dependency:…}` placeholders.

## Consequences

- Every provider surface is declared once and referred to by name, so a port
  change is one edit, paid by the provider's author.
- The coordinate an edge derives is the surface's Stable Address, never the
  providing Process's own Service, so where a provider runs is a fact no
  consumer's render carries
  ([0093](0093-a-provider-is-reached-through-its-stable-address.md)).
- A dependency on a host the estate does not deploy needs a provider record in
  the Platform document, paid by the platform owner.
- Every registered hostname carries a review date, and an overdue one fails
  composition, paid by its owner.
