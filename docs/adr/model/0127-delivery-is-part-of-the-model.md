---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-24
normative: spec/v1/55-delivery.md#scope
rests-on: ["0001", "0002", "0006"]
---

# Delivery is part of the v1 model: Flux pulls a signed, pinned render and Flagger switches it

How the estate deploys stops being "defined separately". It is specified in
[chapter 55](../../../spec/v1/55-delivery.md): Flux pulls each Project's render
as a signed OCI artifact named by digest, Flagger switches an Application's
Processes from the old version to the new one, and a first-party Release Gate
answers the switch's questions from the Resolved Deployment. Schema migrations
join the model on the same footing.

This supersedes [0059](0059-v1-scope-stopping-rule.md). v1 ships when the live
estate renders from declared intent **and is delivered through per-Project pins
and Flagger**, not when it is delivered by an unchanged Flux tree. The
directory partition 0059 introduced survives: `docs/adr/deferred/` now holds
co-testing and the delivery records this decision retires, each with its fate
stated in [its inventory](../deferred/README.md).

## Rests on

One maintainer and one cluster ([0001](0001-estate-scale-and-ownership.md)), so
a single in-cluster applier with a single field owner is enough, and nothing
here arbitrates between people. Kubernetes is kept for its API server as an
authorisation boundary and for server-side-apply field ownership
([0002](0002-kubernetes-as-substrate.md)): pull delivery keeps the deploy
credential inside that boundary. Every render is a function of pinned inputs
([0006](0006-pinned-inputs.md)), so what Flux applies can be named by the digest
of a render and nothing else.

**False if:** delivering the live estate needs a decision still parked in
`docs/adr/deferred/`. **Settled by:** deliver one Project end to end through
its pin, then release `auth` with one member forced to fail analysis and observe
that no member's new version receives traffic and the old versions keep serving.

## Why

The model already promised what delivery never did. The Release Unit rule
(no member's new version receives traffic until every member's is healthy)
existed as a demand with nothing behind it; chapter 20 said so in as many
words. 21 of 30 Processes derive a stop-start roll, and Flux's health checks
run after the apply, after traffic has moved. Parking delivery kept the
model's scope honest and left its most visible promise untested.

**Pull, not push.** The parked design was a push: Aggregators applying the
derived objects with their own credentials, a reconcile CronJob per
Aggregator, field managers per applier, a Lease to serialise them, and a
break-glass workflow ([0041](../deferred/0041-push-delivery-boundary.md) to
[0047](../deferred/0047-namespace-per-deployer.md)). Most of that machinery
exists to make two appliers coexist. A pinned render pulled by the one applier
the estate already runs needs none of it: Flux reconciles continuously, prunes
after it applies, and owns every field it applies, and the pin commit is the
merge-shaped gate point that [0008](../deferred/0008-tested-equals-deployed-requires-push.md)
argued pull could not provide.

**Flagger, not a bespoke switch.** The rendered auth example records three ways
to make the switch real: hold traffic at the edge, pause ReplicaSets and flip a
selector, or gate outside Kubernetes. Flagger's blue/green does the first with
a controller the estate can pin rather than write, and its webhooks are where a
per-Application barrier plugs in. What Flagger lacks, a dependency between
Canaries, is exactly what the Release Gate adds.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep delivery parked until workspace#45 runs | the Release Unit promise stays untested; every image roll of a stop-start Process stays an outage | the parked design's premise (push is required) no longer holds once a pin commit exists |
| Take up the parked push design | two appliers, field managers, a Lease, deploy credentials outside the cluster, a reconcile CronJob per Aggregator | all of it exists to make push coexist with Flux; a pulled pin needs none of it |
| Commit the rendered YAML to a repository | a second copy of every object in git, diffs nobody reads, and merge conflicts on generated files | a digest names the same render in one line, and the artifact is immutable |
| A bespoke switch controller | a controller to write, test and operate alone | Flagger switches blue/green already; only the barrier is missing |

## Reversibility

Undo cost today: move this record's decisions back into `deferred/` and restore
the "defined separately" text in chapters 00 and 50, hours. Becomes
irreversible once a Project is delivered by its pin and `fleet-infra`'s
`deploy/production` path is retired for it: reversing then means rebuilding the
old path. The per-Project handover keeps that cost per Project rather than
estate-wide.

## Consequences

- [0059](0059-v1-scope-stopping-rule.md) is superseded; its finish line moves
  and its 2026-11-30 review of the deferred set is replaced by this record's
  settling test, paid by joris, who owns the date.
- [0041](../deferred/0041-push-delivery-boundary.md),
  [0044](../deferred/0044-reconcile-cronjob.md),
  [0045](../deferred/0045-break-glass-reporting.md),
  [0046](../deferred/0046-distinct-field-managers.md) and
  [0047](../deferred/0047-namespace-per-deployer.md) are retired rather than
  taken up; co-testing (0049–0051) stays parked, and its premise is re-graded
  against the pin commit, paid by whoever takes co-testing up.
- The estate gains three things it must run: Flagger, the Release Gate, and an
  estate repository that composes, renders and pins, paid by joris, in
  [#148](https://github.com/JorisJonkers-dev/deploy-kit/issues/148).
- Every blue/green release runs two copies of a Process for its analysis, paid
  in node capacity at every release.
