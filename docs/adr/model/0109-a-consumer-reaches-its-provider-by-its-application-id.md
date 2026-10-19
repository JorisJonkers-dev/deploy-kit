---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-19
normative: spec/v1/16-dependencies.md#the-alias
rests-on: ["0001", "0005"]
---

# A consumer reaches its provider by the provider's Application Id, through an alias in its own namespace

Every dependency edge derives the name its consumer dials. A provider in
another namespace is reached through an **alias**: a Service of type
`ExternalName` in the consumer's namespace, named after the provider's
Application Id, pointing at where the provider serves. A consumer writes
`http://prowlarr:9696`, and `${dependency:<application>.host}` resolves to the
same name. The rules, the names and the refusal are
[chapter 16](../../../spec/v1/16-dependencies.md#the-alias)'s.

## Rests on

The name a consumer dials is a function of the edge
([0005](0005-derivation-is-total.md)), and a name that also carries the
provider's namespace and the cluster domain carries facts the edge never
stated. One maintainer runs one cluster ([0001](0001-estate-scale-and-ownership.md)),
so an Application Id is unique wherever a consumer resolves it.

**False if:** a consumer's configuration has to name its provider's namespace
to reach it, or an alias resolves to a different provider than the edge names.
**Settled by:** sonarr, radarr and prowlarr configured with `http://prowlarr:9696`,
`http://sonarr:8989` and `qbittorrent:8080`, each reaching the provider its
edge names across two Projects.

## Why

**The name is what a person types.** Several Applications store their peers'
URLs in their own settings, entered by hand. A name such as
`prowlarr.prowlarr-system.svc.cluster.local` is what the cluster calls the
provider, not what anybody calls it, and it breaks when the provider moves
Project. The Application Id is the name the estate already uses for it, and
the only identity an edge can name
([0010](0010-flat-application-identity.md)).

**An alias in the consumer's namespace, because short names resolve there.**
A pod's DNS search list starts with its own namespace, so a bare name resolves
to a Service there and nowhere else. An alias in the consumer's namespace makes
the provider's Id one of those names, with nothing added to every pod.

**The Stable Address stays the indirection.** The alias names the provider's
Stable Address ([0093](0093-a-provider-is-reached-through-its-stable-address.md)),
so a provider that moves still changes one object. The alias only makes that
object reachable by a short name.

**A refusal, not a rename, where names meet.** A Process of the consumer's own
Project may already serve under the name, or two Applications' aliases may
want it. Renaming either silently would hand the consumer a name it did not
write, so composition refuses it.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Add the Stable Address namespace to every pod's DNS search list | no object per edge | every pod pays an extra lookup per external name, the name resolves without any declared edge, and network policy no longer follows from the name |
| Write the Stable Address's short form, `prowlarr-http.estate-system` | no model change | still a namespace and a surface in what a person types |
| Keep the full cluster name | nothing to build | the problem this record exists for |

## Reversibility

Undo cost today: one derived Service per edge, one placeholder rule and one
refusal: a day. Becomes costly once: Applications store the short names in
their own settings, which a revert would have to rewrite by hand.

## Consequences

- A Project's render carries `aliases.yaml`
  ([chapter 30](../../../spec/v1/30-deliverables.md#path-allocation)).
- `${dependency:<application>.host}` resolves to the alias, or to the
  provider's own Service name in the consumer's namespace, or to an IP.
- `E_ALIAS_COLLISION` refuses an alias that takes a name a Project already
  serves under, or that two Applications' aliases share.
- A consumer that reaches a provider only through its own settings still
  declares the edge, which is what derives the alias.
