---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-30
normative: spec/v1/14-platform-intent.md#tiers
rests-on: ["0004", "0008"]
---

# A tier that serves TLS but issues no certificate reads the one it serves from the Secret Store

A `tls` tier whose `certificates` is `none` may name `certificateFrom`, a
Secret Store path holding the certificate its proxy serves. The proxy's
Process reads the path through the one secret delivery, synced to a Secret
beside it, and the proxy's Project renders the default TLS store naming that
Secret. Every proxy serves the default store to a route that names no
certificate of its own, so one tier at most names one. The model does not say
who writes the path: the platform declares a Process that issues the
certificate where the DNS provider's token answers, and writes it there.

## Rests on

A value is declared by whoever contends for the resource it names
([0004](0004-contention-decides-authority.md)): the certificate every proxy
serves is the platform's, so the Platform document names where it is kept, on
the tier that needs it. And a Secret Store read is granted per path
([0008](0008-vault-read-is-per-path.md)), so the proxy's read of that path is
one grant like any other, with its own policy and nothing wider.

**False if:** a tier needs a certificate per host that the default store
cannot serve, or two tiers need two different certificates for routes that
name none. **Settled by:** the estate's LAN tier serving its wildcard from the
path after the old path's cert-manager is retired.

## Why

**The estate's LAN tier is exactly this.** It terminates TLS in Enschede and
cannot prove its names: its proxy runs there, and the DNS provider's token
answers only from frankfurt-contabo-1's address. Until now it served the
wildcard of the default TLS store, which cert-manager on the old path issued
and renewed. The model could not say where that certificate came from, so the
edge could not hand over without either keeping cert-manager behind on the old
path or letting the wildcard expire.

**The certificate crosses sites through the Secret Store, not the proxy.** The
LAN proxy needs the certificate's bytes, not the ability to issue it. The
Secret Store already reaches every site, already holds the DNS token, and is
the one way a value reaches a Process
([chapter 10](../../../spec/v1/10-project-intent.md#secrets)). What issues the
certificate runs where the token answers and writes the path; the LAN proxy
only reads it. So the token's address restriction never meets the LAN proxy,
and nothing in Enschede calls the DNS provider.

**Who issues it is not the model's.** An issuer is an ordinary Process: a
scheduled one in frankfurt, holding the token and a grant that writes the
path. Fixing one in the model would choose an ACME client, a schedule and an
image for every platform that uses the field, and the model would then own a
second certificate authority client beside the proxy's own resolver. Naming
only the path keeps the field a fact about the tier, as `acme.token` is a fact
about the account.

**The default store is every proxy's.** Traefik serves one TLS store, named
`default`, to every route that names no certificate, and each proxy reads it
from every namespace it watches. A second tier's certificate would be a second
`default` store, which no proxy can tell apart from the first: so one tier
names it, and every proxy serves it. That suits a wildcard, which is what such
a tier serves, and it means a route still on the old path, which names an
empty TLS block, keeps a certificate on either proxy after cert-manager goes.

**Synced, not mounted.** The proxy reads the Secret through its Kubernetes
provider, which reloads when it changes. A mounted file would restart the
proxy on every renewal or need a second provider to watch it, so the grant
injects nothing and restarts nothing.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The LAN tier issues through `acme` itself, with a DNS token that answers from Enschede | no model change; a second token restricted to another address | a second credential to the zone, held on the segment the token's restriction exists to keep it off, and two proxies drawing on one allowance for the same wildcard |
| The tier names another tier, and the render copies the certificate that tier's resolver issues | no issuer to declare | the proxy's ACME state is a file on one claim in frankfurt; carrying it to Enschede needs an exporter the model would own, and the LAN tier's names would ride on the public proxy's state |
| The tier names a Kubernetes Secret that something writes directly | no Secret Store read | a cluster-wide writer of Secrets beside every Project, outside the one secret delivery, with no policy or audit of its own |
| Keep cert-manager on the old path after the edge hands over | nothing to build now | the old path cannot be emptied, and the secrets handover's retirement of cert-manager waits on nothing that ends |
| A certificate per tier, each with its own store | two tiers may serve two certificates | Traefik serves one default store to every proxy; two would collide, and a route that names a certificate is the per-host case `acme` already covers |

## Reversibility

Undo cost today: one optional field, one grant, one TLS store and three
refusals: an afternoon. Becomes expensive once: other routes, or other
platforms, rely on the default store holding the wildcard, since dropping it
leaves every route that names no certificate with the proxy's self-signed one.

## Consequences

- The estate declares an issuer Process in frankfurt that writes the wildcard
  to the path, and the old path's cert-manager, its ClusterIssuer, the wildcard
  Certificate and the hand-written default TLS store retire with the edge.
- The path is seeded once before the edge's flip, from the certificate
  cert-manager last issued, so the proxy serves a valid one from its first
  start.
- The issuer draws on the same Let's Encrypt allowance as the public tier's
  resolver ([chapter 14](../../../spec/v1/14-platform-intent.md#tiers)).
- Every proxy serves the certificate to a route that names none, not only the
  tier's own proxy.
