# Chapter 55: Delivery

How a render reaches the cluster, how an Application's new version replaces
the old one, and how its schema moves with it. Until 2026-09-24 this was
"defined separately" from the model; it is now part of it
([0127](../../docs/adr/model/0127-delivery-is-part-of-the-model.md)).

The model's three demands on delivery stand, and this chapter is how they are
met rather than a list of them:

| demand | decided in | how delivery meets it |
|---|---|---|
| **Release Unit atomicity** | [0062](../../docs/adr/model/0062-application-is-the-release-unit.md) | [Switchover](#switchover): a barrier over every member of the Application, run by the [Release Gate](#the-release-gate) |
| **Durability Class gating** | [0015](../../docs/adr/model/0015-durability-class-per-volume.md) | the applier never prunes a claim whose class derives a backup |
| **Pinned inputs only** | [0006](../../docs/adr/model/0006-pinned-inputs.md), [0034](../../docs/adr/model/0034-cluster-state-pinned-input.md) | [Rendered artifacts and pins](#rendered-artifacts-and-pins): what is applied is a signed artifact named by digest, rendered from a recorded lock |

## Scope

Delivery is **pull**. Flux applies a render it fetches, and Flagger switches an
Application's Processes from the old version to the new one. Nothing pushes to
the cluster, so there is one applier, one field owner for what it applies, and
no deploy credential outside the cluster
([0127](../../docs/adr/model/0127-delivery-is-part-of-the-model.md)).

What is in scope, and the section that specifies each:

| concern | section |
|---|---|
| how a render becomes something Flux can fetch, and how a deploy is recorded | [Rendered artifacts and pins](#rendered-artifacts-and-pins) |
| how an Application's new version replaces the old one | [Switchover](#switchover) |
| what gates the switch, and who answers | [The Release Gate](#the-release-gate) |
| what a failed release leaves behind | [Held releases](#held-releases) |
| how a schema moves with its Application | [Migrations](#migrations) |
| what runs before a new version starts, in what order | [Release order](#release-order) |
| what undoes a failed migration, and when it may | [Failure and undo](#failure-and-undo) |

What is not in scope:

- **Co-testing**, whether one Application's tests gate another's deploy. It
  stays parked in [`docs/adr/deferred/`](../../docs/adr/deferred/README.md).
- **Image admission**: verifying an image's signature when a pod is admitted. A
  recorded gap with an owner, not a decision.
- **A second cluster.** The estate is one cluster
  ([0001](../../docs/adr/model/0001-estate-scale-and-ownership.md)).
- **Writing the Vault policy and auth roles.** They are Deliverables of the
  `vault-policy` adapter ([chapter 30](30-deliverables.md)); which identity
  writes them into Vault is not yet decided, and is recorded here rather than
  left implicit.

## Rendered artifacts and pins

Each Project's render is one OCI artifact, signed, and named by digest. A deploy
is a commit that changes which digest a Project's source points at: the
estate's git history is its deploy log, and no rendered YAML is committed
anywhere. Specified in full by
[#154](https://github.com/JorisJonkers-dev/deploy-kit/issues/154).

## Switchover

A Process whose `cutover` keeps serving releases blue/green: its new version
starts beside the old one and receives traffic only when every member of its
Application has passed analysis. Specified in full by
[#151](https://github.com/JorisJonkers-dev/deploy-kit/issues/151) and
[#152](https://github.com/JorisJonkers-dev/deploy-kit/issues/152).

## The Release Gate

A first-party service answers the switch's questions from the Resolved
Deployment: may this Application's new version start, and may it be promoted.
Specified in full by
[#152](https://github.com/JorisJonkers-dev/deploy-kit/issues/152).

## Held releases

A release that fails leaves the old version serving and is reported as held
until a new pin lands. Specified in full by
[#152](https://github.com/JorisJonkers-dev/deploy-kit/issues/152).

## Migrations

An Application that derives a database moves its schema with one estate-wide
system, before its new version starts, and proves the move safe against the
version still serving. Specified in full by
[#155](https://github.com/JorisJonkers-dev/deploy-kit/issues/155) and
[#157](https://github.com/JorisJonkers-dev/deploy-kit/issues/157).

## Release order

Migration first, then any forward-only setup, then the new version. Specified in
full by [#156](https://github.com/JorisJonkers-dev/deploy-kit/issues/156).

## Failure and undo

What each failure leaves serving, and the only conditions under which a
migration is undone automatically. Specified in full by
[#157](https://github.com/JorisJonkers-dev/deploy-kit/issues/157).
