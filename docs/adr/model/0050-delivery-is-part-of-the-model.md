---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/55-delivery.md#scope
rests-on: ["0001", "0002", "0006"]
---

# Delivery is part of the model: Flux pulls a signed, pinned render, and Flagger switches what must keep serving

How the estate deploys is specified in
[chapter 55](../../../spec/v1/55-delivery.md). Flux is the one applier: it pulls
each Project's render as a signed OCI artifact named by digest, reconciles
continuously, and prunes after it applies. A deploy is a pin commit
([0051](0051-a-project-is-delivered-as-a-signed-artifact.md)). Flagger switches
an Application's continuous Processes from the old version to the new one, and a
first-party Release Gate answers the switch's questions
([0052](0052-an-application-is-the-release-unit.md)). Schema migrations join the
model on the same footing ([0026](0026-migration-is-declared-on-the-application.md)).
There is no second applier, no push path, no field manager of the model's own
and no co-test gate; co-testing stays parked
([0069](../deferred/0069-co-testing-is-parked.md)). v1 ships when the live estate
renders from declared intent and is delivered through per-Project pins and
Flagger.

## Rests on

One maintainer and one cluster ([0001](0001-estate-scale-and-ownership.md)), so
one in-cluster applier is enough and nothing arbitrates between people. The
substrate's authorisation boundary and field ownership hold with one applier
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)): pull delivery
keeps the deploy credential inside the cluster. Every render is a function of
pinned inputs ([0006](0006-pinned-inputs.md)), so what Flux applies is named by a
digest and nothing else.

**False if:** delivering the live estate needs a decision still parked.
**Settled by:** one Project delivered end to end through its pin, then `auth`
released with one member forced to fail analysis, observing that no member's new
version receives traffic and the old versions keep serving.

## Why

**The model promised what delivery never did.** "No member's new version
receives traffic until every member's is healthy" existed as a demand with
nothing behind it. 21 of 30 Processes derived a stop-start roll, and Flux's
health checks ran after the apply, after traffic had moved.

**Pull, not push.** A push design (aggregators applying with their own
credentials, a reconcile CronJob per aggregator, a field manager per applier, a
Lease to serialise them, a namespace per deployer, a break-glass workflow) exists
to make two appliers coexist. A pinned render pulled by the one applier the
estate already runs needs none of it. The pin commit is the merge-shaped gate
point a push was once thought necessary for.

**Flagger, not a bespoke switch.** Holding traffic at the edge until the new
version is ready is Flagger's blue/green, a controller the estate pins rather
than writes, and its webhooks are where a per-Application barrier plugs in. What
Flagger lacks, a dependency between Canaries, is what the Release Gate adds.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep delivery out of the model | the release-unit promise stays untested | every image roll of a stop-start Process stays an outage |
| Push delivery by aggregators | two appliers, field managers, a Lease, credentials outside the cluster | all of it exists to make push coexist with Flux |
| Commit rendered YAML to a repository | a second copy of every object in git | a digest names the render in one line, immutably |
| A bespoke switch controller | a controller to write and operate alone | Flagger already switches blue/green |

## Reversibility

Undo cost today: move chapter 55 back out of the model: hours. Becomes
irreversible once: a Project is delivered by its pin and the old
`deploy/production` path is retired for it; the handover one Project at a time
keeps that cost per Project ([0054](0054-projects-are-handed-over-one-at-a-time.md)).

## Consequences

- The estate runs three new things: Flagger, the Release Gate, and an estate
  repository that composes, renders and pins, paid by joris in
  [#148](https://github.com/JorisJonkers-dev/deploy-kit/issues/148).
- Every blue/green release runs two copies of a Process for its analysis, paid
  in node capacity at every release.
- The rendered Vault policies and auth roles reach Vault through an in-cluster
  job ([0087](0087-in-cluster-consumers-read-the-render.md)), which delivering a
  `self` grant needs, paid in one more first-party Application.
