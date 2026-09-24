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
| **Durability Class gating** | [0015](../../docs/adr/model/0015-durability-class-per-volume.md) | no destructive operation proceeds automatically against a volume declared `recoverable` or `irreplaceable`: the applier never prunes such a claim ([#158](https://github.com/JorisJonkers-dev/deploy-kit/issues/158)) |
| **Pinned inputs only** | [0006](../../docs/adr/model/0006-pinned-inputs.md), [0034](../../docs/adr/model/0034-cluster-state-pinned-input.md) | [Rendered artifacts and pins](#rendered-artifacts-and-pins): what is applied is a signed artifact named by digest, rendered from a recorded lock |

## Scope

Delivery is **pull**. Flux applies a render it fetches, and Flagger switches an
Application's Processes from the old version to the new one. Nothing pushes to
the cluster, so there is one applier, no deploy credential outside the
cluster, and Flagger owns only the objects it generates, which the render
therefore omits
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
| why rotating a secret is not a release | [Secret rotation](#secret-rotation) |
| what the render leaves to Flagger | [What the render leaves to Flagger](#what-the-render-leaves-to-flagger) |
| how a Project moves off the old path | [chapter 60](60-setup.md), specified by [#159](https://github.com/JorisJonkers-dev/deploy-kit/issues/159) |

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

The **switchover** is how an Application's new version replaces the old one. It
is derived from the owner's `cutover`
([chapter 10](10-project-intent.md#cutover-is-declared-not-promised),
[0128](../../docs/adr/model/0128-cutover-names-the-promise.md)) and recorded per
Process in the Resolved Deployment
([chapter 20](20-resolved-deployment.md#derived-mechanics)):

| `cutover` | switchover | what happens |
|---|---|---|
| `continuous` | `blue-green` | the new version starts beside the old one; the old keeps serving while the new is analysed, and traffic moves to the new version only once every member of the Application has passed |
| `interrupted` | `stop-start` | the old version stops, then the new one starts; the owner has accepted the gap |

Three rules hold the table true:

- **One Application, one switchover.** Every `lifecycle: application` Process of
  an Application answers `cutover` alike, because the Application switches as
  one (`E_RELEASE_UNIT_MIXED_CUTOVER`).
- **Room for the second copy.** A `blue-green` Process is eligible only on a node
  that fits two copies of it, for the length of its analysis
  ([chapter 20](20-resolved-deployment.md#layer-2-does-not-assign-a-node)).
- **A job has none.** A `lifecycle: job` Process switches nothing, so it carries
  no switchover and never waits on a gate.

What gates a `blue-green` switch, the barrier over every member and who answers
it, is [The Release Gate](#the-release-gate)'s, specified in full by
[#152](https://github.com/JorisJonkers-dev/deploy-kit/issues/152).

## The Release Gate

A first-party controller answers the switch's questions from the Resolved
Deployment: may this Application's new version start, and may it be promoted.
Specified in full by
[#152](https://github.com/JorisJonkers-dev/deploy-kit/issues/152).

## Held releases

A release that fails leaves the old version serving and is reported as held
until a new pin lands. Specified in full by
[#152](https://github.com/JorisJonkers-dev/deploy-kit/issues/152).

## Migrations

The estate has **one migration system**: Liquibase, with YAML changelogs
([0130](../../docs/adr/model/0130-migration-is-declared-on-the-application.md)).
An Application that derives a database answers how its schema moves
([chapter 10](10-project-intent.md#migration)), and a project's one database has
one Application that moves it:

| declared | what runs |
|---|---|
| `migration: {changelog}` | the migration image, built `FROM` the platform's runner with the changelog in it, runs once per Application revision as the migration identity, which alone holds the owner role, **before any new version of the Application starts** and while the old one still serves |
| `migration: self` | nothing of the platform's: the image migrates at startup, inside its own `startupBudget`, holding the owner role |
| `migration: none` | nothing: another Application of the project moves the schema, or there is none |

Because the migration runs while the old version serves, every change it makes
must be one the old version tolerates. What proves that, and what undoes a
migration whose release then fails, is [Failure and undo](#failure-and-undo)'s,
specified in full by
[#157](https://github.com/JorisJonkers-dev/deploy-kit/issues/157).

## Release order

A release of one Application runs in three steps, each gated on the one before,
all while the old version still serves:

1. **Migration up**, if the Application declares a changelog
   ([Migrations](#migrations)).
2. **Every prepare Process, in parallel**
   ([chapter 10](10-project-intent.md#prepare-processes)). Each runs to completion
   within its `startupBudget`, once per Application revision, and is never retried
   within one; there is no order among them.
3. **The new version starts**, by the Application's switchover
   ([Switchover](#switchover)).

A step that fails holds the release: the next step never starts and the old
version keeps serving. What is undone afterwards, and only the migration ever
is, is [Failure and undo](#failure-and-undo)'s.

## Failure and undo

What each failure leaves serving, and the only conditions under which a
migration is undone automatically. Specified in full by
[#157](https://github.com/JorisJonkers-dev/deploy-kit/issues/157).

## Secret rotation

Rotating a secret is not a release, so it never starts a switchover. Specified in
full by [#153](https://github.com/JorisJonkers-dev/deploy-kit/issues/153).

## What the render leaves to Flagger

Which objects Flagger generates and the render therefore omits, and what the
render marks so that Flux and Flagger do not fight over a field. Specified in
full by [#158](https://github.com/JorisJonkers-dev/deploy-kit/issues/158).
