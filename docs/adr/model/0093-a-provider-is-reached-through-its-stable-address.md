---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-09
normative: spec/v1/16-dependencies.md#the-stable-address
rests-on: ["0001", "0005"]
---

# A consumer reaches a provider's surface through its Stable Address, an alias in one estate namespace that names whichever Instance serves

Every surface an edge names derives a **Stable Address**,
`<application>-<surface>` in `estate-system`, rendered by the estate-scoped
artifact as a Kubernetes `ExternalName` Service whose target is the provider's
active Instance. `${dependency:…}` resolves to it, and a tier's forward-auth
endpoint is written as one. A consumer's render then depends on its provider's
Id and surface alone, so a provider that moves changes one object rather than
every consumer. The names, the target rule and what the alias cannot do are
[chapter 16](../../../spec/v1/16-dependencies.md#the-stable-address)'s.

## Rests on

The coordinates a consumer needs are a function of the edge
([0005](0005-derivation-is-total.md)), and nothing in an edge names where the
provider runs, so a coordinate that carries the provider's namespace carries a
fact the edge never stated. One maintainer runs one cluster
([0001](0001-estate-scale-and-ownership.md)), so one namespace of aliases and
the cluster's own DNS are enough indirection.

**False if:** a consumer's rendered configuration changes when its provider
changes Project, or a flip of the alias leaves a consumer resolving the old
Instance for longer than the cluster DNS TTL plus its own resolver cache.
**Settled by:** a lab drill that moves `platform-postgres` between namespaces
and diffs every consumer's render before and after (empty), with `dig` against
the alias recording the TTL the CNAME carries.

## Why

**Changing a provider was a fan-out with no moment of truth.** A coordinate
rendered as `<process>.<namespace>.svc.cluster.local` sat in every consumer's
artifact, and each Project is delivered by its own pin
([0051](0051-a-project-is-delivered-as-a-signed-artifact.md)). A provider that
moved changed every consumer's render, and each consumer followed when its own
pin moved, so for a while some reached the old address and some the new. An
alias they all share moves them together.

**An alias, because a proxy is a component.** DNS indirection costs one object
per surface and nothing in the connection path. Its limits are known and
bounded: it cannot remap a port, so a port change stays expand-and-contract
([chapter 50](../../../spec/v1/50-lifecycle.md#expand-and-contract)); it flips
new connections only, so closing old ones is the Fence's job
([0094](0094-a-move-is-derived-from-one-authored-edit.md)); and network policy
never names a Service, so egress still names the pods of each Instance. The
survey behind these limits, including the DNS caching on the path, is
[`docs/research/provider-moves.md`](../../research/provider-moves.md#indirection).

**One namespace, because the alias must outlive its provider's.** An alias in
the provider's own namespace dies with a move between Projects, the change it
exists for. `estate-system` belongs to the estate-scoped artifact, which no
Project's move touches.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the Process's own Service address in every consumer | nothing to build | a provider's move is a fan-out across every consumer's pin |
| Move every consumer's pin in one composition | one coordinated commit | Flux reconciles each Kustomization on its own, and every consumer restarts |
| A selectorless Service with hand-kept EndpointSlices | a port can be remapped | IP-based, blind to a namespace move, and a second writer of endpoints |
| A Gateway API `TCPRoute` or a mesh as the indirection | full control of the flip | a proxy in every connection's path, the cost [0052](0052-an-application-is-the-release-unit.md) already rejected |
| A logical service name bound in the Platform document | a provider could be swapped for another Application | a second identity namespace beside the Application Id ([0010](0010-flat-application-identity.md)) |

## Reversibility

Undo cost today: the coordinate derivation and one adapter: a day. Becomes
irreversible once: a consumer outside the model, or a hand-written
configuration, names a Stable Address, since that name is then a contract the
estate cannot see.

## Consequences

- Every consumer must reconnect and resolve again when a connection drops, an
  obligation stated once in chapter 16 and paid by each consumer's owner.
- A provider whose HTTP surface depends on its `Host` or a TLS name must answer
  to its Stable Address too; none does today.
- The estate-scoped artifact gains one Service per named surface, rendered
  even while every Project is on the old path.
- The worked examples' oracles resolve coordinates to Process Services until
  [#324](https://github.com/JorisJonkers-dev/deploy-kit/issues/324) lands.
