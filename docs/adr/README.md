# Decision register: the v1 model

This set was rebuilt from scratch on 2026-08-31 as the decision surface for the
v1 goal state, and restructured on 2026-09-07, when delivery and co-testing were
parked in [deferred/](deferred/README.md) (0008, 0041–0051, 0058; the numbering
gaps below). On 2026-09-24 delivery rejoined the model
([0127](model/0127-delivery-is-part-of-the-model.md)): Flux pulls a signed,
pinned render per Project and Flagger switches it, so the parked push design is
retired and only co-testing stays parked. The previous 19 ADRs
were deleted; the last commit carrying the old set is `7ea3c4f`, and after the
rebuild commit lands they are recoverable with
`git log --diff-filter=D -- docs/adr`.

**ADRs justify; `spec/v1` is normative.** Where an ADR and its `normative:`
pointer disagree, the spec wins and the ADR is what gets fixed. The `spec/v1`
chapters now carry the anchors this register names, and `scripts/lint-adrs.ts`
runs as a blocking gate in CI.

The set was amended on 2026-09-07 for placement and project-authored intent:
`size` became a set of hard `placement` dimensions matched against node
allocatable, Intent is authored one file per project, and an Application is itself the
unit of atomic release. 0017 and 0060 are superseded by that amendment and kept
for the record; 0004, 0010, 0016, 0024, 0037 and 0056 were amended in place.

The set was amended on 2026-09-10 for the v1 simplification: the generic
override hatch is deleted and `replicas: {count, reason}` is the sole local
capacity exception (0031, 0089, 0097); `zeroDowntime` is replaced by required
`cutover: rolling | recreate` with `E_CUTOVER_UNHONOURABLE` (0030); and
observability becomes one optional `observability` block on the Application, whole
or absent, with the ServiceMonitor derived from it and rule expressions,
severity and receivers left to the stack that reads the projection (0021,
0079). The hardening exception surface is deleted with the override hatch it
resembled (0016, 0083). The worked examples now declare every applicable
authored field and annotate its effect.

The set was amended on 2026-09-14 for the coursework implementation: the
model-driven engineering course requires the compiler to be built with Ecore,
Xtext, OCL, QVT-Operational and Acceleo, so a second, hand-written Java
implementation lives under `emf/` until its sunset condition holds. The two are
held equal by committed oracle files and nothing else (0105); 0065, 0066, 0100
and 0102 were amended in place to scope them to the TypeScript tree. The Java
implementation's own decisions live in
[`emf/docs/adr/`](../../emf/docs/adr/README.md), numbered from the same
sequence, and are deleted with it. The model is unchanged.

The set was amended on 2026-09-14 for vocabulary: the authored levels Domain,
Service and Workload are now Project, Application and Process, and Service
Intent is Project Intent (0116). Every ADR that used the old words carries an
amendment note and was renamed where its file name used them; no decision
changed.

The set was amended on 2026-09-21 for shared intent: the eight things a Process
holds that are a property of its product or its project (`secrets`, `env`,
`dependsOn`, `assets`, `writablePaths`, `placement`, `cutover`,
`startupBudget`) may be declared at the Project header, on an Application or on a
Process, a declaration descends to every Process below it, lists extend each
other, the lower level's declaration of one thing holds, and an identical
restatement at two levels is refused as a duplicate (0124). The union is
computed once, by a model-to-model lowering onto the Process, and everything
downstream reads the lowered shape (0125). 0022 is superseded by that
amendment and kept for the record; 0063 is amended in place, because `owner` is
no longer the only field the project header carries.

The set was amended on 2026-09-24 for delivery: how the estate deploys is part
of the model again, specified in
[chapter 55](../../spec/v1/55-delivery.md). The finish line of
[0059](model/0059-v1-scope-stopping-rule.md) is superseded by
[0127](model/0127-delivery-is-part-of-the-model.md), the parked push design in
[deferred/](deferred/README.md) is retired record by record, and co-testing
stays parked. The same day `cutover` became `continuous | interrupted`, answered
alike across an Application, with `continuous` deriving a blue/green switchover
([0128](model/0128-cutover-names-the-promise.md)); [0030](model/0030-runtime-mechanics-derived.md),
[0061](model/0061-placement-is-hard-dimensions.md) and
[0071](model/0071-release-gate-inputs-are-layer-2.md) carry amendment notes.

Tier-0 **premises** carry one falsifiable claim each; tier-1 **decisions** name
the premises they stand on in `rests-on`. A `claim: open` means decided in
direction, untested: its owner and settling test are in the file.

Citation rule: never a bare ADR number. In-set references are relative links;
workspace decisions live in a separate namespace
(`JorisJonkers-dev/workspace/docs/decisions/`) and are always linked absolutely.

## Domains

One directory per decision domain, and the directory is the scope boundary
([chapter 00](../../spec/v1/00-overview.md#programme-scope)). Numbers run in one
estate-wide sequence across all three, so a citation resolves without knowing
which domain a decision lives in.

| directory | holds | `normative:` pointers resolve against | linted |
|---|---|---|---|
| [`model/`](model/) | the v1 model: the layers, composition, derivation, the adapters | `spec/v1/` | yes |
| [`architecture/`](architecture/) | the compiler's own structure: layering, ports, error model, gates | `docs/architecture.md`, `docs/architecture-rules.md` | yes |
| [`deferred/`](deferred/README.md) | co-testing, still parked, and the delivery records [0127](model/0127-delivery-is-part-of-the-model.md) retired | sections these chapters deliberately lack | no |

The coursework implementation keeps a register of its own at
[`emf/docs/adr/`](../../emf/docs/adr/README.md), linted by the same script with
`emf` as its root. Its numbers come from this sequence: before taking a number,
check both registers.

## Premises

| # | title | claim | normative |
|---|---|---|---|
| [0001](model/0001-estate-scale-and-ownership.md) | The estate is one maintainer, one cluster, about thirty Applications | open | 00-overview.md#the-estate |
| [0002](model/0002-kubernetes-as-substrate.md) | Kubernetes stays, for two properties that must be made real | open | 00-overview.md#substrate |
| [0003](model/0003-three-model-pipeline.md) | Three layers, with the middle layer as a contract | settled | 00-overview.md#the-three-model-pipeline |
| [0004](model/0004-contention-decides-authority.md) | Contention decides who declares a value | open | 20-resolved-deployment.md#authority |
| [0005](model/0005-derivation-is-total.md) | Derivation from declared intent covers the live estate | open | 20-resolved-deployment.md#derived-mechanics |
| [0006](model/0006-pinned-inputs.md) | Every assignment is a function of pinned, digested inputs | open | 20-resolved-deployment.md#pinned-inputs |
| [0007](model/0007-schema-version-separable.md) | The data model's version is not the package's version | open | 40-composition.md#versioning |
| [0009](model/0009-vault-read-is-per-path.md) | A Vault KV-v2 read grant covers the whole path | open | 10-project-intent.md#secrets |

Premise 0008 (tested-equals-deployed) moved to
[deferred/](deferred/0008-tested-equals-deployed-requires-push.md) with the
delivery work it underpins.

## Decisions

### Identity and authorship
| # | title | claim |
|---|---|---|
| [0010](model/0010-flat-application-identity.md) | One flat Application Id | settled |
| [0011](model/0011-configuration-env-files-per-process.md) | Configuration is per-Process env files with named placeholders | settled |
| [0091](model/0091-identity-placeholders-not-framework-wiring.md) | The model derives no framework wiring; it exposes the Process's own identity as placeholders | settled |
| [0012](model/0012-assets-not-code.md) | File-shaped configuration is an Asset; code is not configuration | settled |
| [0094](model/0094-asset-change-restarts-unconditionally.md) | An Asset change is content-hashed and restarts the Process; there is no onChange field | settled |
| [0013](model/0013-blueprint-packs-pinned-checkout.md) | Blueprint packs arrive by pinned checkout, not a registry | superseded by [0096](model/0096-the-foundation-is-declared.md) |
| [0063](model/0063-intent-authored-per-project.md) | Intent is authored one file per project | settled |
| [0116](model/0116-project-application-process.md) | The authored hierarchy is Project, Application and Process, named for a reader who does not work with deployments | settled |
| [0064](model/0064-sidecars-are-process-vocabulary.md) | A Process may hold sidecars, and a sidecar carries what a container carries | settled |
| [0124](model/0124-shared-intent-descends-to-the-process.md) | Everything a Process holds may be declared at Project, Application or Process, and a declaration descends to every Process below it | settled |
| [0125](model/0125-the-effective-intent-is-a-lowering.md) | Shared intent is lowered onto the Process by a model-to-model step, and the Effective Intent is the only shape anything downstream reads | settled |

### Process-declared runtime intent
| # | title | claim |
|---|---|---|
| [0014](model/0014-probes-are-siblings.md) | Probes are sibling declarations, each carrying its own path | settled |
| [0088](model/0088-startup-probe-targets-liveness.md) | The startup probe targets liveness, and probe cadence is platform policy | settled |
| [0015](model/0015-durability-class-per-volume.md) | Every volume declares a Durability Class | settled |
| [0077](model/0077-durability-derives-a-backup.md) | A Durability Class derives a backup, from platform terms and a method keyed by engine | settled |
| [0081](model/0081-volume-size-is-a-hard-dimension.md) | A volume declares its size; the platform decides whether it fits | settled |
| [0078](model/0078-engine-is-process-vocabulary.md) | `engine` is layer-1 vocabulary: what the process is, not how it is instrumented | settled |
| [0016](model/0016-pod-hardening.md) | Pod hardening is platform policy, and has no exception surface | open |
| [0082](model/0082-images-lock-carries-uid-and-gid.md) | The images lock resolves each image's uid and gid, and fsGroup derives from the gid | settled |
| [0092](model/0092-writable-paths-are-declared.md) | A Process declares the paths it writes, and that is not a hardening exception | settled |
| [0083](model/0083-privileged-port-needs-the-capability.md) | A privileged port under non-root is refused | settled |
| [0017](model/0017-placement-by-capability.md) | Placement is declared as capabilities, never labels | superseded by [0061](model/0061-placement-is-hard-dimensions.md) |
| [0061](model/0061-placement-is-hard-dimensions.md) | Placement is a set of hard dimensions matched against allocatable | open |
| [0089](model/0089-replicas-derived-no-minavailable.md) | `replicas` derives as one, `minAvailable` is deleted, and a budget over one replica is not emitted | settled |

### Exposure, dependencies, observability
| # | title | claim |
|---|---|---|
| [0018](model/0018-exposure-by-audience.md) | Exposure is declared by Audience, in one closed vocabulary | settled |
| [0093](model/0093-route-precedence-is-derived.md) | Route precedence is derived and rendered explicitly, and a duplicate route is refused | settled |
| [0019](model/0019-registered-unmanaged-surfaces.md) | Un-deployed hostnames are Registered Unmanaged Surfaces | settled |
| [0090](model/0090-edges-resolve-against-the-register.md) | An edge resolves against the union or the unmanaged register, and the register carries coordinates | settled |
| [0020](model/0020-dependency-edges-carry-surface.md) | A dependency edge names the provider, the surface, and necessity | settled |
| [0080](model/0080-database-catalog-is-derived-data.md) | The per-consumer database catalog is derived data, and Vault mints the credentials | settled |
| [0021](model/0021-observability-scrape-and-alert-class.md) | Observability is a scrape surface plus an Alert Class | settled |
| [0079](model/0079-alert-class-derives-from-a-rule-catalog.md) | An Alert Class derives rules from a platform catalog, and a class without a signal is refused | settled |

### Secrets
| # | title | claim |
|---|---|---|
| [0022](model/0022-grants-live-on-the-application.md) | Secret grants live on the Application document, at two levels | superseded by [0124](model/0124-shared-intent-descends-to-the-process.md) |
| [0023](model/0023-grant-unit-is-the-path.md) | The grant unit is the path; the subtree splits per reader set | open |
| [0024](model/0024-identity-per-process.md) | Processes hold their own identity | settled |
| [0087](model/0087-token-mounted-only-for-delivery-self.md) | A ServiceAccount token is mounted only where the pod itself authenticates | settled |
| [0025](model/0025-access-tiers-derive-policy.md) | Access tiers derive the Vault policy | settled, KV-only per [0085](model/0085-a-grant-is-a-union-on-engine.md) |
| [0026](model/0026-delivery-env-file-self.md) | Secret delivery is env, file, or self | settled |
| [0027](model/0027-secret-reference-join-key.md) | A secret placeholder byte-matches a granted path | settled, amended by [0085](model/0085-a-grant-is-a-union-on-engine.md) |
| [0028](model/0028-secrets-at-rest-gate.md) | Secrets at rest gate env and file delivery | open |
| [0085](model/0085-a-grant-is-a-union-on-engine.md) | A grant is a discriminated union on engine, and every grant derives a read path | settled |
| [0086](model/0086-kv-read-covers-its-metadata-sibling.md) | A KV-v2 read grant covers the document's metadata sibling | settled |

### Layer 2: derivation and assignment
| # | title | claim |
|---|---|---|
| [0029](model/0029-resolved-deployment-versioned-artifact.md) | The Resolved Deployment is a versioned, reviewable artifact | settled |
| [0030](model/0030-runtime-mechanics-derived.md) | Runtime mechanics are derived from declared intent | settled |
| [0128](model/0128-cutover-names-the-promise.md) | `cutover` names the promise, `continuous` or `interrupted`, one Application answers it alike, and `continuous` derives a blue/green switchover | open |
| [0031](model/0031-derived-overrides-with-reason.md) | A derived value has one declaring site; capacity is the sole named exception | settled |
| [0032](model/0032-reconcile-unit-derived.md) | The Reconcile Unit is derived from the dependency graph | settled |
| [0033](model/0033-assignments-published-back.md) | Assignments are published back to the owning repository | settled |
| [0034](model/0034-cluster-state-pinned-input.md) | ClusterState is a pinned, digested input | settled |
| [0035](model/0035-network-policy-default-deny.md) | Network policy is default-deny, derived from the edge set | settled |
| [0084](model/0084-render-only-is-the-v1-policy-stage.md) | Render-only is v1's network-policy stage; promotion waits on the CNI | settled |
| [0036](model/0036-cni-selection.md) | The CNI is chosen for a non-enforcing policy stage | open |

### Composition and versioning
| # | title | claim |
|---|---|---|
| [0037](model/0037-composition-oci-fragments.md) | Declarations compose from published OCI fragments | settled |
| [0038](model/0038-participants-list-staleness.md) | Participants are listed, bounded by seven days of staleness | settled |
| [0039](model/0039-artifact-schema-versioning.md) | The artifact schema is semver; composition accepts a range | settled |
| [0040](model/0040-renovate-ordering-gate.md) | Version bumps ride Renovate behind an ordering gate | settled |

### Adapters and rendering
| # | title | claim |
|---|---|---|
| [0052](model/0052-registered-adapters-are-v1.md) | The registered adapters are v1; the second generation is deleted | settled, rewritten by [0098](model/0098-one-publication-path.md) |
| [0053](model/0053-adapter-port-contract.md) | An adapter satisfies one typed port | settled |
| [0054](model/0054-adapter-attribution.md) | Every Deliverable is attributed to exactly one Adapter | settled |
| [0055](model/0055-bidirectional-ledgers.md) | Every accepted hole is a bidirectional ledger | settled |
| [0070](model/0070-path-authority-is-layer-2.md) | Layer 2 assigns every output path; layer 3 serialises what it is handed | settled |
| [0071](model/0071-release-gate-inputs-are-layer-2.md) | The release gate is derived into layer 2, and nothing is rendered for it | settled |
| [0072](model/0072-the-label-set-is-fixed.md) | The object label set is fixed, and two of its labels are immutable | settled |
| [0073](model/0073-vault-policy-is-a-deliverable.md) | The derived Vault policy and auth role are Deliverables of their own adapter | settled |
| [0074](model/0074-networking-adapter-emits-policy.md) | A networking adapter owns every NetworkPolicy in the estate | settled |
| [0075](model/0075-no-process-rbac-in-v1.md) | v1 renders no process RBAC, and refuses any Deliverable that grants it | settled |
| [0076](model/0076-middleware-has-one-producer.md) | Every Middleware has one producer, and the tier names its forward-auth endpoint | settled |

### Platform Intent
| # | title | claim |
|---|---|---|
| [0095](model/0095-platform-intent-is-the-second-authored-document.md) | Platform Intent is the second authored document, published as an Intent Fragment | settled |
| [0096](model/0096-the-foundation-is-declared.md) | The foundation is declared as Applications; nothing hand-written enters the render | settled |
| [0097](model/0097-authored-values-name-model-concepts.md) | An authored value names a model concept; the target's spelling is a derivation | settled |
| [0098](model/0098-one-publication-path.md) | A repository publishes its Intent Fragment and nothing else; every derivation runs once, centrally | settled |
| [0099](model/0099-bootstrap-set-is-recorded.md) | The bootstrap set is a recorded, enumerated table | open |

### Platform facts
| # | title | claim |
|---|---|---|
| [0056](model/0056-node-facts-single-source.md) | Node facts are authored once; nix imports them | settled |
| [0123](model/0123-a-node-publishes-media-no-process-may-ask-for.md) | A node publishes storage media no Process may ask for | settled |
| [0057](model/0057-datastore-and-restore.md) | Datastore, server count, and restore are recorded platform facts | open |

### Release and programme
| # | title | claim |
|---|---|---|
| [0059](model/0059-v1-scope-stopping-rule.md) | v1 has a scope and a stopping rule | superseded by [0127](model/0127-delivery-is-part-of-the-model.md) |
| [0127](model/0127-delivery-is-part-of-the-model.md) | Delivery is part of the v1 model: Flux pulls a signed, pinned render and Flagger switches what must keep serving | open |
| [0060](model/0060-release-unit.md) | Several Applications switch as one Release Unit | superseded by [0062](model/0062-application-is-the-release-unit.md) |
| [0062](model/0062-application-is-the-release-unit.md) | An Application is the unit of atomic release | settled |

## Architecture

Decisions about the compiler's own structure, not about the model. Their
`normative:` pointers name sections of
[`docs/architecture.md`](../architecture.md); see
[architecture/README.md](architecture/README.md) for what the domain covers.

| # | title | claim |
|---|---|---|
| [0065](architecture/0065-one-hexagon-domain-mirrors-the-layers.md) | One hexagon, two use-cases, and a domain whose folders are the three layers | settled |
| [0066](architecture/0066-wire-shape-is-not-the-domain.md) | Zod declares the authoring shape, and a mapper turns it into the domain | settled |
| [0067](architecture/0067-adapters-build-objects-one-serializer.md) | Adapters build typed objects; one serializer owns the bytes | settled |
| [0068](architecture/0068-failures-are-a-diagnostic-list.md) | A failure is a coded diagnostic in a list, not a thrown error | settled |
| [0069](architecture/0069-boundaries-enforced-on-the-graph.md) | Layer boundaries and reachability are gates on the module graph | settled |
| [0100](architecture/0100-tests-run-in-process-on-vitest.md) | Tests run in-process on Vitest, and the tooling is TypeScript that Node runs directly | settled |
| [0101](architecture/0101-coverage-is-a-ratchet.md) | Coverage is a ratchet: the thresholds sit on what the suite reaches, and only rise | settled |
| [0102](architecture/0102-the-gate-grows-with-the-code.md) | A new gate's script and its CI job land in the same pull request, and a test proves the two stay matched | settled |
| [0103](architecture/0103-a-behaviour-ledger-names-what-a-test-proves.md) | A behaviour ledger names every guarantee and the test that proves it, and a meta test holds the two together | settled |
| [0104](architecture/0104-every-enforced-rule-has-an-id-a-row-and-a-fixture.md) | Every enforced rule has an id, a ledger row and a fixture that proves it fires | settled |
| [0105](architecture/0105-two-implementations-meet-at-committed-oracles.md) | Two hand-written implementations meet at committed oracle files, and neither is generated from or tested against the other | open |
| [0117](architecture/0117-the-process-lives-in-one-boundary-file.md) | Ambient reads live in the outer rings, and the process is touched in one boundary file | settled |
| [0118](architecture/0118-every-spec-error-code-is-proved-by-a-test.md) | Every error code the specification defines is proved by a test, or pending on the ticket that will prove it | settled |
| [0119](architecture/0119-generated-files-are-committed-and-diff-checked.md) | A generated file is committed and diff-checked in CI, and an oracle file is never generated | open |
| [0120](architecture/0120-the-mutation-break-score-is-measured-not-assumed.md) | The mutation break score is measured, not assumed, and stays over `src/` until `scripts/` clears its own sandbox | settled |
