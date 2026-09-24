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
  recorded gap with an owner, not a decision
  ([Rendered artifacts and pins](#rendered-artifacts-and-pins)).
- **A second cluster.** The estate is one cluster
  ([0001](../../docs/adr/model/0001-estate-scale-and-ownership.md)).
- **Writing the Vault policy and auth roles.** They are Deliverables of the
  `vault-policy` adapter ([chapter 30](30-deliverables.md)); which identity
  writes them into Vault is not yet decided, and is recorded here rather than
  left implicit.

## Rendered artifacts and pins

Each Project's render is one OCI artifact, signed, and named by digest. A deploy
is a commit that changes which digest a Project's source points at: the
estate's git history is its deploy log, and no rendered Deliverable is committed
anywhere ([0133](../../docs/adr/model/0133-a-project-is-delivered-as-a-signed-artifact-pinned-by-digest.md)).

```text
ghcr.io/jorisjonkers-dev/render/auth@sha256:…     one Rendered artifact per Project
  dev.jorisjonkers.content-hash  sha256:…          this Project's share of the rendered tree
  dev.jorisjonkers.render-hash   sha256:…          the Resolved Deployment's renderHash
  dev.jorisjonkers.lock-digest   sha256:…          the composed artifact carrying the lock
```

- **One artifact per Project.** Composition renders the estate once and
  publishes each Project's share of the rendered tree as one artifact at
  `<repository>/<project>`, where `repository` is the Platform document's
  `bootstrap.flux.artifacts.repository`
  ([chapter 14](14-platform-intent.md#the-bootstrap-set)). Each of the Project's
  Reconcile Units applies its own path inside it
  ([chapter 20](20-resolved-deployment.md#the-reconcile-unit)). The paths the
  path plan scopes to the estate rather than to a Project
  ([chapter 20](20-resolved-deployment.md#the-path-plan)) form one more artifact,
  `<repository>/estate`, published and pinned exactly like a Project's.
- **Signed keyless, and annotated.** The artifact is signed by the composition
  workflow's own OIDC identity, the Platform document's
  `bootstrap.flux.artifacts.signer`, so no signing key exists to leak or rotate.
  It carries the render hash and the digest of the composed artifact that holds
  the lock, so an artifact names the inputs that reproduce it, and the content
  hash of the files it holds.
- **An unchanged render publishes nothing.** The files an artifact holds are its
  Project's share of the rendered tree and nothing else. A composition that
  renders a Project whose content hash equals the pinned artifact's publishes
  no artifact and moves no pin, so another Project's fragment never redeploys
  this one; the pinned artifact keeps naming the composition that first
  produced its content.
- **The pin.** The estate repository holds one committed Flux source per
  Project, `projects/<project>/source.yaml`: an `OCIRepository` naming
  `<repository>/<project>` by `ref.digest` and verifying keyless against the
  signer, with one Kustomization per Reconcile Unit of the Project applying its
  path. Composition writes the file the first time a Project composes, from the
  Platform document and the Reconcile Unit DAG, and afterwards changes only its
  `ref.digest`. Removing a retired Project's file is a handover step, not a pin
  ([chapter 60](60-setup.md)). After publishing, composition commits to the
  estate repository's `main` the moved `ref.digest` of every Project whose
  artifact changed, marked `[ci skip]` so the estate repository's push checks
  do not run on a commit that only moves digests. That commit is the deploy.
  These files are the only committed objects; the Deliverables themselves exist
  only inside artifacts.
- **Flux verifies before it applies.** An artifact whose signature does not
  verify against the signer is never applied: its source reports the failure,
  and what was running keeps running. Composition verifies each artifact the
  same way, against the Platform document's signer, before it commits a pin,
  and a composition that failed any step before it commits no pin at all.
- **A fragment names only images that exist.** An application repository
  publishes its Intent Fragment only after its images are built and pushed, with
  every image alias it names resolved to a digest, a UID and a GID in the
  fragment's own contribution to the images lock. A composition therefore never
  renders a reference nothing can pull. This amends
  [0037](../../docs/adr/model/0037-composition-oci-fragments.md), whose fragment
  was published independently of any image build.
- **Rollback is a revert in the application repository.** The revert publishes
  a fragment, which composes a render, which moves the pin forward to the old
  content: the deploy log only grows. Reverting a pin commit directly is
  **break-glass**, for when composition itself cannot run. It puts the estate on
  a render its current inputs no longer produce, so the next composition moves
  it back unless the inputs are reverted as well.

**Image admission** is the recorded gap in [Scope](#scope): nothing verifies an
image's signature when a pod is admitted, only the render's when it is fetched.
The owner is joris, and the policy that closes it is part of the estate's
delivery machinery ([#148](https://github.com/JorisJonkers-dev/deploy-kit/issues/148)).

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
| `continuous`, on delivery machinery | `rolling` | the new version replaces the old one pod by pod, with no gate: the machinery that performs a switchover cannot be switched by itself ([The Release Gate](#the-release-gate)) |
| `interrupted` | `stop-start` | the old version stops, then the new one starts; the owner has accepted the gap |

Four rules hold the table true:

- **One Application, one switchover.** Every `lifecycle: application` Process of
  an Application answers `cutover` alike, because the Application switches as
  one (`E_RELEASE_UNIT_MIXED_CUTOVER`).
- **Room for the second copy.** A `blue-green` Process is eligible only on a node
  that fits two copies of it, for the length of its analysis
  ([chapter 20](20-resolved-deployment.md#layer-2-does-not-assign-a-node)).
- **A worker is a member too.** A `blue-green` Process with no Surface is gated
  like any other. Flagger needs a Service to switch, so the adapter derives one
  with no port for it; layer 2 carries nothing for that Service, because it
  follows from a member with no Surface. Its new version consumes
  real work while it is analysed, so a worker that switches continuously must be
  idempotent and must tolerate one version of skew with its siblings.
- **A job and a prepare step have none.** A `lifecycle: job` or
  `lifecycle: prepare` Process switches nothing, so it carries no switchover and
  never waits on a gate; a prepare Process runs before the switch instead
  ([Release order](#release-order)).

**The barrier, then the promotion.** A `blue-green` Application's members start
their new versions independently and are analysed independently. None is
promoted until **every** member has passed its analysis: that is the barrier,
and it is the Release Unit rule
([chapter 50](50-lifecycle.md#release-unit-switchover)) made mechanical. Once the
barrier opens, each member is promoted on its own, seconds apart, so members of
one Application must tolerate the old and the new version of each other for
that window. A single-instant switch across Processes does not exist: traffic
between Processes goes through their own Services, and no edge flip moves it.

## The Release Gate

The **Release Gate** is the first-party controller that answers the switchover's
two questions, from the Resolved Deployment and nothing else
([0132](../../docs/adr/model/0132-the-release-gate-answers-the-switch.md)):

| question | asked | the gate answers yes when |
|---|---|---|
| may this member's new version start? | once per member per revision, before its new version scales up | the Application's migration and every prepare Process for this revision have completed ([Release order](#release-order)), and the revision the compatibility proof was run against is the one serving ([Failure and undo](#failure-and-undo)) |
| may this member be promoted? | after the member's own analysis passes | every member of the Application has passed its analysis for this revision: the barrier |

It reads the Application's release-gate inputs (its members, their readiness,
their analysis checks and the gate deadline;
[chapter 20](20-resolved-deployment.md#the-release-gate)), and names the release
by its [Application revision](20-resolved-deployment.md#the-application-revision).
No executable code is rendered for it: a Canary names the gate's endpoint, and
the decision is the gate's, from data.

**Analysis** is the platform's. Its cadence (interval, iterations, threshold) is
the Platform document's `delivery.analysis`
([chapter 14](14-platform-intent.md#delivery-policy)), and the checks a member
is analysed on derive from its Runtime Profile: a profile that exposes HTTP
server metrics is checked for error rate and latency, and one that does not is
checked for readiness alone. Nothing about analysis is authored per Application.

**The gate fails closed.** When the gate cannot answer, it answers no: every
switch waits, the old versions keep serving, and an alert fires. A release is
never let through because the thing that would stop it is down.

**Delivery machinery is never gated.** Flagger, the Release Gate and the edge
proxies are listed in the Platform document as the delivery machinery
([chapter 14](14-platform-intent.md#delivery-policy)); Flux is in the bootstrap
set, not an Application, so it is never switched at all. Their Processes derive a
`rolling` switchover when `continuous`, never `blue-green`: a gate cannot gate
its own release, and an edge proxy on a host port cannot run two copies.

## Held releases

A release that fails leaves the Application **held**: the old version keeps
serving while the pin names the new one. It fails when a member does not pass
its analysis within the gate deadline, when the barrier does not open within it,
or when a migration or prepare step fails before any new version starts.

The Release Gate reports a held Application as the pair (serving revision,
pinned revision) and alerts until a new pin lands, whether that is a fix forward
or a revert in the application repository. Nothing reverts the pin
automatically: the old version is already serving, and an automatic revert would
race the fix.

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

Rotating a secret is not a release, so it never starts a switchover
([chapter 10](10-project-intent.md#rotation-is-not-a-release),
[0134](../../docs/adr/model/0134-rotating-a-secret-is-not-a-release.md)).
Flagger starts an analysis whenever a Canary's pod template changes, and by
default it also counts a change to any Secret or ConfigMap the template
references as one. The render removes that second trigger for the Secrets
Vault delivers:

- **Every Secret the render asks Vault to write is excluded from configuration
  tracking.** Its destination carries `flagger.app/config-tracking: disabled`,
  so a new value is never a new Canary revision. The exclusion is uniform: it is
  written on every Vault-delivered Secret, not only those a `blue-green` Process
  reads, so a Process that changes switchover does not change how its secrets
  behave.
- **A restart names what is serving.** Where a grant tolerates only `restart`,
  the Process's serving workload is restarted in place. For a `blue-green`
  Process that is `<name>-primary`, the Deployment Flagger promotes into; the
  Deployment named `<name>` is Flagger's source of new versions and serves
  nothing between releases. For every other Process it is `<name>`.

Layer 2 records which Processes a rotation restarts, by Process name
([chapter 20](20-resolved-deployment.md#derived-mechanics)); the `-primary`
spelling is the adapter's, because it names a Flagger object rather than a
model concept. The workloads it names are rendered with the rest of the
Flagger-ready objects
([#158](https://github.com/JorisJonkers-dev/deploy-kit/issues/158)).

## What the render leaves to Flagger

Which objects Flagger generates and the render therefore omits, and what the
render marks so that Flux and Flagger do not fight over a field. Specified in
full by [#158](https://github.com/JorisJonkers-dev/deploy-kit/issues/158).
