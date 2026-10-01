# Decision register

One record per decision, stating the current design. When a decision changes,
its record is rewritten in the same pull request as the specification change it
justifies; git history is the change log. No record is superseded, amended by a
note, or kept for the record, and `scripts/lint-adrs.ts` refuses a
`superseded-by` field or an amendment note.

The register was rebuilt on 2026-09-29: 141 records, many of them reversed by
dated notes, were merged into the 82 below and renumbered in topic order. The
last commit carrying the previous set is `722dccb`; the old numbers are
recoverable with `git show 722dccb:docs/adr/README.md`.

**ADRs justify; `spec/v1` is normative.** Where a record and its `normative:`
pointer disagree, the specification wins and the record is what gets fixed. The
same holds for code: `docs/architecture.md` is normative for the compiler's
structure.

Tier-0 **premises** carry one falsifiable claim each; tier-1 **decisions** name
the premises they stand on in `rests-on`. `claim: open` means decided in
direction and untested: its owner and settling test are in the file.

Citation rule: never a bare ADR number. In-set references are relative links;
workspace decisions live in a separate namespace
(`JorisJonkers-dev/workspace/docs/decisions/`) and are always linked absolutely.

## Domains

One directory per decision domain, numbered in one sequence, so a citation
resolves without knowing which domain it lands in.

| directory | holds | `normative:` pointers resolve against | linted |
|---|---|---|---|
| [`model/`](model/) | the v1 model: the layers, composition, derivation, the adapters, delivery | `spec/v1/` | yes |
| [`architecture/`](architecture/README.md) | the compiler's own structure: layering, the trace, the error model, gates | `docs/architecture.md`, `docs/architecture-rules.md` | yes |
| [`deferred/`](deferred/README.md) | co-testing, parked | sections the chapters deliberately lack | no |

The model-driven implementation keeps its records at
[`emf/docs/adr/`](../../emf/docs/adr/README.md), numbered from the same sequence
and linted by the same script with `emf` as its root.


## Premises

| # | title | claim | normative |
|---|---|---|---|
| [0001](model/0001-estate-scale-and-ownership.md) | The estate is one maintainer, one cluster, about thirty Applications | open | 00-overview.md#the-estate |
| [0002](model/0002-kubernetes-is-the-substrate-for-one-applier.md) | Kubernetes stays as the substrate for one applier, for its authorisation boundary and its field ownership | open | 00-overview.md#substrate |
| [0003](model/0003-three-model-pipeline.md) | Three layers, with the middle layer as a contract | settled | 00-overview.md#the-three-model-pipeline |
| [0004](model/0004-contention-decides-authority.md) | Contention decides who declares a value | open | 20-resolved-deployment.md#authority |
| [0005](model/0005-derivation-is-total.md) | Derivation from declared intent covers the live estate | open | 20-resolved-deployment.md#derived-mechanics |
| [0006](model/0006-pinned-inputs.md) | Every assignment is a function of pinned, digested inputs | open | 20-resolved-deployment.md#pinned-inputs |
| [0007](model/0007-schema-version-separable.md) | The data model's version is not the package's version | open | 40-composition.md#versioning |
| [0008](model/0008-vault-read-is-per-path.md) | A Vault KV-v2 read grant covers the whole path | open | 10-project-intent.md#secrets |

## Authorship and identity

| # | title | claim |
|---|---|---|
| [0009](model/0009-intent-is-authored-one-file-per-project.md) | Intent is authored one file per project, holding Applications that hold Processes | settled |
| [0010](model/0010-flat-application-identity.md) | One flat Application Id | settled |
| [0011](model/0011-authored-values-name-model-concepts.md) | An authored value names a model concept, and the target's spelling is a derivation | settled |
| [0012](model/0012-shared-intent-descends-and-is-lowered.md) | What a Process holds may be declared at Project, Application or Process, and one lowering step puts it on the Process | settled |
| [0013](model/0013-configuration-is-dotenv-at-three-scopes.md) | Configuration is dotenv at three scopes merged onto the Process, a derived value is only ever a named placeholder, and the model derives no framework wiring | open |
| [0014](model/0014-file-shaped-configuration-is-an-asset.md) | File-shaped configuration is an Asset: static text with named placeholders, never code, content-hashed so a change restarts the Process | settled |
| [0015](model/0015-sidecars-are-process-vocabulary.md) | A Process may hold sidecars, and a sidecar declares its name, image, memory and cpu | settled |

## Process runtime

| # | title | claim |
|---|---|---|
| [0016](model/0016-probes-are-siblings-and-startup-targets-liveness.md) | Readiness and liveness are sibling declarations with their own targets, the startup probe polls liveness, and probe cadence is platform policy | settled |
| [0017](model/0017-placement-is-hard-dimensions.md) | Placement and volume size are hard dimensions the Application states and the platform matches against node allocatable | open |
| [0018](model/0018-durability-class-derives-a-backup.md) | Every volume declares a Durability Class, a class derives its backup, and a claim whose class derives a backup is never pruned | open |
| [0019](model/0019-engine-is-process-vocabulary.md) | `engine` is layer-1 vocabulary: what the process is, not how it is instrumented | settled |
| [0020](model/0020-hardening-is-one-platform-posture.md) | Hardening is one platform posture with no exception surface: writable paths are declared, the user comes from the images lock, and a privileged port is refused | open |
| [0021](model/0021-runtime-mechanics-derive-from-cutover.md) | Runtime mechanics derive from declared intent, and `cutover` names the promise: `continuous` derives a blue/green switchover, `interrupted` a stop-start one | open |
| [0022](model/0022-a-derived-value-has-one-declaring-site.md) | A derived value has one declaring site, and `replicas: {count, reason}` is the sole local exception | settled |

## Exposure, dependencies, observability and migration

| # | title | claim |
|---|---|---|
| [0023](model/0023-exposure-is-declared-by-audience.md) | Exposure is declared by Audience on an authored host, route precedence is derived, and the tier names its forward-auth endpoint | settled |
| [0024](model/0024-dependency-edges-resolve-against-the-union.md) | A dependency edge names the provider, the surface and necessity, and resolves against the union or a provider the Platform document records | settled |
| [0025](model/0025-observability-is-one-optional-block.md) | Observability is one optional block on the Application, whole or absent, and the model derives only the monitor from it | settled |
| [0026](model/0026-migration-is-declared-on-the-application.md) | Migration is declared on the Application: one Liquibase system, one derived database per project, a proof against the serving version, and an undo only while nothing new serves | open |
| [0027](model/0027-prepare-processes-are-forward-only-setup.md) | A prepare Process is forward-only setup that runs after the migration and before the new version, and serves nothing | open |

## Secrets

| # | title | claim |
|---|---|---|
| [0028](model/0028-grant-unit-is-the-path.md) | The grant unit is the path; the subtree splits per reader set | open |
| [0029](model/0029-a-grant-is-a-union-on-engine.md) | A grant is a discriminated union on engine that derives a read path and a policy, and only a kv grant is projected | open |
| [0030](model/0030-secret-delivery-is-env-file-or-self.md) | Secret delivery is env, file or self, an env placeholder byte-matches a kv grant's path, and env and file need secrets at rest | open |
| [0031](model/0031-identity-per-process.md) | Each Process holds its own identity, and its ServiceAccount token is mounted only where the pod itself authenticates | settled |

## Layer 2: derivation and assignment

| # | title | claim |
|---|---|---|
| [0032](model/0032-the-resolved-deployment-is-a-versioned-artifact.md) | The Resolved Deployment is a versioned, reviewable artifact, published back to each owning repository, and an Application's revision is the digest of its own element | open |
| [0033](model/0033-reconcile-unit-derived.md) | The Reconcile Unit is derived from the dependency graph | settled |
| [0034](model/0034-cluster-state-is-a-pinned-input.md) | The ClusterState snapshot is a pinned, digested input holding PV bindings and current placements, and node capacity is a node-contract fact | open |
| [0035](model/0035-network-policy-is-default-deny-and-render-only.md) | Network policy is default-deny, derived from the edge set by one `networking` adapter, rendered but not promoted until a CNI with an audit stage is chosen | open |
| [0036](model/0036-path-authority-is-layer-2.md) | Layer 2 assigns every output path; layer 3 serialises what it is handed | settled |

## Adapters and rendering

| # | title | claim |
|---|---|---|
| [0037](model/0037-six-registered-adapters-satisfy-one-port.md) | The registry is the enumeration of adapters, every adapter satisfies one typed port, and every Deliverable is attributed to exactly one adapter | settled |
| [0038](model/0038-bidirectional-ledgers.md) | Every accepted hole is a bidirectional ledger: an unlisted gap fails the build, and so does an entry that no longer matches | settled |
| [0039](model/0039-the-label-set-is-fixed.md) | The object label set is fixed, and two of its labels are immutable | settled |
| [0040](model/0040-vault-policy-is-a-deliverable.md) | The derived Vault policy and auth role are Deliverables of their own adapter | settled |
| [0041](model/0041-no-process-rbac-in-v1.md) | v1 renders no process RBAC, and refuses any Deliverable that grants it | settled |

## Composition and the platform

| # | title | claim |
|---|---|---|
| [0042](model/0042-declarations-compose-from-intent-fragments.md) | Declarations compose from Intent Fragments published by digest, because eight properties of the estate need every project at once | open |
| [0043](model/0043-participants-list-staleness.md) | Participants are listed, bounded by seven days of staleness | settled |
| [0044](model/0044-artifact-schema-versioning.md) | The artifact schema is semver; composition accepts a range | settled |
| [0045](model/0045-platform-intent-is-the-second-authored-document.md) | Platform Intent is the second authored document, published as an Intent Fragment | settled |
| [0046](model/0046-the-foundation-is-declared.md) | The foundation is declared as Applications, nothing hand-written enters the render, and what must exist first is a recorded bootstrap table | open |
| [0047](model/0047-one-publication-path.md) | A repository publishes its Intent Fragment and nothing else, and every derivation runs once, centrally | settled |
| [0048](model/0048-node-facts-are-authored-once.md) | Node facts are authored once in the node contract, nix imports them, and a node may publish media no Process may ask for | settled |
| [0049](model/0049-datastore-and-restore.md) | Datastore, server count, and restore are recorded platform facts | open |

## Delivery and release

| # | title | claim |
|---|---|---|
| [0050](model/0050-delivery-is-part-of-the-model.md) | Delivery is part of the model: Flux pulls a signed, pinned render, and Flagger switches what must keep serving | open |
| [0051](model/0051-a-project-is-delivered-as-a-signed-artifact.md) | A Project is delivered as a signed OCI artifact pinned by digest, and a deploy is a pin commit | open |
| [0052](model/0052-an-application-is-the-release-unit.md) | An Application is the unit of atomic release, and a first-party Release Gate holds its members at a barrier and fails closed | open |
| [0053](model/0053-rotating-a-secret-is-not-a-release.md) | Rotating a secret is not a release, so it never starts a switchover | open |
| [0054](model/0054-projects-are-handed-over-one-at-a-time.md) | Projects are handed over to the estate path one at a time, recorded in a ledger, and never delivered by both paths | open |
| [0055](model/0055-the-render-leaves-flaggers-objects-to-flagger.md) | The render leaves Flagger's objects to Flagger, so Flux and Flagger never own the same field | open |
| [0083](model/0083-a-fragment-publishes-on-a-release-tag.md) | A fragment publishes on a release tag and carries that release's version | open |
| [0084](model/0084-pause-and-rollback.md) | A Pause freezes a Project's pin, and a Rollback re-composes an earlier proven release with the schema at its newest | open |
| [0085](model/0085-composition-isolates-a-refused-project.md) | Composition isolates a refused Project, and every other Project still composes | open |
| [0086](model/0086-the-collector-runs-in-the-cluster.md) | The ClusterState Collector runs in the cluster, reads only, and commits the snapshot when it changes | open |
| [0087](model/0087-in-cluster-consumers-read-the-render.md) | An in-cluster job applies the rendered Vault policies, and the Release Gate reads its inputs from a rendered ConfigMap | open |

## Architecture

Decisions about the compiler's own structure, not about the model; see
[architecture/README.md](architecture/README.md).

| # | title | claim |
|---|---|---|
| [0056](architecture/0056-the-compiler-is-a-chain-of-typed-models.md) | The compiler is a chain of typed models, each step a module of named mappings, and a directory exists once it holds a module | open |
| [0057](architecture/0057-the-authored-shape-is-the-source-model.md) | Zod declares the authored metamodel, its output is the source model, and a second hand-written domain type waits for a second schemaVersion | settled |
| [0058](architecture/0058-every-step-links-through-one-trace.md) | Every step creates its targets, then links them through one trace, adapters build typed objects, and one serializer owns the bytes | open |
| [0059](architecture/0059-failures-are-a-diagnostic-list.md) | A failure is a coded diagnostic in a list, not a thrown error | settled |
| [0060](architecture/0060-boundaries-enforced-on-the-graph.md) | Layer boundaries and reachability are gates on the module graph, not review notes | settled |
| [0061](architecture/0061-the-process-lives-in-one-boundary-file.md) | Ambient reads live in the outer rings, and the process is touched in one boundary file | settled |
| [0062](architecture/0062-tests-run-in-process-on-vitest.md) | Tests run in-process on Vitest, and the tooling is TypeScript that Node runs directly | settled |
| [0063](architecture/0063-coverage-and-mutation-are-ratchets.md) | Coverage and mutation are ratchets: each threshold sits on what the suite reaches, is measured rather than assumed, and only rises | settled |
| [0064](architecture/0064-a-gate-is-a-script-or-a-named-job.md) | A gate is an npm script or a named CI job, lands with its CI job in one pull request, and a test holds the two lists equal | open |
| [0065](architecture/0065-a-behaviour-ledger-names-what-a-test-proves.md) | A behaviour ledger names every guarantee and the test that proves it, and a meta test holds the two together | settled |
| [0066](architecture/0066-every-enforced-rule-has-an-id-a-row-and-a-fixture.md) | Every enforced rule has an id, a ledger row and a fixture that proves it fires, and a rule not enforced yet says so with a reason | settled |
| [0067](architecture/0067-every-spec-error-code-is-proved-by-a-test.md) | Every error code the specification defines is proved by a test, or pending on the ticket that will prove it | settled |
| [0068](architecture/0068-two-implementations-meet-at-the-parity-table.md) | Two hand-written implementations meet at the oracles the parity table lists, each tree keeps its own rule for generated files, and constraint parity is checked by code | open |
| [0088](architecture/0088-the-committed-schemas-and-their-corpus-are-the-contract.md) | The committed JSON Schemas and their accept/refuse corpus are the contract, and byte equality only proves the generator's output is committed | settled |

## Deferred

| # | title | claim |
|---|---|---|
| [0069](deferred/0069-co-testing-is-parked.md) | Co-testing is parked: if it is taken up, an Aggregator owns each relationship's system tests and gates the pin commit | open |
