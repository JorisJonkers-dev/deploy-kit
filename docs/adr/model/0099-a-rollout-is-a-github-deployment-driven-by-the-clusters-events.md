---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-13
normative: spec/v1/55-delivery.md#rollouts
rests-on: ["0001"]
---

# A Rollout is a GitHub Deployment that composition names and the cluster's own events drive

A Project's release shows on its repository as a GitHub Deployment, a
**Rollout**. Composition gives it its identity when it moves the Project's pin:
the repository, the commit and the version of the fragment the Project composed
at. The same identity sits on the Project's unit in its pin source, where Flux
copies it into every event about the unit. A Reporter in the cluster follows
those events and writes each stage as a status. Nothing reads a snapshot, and
nothing that promotes a release holds a key that writes to GitHub. The fields
are [chapter 55](../../../spec/v1/55-delivery.md#rollouts)'s; the pin is
[0051](0051-a-project-is-delivered-as-a-signed-artifact.md)'s.

## Rests on

The estate is one maintainer on one cluster
([0001](0001-estate-scale-and-ownership.md)). One person releases a Project and
wants to see, on the repository they released from, whether it reached the
cluster and passed its checks. One environment and one Reporter are enough for
that, and no release needs a second audience.

**False if:** an event Flux sends about a Project's unit does not carry the
release the unit is applying, or a release's stages can only be told apart by
reading objects in the cluster.
**Settled by:** release `delivery` and observe a `production` deployment on its
repository whose status history runs from `pinned` to `success`, written
without any step of the release naming the deployment.

## Why

**The repository is where the author looks.** A commit status already says a
fragment composed. A GitHub Deployment is the same surface's record of what
reached an environment, with a history of statuses, so a release that is
applied, checked and promoted reads there in order.

**Composition names the Rollout, because only it knows a pin moved.** A release
whose render is the one already pinned changes nothing in the cluster, so it is
no Rollout. Which fragment a Project composed at, a Rollback's among them, is
composition's fact, and the workflow that creates the Deployment reads it
rather than work it out again.

**The identity rides on the pin source, so an event names its own release.**
Flux copies an object's `event.toolkit.fluxcd.io/` annotations into every event
about it. The Reporter then needs no table of which revision belongs to which
release, and a missed event delays a status without mislabelling one. The
annotations are on the pin source, not in the artifact: a render does not
change because the commit that published it did, so its content hash, and with
it whether the pin moves, stays a function of the render alone.

**A separate Reporter, so no key sits where it could do more.** The Release
Gate promotes, and the Collector only reads. A key that writes deployments on
every application repository belongs to neither: held by the gate it would sit
with the component that decides, and held by the Collector it would end the
property that the Collector cannot write anywhere.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A reporting workflow started by a Flux `Alert` through a repository dispatch, reading the Collector's snapshot | no new Application | not live: the snapshot runs on its own interval, so a status lags the stage it reports by as much |
| The Release Gate reports its own stages | one Application fewer | the component that promotes would hold a GitHub write key, and Flux's stages are not its to see |
| The Collector reports | one Application fewer | the component that only reads would hold a write key |
| The identity in the artifact, as labels on the rendered objects | no annotations on the pin source | the content hash would change with every commit, so every release would move its pin whether or not its render changed |
| The dispatch App's key in the cluster | no second App | a key that can start workflows on every repository would sit in the cluster |

## Reversibility

Cheap. The annotations and the record in `composition.json` are additive: a
pin source without them applies the same, and removing the Reporter leaves
releases delivered and unreported. Nothing in the render depends on a Rollout.

## Consequences

- `composition.json` carries one Rollout per Project whose pin moves, and the
  composition workflow creates the Deployment from it and derives none of its
  fields.
- A Project's unit carries its Rollout on the pin source. A source written
  again while its pin stays keeps the one it is committed with, since the
  release that moved the pin is not something a later composition derives.
- The estate-scoped artifact has no Rollout: it is no Project's release.
- A Rollout's repository and commit are the fragment's own claims, and
  composition verifies no provenance. Whatever creates the Deployment must
  first have held the fragment to a signature made in the repository it names,
  or a fragment could open a Deployment on a repository that never released it.
- The Reporter is an Application of the platform's `delivery` Project with its
  own GitHub App, holding `deployments: write` and nothing else.
- The Platform document names the Reporter, as it names the gate, and that
  name is the one thing the model needs of it. Flux is in the bootstrap set and
  no Application, so nothing else could say who may receive its events: the
  named Application's `http` Process admits Flux's notification controller, the
  one peer of the bootstrap set a policy names.
- The Reporter is declared beside the Release Gate, in the same project file.
  The Platform document names it by id, and an id is something any project
  file can declare, so the id alone would hand every Project's events to
  whoever published the name first. Held to the gate's Project, the role can
  only be taken by a Project that already decides every promotion.
