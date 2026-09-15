# Vocabulary

One term, one meaning, one spelling. This file **defines** the words; the
[`spec/v1`](spec/v1/00-overview.md) chapters are **normative** about the rules
those words participate in, and [`docs/adr/model/`](docs/adr/model/) records
**why** each rule is what it is. None of the three restates the others: a
definition here carries no field list, no error table and no rationale: it
names the concept and points at the chapter that governs it.

It is also the naming authority for code. A type, a folder or a diagnostic that
names one of these concepts uses the word below, unchanged, so that a reviewer
moving between a chapter and a module never translates.

## The three-model pipeline

**Three-model pipeline**: the arrangement of the whole model. Deployment
configuration is split into three layers, and the middle one is a contract
([0003](docs/adr/model/0003-three-model-pipeline.md), normative in
[chapter 00](spec/v1/00-overview.md#the-three-model-pipeline)). **Layer 1
contains no mechanisms; layer 3 contains no decisions.** Each layer is a
**model**, and each is joined to the next by a transformation. The layers are
stages of one pipeline, not metalevels: no layer is a type model of the one
below it. So the arrangement is not a "meta-model", a name this record used to
carry and has retired; say *three-model pipeline*, and say *layer 1*, *layer 2*
and *layer 3* for its members.

**Metamodel**: the definition of the language a model is written in, and
nothing else. A metamodel is a model whose instances are models, so the word is
never used for a layer, a document, an abstraction level or the pipeline as a
whole. The production implementation declares its languages as wire schemas;
the model-driven implementation under `emf/` has two hand-written Ecore
metamodels, a source and a target, and generates the Deliverable Set as files
with no metamodel of its own. One word, `metamodel`, unhyphenated.

**Project Intent**: layer 1. What a project's repository authors by hand:
requirements, never mechanisms. Two kinds of file, a project file and one env file
set per Process ([chapter 10](spec/v1/10-project-intent.md)).

**Platform Intent**: layer 1, the second authored document. What the estate
offers, authored by the platform: substrate facts, the bootstrap set, tiers,
durability and observability policy, engines, providers. Same rule as Project
Intent, and the contention test decides which of the two a value lives in
([chapter 14](spec/v1/14-platform-intent.md),
[0095](docs/adr/model/0095-platform-intent-is-the-second-authored-document.md)).
Formerly the *Cluster Context*, which had no chapter.

**Resolved Deployment**: layer 2. Every platform decision, derived and never
authored, as a pure function of the pinned input set. A versioned, reviewable
artifact ([chapter 20](spec/v1/20-resolved-deployment.md)).

**Deliverable Set**: layer 3. The serialized output. Files, no decisions
([chapter 30](spec/v1/30-deliverables.md)).

## Layer 1: what a human authors

**Project**: the authored document, and the unit of publication. One project
file holds one project's `owner` and every Application in it. A project never spans
repositories ([0063](docs/adr/model/0063-intent-authored-per-project.md)).

**Application**: the release unit, and the thing an owner reasons about. Holds one
or more Processes, its exposure and its shared grants
([0062](docs/adr/model/0062-application-is-the-release-unit.md)).

**Process**: one program to run, with its own image, lifecycle, env file set,
probes, volumes, placement and hardening. A port is a property of a process, so
`provides` hangs off the Process; a hostname is a property of the product, so
exposure hangs off the Application.

**Surface**: a named port a Process provides. What a dependency edge and a
route both name.

**Sidecar**: a second container in a Process's pod, and Process vocabulary
rather than an Application of its own
([0064](docs/adr/model/0064-sidecars-are-process-vocabulary.md)).

**Dependency edge**: a declared need for another Application's Surface, carrying
whether it is required ([chapter 16](spec/v1/16-dependencies.md)).

**Exposure**: a hostname an Application answers on, its audience and its content
policy. Holds one or more Routes.

**Route**: a path within an Exposure, naming the Process and Surface that
serve it.

**Audience**: who may reach an Exposure. The declared word from which the edge
mechanism is derived ([0018](docs/adr/model/0018-exposure-by-audience.md)).

**Probe**: a declared readiness or liveness check.

**Asset**: a file mounted into a Process. Declarative, never executable
([0012](docs/adr/model/0012-assets-not-code.md)). Its object name is
content-hashed and a change restarts the Process, unconditionally
([0094](docs/adr/model/0094-asset-change-restarts-unconditionally.md)).

**Volume**: a claim mounted at a path, carrying its Durability Class.

**Durability Class**: what losing a volume costs: `reconstructible`,
`recoverable`, `irreplaceable`. Gates every destructive operation
([0015](docs/adr/model/0015-durability-class-per-volume.md)), and derives the
backup objects that make the class mean something
([0077](docs/adr/model/0077-durability-derives-a-backup.md)).

**Engine**: what a Process *is*, where the platform must treat it
specially: `postgres`, `rabbitmq`, `valkey`, `files`. Not `runtime`, which says
how a process is instrumented
([0078](docs/adr/model/0078-engine-is-process-vocabulary.md)).

**Durability policy**: the platform's terms for one Durability Class: the
backup window, the retention count, and the off-cluster destination. Carried by
the Platform Intent, never authored per volume.

**Placement**: the hard dimensions a Process requires of a node: memory, cpu,
architecture, site, capabilities, and optionally disk and GPU. Eligibility, not
bin-packing ([0061](docs/adr/model/0061-placement-is-hard-dimensions.md)).

**Capability**: a named node property a Process may require.

**Hardening Class**: the pod security posture every Process takes, declared
once by the platform and authored by none of them. It has no exception surface:
a Process states the paths it must write, and an image that cannot meet the
class is refused ([0016](docs/adr/model/0016-pod-hardening.md)).

**Runtime Profile**: the profile selected by `runtime`, from which observability
and runtime environment variables are derived. Writing one of its keys by hand
is a build error.

**Alert Class**: how urgently a signal about this Application should wake
someone. Urgency only: which receiver, which channel and which severity mapping
belong to the monitoring stack that reads the projection, never to this model
([0021](docs/adr/model/0021-observability-scrape-and-alert-class.md)).

**Grant**: declared access to a Secret Store path, its keys, its access tier
and its delivery mode. Lives on the Application, or on a Process when it is
specific to one ([0022](docs/adr/model/0022-grants-live-on-the-application.md),
[0023](docs/adr/model/0023-grant-unit-is-the-path.md)).

**Placeholder**: an env-file entry naming what should be substituted rather
than carrying a value. A secret placeholder byte-matches a granted path
([0027](docs/adr/model/0027-secret-reference-join-key.md)).

**Capacity exception**: the sole local exception to a derived value:
`replicas: {count, reason}`, with the reason required
([0031](docs/adr/model/0031-derived-overrides-with-reason.md)). There is no
generic override mechanism.

## Composition: many repositories, one estate

**Intent Fragment**: one project file published as an OCI artifact, by digest
([0037](docs/adr/model/0037-composition-oci-fragments.md),
[chapter 40](spec/v1/40-composition.md#fragments)).

**Composition**: the run that unions the published fragments and checks the
estate-wide invariants. It merges nothing, and runs on every publish.

**ComposedIntent**: the union that composition produces.

**Composition lock**: composition's output recording the digest of every
fragment it resolved. An output rather than an input, because an artifact
cannot contain its own digest.

**Participants**: the expected set of publishing projects, with a staleness
bound. A missed publish is a deletion, so the bound is what makes silence
visible ([0038](docs/adr/model/0038-participants-list-staleness.md)).

**Schema version**: the data model's own semver, carried by each document
family and separate from the toolkit's package version
([0039](docs/adr/model/0039-artifact-schema-versioning.md)).

## Layer 2: what the platform decides

**Pinned input set**: the closed set layer 2 derives from: every Intent Fragment
(the project files and the Platform document), the node contract, the locks, and
the ClusterState snapshot, each carried by digest. Nothing at render time reads live cluster
state ([0006](docs/adr/model/0006-pinned-inputs.md),
[0034](docs/adr/model/0034-cluster-state-pinned-input.md)).

**Node contract**: the node facts a cluster publishes, authored once where nix
reads them and named by the Platform document by digest
([0056](docs/adr/model/0056-node-facts-single-source.md)).

**Tier**: where the edge terminates: four facts, `audiences`, `listener`,
`certificates`, `forwardAuth`, plus the Traefik Application that is its proxy. A
route's audience is the only way it reaches a tier
([chapter 14](spec/v1/14-platform-intent.md#tiers)).

**Provider**: something the estate runs and does not deploy, that an Application may
depend on: an address and surfaces, in the Platform document. A fact, not a hole
([chapter 14](spec/v1/14-platform-intent.md#providers)).

**Bootstrap set**: what must exist before the first rendered object can apply:
k3s, the Flux source, Vault's unseal, the CRDs. Recorded, enumerated, never
declared ([0099](docs/adr/model/0099-bootstrap-set-is-recorded.md)).

**The foundation**: Vault, VSO, Traefik, Prometheus, Gatus: Applications in project
files the platform owns, declared like any tenant
([0096](docs/adr/model/0096-the-foundation-is-declared.md)). Not packs, not
charts.

**ClusterState snapshot**: observed cluster facts captured once, digested, and
then treated as an input like any other.

**Images lock**: image digests, never tags.

**Authority**: which side declares a value. Platform-assigned if and only if it
must be unique across the estate or draws on a shared finite resource
([0004](docs/adr/model/0004-contention-decides-authority.md)).

**ResolvedService**: the projection of the Resolved Deployment belonging to one
Application, obtained by filtering and published back to its repository
([0033](docs/adr/model/0033-assignments-published-back.md)).

**Reconcile Unit**: the ordering unit, derived from the dependency graph and
never declared ([0032](docs/adr/model/0032-reconcile-unit-derived.md)).

**Release Unit**: the set that switches together: no member's new version
receives traffic until every member's new version is healthy
([0060](docs/adr/model/0060-release-unit.md)).

**`renderHash`**: the hash identifying a render. A function of the recorded
input digests alone, so if it changes at least one input changed.

## Layer 3: what is written out

**Deliverable**: one serialized object destined for a file. Attributed to
exactly one Adapter ([0054](docs/adr/model/0054-adapter-attribution.md)).

**Adapter**: one of six named renderers registered in one registry, every one
central and run once over the composed union. Documents in, attributed
Deliverables out; deterministic; no ambient reads
([0052](docs/adr/model/0052-registered-adapters-are-v1.md),
[0053](docs/adr/model/0053-adapter-port-contract.md)).

**Adapter port**: the single typed contract every Adapter satisfies.

**Bidirectional ledger**: where an accepted hole is recorded, with an owner and
a reason. Bidirectional because an entry outliving the gap it covered fails the
build too ([0055](docs/adr/model/0055-bidirectional-ledgers.md)).

**Unmanaged surface**: a hostname nobody deploys and nobody depends on,
registered as a ledger entry rather than ignored
([0019](docs/adr/model/0019-registered-unmanaged-surfaces.md)). Something the
estate *depends on* is a Provider, not an unmanaged surface.

## Words to use carefully

**Fragment.** One meaning now: the **Intent Fragment**, an authored document
published by digest. The output unit is a **Deliverable**, in chapter 30 as
everywhere else, and the `*Fragment` producer kinds are deleted
([0098](docs/adr/model/0098-one-publication-path.md)). Say *Intent Fragment*
in prose, `IntentFragment` in code, and never `Fragment` bare.

**Cluster Context.** Retired. The document is Platform Intent; the old name
described observed context and the content is authored intent
([0095](docs/adr/model/0095-platform-intent-is-the-second-authored-document.md)).

**Deployment.** Ambiguous between the Kubernetes kind and the estate's old
`deployment.jorisjonkers.dev` documents, which is the confusion
[0003](docs/adr/model/0003-three-model-pipeline.md) exists to end. Say
Resolved Deployment, or say the Kubernetes kind.

**Reload.** A secret's `rotation.tolerates: reload`, and nothing else: the
client library re-reads the value itself, which happens under `delivery: self`.
An Asset has no such actor, so an Asset change restarts
([0094](docs/adr/model/0094-asset-change-restarts-unconditionally.md)).

**Render.** Two steps, both layer 2 to layer 3. The **adapters** map the
Resolved Deployment into the narrow Kubernetes and Vault object model (a
model-to-model step, one per registered adapter), and the **serializer** turns
those objects into the rendered bytes (the only model-to-text step). The
vocabulary keeps the two apart so the act of deciding is still *resolution* or
*derivation*, never rendering, and an adapter never formats bytes itself.

**Deploy.** Applying Deliverables to a cluster, which is **defined separately**
from this model ([`docs/adr/deferred/`](docs/adr/deferred/README.md)). A render
is not a deploy.

**Service.** Retired as a model word: the level is **Application**
([0116](docs/adr/model/0116-project-application-process.md)). Say *Service*
only for the Kubernetes `Service` object a Deliverable contains.

**Workload.** Retired as a model word: the level is **Process**. A rendered
`workload.yaml` keeps the name, because layer 3 spells what the target calls
its objects.

**Domain.** Retired as a model word: the level is **Project**. *Domain* is left
for a DNS name, an ADR decision domain, and the core ring of the compiler's
hexagon.

**Bootstrap.** The bootstrap set and the bootstrap order, and nothing else.
The first build of the model-driven implementation under `emf/` is the **EMF
scaffold** (its Maven build, gates and CI job, with no EMF dependency), and its
first change that depends on the modelling tools is the **walking skeleton**,
which proves each tool runs headless.

**Config.** Avoid. Env files carry *configuration*; the platform's facts and
policies are *Platform Intent*; an Application's authored document is *Project Intent*.
