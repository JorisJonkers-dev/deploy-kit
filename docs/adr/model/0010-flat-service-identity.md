---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#service-identity
rests-on: ["0004"]
---

# One flat Service Id

A Service is identified by one short string, unique across the estate, and that
string is the only identity another Service may reference. The id is the
repository or product name. The namespace derives from the Service's domain
([0063](0063-intent-authored-per-domain.md)); Workload names and image
references are authored, not derived; there is no alias mechanism.

## Rests on

Identity is the estate's most contended surface — dependency edges, Vault paths
and route ownership all resolve through it — so per
[0004](0004-contention-decides-authority.md) it takes exactly one authoritative
form, while the namespace is derivable from the domain and Workload and image
names are properties of the processes themselves. False if: two Services
genuinely require the same id, or a live coordinate turns up that is neither
derivable from the domain nor already authored explicitly. Settled by: composing
the full participants list and asserting zero `E_DUPLICATE_SERVICE_ID`
occurrences and that every namespace it renders is `<domain>-system`.

## Why

Take the case the alias field was invented for.
`fleet-infra/docs/live-divergence.md` records it as a rename — *"the service
repository is home-portal; live called the image app-ui"* — and the model
carried an `alias` to explain it. Under this decision there is nothing to
explain. The Service id is the repository name, `home-portal`. The Workload is
called what the process is called, `app-ui`, and so is its image, because a
Workload name is a process name and never a derivative of the id. The namespace
is `app-system` because the domain is `app`
([0063](0063-intent-authored-per-domain.md)). Nothing moves and nothing is
aliased: the prose row describes a divergence that no longer exists.

Flat uniqueness cannot be had by construction, only by check: the id is a bare
string with no domain or repository path inside it, so nothing structural stops
two repositories claiming the same string. Uniqueness is therefore a composition-time check —
`E_DUPLICATE_SERVICE_ID`, specified in
[chapter 40](../../../spec/v1/40-composition.md) — and the window in which two
repositories both claim an id, open until composition runs, is an accepted
cost.

An alias field would have nothing left to carry. The namespace comes from the
domain, the Workload name and the image are already authored, and the one
divergence an alias still expressed — a namespace of its own choosing — is
exactly the move that lets a Service claim another domain's namespace. Deleting
the field deletes that move with it.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Domain-qualified id (`data/platform-postgres`), mirroring the vault claim format and the collection layout | every inbound reference and Vault path embeds the domain, so a domain move is an estate-wide rename | moving a Service between domains would rename it and break every inbound reference and Vault path |
| Location-derived URN (`svc:<org>/<repo>`), unique by construction and self-resolving | identity welds to repository layout; splitting or merging a repository renames its Services | `homelab-collections` holds three Services in one repository, so the repo coordinate does not identify a Service |

## Reversibility

Undo cost today: hours, not days — the identity rules live in
`spec/v1/10-service-intent.md#service-identity` and chapter 20's derivation
table, and only a handful of Service documents exist; no composed artifact has
been published against the scheme.
Becomes irreversible once: ids are baked into published composed artifacts,
Vault paths and other Services' dependency edges across the estate — from that
point a scheme change is the very estate-wide rename this decision exists to
avoid.

## Consequences

- Every cross-Service reference resolves through one string, and the namespace
  falls out of the domain — paid by authors, who give up encoding domain or
  location in the id.
- A deliberate divergence can no longer be recorded as data with a reason:
  there is no field for one, so a name that surprises a reader is explained in
  prose or not at all — paid by whoever next asks why the `home-portal`
  repository runs a process called `app-ui`.
- Uniqueness is enforced by `E_DUPLICATE_SERVICE_ID` at composition, not by
  construction; two repositories can claim one id until composition runs —
  paid by the aggregator operator, who discovers the collision only then.
- A namespace is no longer reachable from Service Intent at all: it is
  `<domain>-system` and nothing else, so the Services of one domain share one
  namespace and that namespace is not a trust boundary — paid by anyone who
  read co-location as isolation.
