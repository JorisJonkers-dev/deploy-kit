---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/20-resolved-deployment.md#the-forward-auth-endpoint
rests-on: ["0004"]
---

# Every Middleware has one producer, and the tier names its forward-auth endpoint

> **Amended 2026-09-08.** Two things moved. A tier declares four edge facts in
> the model's words — `audiences`, `listener`, `certificates`, `forwardAuth` —
> and the Traefik spelling is the adapter's
> ([0097](0097-authored-values-name-model-concepts.md),
> [chapter 14](../../../spec/v1/14-platform-intent.md#tiers)). And the
> middleware producer this ADR created is folded, with the two per-tier route
> adapters, into one `traefik` adapter that emits one route set and one
> middleware set per declared tier ([0098](0098-one-publication-path.md)). The
> decision that matters here — one producer for the Middleware kind, and the
> tier names the endpoint — is unchanged; the producer is now `traefik`.

## Rests on
The set of Middlewares the estate needs is derivable from the composed union —
one forward-auth per tier serving `authenticated`, one security-headers object
per content profile in use, one redirect per `redirectTo` — and the only fact
that derivation lacks is an address the platform owns. False if: a route needs a
middleware whose shape depends on something no declaration carries, or two
routes on one tier and audience need different chains. Settled by: rendering the
three worked domains and finding every middleware reference in every emitted
IngressRoute resolved by an object this adapter emitted.

## Why
`traefik-public` and `traefik-lan` emit IngressRoutes carrying middleware
*references*, and nothing emits the referents. Every `audience: authenticated`
route in the estate therefore resolves against an object that does not exist in
the rendered tree — the chain is derived in chapter 20's authority table and
produced nowhere.

The producer is its own adapter for the reason
[0074](0074-networking-adapter-emits-policy.md) gives for policy: one producer
per kind. The Middlewares are estate-scoped, not per-Service, and both route
adapters reference them, so making one route adapter the owner would mean a
lan-only change can require editing the public adapter and the shared object's
owner is decided by which adapter happened to receive it. A blueprint pack is
the other tempting answer and it is wrong for a different reason: *which*
middlewares are needed follows from which audiences and content policies routes
declare, so a fixture would be a hand-maintained superset of a derived set — the
drift the model exists to remove.

The endpoint is the interesting half. A forward-auth Middleware must name the
address that performs the check, and in this estate that address is `auth-api`.
Deriving it from `auth-api`'s own surface would write one Service's id into a
platform derivation and make the edge tree depend on resolving a Service, which
chapter 10 refuses in as many words: `auth-api`'s estate-wide role is this
middleware, *never an edge*.

By [0004](0004-contention-decides-authority.md) the address is
platform-assigned — the shared edge is finite and the endpoint is estate-unique
— so it belongs in the Platform Intent. It goes on the **tier** rather than in
one global field because a tier already declares which audiences it serves: the
address sits with the thing it is an attribute of, a tier serving no
`authenticated` route carries no endpoint and needs none, and two tiers with
different authenticating endpoints need no model change. A global fact would
have to be carried and ignored by every tier that does not use it.

A route declaring `audience: authenticated` on a tier with no endpoint is
`E_NO_FORWARD_AUTH_ENDPOINT` at derivation time. Without the check the failure is
a 500 at the edge on a route nobody tested, which is how the estate found this
class of defect before.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| `traefik-public` emits them, `traefik-lan` references | No registry change; middlewares live beside the routes using them | One adapter owns objects the other depends on, so a lan change edits the public adapter, and ownership is decided by accident of assignment |
| A blueprint pack fixture | 0013 already delivers fixtures at a pinned ref, and the security baseline is platform policy | The needed set follows from declared audiences and content policies, so a fixture is a hand-maintained superset that drifts from the routes |
| Derive the endpoint from the auth Service's surface | Nothing authored twice | Hardcodes a Service id into a platform derivation and makes the edge depend on resolving a Service, which chapter 10 refuses |
| One Platform Intent field for the estate | Simplest at one cluster and one auth Service | Every tier carries a fact most of them must ignore, and a second endpoint becomes a schema change rather than a value |

## Reversibility
Undo cost today: one adapter, its registry entry, and one field on the tier
declaration — deletable while nothing references the emitted objects. Becomes
irreversible once: live IngressRoutes reference middlewares this adapter owns,
because removing the producer then breaks every authenticated route at the edge
rather than at build time.

## Consequences
- 0052's set becomes nineteen, amended in place — paid in one amendment, and the
  count keeps doing its job.
- The Platform Intent's tier declaration grows a field, so the Platform schema
  and the example set both need it before a render can succeed; that is one of
  the missing-input rows the gap list already carries — paid by whoever
  republishes the context.
- A tier serving `authenticated` without an endpoint now fails the render rather
  than the request, which turns a 500 nobody tested into a build error — paid by
  the platform, once, at the moment the context is wrong.
- Two route adapters reference an object neither owns. That is allowed —
  attribution is per Deliverable and single authority is per field — but it means a
  reviewer reading `traefik-public` alone cannot see the whole chain — paid in
  one extra file to open, and the reason the chain is stated in chapter 20.
