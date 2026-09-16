---
tier: decision
status: proposed
claim: settled
date: 2026-09-14
normative: spec/v1/10-project-intent.md#application-identity
rests-on: ["0003"]
---

# The authored hierarchy is Project, Application and Process, named for a reader who does not work with deployments

> **Amended 2026-09-16.** The rename reached layer 2: the projection kind is
> `ResolvedApplication`, not `ResolvedService`. One document kind was still
> built from the retired word, which left `CONTEXT.md` retiring *Service* and
> defining `ResolvedService` four entries apart. The decision is unchanged; it
> is applied where it had not yet been. The rename is free because no oracle
> file names the kind: the first `resolved.json` lands with the metamodel that
> gives it a shape ([#42](https://github.com/JorisJonkers-dev/deploy-kit/issues/42)).

## Rests on
The three levels of layer 1 are fixed by the model rather than by any
substrate ([0003](0003-three-model-pipeline.md)): one authored file with one
owner, a set of runnable parts that switch version together, and one runnable
part. Their names therefore describe those roles and nothing the substrate
spells. False if: a level's new name is also a name the rendered output uses
for a different thing, so a reader of one chapter meets one word with two
meanings. Settled by: `CONTEXT.md` listing Service, Workload and Domain as
retired model words, and no chapter using them for a model level.

## Why
The levels were Domain, Service and Workload. Each word was already taken.

**Service** carried five incompatible meanings across the tools this estate
could deploy with: a network endpoint in Kubernetes, one independently released
unit in Docker Compose, ECS, Railway and Cloud Run, a microservice in Dapr, an
add-on in Heroku, a port section in Score. The model's Service was none of
those: it was the set of runnable parts released atomically. Worse, the
Deliverable Set renders Kubernetes `Service` objects, so a chapter about one
Service's rendered tree named two different things with one word.

**Domain** reads as a DNS name to most readers, and this model authors
hostnames. **Workload** is jargon, and it means opposite things in Kubernetes
(one runnable part) and Score (the whole deployable bundle).

The replacements come from where the concept already has a common name.
Platforms that release several processes as one unit call that unit an
**application** (Heroku, Fly.io, Cloud Foundry, DigitalOcean App Platform, the
Open Application Model, Radius, the Kubernetes SIG Application resource).
Heroku, Cloud Foundry and Fly.io call one runnable part a **process**, and a
newcomer reads that as a running program without a glossary. Docker Compose
and Railway call one file holding several deployable apps a **project**.
Because the estate may move off Kubernetes, the names are chosen for clarity,
not for alignment with any one tool.

The layer-1 document follows the file it lives in: **Project Intent**, beside
Platform Intent. Layer 3 keeps the target's spellings, as
[0097](0097-authored-values-name-model-concepts.md) already requires, so a
rendered file is still `workload.yaml` and a Kubernetes `Service` is still a
`Service`.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep Domain, Service and Workload | No rename | Service collides with the rendered Kubernetes object and four other meanings; Domain collides with hostnames |
| ReleaseGroup containing Services | Names the release guarantee directly | "Group" suggests independently releasable members, which is the superseded Release Unit ([0060](0060-release-unit.md), superseded by [0062](0062-application-is-the-release-unit.md)); "service" then sits at a level that is not independently released |
| Application containing Components | Matches OAM and Backstage | "Component" does not say the thing runs, and Backstage uses it for libraries too |
| Application containing Workloads | Keeps half the vocabulary | Workload stays jargon with opposite meanings in Kubernetes and Score |

## Reversibility
Undo cost today: a mechanical rename across the specification, the decision
record and the examples, a day. Becomes irreversible once: either
implementation names its types, grammar keywords or diagnostic codes after the
levels, because the words then sit in two codebases and every authored file.

## Consequences
- Every authored key moves with the level: `project`, `applications`,
  `processes`, and the file suffix `.project.yml`. Paid once, now, while no
  parser exists.
- Five diagnostic codes are renamed, among them `E_DUPLICATE_APPLICATION_ID`
  and `E_DUPLICATE_PROCESS_NAME`. Paid once, in the constraint ledger's first
  rows.
- "Application" and "process" are also ordinary English words, and the
  hexagon's `application/` ring names the use-cases. The capitalised term is the
  model level; lower case in a chapter is the ordinary word. Paid by readers of
  `docs/architecture.md`, where both appear.
- ADRs written before this one keep their decisions and gain an amendment note;
  their file names and titles use the new words, so a citation by number still
  resolves.
