---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#exposure
rests-on: ["0004"]
---

# Exposure is declared by Audience, in one closed vocabulary

> **Amended 2026-09-08.** "entryPoint, TLS" below are Traefik's words for what
> a tier now declares as `listener` and `certificates` in the Platform document
> ([chapter 14](../../../spec/v1/14-platform-intent.md#tiers),
> [0097](0097-authored-values-name-model-concepts.md)); the derivation this ADR
> records is unchanged, and the Traefik spelling is the `traefik` adapter's. The
> fragment producers named in the evidence are deleted
> ([0098](0098-one-publication-path.md)).

A **Service** declares exposure: a hostname, authored as the full FQDN, carrying
an **Audience**, with routes to the Workloads behind it and per-path audiences
where they differ. The host is written once and referenced by placeholder
thereafter; forward-auth, the security-headers baseline, entryPoint, TLS, the
middleware chain, the reachability entry and the health endpoint all derive from
the audience and the tier. `provides` stays on the Workload: a port is a
property of a process, a hostname is not.

## Rests on

An authored host with a uniqueness check arbitrated at composition is safer than
a derived one, because a duplicate fails loudly and a wrong derivation does not.
False if: a derivation exists that is right for every live host. Settled by: the
live host list read against Service ids: `knowledge.jorisjonkers.dev` and
`kb.jorisjonkers.dev` both resolve; `platform-rabbitmq` serves
`rabbitmq.jorisjonkers.dev`; `root`, `status`, `dashboard` and `faro` belong to
no Service at all. A derivation would be right for most and silently wrong for
the rest, and the wrong ones are the ones nobody checks. Uniqueness is contended
and so is arbitrated by the platform, which is
[0004](0004-contention-decides-authority.md) as restated: contention decides who
arbitrates, not who authors.

The audience half is unchanged. The audience of a surface is contended by nobody
and so is declared, and one closed vocabulary of four values (`anonymous`,
`authenticated`, `internal`, `lan`) covers every routed surface in the estate.
False if: a routed surface needs an audience the set cannot express, or two
consumers of one surface need audiences that cannot both derive from one
declaration. Settled by: mapping every `route.authMode`, `auth.scope` and tier
`authModes` value onto exactly one audience, rendering all four routed services,
and asserting the derived IngressRoutes match those served today, zero unmapped.

## Why

One hostname, `kb.jorisjonkers.dev`, was declared in seven authoritative places.
That evidence stands, and it is the reason the host is declared **once** (on the
Service's exposure entry) and referenced by placeholder everywhere else. Six of
the seven derive from that one declaration: the reachability channel, both edge
catalogs, both Traefik IngressRoutes and the Gatus endpoint, with consumers
resolving `${exposure:<service>.<name>#url}` instead of repeating the literal.
The two conformance tests that existed only to detect their disagreement become
unnecessary, not merely green. The defect was seven authorities for one value;
the fix was never derivation, it was single declaration.

Exposure sits on the Service because a hostname can front more than one Workload
and that case is unexpressible one level down: `auth.jorisjonkers.dev/api` routes
to `auth-api` and `/` to `auth-ui`. At the Workload level the two can only reach
one host by each repeating its name.

The deeper defect was that one concept carried three disjoint vocabularies:

| where | values |
|---|---|
| service `route.authMode` | `anonymous`, `sso`, `forward-auth` |
| tier `authModes` | `forward-auth`, `internal`, `lan` |
| rule `auth.scope` | `anonymous`, `authenticated`, `application` |

Only `forward-auth` and `anonymous` appeared in two of them; `sso`, `internal`,
`lan`, `authenticated` and `application` each appeared in exactly one: seven
distinct values across three vocabularies. Because the
values were never comparable, the gate that should have caught this could not,
and it did not fire anyway. `validateDeploymentSemantics` checks `authMode`
against a tier only `if (tier && …)`: `src/deployment/v2-model.ts:199-203` takes
the tier from the optional `route.expose?.tier` and skips the check when it is
absent, and three of the four routed services declare no `expose.tier` at all:
`auth-api` (`anonymous`), `agents-api` (`sso`) and `home-portal` (`anonymous`),
every one on a public `*.jorisjonkers.dev` hostname whose only tier permits
`forward-auth` alone. `E_ROUTE_AUTH_MODE_NOT_IN_TIER` was implemented, had an
error code, and was vacuous exactly where it mattered.

One Audience vocabulary, shared by Services and route tiers, makes that class of
bug impossible: the two can no longer say the same thing in different words.
Undeployed hostnames are bounded by [0019](0019-registered-unmanaged-surfaces.md).

Counting the live edge shows how little of it is authored. `forwardAuth` has 3
definitions and 15 references, all derivable from `audience: authenticated`; the
7 `headers` middlewares are one security baseline plus a choice between three
content-policy profiles; both `chain` middlewares are composition. What remains
is 2 `redirectRegex` rules and the profile choice, so the authored proxy
vocabulary is exactly two fields, `contentPolicy` on an exposure and `redirectTo`
on a route. No timeout, rate limit, IP allowlist, basic auth, compression, retry
or circuit breaker exists anywhere in the estate, and none is invented here.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the three vocabularies; make `expose.tier` required and add a mapping table between them | every routed service repository is edited (the same migration cost as this decision) plus a hand-maintained 3×7 mapping table | the table is a fourth authority free to drift from the three it joins, and the gate it repairs already existed, had an error code, and was vacuous |
| Derive `<service>.<zone>` from a zone in the Platform Intent | no host is authored anywhere, and a zone mapping already exists in the reachability channels; right for `auth` and `knowledge` today | silently wrong for `kb`, for `rabbitmq` under Service `platform-rabbitmq`, and for every platform host belonging to no Service, and the wrong ones are the ones nobody checks. A derivation right for most is worse than none, because it is trusted |
| Author `host` on the Workload, repeated by each Workload behind it | no new nesting; the exposure block stays where it already sits | two Workloads can disagree about their own hostname, and the disagreement renders as two IngressRoutes rather than an error. One host fronting several Workloads is expressible only by repeating the string |

## Reversibility

Undo cost today: hours, one spec edit, the exposure block moving back to the
Workload, and four modules that read `authMode` (`src/deployment/v2-model.ts`,
`src/adapters/fragment-model.ts`, and the Traefik route and edge-catalog fragment
adapters), old fields still standing alongside, four routed services affected.
Becomes irreversible once: those repositories drop `authMode` and `auth.scope`,
consumers replace literal hostnames with `${exposure:…}` placeholders, and the
edge catalogs and Gatus ConfigMap stop being authored, restoring them means
re-authoring six derived artefacts by hand from a render that no longer emits
them.

## Consequences

- Six of seven hostname declarations stop being authored and become renders of
  the one on the Service, with consumers referencing it by placeholder: paid by
  service owners, who write the host once and may no longer paste it.
- `E_DUPLICATE_HOST` is now the whole of what stands between two Services
  claiming one hostname, and it is a composition check over the composed union
  together with Registered Unmanaged Surfaces, not a structural guarantee. A
  fragment that never reaches the union is never checked: paid by whoever
  composes, and by anyone reading a per-repository build as proof.
- `exposure[].name` is finally defined (required, unique within the Service),
  so `E_DUPLICATE_EXPOSURE_NAME` stops checking a name nothing declared, and
  `E_DUPLICATE_ROUTE_MATCH` catches the identical IngressRoute matches the auth
  example renders today: paid by reviewers, who lose two vacuous greens.
- The authored proxy vocabulary is closed at two fields, `contentPolicy` and
  `redirectTo`. A genuinely new edge case takes a field and its own decision
  record, not a provider-shaped passthrough, deliberately slower, paid by
  whoever meets that case first.
- `exposure` moves from the Workload to the Service while `provides` stays, so
  every routed service repository re-nests one block: paid by the four routed
  service owners, in the same coordinated migration.
- The hostname no longer leaves the Service repository, so publish-back
  ([0033](0033-assignments-published-back.md)) is still owed for arbitrated
  values but is no longer how an owner learns their own host: paid by nobody;
  it refunds a dependency this decision used to create.
- `authMode`, `auth.scope` and tier `authModes` are all replaced, and the edge
  catalogs plus the Gatus ConfigMap stop being authored: paid by the four routed
  service owners, in one coordinated migration.
- The health endpoint derives from the same declaration as the route, so a
  monitored and a served surface can no longer disagree: paid by observability
  authors ([0021](0021-observability-scrape-and-alert-class.md)).
- `E_ROUTE_AUTH_MODE_NOT_IN_TIER` is deleted rather than repaired: paid by
  reviewers, who read a shrunk error set as a fixed defect, not a lost check.
