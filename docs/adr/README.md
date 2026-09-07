# Decision register — the v1 model

This set was rebuilt from scratch on 2026-08-31 as the decision surface for the
v1 goal state, and restructured on 2026-09-07: **how the estate deploys, and
how co-testing gates a deploy, are defined separately from the model** — those
thirteen ADRs (0008, 0041–0051, 0058; the numbering gaps below) are parked in
[deferred/](deferred/README.md) and are not v1 decisions. The previous 19 ADRs
were deleted; the last commit carrying the old set is `7ea3c4f`, and after the
rebuild commit lands they are recoverable with
`git log --diff-filter=D -- docs/adr`.

**ADRs justify; `spec/v1` is normative.** Where an ADR and its `normative:`
pointer disagree, the spec wins and the ADR is what gets fixed. The `spec/v1`
chapters have **not yet been rewritten** to carry the anchors this register
names — that is the follow-up spec rewrite, tracked in
`review/REBUILD-MANIFEST.md`; `scripts/lint-adrs.mjs` stays non-blocking until
it lands.

The set was amended on 2026-09-07 for placement and domain-authored intent:
`size` became a set of hard `placement` dimensions matched against node
allocatable, Intent is authored one file per domain, and a Service is itself the
unit of atomic release. 0017 and 0060 are superseded by that amendment and kept
for the record; 0004, 0010, 0016, 0024, 0037 and 0056 were amended in place.

Tier-0 **premises** carry one falsifiable claim each; tier-1 **decisions** name
the premises they stand on in `rests-on`. A `claim: open` means decided in
direction, untested — its owner and settling test are in the file.

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
| [`architecture/`](architecture/) | the compiler's own structure: layering, ports, error model, gates | `docs/architecture.md` | yes |
| [`deferred/`](deferred/README.md) | delivery mechanics and co-testing, defined separately | sections these chapters deliberately lack | no |

## Premises

| # | title | claim | normative |
|---|---|---|---|
| [0001](model/0001-estate-scale-and-ownership.md) | The estate is one maintainer, one cluster, about thirty Services | open | 00-overview.md#the-estate |
| [0002](model/0002-kubernetes-as-substrate.md) | Kubernetes stays, for two properties that must be made real | open | 00-overview.md#substrate |
| [0003](model/0003-three-layer-meta-model.md) | Three layers, with the middle layer as a contract | settled | 00-overview.md#the-meta-model |
| [0004](model/0004-contention-decides-authority.md) | Contention decides who declares a value | open | 20-resolved-deployment.md#authority |
| [0005](model/0005-derivation-is-total.md) | Derivation from declared intent is total | open | 20-resolved-deployment.md#derived-mechanics |
| [0006](model/0006-pinned-inputs.md) | Every assignment is a function of pinned, digested inputs | open | 20-resolved-deployment.md#pinned-inputs |
| [0007](model/0007-schema-version-separable.md) | The data model's version is not the package's version | open | 40-composition.md#versioning |
| [0009](model/0009-vault-read-is-per-path.md) | A Vault KV-v2 read grant covers the whole path | open | 10-service-intent.md#secrets |

Premise 0008 (tested-equals-deployed) moved to
[deferred/](deferred/0008-tested-equals-deployed-requires-push.md) with the
delivery work it underpins.

## Decisions

### Identity and authorship
| # | title | claim |
|---|---|---|
| [0010](model/0010-flat-service-identity.md) | One flat Service Id | settled |
| [0011](model/0011-configuration-env-files-per-workload.md) | Configuration is per-Workload env files with named placeholders | settled |
| [0012](model/0012-assets-not-code.md) | File-shaped configuration is an Asset; code is not configuration | settled |
| [0013](model/0013-blueprint-packs-pinned-checkout.md) | Blueprint packs arrive by pinned checkout, not a registry | settled |
| [0063](model/0063-intent-authored-per-domain.md) | Intent is authored one file per domain | settled |
| [0064](model/0064-sidecars-are-workload-vocabulary.md) | A Workload may hold sidecars, and a sidecar carries what a container carries | settled |

### Workload-declared runtime intent
| # | title | claim |
|---|---|---|
| [0014](model/0014-probes-are-siblings.md) | Probes are sibling declarations, each carrying its own path | settled |
| [0015](model/0015-durability-class-per-volume.md) | Every volume declares a Durability Class | settled |
| [0077](model/0077-durability-derives-a-backup.md) | A Durability Class derives a backup, from platform terms and a method keyed by engine | settled |
| [0081](model/0081-volume-size-is-a-hard-dimension.md) | A volume declares its size; the platform decides whether it fits | settled |
| [0078](model/0078-engine-is-workload-vocabulary.md) | `engine` is layer-1 vocabulary: what the process is, not how it is instrumented | settled |
| [0016](model/0016-pod-hardening.md) | Pod hardening is layer-1 vocabulary | open |
| [0082](model/0082-images-lock-carries-uid-and-gid.md) | The images lock resolves each image's uid and gid, and fsGroup derives from the gid | settled |
| [0083](model/0083-privileged-port-needs-the-capability.md) | A privileged port under non-root is refused, and the escape is the existing exception | settled |
| [0017](model/0017-placement-by-capability.md) | Placement is declared as capabilities, never labels | superseded by [0061](model/0061-placement-is-hard-dimensions.md) |
| [0061](model/0061-placement-is-hard-dimensions.md) | Placement is a set of hard dimensions matched against allocatable | open |

### Exposure, dependencies, observability
| # | title | claim |
|---|---|---|
| [0018](model/0018-exposure-by-audience.md) | Exposure is declared by Audience, in one closed vocabulary | settled |
| [0019](model/0019-registered-unmanaged-surfaces.md) | Un-deployed hostnames are Registered Unmanaged Surfaces | settled |
| [0020](model/0020-dependency-edges-carry-surface.md) | A dependency edge names the provider, the surface, and necessity | settled |
| [0080](model/0080-database-catalog-is-derived-data.md) | The per-consumer database catalog is derived data, and Vault mints the credentials | settled |
| [0021](model/0021-observability-scrape-and-alert-class.md) | Observability is a scrape surface plus an Alert Class | settled |
| [0079](model/0079-alert-class-derives-from-a-rule-catalog.md) | An Alert Class derives rules from a platform catalog, and a class without a signal is refused | settled |

### Secrets
| # | title | claim |
|---|---|---|
| [0022](model/0022-grants-live-on-the-service.md) | Secret grants live on the Service document, at two levels | settled |
| [0023](model/0023-grant-unit-is-the-path.md) | The grant unit is the path; the subtree splits per reader set | open |
| [0024](model/0024-identity-per-workload.md) | Workloads hold their own identity | settled |
| [0087](model/0087-token-mounted-only-for-delivery-self.md) | A ServiceAccount token is mounted only where the pod itself authenticates | settled |
| [0025](model/0025-access-tiers-derive-policy.md) | Access tiers derive the Vault policy | settled, KV-only per [0085](model/0085-a-grant-is-a-union-on-engine.md) |
| [0026](model/0026-delivery-env-file-self.md) | Secret delivery is env, file, or self | settled |
| [0027](model/0027-secret-reference-join-key.md) | A secret placeholder byte-matches a granted path | settled, amended by [0085](model/0085-a-grant-is-a-union-on-engine.md) |
| [0028](model/0028-secrets-at-rest-gate.md) | Secrets at rest gate env and file delivery | open |
| [0085](model/0085-a-grant-is-a-union-on-engine.md) | A grant is a discriminated union on engine, and every grant derives a read path | settled |
| [0086](model/0086-kv-read-covers-its-metadata-sibling.md) | A KV-v2 read grant covers the document's metadata sibling | settled |

### Layer 2 — derivation and assignment
| # | title | claim |
|---|---|---|
| [0029](model/0029-resolved-deployment-versioned-artifact.md) | The Resolved Deployment is a versioned, reviewable artifact | settled |
| [0030](model/0030-runtime-mechanics-derived.md) | Runtime mechanics are derived from declared intent | settled |
| [0031](model/0031-derived-overrides-with-reason.md) | A derived value is overridable with a reason; an assignment is not | settled |
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
| [0052](model/0052-registered-adapters-are-v1.md) | The registered adapters are v1; the second generation is deleted | settled, amended by [0073](model/0073-vault-policy-is-a-deliverable.md), [0074](model/0074-networking-adapter-emits-policy.md), [0076](model/0076-middleware-has-one-producer.md), [0079](model/0079-alert-class-derives-from-a-rule-catalog.md) |
| [0053](model/0053-adapter-port-contract.md) | An adapter satisfies one typed port | settled |
| [0054](model/0054-adapter-attribution.md) | Every Deliverable is attributed to exactly one Adapter | settled |
| [0055](model/0055-bidirectional-ledgers.md) | Every accepted hole is a bidirectional ledger | settled |
| [0070](model/0070-path-authority-is-layer-2.md) | Layer 2 assigns every output path; layer 3 serialises what it is handed | settled |
| [0071](model/0071-release-gate-inputs-are-layer-2.md) | The release gate is derived into layer 2, and nothing is rendered for it | settled |
| [0072](model/0072-the-label-set-is-fixed.md) | The object label set is fixed, and two of its labels are immutable | settled |
| [0073](model/0073-vault-policy-is-a-deliverable.md) | The derived Vault policy and auth role are Deliverables of their own adapter | settled |
| [0074](model/0074-networking-adapter-emits-policy.md) | A networking adapter owns every NetworkPolicy in the estate | settled |
| [0075](model/0075-no-workload-rbac-in-v1.md) | v1 renders no workload RBAC, and refuses any Deliverable that grants it | settled |
| [0076](model/0076-middleware-has-one-producer.md) | Every Middleware has one producer, and the tier names its forward-auth endpoint | settled |

### Platform facts
| # | title | claim |
|---|---|---|
| [0056](model/0056-node-facts-single-source.md) | Node facts are authored once; nix imports them | settled |
| [0057](model/0057-datastore-and-restore.md) | Datastore, server count, and restore are recorded platform facts | open |

### Release and programme
| # | title | claim |
|---|---|---|
| [0059](model/0059-v1-scope-stopping-rule.md) | v1 has a scope and a stopping rule | open |
| [0060](model/0060-release-unit.md) | Several Services switch as one Release Unit | superseded by [0062](model/0062-service-is-the-release-unit.md) |
| [0062](model/0062-service-is-the-release-unit.md) | A Service is the unit of atomic release | settled |

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
