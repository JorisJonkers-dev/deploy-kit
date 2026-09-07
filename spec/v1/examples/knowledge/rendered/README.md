# Rendered output — the `knowledge` domain

Hand-executed Deliverable Set for
[`knowledge.domain.yml`](../knowledge.domain.yml) and its two env files. One
domain, one Service, two Workloads, namespace `knowledge-system`.

This is the **goal state**, not what the tree emits today. Every object carries
`securityContext` from the hardening class and `resources` from `placement`;
images are digests from the images lock; there is no HorizontalPodAutoscaler,
because autoscaling is not in the model; storage is `local-path`, because no
PVC in the estate sets a `storageClassName`.

Adapter attribution lives on the **Fragment** record (`{path, content, adapter}`),
not on the object, so each file states its adapter in a header comment. Nothing
in the rendered YAML carries it machine-readably — see G-30.

## Emitted

| file | adapter | derives from | cannot derive today |
|---|---|---|---|
| `namespace.yaml` | `kubernetes` | `domain` | — (the adapter emits this per *Service* directory, not per domain: **G-02**) |
| `kustomization.yaml` | `kubernetes` | the Service set of the domain | — |
| `apps/knowledge/workload.yaml` | `kubernetes` | `lifecycle`, `image`, `runtime`, `provides`, `placement`, `hardening`, `probes`, `startupBudget`, `zeroDowntime`, `stateful`, `volumes`, `secrets`, env files | `replicas` (`minAvailable` ungraded); the image's UID behind `runAsNonRoot`; a scratch volume for a read-only-root JVM (**G-04**); what `stateful` changes about the object kind (**G-05**); the PV-bound node (**G-06**); env-var renaming through `envFrom` (**G-03**); readable mode on the 0400 key (**G-08**) |
| `apps/knowledge/serviceaccount.yaml` | `kubernetes` | workload `name` × 2, `domain` | — (the adapter names one account after the *Service*: **G-09**) |
| `apps/knowledge/configmap.yaml` | `kubernetes` | env files, `dependsOn`, exposure port, Cluster Target, workload `name` | 15 of the 16 Runtime Profile keys (**G-13**); the database name spelling (**G-12**); change propagation on edit (**G-10**) |
| `apps/knowledge/pvc.yaml` | `kubernetes` | `volumes[].claim`, `volumes[].durability`, `stateful` | `resources.requests.storage` — **the object does not apply without it** (**G-15**); the durability annotation key (**G-14**) |
| `apps/knowledge/servicemonitor.yaml` | `kubernetes` | `scrape`, `provides` | `interval` (an adapter constant, not a derivation) |
| `apps/knowledge/networkpolicy.yaml` | `networking` — **not registered** (**G-16**) | `dependsOn`, `provides`, `exposure`, `scrape`, effective grant set, baseline | egress to anything outside the estate — the worker's git remote (**G-20**); ingress from consumers absent from the union (**G-18**); whether a namespace catch-all is emitted (**G-17**) |
| `apps/knowledge/vso.yaml` | `vso` | `secrets` at both levels, `delivery`, `rotation`, workload `name` | Secret/object naming (**G-21**); which identity reads a shared path (**G-23**); the Kubernetes auth mount name |
| `apps/knowledge/kustomization.yaml` | `kubernetes` | the emitted file set | ownership of `vso.yaml` (**G-25**) |
| `edge/ingressroutes.yaml` | `traefik-public` | `exposure` port, audience and five path rules | the hostname label — **no field in layer 1 declares it** (**G-26**) |
| `observability/gatus-endpoints.yaml` | `gatus` | `exposure`, `probes.readiness`, `provides` | an externally probeable health path (**G-28**); anything at all from `alertClass` (**G-29**); which namespace the ConfigMap belongs in (**G-27**) |

## Deliberately absent, and correct

| not emitted | why it is right |
|---|---|
| a Kubernetes `Service` for `knowledge-ingest-worker` | it declares no `provides`. A RabbitMQ consumer opens no listener, so there is no surface, nothing may `dependsOn` it, and there is no address to route to. |
| a `ServiceMonitor` or `PodMonitor` for `knowledge-ingest-worker` | no `scrape` is declared, and a ServiceMonitor selects a Service it does not have. |
| any probe on `knowledge-ingest-worker` | `probes: none` is **declared**, so the absence is a decision rather than a forgotten block — and a readiness gate on a Workload that can never report ready would stop the Service switching for ever. |
| `podmonitor.yaml`, `hpa.yaml` | nothing declares a pod-level scrape; autoscaling is not in this model. |
| `traefik-lan` routes | no path rule carries the `lan` audience. |

## Demanded by the model, produced by nothing

| object | demanded by | producer today |
|---|---|---|
| backup `CronJob` + retention sweep + off-cluster copy | `durability: irreplaceable` on `knowledge-vault-clone` | **none.** No adapter reads `durability`, and even with one, three values have no declaring site: the schedule, the retention window and the off-cluster destination. Not rendered rather than invented (**G-31**). |
| `PodDisruptionBudget` | the `kubernetes` adapter builds one from an availability field | **not derivable.** `minAvailable` is ungraded and no `replicas` assignment exists; a PDB over a single-replica Deployment blocks every node drain (**G-32**). |
| `PrometheusRule` | `alertClass: business-hours` | **none.** Zero occurrences under `src/` in either generation. |
| `Role` / `RoleBinding` per Workload | per-Workload identity | **none.** No `rbac` adapter. It is also what keeps the two Secret boundaries apart in a shared namespace (**G-24**). |
| `resolved.yml` (the `ResolvedService` projection) | publish-back | central composition; not part of a Deliverable Set. |

Estate-scoped files this domain contributes rows to but cannot render alone:
`edge-catalog`, `edge-route-catalog`, `image-metadata`, `flux-root`'s
`apps-knowledge` Kustomization, and `vso`'s `VaultConnection` in `vso-system`.

## Gaps

**G-01** The `kubernetes` adapter keys every object off the *Service* name and
emits one controller per Service directory. Two Workloads in one Service
overwrite each other. Nothing about the adapter is per-Workload.

**G-02** The same adapter emits `namespace.yaml` inside each Service directory.
A domain with three Services emits three identical `Namespace` objects at three
paths.

**G-03** `envFrom: secretRef` injects the Secret's **own key names**. The env
file asks for `DB_USER=${secret:…#user}` and `RABBITMQ_USER=${secret:…#rabbitmq.user}`,
so envFrom yields `user` and `rabbitmq.user` — the second is not a legal
environment variable name at all. The rule "literal keys become plain env
entries, `${secret:…}` keys become envFrom secretRef entries" cannot deliver the
renaming the placeholder mechanism promises. It needs per-variable
`valueFrom.secretKeyRef`, or a VSO `destination.transformation` template. This
is the largest hole in the model as written.

**G-04** `readOnlyRootFilesystem: true` on a JVM needs a writable `/tmp`. Layer 1
has no vocabulary for an ephemeral volume — `volumes` carries `claim`, `mountAt`
and `durability` only — so neither the author nor the renderer can produce one.

**G-05** Object kind is documented as derived from `lifecycle` + `stateful` +
`volumes`, but chapter 20's own projection renders `Deployment` for
`knowledge-ingest-worker`, which is `stateful: true` with a volume. With
`volumeClaimTemplate` forbidden, what `stateful` changes about the kind is
unstated; here it only selects the 10m health timeout class.

**G-06** The example set contains no `ClusterState` snapshot, so `placement.boundTo`,
`from: clusterState` and the PV's node affinity cannot be rendered. Every
statement about reproducibility depends on a collector that does not exist.

**G-07** `startupBudget: 120s` on a Workload with `probes: none` feeds only
`progressDeadlineSeconds`. Its other stated consumer — the startup probe's
period and threshold — has nothing to configure, so half the derivation is dead
for this shape.

**G-08** `fileMode: "0400"` on a projected Secret writes a file owned `root:root`.
The container runs as a non-root UID from the image under `hardening: restricted`.
As declared, the process cannot read its own deploy key. Repairing it needs
`fsGroup` or a known UID, neither of which layer 1 can express — and the two
declarations that collide are in the same Workload block.

**G-09** `serviceAccountName()` returns the Service name today, so both pods
authenticate as one principal and receive the union of both policies. That gives
the internet-facing API `read` on the ingest worker's SSH deploy key. The
declaration and the identity must ship together.

**G-10** `onChange: restart` content-hashes an **Asset's** object name. No rule
states what an **env file's** ConfigMap does, so an edit to `base.env` applies
successfully and never reaches the running pod — the failure 16 of the estate's
18 ConfigMaps already have.

**G-11** A `${dependency:…}` coordinate resolves to the provider's Kubernetes
`Service`, which is named for the provider's **Workload** (`postgres`), not for
the Service id the consumer wrote (`platform-postgres`). Chapter 16 promises a
provider may move a surface between its own Workloads "without a single consumer
edit"; the resolved coordinate in the consumer's ConfigMap changes when it does.

**G-12** `${dependency:platform-postgres.database}` resolves to `knowledge_db`.
The `<service>_db` spelling is evidenced by `init-databases.sh` and specified in
no chapter. The set of legal coordinate names (`host`, `port`, `database`, …) is
not enumerated anywhere either.

**G-13** `runtime: jvm` injects 10 `OTEL_*` and 6 `PYROSCOPE_*` keys; `runtime:
python` injects 6. Exactly one of them, `OTEL_SERVICE_NAME`, is a function of
anything declared. The other fifteen are constants held in a **Runtime Profile**,
and chapter 20's pinned input set does not include one — it lists Intent
Fragments, the Cluster Context and node contract, the images lock and the
ClusterState snapshot. A render cannot be a pure function of pinned inputs while
16 env vars come from an unpinned source.

**G-14** Durability is carried onto the PVC as an annotation so a delivery
mechanism can refuse to prune it, which is one of the model's three demands. No
chapter names the annotation key, so the demand has no wire format.

**G-15** PVC capacity is "assigned" and forbidden to the author, but no pinned
input carries an assignment: the node contract publishes `disks[].usable_gib`
and no rule allocates a number to a claim. For an existing claim the bound PV's
capacity would come from the ClusterState snapshot (see G-06). **A PVC without
`resources.requests.storage` does not apply**, so this blocks the file, not just
a field.

**G-16** No registered adapter emits `NetworkPolicy`. The only implementation
ever written is in the generation being deleted, so coverage for the kind goes
from unregistered to absent while default-deny becomes normative.

**G-17** Whether the derivation emits a namespace-scoped catch-all in addition to
per-Workload policies is unstated. It matters more than it looks: the namespace
holds every Service of the domain, so one domain's catch-all governs Services
added to the file later and never reviewed against it.

**G-18** `knowledge-api`'s ingress allow set contains no consumer rule, because
nothing in the composed example set declares an edge to `knowledge`. In the live
estate the agents Services do. A provider's policy is therefore a function of
**which fragments are in the union**: a domain that silently fails to publish
narrows its *providers'* ingress, and the pod that breaks is not in the domain
that broke. Chapter 40's stale-participant check is a correctness gate here, not
hygiene.

**G-19** "Egress to the Secret Store, from the Workloads holding the grant" is
derived from any grant. All four grants here are `delivery: env` or `file`, where
the VSO operator does the reading and the pod never opens a connection to Vault.
The rule should be conditioned on `delivery: self`; as stated it grants Vault
reachability to pods that never use it.

**G-20** `knowledge-ingest-worker` holds an SSH deploy key at 0400 and a claim
called `knowledge-vault-clone`, so it must reach a git host **outside the
cluster**. `dependsOn` can only name a Service Id in the composed union, so no
declaration can produce that egress rule. Under default-deny the Workload cannot
do the job the grant exists for, and no field in layer 1 can say so.

**G-21** The derived `Secret` / `VaultStaticSecret` name is load-bearing — it is
what `envFrom` and the projected volume reference — and no chapter states the
rule. This render uses the granted path minus the mount and `data/`, with `/`
replaced by `-`.

**G-22** The registered `vso` adapter emits one `VaultAuth`, in `vso-system`, on
the operator's own ServiceAccount and role. Under it the operator reads every
path for everyone and the two derived per-Workload Vault roles do nothing for
`env` or `file` delivery. This render emits one `VaultAuth` per Workload
instead; that is the goal state, and it is a different object graph.

**G-23** A Service-level grant has two eligible identities. The model states no
tie-break for which one performs the read, and the choice is visible in the
rendered object.

**G-24** With `delivery: env`/`file` the per-Workload Vault boundary is
re-materialised as a namespace-scoped Kubernetes `Secret`. It holds only because
nothing grants `get secrets` in `knowledge-system` — and there is no `rbac`
adapter to render such a Role, nor to prove none exists.

**G-25** `vso.yaml` sits in the Service directory here but the registered adapter
writes to `apps/vso-secrets/<name>.yaml` with its own kustomization. Three
central adapters already declare the same `platform/cluster/flux/apps` prefix
and `E_PATH_COLLISION` has zero occurrences under `src/`.

**G-26** Rendering the IngressRoute needs `kb.jorisjonkers.dev`, and chapter 10's
`exposure` entry has **no field for the hostname label**. The value is
platform-assigned from a label the intent cannot write.

**G-27** The `gatus` adapter's `defaultPath` places the ConfigMap under
`apps/utility-system/gatus/`, while the observability pack runs gatus in
namespace `observability` and mounts a ConfigMap named `gatus-endpoints`. A
ConfigMap in the wrong namespace is not mounted and is not an error.

**G-28** The only declared health path is matched by the `/` rule, whose audience
is `authenticated`, so an external probe is answered by forward-auth. The
endpoint must be internal, which means nothing checks that the hostname resolves,
that the certificate is valid, or that the IngressRoute matches — the six
artefacts the exposure block unified are still unverified end to end.

**G-29** `alertClass: business-hours` renders nothing. The gatus ConfigMap carries
`endpoints` only, no adapter emits a receiver or a notifier route, and
`PrometheusRule` has no implementation. The declaration has out-degree zero
today, which is exactly the defect property 3 exists to catch.

**G-30** Attribution is a property of the Fragment record, so the rendered YAML
carries no machine-readable adapter. A diff over the tree cannot name the
producer without joining to the Fragment set; the header comments here are
documentation.

**G-31** `durability` has no reader in either renderer generation. Even given an
adapter, `irreplaceable` needs a schedule, a retention window and an off-cluster
destination, and none of the three has a declaring site in any layer.

**G-32** `minAvailable` is ungraded and no `replicas` assignment appears in
chapter 20's projection, so `pdb.yaml` cannot be produced. Guessing `minAvailable: 1`
over a one-replica Deployment blocks every node drain permanently.

**G-33** The `restricted` class is defined as exactly four controls and does not
include `allowPrivilegeEscalation: false`, which the Pod Security Standards
profile of the same name requires. A pod rendered from this class does not
satisfy PSA `restricted`, so the class name promises more than it delivers.

**G-34** Probe timings are stated only for the startup probe (`periodSeconds: 5`,
threshold = budget ÷ 5) and `timeoutSeconds: 5`. `periodSeconds`,
`initialDelaySeconds` and `failureThreshold` for readiness and liveness are fixed
by no rule; this render omits them and takes Kubernetes' defaults.

**G-35** Chapter 20's worked projection for `knowledge-ingest-worker` shows
`memory: 512Mi`, `cpu: 100m` and `disk: {media: [nvme], size: 100Gi}`. The intent
file declares `256Mi`, `50m` and no `disk` dimension. This render follows the
intent and invents no dimension. The chapter's example needs correcting, or the
two disagree about what the same Workload asks for.

**G-36** `E_SECRETS_AT_REST_REQUIRED` blocks all four grants until the pinned
Cluster Context advertises `secretsEncryption: true`, so **none of this domain
ships** on today's inputs. There is no Cluster Context document in the example
set to check against.
