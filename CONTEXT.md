# Vocabulary

One term, one meaning, one spelling. This file **defines** the words; the
[`spec/v1`](spec/v1/00-overview.md) chapters are **normative** about the rules
those words participate in, and [`docs/adr/model/`](docs/adr/model/) records
**why** each rule is what it is. None of the three restates the others: a
definition here carries no field list, no error table and no rationale — it
names the concept and points at the chapter that governs it.

It is also the naming authority for code. A type, a folder or a diagnostic that
names one of these concepts uses the word below, unchanged, so that a reviewer
moving between a chapter and a module never translates.

## The three layers

Deployment configuration is split into three layers, and the middle one is a
contract ([0003](docs/adr/model/0003-three-layer-meta-model.md), normative in
[chapter 00](spec/v1/00-overview.md#the-meta-model)). **Layer 1 contains no
mechanisms; layer 3 contains no decisions.**

**Service Intent** — layer 1. What a repository authors by hand: requirements,
never mechanisms. Two kinds of file, a domain file and one env file set per
Workload ([chapter 10](spec/v1/10-service-intent.md)).

**Resolved Deployment** — layer 2. Every platform decision, derived and never
authored, as a pure function of the pinned input set. A versioned, reviewable
artifact ([chapter 20](spec/v1/20-resolved-deployment.md)).

**Deliverable Set** — layer 3. The serialized output. Files, no decisions
([chapter 30](spec/v1/30-deliverables.md)).

## Layer 1 — what a human authors

**Domain** — the authored document, and the unit of publication. One domain
file holds one domain's `owner` and every Service in it. A domain never spans
repositories ([0063](docs/adr/model/0063-intent-authored-per-domain.md)).

**Service** — the release unit, and the thing an owner reasons about. Holds one
or more Workloads, its exposure and its shared grants
([0062](docs/adr/model/0062-service-is-the-release-unit.md)).

**Workload** — one process to run, with its own image, lifecycle, env file set,
probes, volumes, placement and hardening. A port is a property of a process, so
`provides` hangs off the Workload; a hostname is a property of the product, so
exposure hangs off the Service.

**Surface** — a named port a Workload provides. What a dependency edge and a
route both name.

**Sidecar** — a second container in a Workload's pod, and Workload vocabulary
rather than a Service of its own
([0064](docs/adr/model/0064-sidecars-are-workload-vocabulary.md)).

**Dependency edge** — a declared need for another Service's Surface, carrying
whether it is required ([chapter 16](spec/v1/16-dependencies.md)).

**Exposure** — a hostname a Service answers on, its audience and its content
policy. Holds one or more Routes.

**Route** — a path within an Exposure, naming the Workload and Surface that
serve it.

**Audience** — who may reach an Exposure. The declared word from which the edge
mechanism is derived ([0018](docs/adr/model/0018-exposure-by-audience.md)).

**Probe** — a declared readiness or liveness check.

**Asset** — a file mounted into a Workload. Declarative, never executable
([0012](docs/adr/model/0012-assets-not-code.md)).

**Volume** — a claim mounted at a path, carrying its Durability Class.

**Durability Class** — what losing a volume costs: `reconstructible`,
`recoverable`, `irreplaceable`. Gates every destructive operation
([0015](docs/adr/model/0015-durability-class-per-volume.md)).

**Placement** — the hard dimensions a Workload requires of a node: memory, cpu,
architecture, site, capabilities, and optionally disk and GPU. Eligibility, not
bin-packing ([0061](docs/adr/model/0061-placement-is-hard-dimensions.md)).

**Capability** — a named node property a Workload may require.

**Hardening Class** — the pod security posture a Workload takes, with named
exceptions each carrying a reason
([0016](docs/adr/model/0016-pod-hardening.md)).

**Runtime Profile** — the profile selected by `runtime`, from which observability
and runtime environment variables are derived. Writing one of its keys by hand
is a build error.

**Alert Class** — how an alert on this Service should be delivered
([0021](docs/adr/model/0021-observability-scrape-and-alert-class.md)).

**Grant** — declared access to a Secret Store path, its keys, its access tier
and its delivery mode. Lives on the Service, or on a Workload when it is
specific to one ([0022](docs/adr/model/0022-grants-live-on-the-service.md),
[0023](docs/adr/model/0023-grant-unit-is-the-path.md)).

**Placeholder** — an env-file entry naming what should be substituted rather
than carrying a value. A secret placeholder byte-matches a granted path
([0027](docs/adr/model/0027-secret-reference-join-key.md)).

**Override** — an authored escape from a derived value, carrying a reason
([0031](docs/adr/model/0031-derived-overrides-with-reason.md)).

## Composition — many repositories, one estate

**Intent Fragment** — one domain file published as an OCI artifact, by digest
([0037](docs/adr/model/0037-composition-oci-fragments.md),
[chapter 40](spec/v1/40-composition.md#fragments)).

**Composition** — the run that unions the published fragments and checks the
estate-wide invariants. It merges nothing, and runs on every publish.

**ComposedIntent** — the union that composition produces.

**Composition lock** — composition's output recording the digest of every
fragment it resolved. An output rather than an input, because an artifact
cannot contain its own digest.

**Participants** — the expected set of publishing domains, with a staleness
bound. A missed publish is a deletion, so the bound is what makes silence
visible ([0038](docs/adr/model/0038-participants-list-staleness.md)).

**Schema version** — the data model's own semver, carried by each document
family and separate from the toolkit's package version
([0039](docs/adr/model/0039-artifact-schema-versioning.md)).

## Layer 2 — what the platform decides

**Pinned input set** — the closed set layer 2 derives from: Service Intent, the
Cluster Context and its node contract, the locks, and the ClusterState
snapshot, each carried by digest. Nothing at render time reads live cluster
state ([0006](docs/adr/model/0006-pinned-inputs.md),
[0034](docs/adr/model/0034-cluster-state-pinned-input.md)).

**Cluster Context** — the platform's own facts, republished deliberately and
pinned by digest.

**Node contract** — the node facts a cluster publishes, authored once and
generated from ([0056](docs/adr/model/0056-node-facts-single-source.md)).

**ClusterState snapshot** — observed cluster facts captured once, digested, and
then treated as an input like any other.

**Images lock** — image digests, never tags.

**Authority** — which side declares a value. Platform-assigned if and only if it
must be unique across the estate or draws on a shared finite resource
([0004](docs/adr/model/0004-contention-decides-authority.md)).

**ResolvedService** — the projection of the Resolved Deployment belonging to one
Service, obtained by filtering and published back to its repository
([0033](docs/adr/model/0033-assignments-published-back.md)).

**Reconcile Unit** — the ordering unit, derived from the dependency graph and
never declared ([0032](docs/adr/model/0032-reconcile-unit-derived.md)).

**Release Unit** — the set that switches together: no member's new version
receives traffic until every member's new version is healthy
([0060](docs/adr/model/0060-release-unit.md)).

**`renderHash`** — the hash identifying a render. A function of the recorded
input digests alone, so if it changes at least one input changed.

## Layer 3 — what is written out

**Deliverable** — one serialized object destined for a file. Attributed to
exactly one Adapter ([0054](docs/adr/model/0054-adapter-attribution.md)).

**Adapter** — a named renderer registered in one registry. Documents in,
attributed Deliverables out; deterministic; no ambient reads
([0052](docs/adr/model/0052-registered-adapters-are-v1.md),
[0053](docs/adr/model/0053-adapter-port-contract.md)).

**Adapter port** — the single typed contract every Adapter satisfies.

**Blueprint pack** — a pinned checkout of platform fixtures, delivered as
Deliverables like anything else
([0013](docs/adr/model/0013-blueprint-packs-pinned-checkout.md)).

**Bidirectional ledger** — where an accepted hole is recorded, with an owner and
a reason. Bidirectional because an entry outliving the gap it covered fails the
build too ([0055](docs/adr/model/0055-bidirectional-ledgers.md)).

**Unmanaged surface** — a deployment target Service Intent does not cover,
registered rather than ignored
([0019](docs/adr/model/0019-registered-unmanaged-surfaces.md)).

## Words to use carefully

**Fragment.** Two chapters use it for different things: chapter 40's Intent
Fragment is a published *input*, chapter 30's Fragment is an *output* file with
its adapter attribution. In prose, qualify it. In code, never name a type
`Fragment` — the input is `IntentFragment` and the output is `Deliverable`.

**Deployment.** Ambiguous between the Kubernetes kind and the estate's old
`deployment.jorisjonkers.dev` documents, which is the confusion
[0003](docs/adr/model/0003-three-layer-meta-model.md) exists to end. Say
Resolved Deployment, or say the Kubernetes kind.

**Render.** Serialization only — layer 2 to layer 3. The act of deciding is
*resolution* or *derivation*, never rendering.

**Deploy.** Applying Deliverables to a cluster, which is **defined separately**
from this model ([`docs/adr/deferred/`](docs/adr/deferred/README.md)). A render
is not a deploy.

**Config.** Avoid. Env files carry *configuration*; the platform's own facts are
the *Cluster Context*; the authored document is *Service Intent*.
