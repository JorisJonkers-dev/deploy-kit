---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/10-project-intent.md#exposure
rests-on: ["0004", "0005"]
---

# Exposure is declared by Audience on an authored host, route precedence is derived, and the tier names its forward-auth endpoint

An Application declares exposure: a hostname, authored as the full FQDN, with an
**Audience** from one closed vocabulary (`anonymous`, `authenticated`,
`internal`, `lan`), and routes to the Processes behind it. The host is written
once and referenced by placeholder thereafter. Forward-auth, the
security-headers baseline, entryPoint, TLS, the middleware chain and the health
endpoint derive from the audience and the tier. Route precedence derives from
specificity (`exact` before `prefix`, longer prefix before shorter) and is
rendered explicitly. Two routes on one host with the same `path` and `match` are
refused. Each tier that serves `authenticated` names its forward-auth endpoint
in the Platform document, and the `traefik` adapter emits every Middleware the
routes reference ([chapter 20](../../../spec/v1/20-resolved-deployment.md#the-forward-auth-endpoint)).

## Rests on

An authored host with a uniqueness check arbitrated at composition is safer than
a derived one: a duplicate fails loudly and a wrong derivation does not.
Uniqueness is contended, so the platform arbitrates it; the audience of a
surface is contended by nobody, so it is declared
([0004](0004-contention-decides-authority.md)). Which route serves a request is
a routing decision, and a decision that determines behaviour is one the model
makes ([0005](0005-derivation-is-total.md)).

**False if:** a derivation exists that is right for every live host, a routed
surface needs an audience the set cannot express, or two routes on one host need
an order specificity does not produce. **Settled by:** the live host list read
against Application ids (`kb` and `knowledge` both resolve; `status` and
`dashboard` belong to no Application), every `authMode`, `auth.scope` and tier
`authModes` value mapped onto exactly one audience, and `auth`'s `/api` rendered
ahead of `/` by derivation.

## Why

**One hostname lived in seven places.** `kb.jorisjonkers.dev` was declared in
seven authoritative places, with two conformance tests existing only to detect
their disagreement. The fix was single declaration, not derivation: six of the
seven now resolve `${exposure:<application>.<name>#url}`.

**Exposure sits on the Application** because one host can front several
Processes: `auth.jorisjonkers.dev/api` routes to `auth-api` and `/` to
`auth-ui`. `provides` stays on the Process: a port is a property of a process, a
hostname is not.

**Three vocabularies became one.** Route `authMode`, `auth.scope` and tier
`authModes` described one concept three ways. Four audiences cover every routed
surface.

**Precedence was a proxy's tie-break.** `/api/foo` reached `auth-api` because
Traefik sorts rules by length then name, behaviour of one proxy version that the
estate's most common exposure shape depended on. Deriving and rendering the
order makes the document say what the edge does. Refusing overlaps would refuse
that normal case.

**The endpoint is the tier's.** A forward-auth Middleware must name the address
performing the check. Deriving it from `auth-api`'s surface would write one
Application's id into a platform derivation. The address is estate-unique and
platform-assigned, so it sits on the tier that serves `authenticated`. Without
it, an `authenticated` route is `E_NO_FORWARD_AUTH_ENDPOINT`, instead of a 500
at the edge on a route nobody tested. The Middleware set follows from which
audiences and content policies routes declare, so it is rendered, not a fixture.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Derive the host from the Application id | nothing authored | right for most hosts and silently wrong for the rest |
| Exposure on the Process | one level fewer | one host fronting two Processes is unexpressible |
| Rely on the proxy's ordering | right for every route today | correctness rests on one proxy's undocumented tie-break |
| Author a priority per route | full control | every author holds a whole host's routing in their head |
| Middleware as a hand-written fixture | nothing to derive | a superset of a derived set, which drifts |
| One global forward-auth address | one field | every tier carries a fact most do not use |

## Reversibility

Undo cost today: the audience vocabulary and the precedence derivation are one
schema block and one ordering rule: a day. Becomes irreversible once: consumers
across repositories resolve hosts through `${exposure:…}` placeholders.

## Consequences

- Every host is authored once and checked for uniqueness at composition, paid
  by the Application author in one field.
- A change in route ordering appears in a diff, and a proxy upgrade that
  tie-breaks differently changes nothing.
- A tier serving `authenticated` must name its endpoint, paid by the platform
  owner once per tier.
- A route needing a shorter prefix to win over a longer one cannot be
  expressed, which the estate has no case of.
