---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#service-identity
rests-on: ["0003"]
---

# A Service is the unit of atomic release

## Rests on
Every lockstep pair in this estate can be one Service without losing a
referencable name. False if: a pair must release together AND both names must be
referencable from outside their domain. Settled by: grep every `dependsOn` target
across the composed union — today the complete set is `platform-postgres`,
`platform-rabbitmq`, `stalwart` and `platform-valkey`; neither `auth-api` nor
`auth-ui` nor `stalwart-provisioner` appears, so merging either pair into one
Service breaks no reference.

## Why
This supersedes [0060](0060-release-unit.md). The requirement survives unchanged:
no member's new version receives traffic until every member is healthy — health
meaning that member's own declared readiness
([0014](0014-probes-are-siblings.md)) — and one member failing its startup budget
holds the whole set on old versions. The mechanism changes. The guarantee is
carried by the Service boundary itself rather than by a `releaseUnit` name, which
is deleted. Things that must release together are Workloads of one Service, and
there is no mechanism to couple two Services.

`releaseUnit` was a cross-repository coupling invisible in any single file: a
reader of `auth-api`'s document saw a name and had to search the composed union
to learn what else answered to it. Under one file per domain
([0063](0063-intent-authored-per-domain.md)) the coupled things are adjacent —
two entries under one Service's `workloads` — and the Service boundary already
means "switches together". The field restated a fact the boundary carried, and
two records of one fact drift.

The estate's clearest pair costs nothing to merge. `auth-api`'s estate-wide role
is the forward-auth middleware derived from every route's exposure audience
([0018](0018-exposure-by-audience.md)), **not** a `dependsOn` edge, so no
consumer names the id and folding it into Service `auth` breaks no reference.
`stalwart-provisioner` is the same case: nothing depends on it.

A Service is not a Reconcile Unit ([0032](0032-reconcile-unit-derived.md)). The
Reconcile Unit is derived from the dependency graph and answers ordering —
`platform-postgres` before `knowledge`, where the later unit waits. The Service
is declared, by drawing a boundary, and answers atomicity — every Workload
switches or none does, and a failure means nothing switches. Ordering is a graph
property; atomicity is a product judgement the graph cannot see, which is why one
is derived and the other is authored.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A `releaseWith` field, valid only within the domain file | The deleted field worn narrower: the schema keeps a coupling name plus a rule that its target is in the same file, and two Services in one file get a second way to say "together" | The file-scope rule is the Service boundary spelled out longhand; it adds a record without adding a fact, and the record can disagree with the boundary |
| Co-location implies atomicity — every Service in a domain file releases as one | Adding an unrelated Service to `media.yml` silently couples its rollout to nine others, and nothing in the file says so | The trap: coupling acquired by editing an unrelated line, discoverable only when a held release blocks a Service its owner never coupled |
| A `components` level between Service and Workload | A third authoring level whose only job is grouping Workloads, and every field must then be assigned to Service, component or Workload | Fails [0003](0003-three-layer-meta-model.md)'s two deciding questions — the level records no decision, and Service is already that grouping |

## Reversibility
Undo cost today: reintroduce a Service-level coupling field and split the merged
Services back into separate ids — an afternoon of schema work plus one pull
request per domain file, no data movement. The split is the expensive half.
Becomes irreversible once: an inbound reference exists to a merged Service's id —
a dependency edge, an exposure route, or a Vault path derived from it — because
splitting is then a rename, and [0010](0010-flat-service-identity.md) makes
renames permanent data rather than a free correction.

## Consequences
- A Workload is not independently referencable: `dependsOn` names
  `{service, surface}`, so if anything ever needs an edge to
  `stalwart-provisioner` the merge must be undone and the id restored — paid by
  whoever adds that edge, in a rename with inbound references to fix.
- A surviving lockstep pair that cannot merge is not a missing feature; it is
  evidence the Service boundary is drawn wrong, and the fix is redrawing it. That
  judgement is joris's, one pair at a time, and it is the discipline this decision
  buys — paid by the domain owner, in boundary arguments the field used to defer.
- A Service switches at the speed of its slowest Workload's health gate, and one
  bad Workload holds its neighbours on old versions visibly — paid by every
  Workload owner in that Service, in rollout latency.
- Rollback is Service-scoped: reverting one Workload reverts all of them — paid
  by incident responders, in larger but consistent rollback scope.
- `## Release units` leaves chapter 10 and the field's validation goes with it,
  so the guarantee is now only as tested as the Service boundary is — paid by
  whoever writes the test that proves a held member holds the set.
- Whatever delivery mechanism is eventually defined must implement
  all-or-nothing switchover per Service — paid by the deferred delivery
  definition ([deferred/README.md](../deferred/README.md)).
