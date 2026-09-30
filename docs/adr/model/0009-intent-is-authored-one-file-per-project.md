---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/10-project-intent.md#application-identity
rests-on: ["0001", "0003"]
---

# Intent is authored one file per project, holding Applications that hold Processes

One file per project is one Intent Fragment. It holds many Applications, and an
Application holds its Processes. A repository may hold several project files;
a project never spans repositories. The namespace derives from `project` as
`<project>-system`. The three levels are named Project, Application and
Process, for a reader who does not work with deployments.

## Rests on

The project is the right authoring unit because it already is the deployment
unit: every live Application runs in the namespace named after its project
([0001](0001-estate-scale-and-ownership.md)). The three levels are fixed by the
model rather than by any substrate ([0003](0003-three-model-pipeline.md)): one
authored file with one owner, a set of runnable parts that switch version
together, and one runnable part.

**False if:** a live Application namespace does not match its project, or a
level's name is also a name the rendered output uses for a different thing.
**Settled by:** `kubectl get ns -o name | grep -- '-system$'` compared against
the project header of every project file (ten of ten equal
`<project>-system`), and `CONTEXT.md` listing Service, Workload and Domain as
retired model words that no chapter uses for a level.

## Why

**Namespaces here have always been per project.** Deriving the namespace from
the Application id pointed at the wrong field: `home-portal` would derive
`home-portal-system`, a namespace that never existed, while the Application
runs in `app-system`. Deriving from `project` yields every live namespace
unchanged, and no alias field is needed.

**A namespace is not a trust boundary.** It holds several Applications by
construction, so no isolation claim rests on a namespace wall. Isolation is the
derived default-deny edge set
([0035](0035-network-policy-is-default-deny-and-render-only.md)) plus per-Process
identity ([0031](0031-identity-per-process.md)).

**A file is a fragment.** A project file publishes as exactly one Intent
Fragment, so composition unions fragments and never has to union a project
([0042](0042-declarations-compose-from-intent-fragments.md)).

**The names come from where the concepts already have common names.** The old
words were each taken: *Service* is also the rendered Kubernetes object, and
means an independently released unit, a microservice or an add-on elsewhere;
*Domain* reads as a hostname in a model that authors hostnames; *Workload*
means opposite things in Kubernetes and Score. Platforms that release several
processes as one unit call it an **application** (Heroku, Fly.io, Cloud
Foundry, the Open Application Model); Heroku and Cloud Foundry call one
runnable part a **process**; Docker Compose calls one file of several apps a
**project**. The layer-1 document follows its file: **Project Intent**, beside
Platform Intent. Layer 3 keeps the target's spellings
([0011](0011-authored-values-name-model-concepts.md)), so a rendered file is
still `workload.yaml`.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One repository = one project = one file | splits `homelab-collections` into three repositories, three publish workflows, three credential sets | composition behaves identically split or not, so the split buys nothing |
| A project spanning repositories, unioned by name | membership is knowable only after composition | members agreeing on a name as the mechanism, the shape the release-unit record rejected ([0052](0052-an-application-is-the-release-unit.md)) |
| Namespace from the Application id, with an alias field | an alias for every Application whose id is not its project | points at the wrong field; ten of ten live namespaces are per project |
| Keep Domain, Service and Workload | no rename | Service collides with the rendered Kubernetes object; Domain collides with hostnames |
| Application containing Components | matches OAM and Backstage | "Component" does not say the thing runs |

## Reversibility

Undo cost today: splitting ten project files and renaming three levels across
both implementations, days. Becomes irreversible once: fragments publish
project-scoped and consumers pin them by digest, and Vault roles and
ServiceAccounts are named for the Process under the project namespace.

## Consequences

- The ServiceAccount and Vault role are the Process name alone, unique within
  the project, so two Applications in one file cannot both call a Process
  `api`, paid by the project's authors.
- A project file grows with its project: one review surface and one `owner` for
  every Application in it; an Application needing another owner needs its own
  project.
- Every authored key follows the level: `project`, `applications`,
  `processes`, and the suffix `.project.yml`.
- "Application" is also the name of the compiler's use-case directory; the
  capitalised term is the model level.
