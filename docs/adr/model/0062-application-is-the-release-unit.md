---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-project-intent.md#application-identity
rests-on: ["0003"]
---

# An Application is the unit of atomic release

> **Amended 2026-09-14.** Vocabulary renamed by
> [0116](0116-project-application-process.md): Domain is now Project,
> Service is Application, Workload is Process, and Service Intent is Project
> Intent. The decision is unchanged.

## Rests on
Every lockstep pair in this estate can be one Application without losing a
referencable name. False if: a pair must release together AND both names must be
referencable from outside their project. Settled by: grep every `dependsOn` target
across the composed union: today the complete set is `platform-postgres`,
`platform-rabbitmq`, `stalwart` and `platform-valkey`; neither `auth-api` nor
`auth-ui` nor `stalwart-provisioner` appears, so merging either pair into one
Application breaks no reference.

## Why
This supersedes [0060](0060-release-unit.md). The requirement survives unchanged:
no member's new version receives traffic until every member is healthy, health
meaning that member's own declared readiness
([0014](0014-probes-are-siblings.md)), and one member failing its startup budget
holds the whole set on old versions. The mechanism changes. The guarantee is
carried by the Application boundary itself rather than by a `releaseUnit` name, which
is deleted. Things that must release together are Processes of one Application, and
there is no mechanism to couple two Applications.

`releaseUnit` was a cross-repository coupling invisible in any single file: a
reader of `auth-api`'s document saw a name and had to search the composed union
to learn what else answered to it. Under one file per project
([0063](0063-intent-authored-per-project.md)) the coupled things are adjacent
(two entries under one Application's `processes`) and the Application boundary already
means "switches together". The field restated a fact the boundary carried, and
two records of one fact drift.

The estate's clearest pair costs nothing to merge. `auth-api`'s estate-wide role
is the forward-auth middleware derived from every route's exposure audience
([0018](0018-exposure-by-audience.md)), **not** a `dependsOn` edge, so no
consumer names the id and folding it into Application `auth` breaks no reference.
`stalwart-provisioner` is the same case: nothing depends on it.

An Application is not a Reconcile Unit ([0032](0032-reconcile-unit-derived.md)). The
Reconcile Unit is derived from the dependency graph and answers ordering:
`platform-postgres` before `knowledge`, where the later unit waits. The Application
is declared, by drawing a boundary, and answers atomicity: every Process
switches or none does, and a failure means nothing switches. Ordering is a graph
property; atomicity is a product judgement the graph cannot see, which is why one
is derived and the other is authored.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A `releaseWith` field, valid only within the project file | The deleted field worn narrower: the schema keeps a coupling name plus a rule that its target is in the same file, and two Applications in one file get a second way to say "together" | The file-scope rule is the Application boundary spelled out longhand; it adds a record without adding a fact, and the record can disagree with the boundary |
| Co-location implies atomicity: every Application in a project file releases as one | Adding an unrelated Application to `media.yml` silently couples its rollout to nine others, and nothing in the file says so | The trap: coupling acquired by editing an unrelated line, discoverable only when a held release blocks an Application its owner never coupled |
| A `components` level between Application and Process | A third authoring level whose only job is grouping Processes, and every field must then be assigned to Application, component or Process | Fails [0003](0003-three-model-pipeline.md)'s two deciding questions, the level records no decision, and Application is already that grouping |

## Reversibility
Undo cost today: reintroduce an Application-level coupling field and split the merged
Applications back into separate ids, an afternoon of schema work plus one pull
request per project file, no data movement. The split is the expensive half.
Becomes irreversible once: an inbound reference exists to a merged Application's id
(a dependency edge, an exposure route, or a Vault path derived from it) because
splitting is then a rename, and [0010](0010-flat-application-identity.md) makes
renames permanent data rather than a free correction.

## Consequences
- A Process is not independently referencable: `dependsOn` names
  `{application, surface}`, so if anything ever needs an edge to
  `stalwart-provisioner` the merge must be undone and the id restored: paid by
  whoever adds that edge, in a rename with inbound references to fix.
- A surviving lockstep pair that cannot merge is not a missing feature; it is
  evidence the Application boundary is drawn wrong, and the fix is redrawing it. That
  judgement is joris's, one pair at a time, and it is the discipline this decision
  buys: paid by the project owner, in boundary arguments the field used to defer.
- An Application switches at the speed of its slowest Process's health gate, and one
  bad Process holds its neighbours on old versions visibly: paid by every
  Process owner in that Application, in rollout latency.
- Rollback is Application-scoped: reverting one Process reverts all of them: paid
  by incident responders, in larger but consistent rollback scope.
- `## Release units` leaves chapter 10 and the field's validation goes with it,
  so the guarantee is now only as tested as the Application boundary is: paid by
  whoever writes the test that proves a held member holds the set.
- Whatever delivery mechanism is eventually defined must implement
  all-or-nothing switchover per Application: paid by the deferred delivery
  definition ([deferred/README.md](../deferred/README.md)).
