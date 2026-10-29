---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-29
normative: spec/v1/10-project-intent.md#exposure
rests-on: ["0004", "0005"]
---

# An exposure may bypass the DNS provider's proxy, pointing its record at the tier's stated direct address and counting its clients by their connection

An exposure may declare `proxied: false`. Its host's record then points at the
tier's direct address, the one its edge is dialled at, and is not proxied.
Every rate limit on its routes counts a client by the connection's address,
whatever the tier's `proxiedBy` says. The tier states that direct address in
its `dns`, beside `target`. The compiler does not derive it. Settled in
[Whether the DNS provider proxies a host is the tier's, so one host cannot bypass the proxy](https://github.com/JorisJonkers-dev/deploy-kit/issues/694).

## Rests on

Contention decides who declares a value
([0004](0004-contention-decides-authority.md)). Whether a host can stand behind
the provider's proxy depends on what it serves, and nothing contends for that,
so the Application declares it. The address the edge is reached at belongs to
the platform, so the tier declares it. Derivation covers the live estate
([0005](0005-derivation-is-total.md)) only if every live record can be reached
from intent. hermes's grey-cloud record could not be reached.

**False if:** an unproxied host that its own tier's edge serves needs a record
at an address other than that edge's, or one tier's edge is dialled directly at
more than one address.
**Settled by:** hermes's public route rendered with the target `167.86.79.203`
and `cloudflare-proxied: "false"`, the record external-dns writes for it live.

## Why

**One host cannot stand behind the proxy.** Cloudflare closes a WebSocket that
has been idle for about 100 seconds. hermes's dashboard runs its chat tab over
one, so live its host is grey-cloud and resolves straight to the Frankfurt edge.
Every other name on the public tier is proxied. A tier-wide `proxied` cannot
express a single exception, so the Application has to state it, on the
exposure that serves the host.

**The direct address is stated, because nothing in the model holds it.** The
public tier's `address` is `edge-frankfurt`, a node address. A node address
names the node and leaves out the address: what a client dials is the
substrate's, and the node contract declares every fact but that one. A pool's
`range` may hold several addresses, so it does not name one either. The address
can therefore only be derived by adding a public address to a document that has
none. That means a node fact the k3s labels and the nix host data would also
have to carry, for one consumer. The smallest field that tells the truth sits on
the tier, beside the `target` it replaces: both are values the DNS provider's
record holds, and both are written in its own terms.

**The client is the connection on a host the proxy does not front.** The tier's
`proxiedBy: cloudflare` is true only when every request reaches the tier through
Cloudflare ([0110](0110-a-route-may-bound-its-request-rate.md)). A host taken
out of the proxy breaks that assumption for its own routes. There a client
connects to the edge itself, so `CF-Connecting-IP` contains whatever the client
chose to write. A limit keyed on that header would let each client pick its own
bucket, so its routes count by the connection. The routes of every other
exposure on the tier keep the tier's reading.

**`false` alone.** Proxying belongs to the tier. An exposure may opt out of it,
and it may never opt a host into a proxy its tier does not have. A `true` would
mean nothing on a proxied tier, and on an unproxied one it would name a proxy
the platform never declared.

**When the tier states no `proxiedBy`, only the record changes.** A tier
without it already counts every client by the connection, so on such a tier
`proxied: false` moves the host's record to `direct` and leaves its routes'
reading as it was.

**The case it covers is a host its own tier's edge serves.** hermes and
agents-ws resolve to the Frankfurt edge, the public tier's own. jellyfin's
unproxied public record does not. It names the home address and reaches the
LAN tier's proxy, so a public name is served by a different tier's edge. That
is a different shape, because the host's audience and the proxy that answers it
belong to two different tiers, and `proxied: false` does not express it.
jellyfin's public record stays a named gap.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A second tier for unproxied public hosts | no exposure field | an audience selects a tier, so the second tier needs an audience of its own that every route on it writes, plus the same proxy and class under a second name, all to change one DNS annotation |
| Derive the direct address from the tier's L4 Address | no new tier field | a node address names a node, not an address, so the node contract would need a public address it does not hold today, and every node would carry it for a single consumer |
| A direct address authored on the exposure | no tier field | it is the platform's address, and each unproxied host would repeat it, so the copies drift when the edge moves |
| Point the record at the tier's `target`, unproxied | no address at all | live, the unproxied record holds the edge's own address, not `target`. Whether a name pointed at `target` reaches the edge without the proxy depends on how the provider answers `target`, and the model does not hold that |
| Keep the proxy and raise the WebSocket's activity | no model change | hermes's dashboard is a third-party image, so it is not ours to change |

## Reversibility

Cheap. Both fields are optional, and removing `proxied: false` from hermes puts
its host back behind the proxy.

## Consequences

- An exposure carries `proxied: false`, or nothing
  ([chapter 10](../../../spec/v1/10-project-intent.md#exposure)). A tier's
  `dns` may carry `direct`
  ([chapter 14](../../../spec/v1/14-platform-intent.md#tiers)). An exposure
  that declares `proxied: false` on a tier with no `direct` is
  `E_NO_DIRECT_TARGET`.
- The resolved exposure's `dns` is its host's own record, so the `traefik`
  adapter writes the external-dns annotations from that record unchanged.
- An unproxied host's record makes the edge's address public. It was always
  reachable on that address, since nothing in the model holds the public tier
  to Cloudflare's ranges. Even so, a client that dials the edge with a proxied
  host's name still writes its own `CF-Connecting-IP`. The routes of proxied
  hosts keep relying on [0110](0110-a-route-may-bound-its-request-rate.md)'s assumption, which is now easier to break.
- A tier that states no `proxiedBy` reads every client by the connection
  either way, so there `proxied: false` changes the record alone.
- A public host served by another tier's edge, such as jellyfin's at the home
  address, which reaches the LAN proxy, is not expressible and stays a gap.
- RENDER-GAPS.md's A4 closes: hermes's public host renders grey-cloud, pointing
  at the Frankfurt edge.
