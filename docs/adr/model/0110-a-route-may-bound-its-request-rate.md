---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-20
normative: spec/v1/10-project-intent.md#exposure
rests-on: ["0004", "0005"]
---

# A route may bound how many requests one client sends it, and the tier decides who the client is

A route may carry `rateLimit`: how many requests one client may send it, and
over what period. It is the third field in the authored proxy vocabulary, after
`contentPolicy` and `redirectTo`. The author writes those two numbers and
nothing else. The render derives the burst, which equals the request count. A
tier fact, `proxiedBy`, decides which address a client is counted by: the
connection's own address on a tier clients reach directly, or the address
Cloudflare forwards on a tier that Cloudflare proxies.

## Rests on

How many requests a path can take is the Application's judgement. Its cost
depends on what the Process does behind that path, and nothing in the model can
derive it. Who a client is depends on how traffic reaches the edge, which is the
same for every route on a tier. That makes it the platform's fact, decided once
([0004](0004-contention-decides-authority.md)). The burst, the source of the
address and the Middleware that enforces the limit all follow from those two
facts, so none of them is authored ([0005](0005-derivation-is-total.md)).

**False if:** a route needs a limit keyed by something other than the client's
address, such as a user or an API key, or two routes on one tier need different
ideas of who the client is.
**Settled by:** identity's `/oidc/register` limited on the public tier, with
registrations from one address refused past the limit and every other address
unaffected.

## Why

**The closure promised a field and a record for a real case.** The proxy
vocabulary stayed at two fields because the estate ran no rate limit anywhere
([chapter 10](../../../spec/v1/10-project-intent.md#the-authored-proxy-vocabulary-is-three-fields)).
identity now serves an endpoint that anyone may call without signing in, and
every call stores a row: the registration endpoint (RFC 7591) that MCP clients
use. Consent keeps a registration harmless, but nothing bounds how fast
registrations arrive. That is a real case.

**Two numbers, not a block.** Traefik's limiter takes an average, a period, a
burst and a source criterion. An author can judge the first two, "ten an hour".
The burst follows from them: a client that has sent nothing may send its whole
allowance at once. The source criterion is not the route's to choose.

**The tier knows who the client is.** On a tier that Cloudflare proxies, every
connection comes from a Cloudflare edge. Counting by the connection's address
would then put everyone behind one edge into one bucket. On a tier clients
reach directly, the forwarded header is whatever the client wrote, so trusting
it would let anyone choose their own bucket. Both cases depend on the tier, and
neither on the route.

**Per route, not per host.** The case is one path on a host whose other paths
must not be limited: identity's sign-in pages and token endpoint carry their own
protections. A limit per host would either limit the token endpoint or be
useless for registration.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Limit inside the application | no model change | each replica counts on its own, and behind Cloudflare the application sees Cloudflare's address unless it trusts a header the edge does not verify |
| A raw Traefik middleware reference on a route | any Traefik option at once | a mechanism in Project Intent, which reopens the passthrough the closure exists to keep shut |
| Named levels such as `strict` and `standard` | no numbers authored | the right number depends on the endpoint, and a level hides it behind a name nobody can check |
| Author the burst too | a client may send more than its steady rate at once | no live case needs it, and a field nobody sets costs a schema, a derivation and a test |
| The client address authored on the route | one route could trust a header | it is the same for every route on a tier, and a route that gets it wrong lets every client pick its own bucket |

## Reversibility

Undo cost today: one route field, one tier fact, one Middleware in one adapter:
a day. Becomes costly once several Applications limit routes and depend on the
derived burst.

## Consequences

- A route carries `rateLimit: {requests, per}`
  ([chapter 10](../../../spec/v1/10-project-intent.md#exposure)), and the
  authored proxy vocabulary is three fields.
- A tier may state `proxiedBy: cloudflare`
  ([chapter 14](../../../spec/v1/14-platform-intent.md#tiers)). Without it,
  clients are counted by the connection's address. The fact is true only when
  every request reaches the tier through Cloudflare: a client that reaches the
  edge directly writes the header itself and picks its own bucket.
- The Release Gate's checks request the Canary's service, inside the cluster,
  and never meet the limit. Its warm-up crosses the edge once per path, and a
  `429` is no 5xx, so a limited route never fails a release
  ([chapter 55](../../../spec/v1/55-delivery.md#the-release-gate)).
- The `traefik` adapter renders a `RateLimit` Middleware for each limited route,
  in the Application's own namespace beside its IngressRoute, because its values
  belong to that route alone.
- Each replica of the tier's proxy counts on its own. The public tier's proxy runs one
  replica today, so its limits are exact. A second replica would let a client
  send up to twice the allowance.
