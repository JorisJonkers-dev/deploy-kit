# What the render surface says the model still owes

Rendered by hand from the three worked domains, against the sixteen registered
adapters. Every row is something a renderer must produce and cannot produce from
intent as declared today. Read `auth/rendered/README.md`,
`knowledge/rendered/README.md` and `data/rendered/README.md` for the per-file
detail; this is the ordered list.

Fifty rendered files across `auth/`, `knowledge/` and `data/`. All parse.

Rows marked **closed** have since been decided; the row stays so the evidence
that forced the decision stays with it.

**Both blocking sections are discharged as of 2026-09-07.** R1–R11 are decided:
nine closed outright, R1 and R11 reclassified as obligations that were never the
render's, and R7's blocker — a grant that can name
`database/creds/<role>` — closed with R19 and R21 on the same day. What is left in this document is the fifteen model holes
below, each of which the compiler will force in turn, and the list of what the
decisions owe the example set.

## Blocking — no producer exists

| # | gap | seen in |
|---|---|---|
| R1 | **Atomic switchover is not expressible in plain Kubernetes objects.** Two Deployments in one Service each enter their own Endpoints when their own readiness passes. auth-ui (30s) serves a new bundle for up to the 600s auth-api is allowed to start — a new UI against an old API, both healthy. Nothing links them: the shared label is consumed by no controller, kustomize groups without gating, Flux health checks run after apply. **No rendered object has the identity "the Service".** **Reclassified** by [0071](../../../docs/adr/model/0071-release-gate-inputs-are-layer-2.md): the mechanism stays with the delivery definition and the model owes the gate's inputs, which layer 2 now derives — member list, readiness references, and a deadline of max member progressDeadlineSeconds. No longer blocks the render. | auth |
| R2 | **The Vault policy and Kubernetes auth role have no producer.** `vso` emits VaultConnection / VaultAuth / VaultStaticSecret / VaultDynamicSecret — none is a policy or a role. Reached from `delivery: self` in auth and from `delivery: env` in data, so it is not a delivery-mode edge case. **Closed** by [0073](../../../docs/adr/model/0073-vault-policy-is-a-deliverable.md): a vault-policy adapter emits one JSON policy and one Kubernetes auth role per Workload identity; writing them into Vault is delivery, and the auth mount is a platform fixture. | auth, data |
| R3 | **No `rbac` adapter and no `networking` adapter.** Every NetworkPolicy in these trees is what a future `networking` adapter must emit, and the only implementation lives in the generation being deleted. Three Services share `data-system`; the only thing stopping valkey's ServiceAccount reading postgres' Secret is that no Role grants it — an absence, not a boundary. **Closed** by [0074](../../../docs/adr/model/0074-networking-adapter-emits-policy.md) (a networking adapter owns every NetworkPolicy) and [0075](../../../docs/adr/model/0075-no-workload-rbac-in-v1.md) (no workload RBAC is rendered; the absence becomes E_WORKLOAD_RBAC_GRANT, a composition-time refusal). | data |
| R4 | **The forward-auth `Middleware` has no producer.** `traefik-public` emits IngressRoutes *with middleware references* — references only. Every `audience: authenticated` route in the estate resolves against a Middleware nothing renders. **Closed** by [0076](../../../docs/adr/model/0076-middleware-has-one-producer.md): a traefik-middleware adapter owns every Middleware, and a tier serving `authenticated` names the endpoint that authenticates for it. | auth, data |
| R5 | **Durability renders nothing.** `irreplaceable` should derive a backup job, a retention sweep and an off-cluster copy; `recoverable` a job and a sweep; `reconstructible` nothing. No adapter reads the field, and schedule, retention window and destination have no declaring site in layer 1. PVC-level snapshots are impossible here — no VolumeSnapshot CRDs, no CSI snapshot support on `local-path` — so an application-level job is the *only* mechanism. **Closed** by [0077](../../../docs/adr/model/0077-durability-derives-a-backup.md): the Platform document carries one policy per class (window, retention, destination), the method is keyed by the Workload's new `engine` field ([0078](../../../docs/adr/model/0078-engine-is-workload-vocabulary.md)), and the kubernetes adapter emits the CronJob and sweep. The destination credential is a derived grant. | data, knowledge |
| R6 | **`alertClass` derives nothing.** Three Services declare three different values and all three produce zero objects. No adapter renders a PrometheusRule in either generation. `platform-postgres` declares `page` and has no monitoring object at all, because Gatus derives from `exposure` and a datastore is correctly not exposed. **Closed** by [0079](../../../docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md): the class derives nothing in this model and is published as a resolved fact for the monitoring stack to read, while the declared `scrape` surface derives the ServiceMonitor. A declared class with no signal is E_ALERT_CLASS_WITHOUT_SIGNAL. `platform-postgres` clears it on its exporter sidecar's surface rather than on its exposure; `platform-valkey`, which has neither, declares no `observability` block at all. | data |
| R7 | **`init-databases.sh` is a derived catalog with no producer.** One database and one owning user per consumer, which the inbound edge set already knows. Chapter 16 calls it an inbound derivation; chapter 10 refuses it as an Asset because an Asset may not be executable. So it is a Deliverable, and nothing produces it. **Decided** by [0080](../../../docs/adr/model/0080-database-catalog-is-derived-data.md): the render emits a declarative catalog (one entry per consumer: database, owning user, Vault role) and the platform's engine catalog applies it; credentials are issued by Vault's database engine, not stored. Blocked on R20 for a grant that can name `database/creds/<role>`. | data |

## Blocking — the object cannot be applied as rendered

| # | gap | seen in |
|---|---|---|
| R8 | **PVC capacity cannot be derived.** Capacity is platform-assigned and the author may not write it, yet no pinned input assigns a number. The node contract publishes `disks[].usable_gib` and no rule allocates from it. Rendered `storage: null` — parses, does not apply. **Closed** by [0081](../../../docs/adr/model/0081-volume-size-is-a-hard-dimension.md): a volume authors `size` as a hard dimension, matched against the node contract's `usable_gib` (`E_STORAGE_UNSATISFIABLE`), and `placement.disk.size` becomes derived so the quantity has one declaring site. | data |
| R9 | **`runAsNonRoot: true` with no UID and no `fsGroup`, against RWO volumes.** A freshly provisioned `local-path` directory is root-owned; without `fsGroup`, postgres cannot `initdb` into its own PV. The images lock carries digests, not UIDs. If the image's `USER` is a name rather than a number the kubelet cannot verify non-root and the pod fails `CreateContainerConfigError`. **Closed** by [0082](../../../docs/adr/model/0082-images-lock-carries-uid-and-gid.md): the lock resolves `uid` and `gid` per alias, `runAsUser`/`runAsGroup`/`fsGroup` derive from them, a named `USER` is `E_IMAGE_USER_NOT_NUMERIC` at lock time, and `fsGroupChangePolicy: OnRootMismatch` keeps a large volume from being re-chowned on every start. | data |
| R10 | **auth-ui cannot bind port 80** under `runAsNonRoot` + `drop ALL` with only a `writableRootFilesystem` exception. Either the port is wrong or the exception set is. **Closed** by [0083](../../../docs/adr/model/0083-privileged-port-needs-the-capability.md): a port below 1024 under non-root is `E_PRIVILEGED_PORT_UNDER_NONROOT`, and there is no escape. auth-ui provides 8080; a route names a surface, not a number, and the Service object keeps the port the edge expects. | auth |
| R11 | **Default-deny cannot ship non-enforcing.** `networking.k8s.io/v1` has no audit mode and k3s's embedded kube-router has none; a policy is enforced the moment it selects a pod. The audit stage the model sequences needs a CNI nobody has picked. Enforcing `data-system`'s policies on day one cuts five live consumers off the datastore. **Reclassified** by [0084](../../../docs/adr/model/0084-render-only-is-the-v1-policy-stage.md): render-only is v1's stage, so the adapter emits the full set and nothing loads it until 0036 picks a CNI. The render is not waiting on the CNI; the promotion is. | data |

## Model holes the render exposed

| # | gap | seen in |
|---|---|---|
| R12 | **Which Service directory owns a per-domain object.** `namespace.yaml` and the namespace-wide default-deny are one object per domain; the adapter emits one directory per Service. auth has one Service so nothing collides; data has three — three identical Namespace objects at three paths, `E_PATH_COLLISION` waiting for a second writer. **Closed** by [0070](../../../docs/adr/model/0070-path-authority-is-layer-2.md): layer 2 assigns the path, so the object has one owner and the collision is decidable at plan assembly. | data, auth |
| R13 | **`automountServiceAccountToken` is underivable, and the obvious rule is wrong.** "No grant → no token" gets postgres backwards: it holds a grant and needs no token, because under `delivery: env` the operator performs the read and the pod never authenticates. The derivation must read `delivery`; no chapter states it. **Closed** by [0087](../../../docs/adr/model/0087-token-mounted-only-for-delivery-self.md): the token is mounted only where a grant carries `delivery: self`, because that is the one case the pod authenticates; agents-api, which calls the Kubernetes API, restates it with a reason. | auth, data |
| R14 | **Probe derivation is partial.** `startupBudget` gives period × threshold and a progress deadline, but which endpoint the startup probe uses is unstated — chosen during serialisation, which chapter 30 forbids — and readiness/liveness `periodSeconds`, `failureThreshold` and `initialDelaySeconds` have no derivation. **Closed** by [0088](../../../docs/adr/model/0088-startup-probe-targets-liveness.md): the startup probe targets the liveness declaration, because exceeding its threshold kills the container; cadence comes from a Platform document probe policy and `initialDelaySeconds` is 0. | auth |
| R15 | **No writable-path vocabulary.** A read-only root filesystem needs `/tmp` for the JVM; that is prose in the intent, not a field. No `sizeLimit` is derivable, and a second writable path can only be had by relaxing the whole control. **Closed** by [0092](../../../docs/adr/model/0092-writable-paths-are-declared.md): `writablePaths` is authored and each derives an `emptyDir`, `sizeLimit` comes from a Platform document default, the hardening control stays intact, and auth-ui's exception retires. | auth |
| R16 | **`replicas` and `minAvailable` are derived separately and never compared.** auth-api's eligible node set is one node, so live's two replicas is not reproducible; PDB `minAvailable: 1` against `replicas: 1` permits zero voluntary evictions, so draining that node — also the control plane — blocks forever. **Closed** by [0089](../../../docs/adr/model/0089-replicas-derived-no-minavailable.md): `minAvailable` is deleted, `replicas` derives as 1 with more than one a `replicas: {count, reason}` declaration — the sole local capacity exception since the generic override hatch was deleted — and a PDB is emitted only above one replica as `maxUnavailable: 1`. | auth |
| R17 | **No exposure name and no hostname label.** Two anonymous exposures with no `paths` render two IngressRoutes with an identical match; Traefik breaks the tie by rule length then name. The live `/api` versus `/` split is expressible and is not declared. **Closed**: chapter 10 now requires `name` per exposure and `path` plus `match` per route, [0072](../../../docs/adr/model/0072-the-label-set-is-fixed.md) settled the label set with no hostname label, and [0093](../../../docs/adr/model/0093-route-precedence-is-derived.md) derives precedence explicitly — `exact` before `prefix`, longer prefix first — with `E_DUPLICATE_ROUTE` refusing an identical pair. | auth |
| R18 | **A cross-domain edge outside the fragment set narrows the allow set silently.** `{service: stalwart, surface: smtp}` does not resolve, so the coordinates and the egress rule are absent rather than wrong — a valid policy with a missing rule, seen on-call as a timeout, not an error code. **Closed** by [0090](../../../docs/adr/model/0090-edges-resolve-against-the-register.md): an edge resolves against the union or the 0019 register, the register carries an address and ports per surface, and an entry without them is `E_UNMANAGED_SURFACE_WITHOUT_COORDINATES`. | auth |
| R19 | **`self-roll` derives a capability that cannot perform the roll.** `patch` on a transit key permits neither `transit/keys/<name>/rotate` nor `transit/sign/<name>`. The access × path derivation needs a non-KV branch. **Closed** by [0085](../../../docs/adr/model/0085-a-grant-is-a-union-on-engine.md): a `transit` grant declares a key and a closed `operations` set — sign, verify, encrypt, decrypt, rotate — each mapping to one Vault path; the access tiers are KV intents only. | auth |
| R20 | **A grant path is not the path the credential is read from.** The dynamic database credential is granted at a KV-v2 path while the engine lives at `database/creds/<role>`, which no grant declares and no policy covers. **Closed** by [0085](../../../docs/adr/model/0085-a-grant-is-a-union-on-engine.md): every grant derives a read path, a `database` grant's is `database/creds/<role>`, and 0027's join key becomes that derived path — identical to the declared one for `kv`. | auth |
| R21 | **Byte-matched grant paths cannot reach their KV-v2 `metadata` sibling.** No transform is permitted, so version listing and soft-delete are denied to every reader in the estate. **Closed** by [0086](../../../docs/adr/model/0086-kv-read-covers-its-metadata-sibling.md): one `kv` declaration derives both `secret/data/<path>` and `secret/metadata/<path>`, since KV-v2 splitting one document across two API paths is an engine detail. Soft-delete stays out — it is a write. | auth |
| R22 | **`runtime: jvm` is asked to imply Spring Boot.** Four spring-cloud-vault spellings derive from `delivery: self`, and no field distinguishes a Spring JVM from any other. **Closed** by [0091](../../../docs/adr/model/0091-identity-placeholders-not-framework-wiring.md): nothing derives framework wiring — it stays in the Workload's env file — and the one derived value it references comes through a closed `${identity:…}` placeholder source. | auth |
| R23 | **An Asset's change-propagation mechanism is unstated.** `onChange: restart` needs either a content-hashed ConfigMap name or a checksum annotation; no chapter picks one. `onChange` has two values and postgres supports `pg_ctl reload`, so under `Recreate` a one-line config edit is a full outage. **Closed** by [0094](../../../docs/adr/model/0094-asset-change-restarts-unconditionally.md): the object name is content-hashed unconditionally, `reload` is deleted along with the `onChange` field, and the outage is stated in the chapter as what an Asset edit costs on this substrate. | data |
| R24 | **The label set is not fixed anywhere.** `name` + `instance` are the Deployment selector and therefore immutable — changing the convention later is delete-and-recreate on every workload in the estate. **Closed** by [0072](../../../docs/adr/model/0072-the-label-set-is-fixed.md): the five labels are named, part-of carries the Service, and name plus instance are named as immutable selectors. | auth |
| R25 | **No scrape `interval` or `scrapeTimeout` is derivable**, so omitting them silently takes the metrics stack's global default, decided outside the model. **Closed** by [0079](../../../docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md): the Platform document states one `monitors: {interval, timeout}` for the estate and every emitted monitor names it, so the metrics stack's global default stops being an input nobody declared. | auth |
| R26 | **Estate-scoped Deliverables land in another domain's namespace.** The Gatus endpoints ConfigMap is one object in `utility-system`; `E_FOREIGN_NAMESPACE` is satisfied only because the adapter owns the path rather than the Service. **Closed** by [0070](../../../docs/adr/model/0070-path-authority-is-layer-2.md): an estate-scoped Deliverable is assigned its path and its owner rather than inheriting the emitting adapter's. | auth |

## Missing inputs, not missing derivations

**Discharged on 2026-09-08**: every input this section lists is a block of the
worked Platform document ([`platform/platform.intent.yml`](platform/platform.intent.yml)),
in the model's words rather than Traefik's — a tier declares a `listener` and
`certificates`, and the adapter spells them as `entryPoints` and `certResolver`.
The paragraph below is kept as the record of what was missing.

Every platform-component fact the render needs is a Platform document input the
example set does not carry: cluster DNS, edge, metrics-stack and Secret Store
selectors; `release: metrics-stack` on the ServiceMonitor; entryPoints and
certResolver; `VAULT_ADDR`; `DEPLOYMENT_ENVIRONMENT`; the remaining `OTEL_*` and
`PYROSCOPE_*` Runtime Profile values. One coupling worth recording: if
`VAULT_ADDR` is the public hostname, the derived "egress to the Secret Store"
rule selects pods the traffic never reaches.

Also missing from the example set itself: auth-ui has no env file, so its
container renders with no env at all — the model requires one per Workload and
the set carries one of two.

## What the closed rows owed the example set

**Discharged on 2026-09-07.** Layer 1 was updated, the Platform document was
written, and the rendered trees were stripped of commentary and re-rendered
against the decisions. What each row owed is listed below for the record; the
per-tree summary of what changed is in each `rendered/README.md`.

Two items are deliberately still owed, because they are not the example set's
to answer: the node contract is a separate pinned input and is not reproduced
here ([0056](../../../docs/adr/model/0056-node-facts-single-source.md)), and
`auth-ui` still has no env file of its own — the model requires one per Workload
and the set carries one of two.

### The list, as it stood

Every **Closed** row above decided something the worked examples predate, so the
three domain files and the Platform document inputs are behind the model. This is
the list, and it is discharged in one pass rather than row by row — the trees are
also being stripped of commentary, and both edits touch the same files.

| owed | from | where |
|---|---|---|
| `engine` on every datastore Workload | [0078](../../../docs/adr/model/0078-engine-is-workload-vocabulary.md) | `data`, `knowledge` |
| `minAvailable` removed, and `auth-api`'s second replica declared as `replicas: {count, reason}` with its capacity reason | [0089](../../../docs/adr/model/0089-replicas-derived-no-minavailable.md) | `auth`, and any rendered PDB over a single replica |
| the probe policy, and every rendered probe naming its cadence | [0088](../../../docs/adr/model/0088-startup-probe-targets-liveness.md) | Platform document, all three rendered trees |
| `automountServiceAccountToken` on every pod template | [0087](../../../docs/adr/model/0087-token-mounted-only-for-delivery-self.md) | all three rendered trees |
| `writablePaths` on every non-static Workload, and auth-ui's `writableRootFilesystem` exception deleted | [0092](../../../docs/adr/model/0092-writable-paths-are-declared.md) | `auth`, `knowledge` |
| the `${identity:…}` placeholder in auth-api's env file, replacing the literal role name | [0091](../../../docs/adr/model/0091-identity-placeholders-not-framework-wiring.md) | `auth` env files |
| `onChange` removed from every Asset | [0094](../../../docs/adr/model/0094-asset-change-restarts-unconditionally.md) | `data` |
| `size` on every volume | [0081](../../../docs/adr/model/0081-volume-size-is-a-hard-dimension.md) | `data`, `knowledge` |
| `placement.disk.size` removed — it is now derived | [0081](../../../docs/adr/model/0081-volume-size-is-a-hard-dimension.md) | `data` declares `size: 100Gi` under `disk` |
| a scrape surface for `platform-postgres`, or a lower class | [0079](../../../docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md) | `data` — it declares `page` and has no signal, which is now `E_ALERT_CLASS_WITHOUT_SIGNAL` |
| the durability policy per class, and the backup method per `engine` | [0077](../../../docs/adr/model/0077-durability-derives-a-backup.md) | Platform document |
| the alert rule catalog and the class-to-receiver mapping | [0079](../../../docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md) | deleted, not relocated: the monitoring stack reads `alertClass` from the published projection. Monitor cadence is one line in the Platform document (2026-09-10) |
| coordinates for every unmanaged surface an edge targets, starting with `stalwart`'s SMTP | [0090](../../../docs/adr/model/0090-edges-resolve-against-the-register.md) | Platform document |
| a forward-auth endpoint on every tier serving `authenticated` | [0076](../../../docs/adr/model/0076-middleware-has-one-producer.md) | Platform document |
| explicit precedence on every rendered IngressRoute | [0093](../../../docs/adr/model/0093-route-precedence-is-derived.md) | `auth`, `knowledge`, `data` edge trees |
| the label set as fixed, on every rendered object | [0072](../../../docs/adr/model/0072-the-label-set-is-fixed.md) | all three rendered trees |
| the release gate's inputs in each projection | [0071](../../../docs/adr/model/0071-release-gate-inputs-are-layer-2.md) | `resolved.yml` examples |
