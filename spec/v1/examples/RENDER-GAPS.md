# What the render surface says the model still owes

Rendered by hand from the three worked domains, against the sixteen registered
adapters. Every row is something a renderer must produce and cannot produce from
intent as declared today. Read `auth/rendered/README.md`,
`knowledge/rendered/README.md` and `data/rendered/README.md` for the per-file
detail; this is the ordered list.

Fifty rendered files across `auth/`, `knowledge/` and `data/`. All parse.

Rows marked **closed** have since been decided; the row stays so the evidence
that forced the decision stays with it.

## Blocking — no producer exists

| # | gap | seen in |
|---|---|---|
| R1 | **Atomic switchover is not expressible in plain Kubernetes objects.** Two Deployments in one Service each enter their own Endpoints when their own readiness passes. auth-ui (30s) serves a new bundle for up to the 600s auth-api is allowed to start — a new UI against an old API, both healthy. Nothing links them: the shared label is consumed by no controller, kustomize groups without gating, Flux health checks run after apply. **No rendered object has the identity "the Service".** **Reclassified** by [0071](../../../docs/adr/model/0071-release-gate-inputs-are-layer-2.md): the mechanism stays with the delivery definition and the model owes the gate's inputs, which layer 2 now derives — member list, readiness references, and a deadline of max member progressDeadlineSeconds. No longer blocks the render. | auth |
| R2 | **The Vault policy and Kubernetes auth role have no producer.** `vso` emits VaultConnection / VaultAuth / VaultStaticSecret / VaultDynamicSecret — none is a policy or a role. Reached from `delivery: self` in auth and from `delivery: env` in data, so it is not a delivery-mode edge case. **Closed** by [0073](../../../docs/adr/model/0073-vault-policy-is-a-deliverable.md): a vault-policy adapter emits one JSON policy and one Kubernetes auth role per Workload identity; writing them into Vault is delivery, and the auth mount is a platform fixture. | auth, data |
| R3 | **No `rbac` adapter and no `networking` adapter.** Every NetworkPolicy in these trees is what a future `networking` adapter must emit, and the only implementation lives in the generation being deleted. Three Services share `data-system`; the only thing stopping valkey's ServiceAccount reading postgres' Secret is that no Role grants it — an absence, not a boundary. **Closed** by [0074](../../../docs/adr/model/0074-networking-adapter-emits-policy.md) (a networking adapter owns every NetworkPolicy) and [0075](../../../docs/adr/model/0075-no-workload-rbac-in-v1.md) (no workload RBAC is rendered; the absence becomes E_WORKLOAD_RBAC_GRANT, a composition-time refusal). | data |
| R4 | **The forward-auth `Middleware` has no producer.** `traefik-public` emits IngressRoutes *with middleware references* — references only. Every `audience: authenticated` route in the estate resolves against a Middleware nothing renders. **Closed** by [0076](../../../docs/adr/model/0076-middleware-has-one-producer.md): a traefik-middleware adapter owns every Middleware, and a tier serving `authenticated` names the endpoint that authenticates for it. | auth, data |
| R5 | **Durability renders nothing.** `irreplaceable` should derive a backup job, a retention sweep and an off-cluster copy; `recoverable` a job and a sweep; `reconstructible` nothing. No adapter reads the field, and schedule, retention window and destination have no declaring site in layer 1. PVC-level snapshots are impossible here — no VolumeSnapshot CRDs, no CSI snapshot support on `local-path` — so an application-level job is the *only* mechanism. **Closed** by [0077](../../../docs/adr/model/0077-durability-derives-a-backup.md): the Cluster Context carries one policy per class (window, retention, destination), the method is keyed by the Workload's new `engine` field ([0078](../../../docs/adr/model/0078-engine-is-workload-vocabulary.md)), and the kubernetes adapter emits the CronJob and sweep. The destination credential is a derived grant. | data, knowledge |
| R6 | **`alertClass` derives nothing.** Three Services declare three different values and all three produce zero objects. No adapter renders a PrometheusRule in either generation. `platform-postgres` declares `page` and has no monitoring object at all, because Gatus derives from `exposure` and a datastore is correctly not exposed. | data |
| R7 | **`init-databases.sh` is a derived catalog with no producer.** One database and one owning user per consumer, which the inbound edge set already knows. Chapter 16 calls it an inbound derivation; chapter 10 refuses it as an Asset because an Asset may not be executable. So it is a Deliverable, and nothing produces it. | data |

## Blocking — the object cannot be applied as rendered

| # | gap | seen in |
|---|---|---|
| R8 | **PVC capacity cannot be derived.** Capacity is platform-assigned and the author may not write it, yet no pinned input assigns a number. The node contract publishes `disks[].usable_gib` and no rule allocates from it. Rendered `storage: null` — parses, does not apply. | data |
| R9 | **`runAsNonRoot: true` with no UID and no `fsGroup`, against RWO volumes.** A freshly provisioned `local-path` directory is root-owned; without `fsGroup`, postgres cannot `initdb` into its own PV. The images lock carries digests, not UIDs. If the image's `USER` is a name rather than a number the kubelet cannot verify non-root and the pod fails `CreateContainerConfigError`. | data |
| R10 | **auth-ui cannot bind port 80** under `runAsNonRoot` + `drop ALL` with only a `writableRootFilesystem` exception. Either the port is wrong or the exception set is. | auth |
| R11 | **Default-deny cannot ship non-enforcing.** `networking.k8s.io/v1` has no audit mode and k3s's embedded kube-router has none; a policy is enforced the moment it selects a pod. The audit stage the model sequences needs a CNI nobody has picked. Enforcing `data-system`'s policies on day one cuts five live consumers off the datastore. | data |

## Model holes the render exposed

| # | gap | seen in |
|---|---|---|
| R12 | **Which Service directory owns a per-domain object.** `namespace.yaml` and the namespace-wide default-deny are one object per domain; the adapter emits one directory per Service. auth has one Service so nothing collides; data has three — three identical Namespace objects at three paths, `E_PATH_COLLISION` waiting for a second writer. **Closed** by [0070](../../../docs/adr/model/0070-path-authority-is-layer-2.md): layer 2 assigns the path, so the object has one owner and the collision is decidable at plan assembly. | data, auth |
| R13 | **`automountServiceAccountToken` is underivable, and the obvious rule is wrong.** "No grant → no token" gets postgres backwards: it holds a grant and needs no token, because under `delivery: env` the operator performs the read and the pod never authenticates. The derivation must read `delivery`; no chapter states it. | auth, data |
| R14 | **Probe derivation is partial.** `startupBudget` gives period × threshold and a progress deadline, but which endpoint the startup probe uses is unstated — chosen during serialisation, which chapter 30 forbids — and readiness/liveness `periodSeconds`, `failureThreshold` and `initialDelaySeconds` have no derivation. | auth |
| R15 | **No writable-path vocabulary.** A read-only root filesystem needs `/tmp` for the JVM; that is prose in the intent, not a field. No `sizeLimit` is derivable, and a second writable path can only be had by relaxing the whole control. | auth |
| R16 | **`replicas` and `minAvailable` are derived separately and never compared.** auth-api's eligible node set is one node, so live's two replicas is not reproducible; PDB `minAvailable: 1` against `replicas: 1` permits zero voluntary evictions, so draining that node — also the control plane — blocks forever. | auth |
| R17 | **No exposure name and no hostname label.** Two anonymous exposures with no `paths` render two IngressRoutes with an identical match; Traefik breaks the tie by rule length then name. The live `/api` versus `/` split is expressible and is not declared. | auth |
| R18 | **A cross-domain edge outside the fragment set narrows the allow set silently.** `{service: stalwart, surface: smtp}` does not resolve, so the coordinates and the egress rule are absent rather than wrong — a valid policy with a missing rule, seen on-call as a timeout, not an error code. | auth |
| R19 | **`self-roll` derives a capability that cannot perform the roll.** `patch` on a transit key permits neither `transit/keys/<name>/rotate` nor `transit/sign/<name>`. The access × path derivation needs a non-KV branch. | auth |
| R20 | **A grant path is not the path the credential is read from.** The dynamic database credential is granted at a KV-v2 path while the engine lives at `database/creds/<role>`, which no grant declares and no policy covers. | auth |
| R21 | **Byte-matched grant paths cannot reach their KV-v2 `metadata` sibling.** No transform is permitted, so version listing and soft-delete are denied to every reader in the estate. | auth |
| R22 | **`runtime: jvm` is asked to imply Spring Boot.** Four spring-cloud-vault spellings derive from `delivery: self`, and no field distinguishes a Spring JVM from any other. | auth |
| R23 | **An Asset's change-propagation mechanism is unstated.** `onChange: restart` needs either a content-hashed ConfigMap name or a checksum annotation; no chapter picks one. `onChange` has two values and postgres supports `pg_ctl reload`, so under `Recreate` a one-line config edit is a full outage. | data |
| R24 | **The label set is not fixed anywhere.** `name` + `instance` are the Deployment selector and therefore immutable — changing the convention later is delete-and-recreate on every workload in the estate. **Closed** by [0072](../../../docs/adr/model/0072-the-label-set-is-fixed.md): the five labels are named, part-of carries the Service, and name plus instance are named as immutable selectors. | auth |
| R25 | **No scrape `interval` or `scrapeTimeout` is derivable**, so omitting them silently takes the metrics stack's global default, decided outside the model. | auth |
| R26 | **Estate-scoped Deliverables land in another domain's namespace.** The Gatus endpoints ConfigMap is one object in `utility-system`; `E_FOREIGN_NAMESPACE` is satisfied only because the adapter owns the path rather than the Service. **Closed** by [0070](../../../docs/adr/model/0070-path-authority-is-layer-2.md): an estate-scoped Deliverable is assigned its path and its owner rather than inheriting the emitting adapter's. | auth |

## Missing inputs, not missing derivations

Every platform-component fact the render needs is a Cluster Context input the
example set does not carry: cluster DNS, edge, metrics-stack and Secret Store
selectors; `release: metrics-stack` on the ServiceMonitor; entryPoints and
certResolver; `VAULT_ADDR`; `DEPLOYMENT_ENVIRONMENT`; the remaining `OTEL_*` and
`PYROSCOPE_*` Runtime Profile values. One coupling worth recording: if
`VAULT_ADDR` is the public hostname, the derived "egress to the Secret Store"
rule selects pods the traffic never reaches.

Also missing from the example set itself: auth-ui has no env file, so its
container renders with no env at all — the model requires one per Workload and
the set carries one of two.
