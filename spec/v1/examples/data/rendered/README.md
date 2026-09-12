# Rendered output: the `data` domain

What a renderer must produce from [`../data.domain.yml`](../data.domain.yml) and
[`../env/platform-postgres.base.env`](../env/platform-postgres.base.env),
rendered by hand against the model as decided: chapter 10 (intent), chapter 16
(identity, edges, policy), chapter 20 (the derivations), chapter 30 (adapters and
attribution), and the two amendments in `review/PLACEMENT-DOMAIN-MANIFEST.md`
and `review/EXPOSURE-MANIFEST.md`.

It is the **goal state**, not today's output. Today's renderer emits no
`securityContext`, no `resources` and pins nothing. Every object below carries
the hardening class, `resources` under the two shape rules (memory request ==
limit; cpu request, no cpu limit), and an image by digest. There is no
HorizontalPodAutoscaler, because autoscaling is not in this model. Storage is
`local-path`, because no PVC in the estate sets a `storageClassName` and Longhorn
is not in use. Where a value cannot be derived from the intent as declared it is
marked in the file rather than invented, and the reason is a row in
[Gaps](#gaps).

**Three Services (`platform-postgres`, `platform-rabbitmq`, `platform-valkey`),
in ONE namespace, `data-system`, each releasing on its own.** This domain is the
proof that a namespace is not a trust boundary, and the tree is arranged so that
claim is checkable rather than asserted:

- three Service directories, three `kustomization.yaml`, three file sets, and no
  object in any of them naming an object in another;
- three ServiceAccounts, one per Workload, named for the Workload alone, which
  is the *entire* boundary between them, because Vault's Kubernetes auth binds a
  role to a name and a namespace and the namespace half is shared;
- three NetworkPolicies, none of which admits the two pods sitting beside it.

What the tree does **not** show is that all three reconcile as one unit, see
[G-01](#g-01), the most important row here.

Attribution is a property of the producing adapter, declared in the registry
(0054), not an annotation on the object, which was considered and rejected
because an edit can lose it. The `# adapter:` header on each file is a reading
aid; the table below is the attribution.

## Comment-free, and what this pass changed

The tree carries **no commentary**: one `GENERATED. Never hand-edit.` header line
per file, emitted by the serializer as a constant, and then the object.
Everything the files used to explain in comments belongs here, in this README,
or in a decision.

The trees were re-rendered against the decisions taken on 2026-09-07, so this
pass added the objects that had no producer, applied the fixed label set, and
made three derivations explicit that a renderer had been choosing:

| change | decided in |
|---|---|
| the fixed label set, `instance` now the Workload and `component` the runtime | [0072](../../../../../docs/adr/model/0072-the-label-set-is-fixed.md) |
| `automountServiceAccountToken`, `false` wherever the pod does not authenticate | [0087](../../../../../docs/adr/model/0087-token-mounted-only-for-delivery-self.md) |
| `runAsUser`, `runAsGroup`, and `fsGroup` where a volume is held | [0082](../../../../../docs/adr/model/0082-images-lock-carries-uid-and-gid.md) |
| a startup probe pointed at the **liveness** endpoint, and one probe cadence | [0088](../../../../../docs/adr/model/0088-startup-probe-targets-liveness.md) |
| an `emptyDir` per declared writable path, at the platform's ephemeral size | [0092](../../../../../docs/adr/model/0092-writable-paths-are-declared.md) |
| explicit route `priority`, rather than Traefik's rule-length sort | [0093](../../../../../docs/adr/model/0093-route-precedence-is-derived.md) |
| a `PodDisruptionBudget` only above one replica, as `maxUnavailable` | [0089](../../../../../docs/adr/model/0089-replicas-derived-no-minavailable.md) |

**The "cannot derive today" column below is largely historical.** Twenty-six of
those rows were decided on 2026-09-07 and the row-by-row status lives in
[`../../RENDER-GAPS.md`](../../RENDER-GAPS.md) rather than being restated here: one source, so the two cannot drift.

## Estate-scoped objects are not in this tree

Two files this tree used to carry, `edge/middlewares.yaml` and
`observability/gatus-endpoints.yaml`, render in the **platform domains** now:
the Middleware set is emitted per tier by the `traefik` adapter into the edge
domain, and the Gatus endpoint list is an inbound derivation rendered as the
declared `gatus` Service's own Asset in the observability domain
([0096](../../../../../docs/adr/model/0096-the-foundation-is-declared.md),
[0098](../../../../../docs/adr/model/0098-one-publication-path.md)). This domain
contributes routes and exposures to both; it owns neither object.

## The files

| file | adapter | derives from (layer 1) | cannot derive today |
|---|---|---|---|
| `namespace.yaml` | `kubernetes` | `domain: data` → `data-system` | Nothing about the object. Which of the three Service directories owns it ([G-20](#g-20)) |
| `networkpolicy.yaml` | **none**: `networking` is not a registered adapter ([G-35](#g-35)) | the non-authorable baseline; `podSelector: {}` is per domain | Which Service directory owns it ([G-20](#g-20)); the DNS selectors ([G-21](#g-21)); that it cannot be loaded non-enforcing ([G-29](#g-29)) |
| `kustomization.yaml` | `kubernetes` | the Service list of the domain | Nothing it needs. It groups; it does not gate, and it does not separate ([G-01](#g-01)) |
| `apps/platform-postgres/workload.yaml` | `kubernetes` | `lifecycle`, `image`, `runtime`, `provides` (×2 surfaces), `placement` (memory, cpu, arch, disk), `hardening` + its exception, `sidecars`, `probes` (tcp), `startupBudget`, `cutover`, `stateful`, `volumes`, `assets`, env file | the digest and repository path ([G-03](#g-03)); whether `stateful` means StatefulSet ([G-04](#g-04)); `replicas` ([G-05](#g-05)); a node label for `disk` ([G-06](#g-06)); the PV binding that actually places it ([G-07](#g-07)); the Asset's content hash ([G-08](#g-08)); which container gets which env key ([G-09](#g-09)); a sidecar-scoped identity and restart target ([G-02](#g-02)); a UID and an fsGroup ([G-15](#g-15)); where the hardening controls land ([G-16](#g-16)); the label set ([G-13](#g-13)) |
| `apps/platform-postgres/serviceaccount.yaml` | `kubernetes` | workload `name`, `domain` | `automountServiceAccountToken` ([G-14](#g-14)); any Role/RoleBinding ([G-35](#g-35)) |
| `apps/platform-postgres/configmap.yaml` | `kubernetes` | `assets[0].from`, `.mountAt`, `.onChange` | the object's name: the content hash has no input here ([G-08](#g-08)); the file's 54 lines, which live in the Service repository; whether env literals belong here at all ([G-10](#g-10)); the `init-databases.sh` catalog ([G-11](#g-11)) |
| `apps/platform-postgres/pvc.yaml` | `kubernetes` | `volumes[].claim`, `.durability` | `resources.requests.storage`: **the object does not apply without it** ([G-17](#g-17)); the durability annotation key ([G-18](#g-18)); the backup job the class demands ([G-12](#g-12)) |
| `apps/platform-postgres/servicemonitor.yaml` | `prometheus` | `observability.scrape {workload: postgres, surface: metrics, path}`, `provides` | cadence from the Platform document ([G-19](#g-19)); the operator's `release` selector ([G-21](#g-21)) |
| `apps/platform-postgres/networkpolicy.yaml` | **none** ([G-35](#g-35)) | inbound `dependsOn` edges over the union (ingress), `scrape` (ingress), the grant set (egress), the baseline | five of the eight consumers ([G-22](#g-22)); that the Secret Store rule is wrong for `delivery: env` ([G-23](#g-23)); the platform-component selectors ([G-21](#g-21)) |
| `apps/platform-postgres/vso.yaml` | `vso` | `secrets` (path, access, delivery, rotation), workload `name` | the object-naming rule ([G-24](#g-24)); one VaultAuth per estate vs per Workload ([G-25](#g-25)); the Vault policy and auth role, which nothing produces ([G-26](#g-26)); that the restart target is the database ([G-02](#g-02)) |
| `apps/platform-postgres/kustomization.yaml` | `kubernetes` | the Service's emitted file set | who applies `vso.yaml` ([G-24](#g-24)) |
| `apps/platform-rabbitmq/workload.yaml` | `kubernetes` | `lifecycle`, `image`, `runtime`, `provides` (×3), `placement` (memory, cpu), `hardening`, `probes`, `startupBudget`, `cutover`, `stateful`, `volumes` | the digest ([G-03](#g-03)); object kind ([G-04](#g-04)); `replicas` ([G-05](#g-05)); that the locked digest may not run on 3 of its 7 eligible nodes ([G-27](#g-27)); UID/fsGroup ([G-15](#g-15)); its env file, which the example set omits ([G-28](#g-28)) |
| `apps/platform-rabbitmq/serviceaccount.yaml` | `kubernetes` | workload `name`, `domain` | `automountServiceAccountToken` ([G-14](#g-14)) |
| `apps/platform-rabbitmq/pvc.yaml` | `kubernetes` | `volumes[].claim`, `.durability: recoverable` | `storage` ([G-17](#g-17)); the annotation key ([G-18](#g-18)); the backup job and sweep ([G-12](#g-12)) |
| `apps/platform-rabbitmq/servicemonitor.yaml` | `prometheus` | `observability.scrape {workload: rabbitmq, surface: metrics, path}`, `provides` | cadence from the Platform document |
| `apps/platform-rabbitmq/networkpolicy.yaml` | **none** ([G-35](#g-35)) | inbound edges, `exposure` (ingress from the tier), `scrape`, the baseline | consumers outside the union ([G-22](#g-22)); the edge selectors ([G-21](#g-21)) |
| `apps/platform-rabbitmq/kustomization.yaml` | `kubernetes` | the emitted file set | - |
| `apps/platform-valkey/workload.yaml` | `kubernetes` | `lifecycle`, `image`, `runtime`, `provides`, `placement` (memory, cpu), `hardening`, `probes`, `startupBudget`, `cutover`, `stateful`, `volumes` | the digest ([G-03](#g-03)); object kind ([G-04](#g-04)); `replicas` ([G-05](#g-05)); architecture vs digest ([G-27](#g-27)); its env file ([G-28](#g-28)) |
| `apps/platform-valkey/serviceaccount.yaml` | `kubernetes` | workload `name`, `domain` | `automountServiceAccountToken` ([G-14](#g-14)) |
| `apps/platform-valkey/pvc.yaml` | `kubernetes` | `volumes[].claim`, `.durability: reconstructible` | `storage` ([G-17](#g-17)); the annotation key ([G-18](#g-18)). **No backup job, and that is correct** |
| `apps/platform-valkey/networkpolicy.yaml` | **none** ([G-35](#g-35)) | one inbound edge, the baseline | the same union problem, at its sharpest ([G-22](#g-22)) |
| `apps/platform-valkey/kustomization.yaml` | `kubernetes` | the emitted file set | - |
| `edge/ingressroutes.yaml` | `traefik`, for the tier each route's audience selects | the `management` exposure: `host` (authored, and it does **not** follow the Service id), its one route → the rule and the backend surface, `audience: authenticated` → the forward-auth chain | the `Middleware` object the chain references ([G-31](#g-31)); entryPoint and TLS policy ([G-21](#g-21)); the CORS contribution this route makes to another domain ([G-32](#g-32)) |
| `apps/platform-postgres/backup.yaml` | `kubernetes` | `durability: irreplaceable` plus `engine: postgres`: the platform's per-class policy supplies the window and retention, the engine catalog the command | none (0077) |
| `apps/platform-rabbitmq/backup.yaml` | `kubernetes` | `durability: recoverable` plus `engine: rabbitmq`: a backup and a sweep, no off-cluster copy | none (0077) |
| `apps/vso-secrets/policies/postgres.policy.json` | `vault-policy` | the exporter grant and the derived off-cluster backup credential | none (0073, 0077) |
| `apps/vso-secrets/policies/postgres.role.json` | `vault-policy` | the Workload's ServiceAccount and namespace | - |

### Not emitted, with the reason

| file | why |
|---|---|
| `pdb.yaml`, anywhere | No Workload in this domain declares `minAvailable`, and the field is ungraded. A renderer inventing one would be authoring an availability requirement only the Service knows. The consequence is worth stating: **the estate's datastore has no disruption budget**, so a node drain evicts it with nothing to object |
| `podmonitor.yaml` | Both scrape surfaces are fronted by a Service |
| `hpa.yaml` | The registered `kubernetes` adapter can emit one; nothing in layer 1 declares autoscaling |
| `vso.yaml` for rabbitmq and valkey | Neither declares `secrets` at either level. Their clients hold the credentials, which is what a provider looks like |
| `configmap.yaml` for rabbitmq and valkey | No `assets`, and their env files are not in this example set ([G-28](#g-28)) |
| `servicemonitor.yaml` for valkey | No `scrape`. No exporter runs beside it, so there is no metrics surface and none is invented, which is why the Service declares `alertClass: none` rather than a class it could not signal |
| a backup job for `valkey-data` | `durability: reconstructible` derives none. **The one absence in this domain that is a decision rather than a hole** |
| `PrometheusRule`, anywhere | Not the model's to render. `alertClass` is published as a resolved fact and the monitoring stack that owns PromQL, severity and receivers reads it from the projection ([chapter 10](../../../10-service-intent.md#observability)) |
| `Role` / `RoleBinding` | No `rbac` adapter ([G-35](#g-35)) |
| a backup job for `postgres-data` and `rabbitmq-data` | `irreplaceable` and `recoverable` both demand one; nothing reads `durability` ([G-12](#g-12)) |

## <a id="g-01"></a>G-01: three Services release independently and reconcile as one

The domain file holds three Services because they are neighbours, not a unit.
Atomicity stops at the Service boundary: each of the three switches versions on
its own, and there is no mechanism to couple two Services: a pair that must
release together is one Service, and a surviving pair is evidence the boundary is
drawn wrong. The rendered tree carries that faithfully: three directories, three
kustomizations, three independent file sets.

**And then one Flux `Kustomization` named `apps-data` reconciles all three.** The
Reconcile Unit is derived as `apps-<domain>` (chapter 20), it is rendered by
`flux-root` outside this tree, and it does not distinguish its members. So:

- a one-line edit to `platform-valkey` re-applies `platform-postgres` and
  `platform-rabbitmq`;
- a failure anywhere in the domain, a PVC that will not bind, a
  `secretsEncryption` gate refusing platform-postgres's VaultStaticSecret, takes
  the whole `apps-data` Kustomization not-Ready, and Flux reports one status for
  three independent releases;
- the health timeout class is taken as *the strongest class across a Service's
  Workloads*, and no chapter says what happens when three **Services** share one
  Kustomization. All three here are `stateful`, so 10m, and the disagreement does
  not surface, and it will on the first domain that mixes classes.

Nothing in the rendered tree records which objects belong to which release. The
only marker is `app.kubernetes.io/instance`, and no controller reads it.

The **inverse** of auth's G-01 is worth stating beside it. There, the model
demanded atomicity across two Workloads and the objects could not express it.
Here, the model demands *independence* across three Services and the objects
express it perfectly, right up to the point where the reconcile unit, derived
from a different rule for a different purpose, silently binds them back together.
Two derivations over one domain file disagree about what a unit is, and neither
knows about the other.

## <a id="g-07"></a>G-07: `disk` places the pod once; the PV binding places it for ever

This is the domain's `E_DISK_BINDING_CONFLICT` territory, and it needs stating in
full because the rendered object is actively misleading about it.

**What the intent declares.** `platform-postgres` declares
`disk: {media: [nvme, ssd], size: 100Gi}` alongside `arch: [amd64]`. Matched
against the pinned node contract, the eligible set is four nodes:

| node | why eligible |
|---|---|
| `enschede-t1000-1` | amd64, nvme 120G + 500G |
| `enschede-rx7900xtx-1` | amd64, nvme 160G + 1000G |
| `enschede-gtx-960m-1` | amd64, ssd 100G + 500G |
| `frankfurt-contabo-1` | amd64, ssd 80G + 120G |

The three Pis fail three separate ways: `arm64` against `arch`, `sdcard` against
`media`, and 64G against a 100Gi ask. Under the deleted resource-class model this
Workload could have sat beside a placement admitting only the Pis, passed the
build, and gone `Pending` at apply. That is what the dimension bought.

**What happens next.** Storage is `local-path`. The claim is `ReadWriteOnce` and
the provisioner creates the PersistentVolume on whichever node the pod first
lands on, with node affinity pinning it there. From that moment the *binding* is
the placement: this pod runs on that node or it does not run. `disk` filtered the
**first** placement and has no further effect.

**Three consequences the rendered tree does not carry.**

1. **The affinity term lists four nodes and three of them are unreachable.** A
   reader of `workload.yaml` sees a four-node eligible set and cannot tell which
   member holds the data. The binding is a fact read from the pinned ClusterState
   snapshot, this example set reproduces no snapshot, so `boundTo` is not
   rendered, and even with a snapshot, no field on a Deployment records it.
   Chapter 20's projection has `placement.boundTo` and `from: clusterState`; the
   Deliverable Set has nowhere to put them.
2. **Narrowing `disk` after the volume exists is a build error, not a move.** If
   the volume binds on `enschede-gtx-960m-1` (ssd) and someone later tightens the
   dimension to `media: [nvme]`, composition fails with
   `E_DISK_BINDING_CONFLICT` rather than re-placing. That is deliberate: moving
   an `irreplaceable` volume is a state-move-plan, not a re-render. Nothing in
   the rendered tree explains this to whoever hits it.
3. **A rebound volume is a new lock, not drift.** After a node failure the
   provisioner may bind elsewhere; the next collector run produces a new
   `clusterStateDigest`, and the assignment that follows the data is a decision
   someone lands. A re-render taken from a *fresh* snapshot instead of the
   recorded one reports a lock defect where the truth is a changed cluster fact.

**And the two sizes are not the same fact.** `placement.disk.size: 100Gi` filters
*nodes*; `pvc.resources.requests.storage` sizes the *claim* (20Gi live). They
appear in different files, neither references the other, and nothing checks that
the claim fits inside the disk the dimension selected for. A reader will conflate
them; this render puts the warning in `pvc.yaml` where they will meet it.

## <a id="g-04"></a>G-04: Deployment or StatefulSet, and why this renders Deployment

`platform-postgres` declares `stateful: true`, `cutover: recreate`, and one
`ReadWriteOnce` volume. Chapter 20 derives the object kind from `lifecycle`,
`stateful` and `volumes` and states no function over the three.

**Rendered: `Deployment` with `strategy: {type: Recreate}`.** The reasoning, in
order:

- **`Recreate` is forced, not chosen.** A ReadWriteOnce `local-path` volume
  cannot attach to two pods at once, so no surge is possible. Estate-wide the
  split is 21 `Recreate` to 9 `RollingUpdate`, and every RWO holder is on the
  `Recreate` side. `cutover: recreate` records the same fact from the author's
  side, and the two agree here, and nothing checks that they always will. The
  current renderer reads an authored enum and inspects no volume, which is the
  trap: a stateful Workload whose author forgets it gets `maxSurge: 1` against an
  RWO volume, appears to work on one node, and wedges the first time a second
  worker exists.
- **`StatefulSet` buys nothing available here.** Its distinguishing feature is
  `volumeClaimTemplate`, which chapter 10 forbids outright, for a template ties the
  claim to the Workload's name, so a rename orphans the data. Its other effects (
  a headless Service, ordinal pod names, ordered rollout, stable network identity)
  are declared by nothing in layer 1 and consumed by nothing in this domain,
  which addresses its provider by the Workload's Service name.
- **So `stateful: true` selects the 10m Flux health timeout class and nothing
  else about this object.** That is the whole of its effect, and it is not what a
  reader of the field expects.

The same reasoning renders `platform-rabbitmq` and `platform-valkey` as
Deployments. The cost is uniform and stated: **every roll of the estate's
datastore is a zero-pod window**, and eight Services queue behind it. The estate
already paid for the other side of this, *"under `Recreate` every image roll
opened a zero-pod window, so a slow cold start or a flaky ghcr image pull took
the MCP fully down (503)"*, and with an RWO volume there is no third option.

One derived value is worth reading against another: rotating the
`postgres-exporter`'s connection string sets `rolloutRestartTargets:
[{kind: Deployment, name: postgres}]`, which under `Recreate` is that same
zero-pod window, on the datastore, because a *sidecar's* credential changed.
See [G-02](#g-02).

## <a id="g-22"></a>G-22: a provider's ingress is only as complete as the union

`platform-postgres` declares zero `dependsOn` edges and receives five ingress
rules. Every one of them is read from **another domain's file**, because
`dependsOn` is written by the consumer and no Service knows its own consumers.
That derivation is computable only over the composed union (chapter 40), which is
this domain's hard dependency on composition.

The intent names **eight** consumers of the `postgres` surface: auth's api
Workload, `agents-api`, knowledge's api and ingest worker, `lightrag`, `n8n`,
`outline`, and the observability backup jobs. **Three resolve here** (`auth` and
`knowledge` are the only other domains publishing an Intent Fragment in this
example set), so the rendered policy carries three consumer rules and omits five.

As rendered, applying that policy **cuts five live consumers off**. That is not a
rendering bug: it is the correct output for the fragment set it was given, and it
is exactly why chapter 40 requires a domain that silently fails to publish to
surface as a **stale participant** rather than as a quietly smaller render. The
same shape, one rule instead of three, appears in `platform-valkey`'s policy: if
auth's fragment were missing, that policy would render with **no ingress rules at
all**, be perfectly valid, apply cleanly, and black-hole every session lookup in
the estate.

The failure mode to design against is chapter 16's: a typo'd `surface` name
renders a valid policy with a missing rule, and the on-call sees a connection
timeout, not an error code.

## Gaps

Every row is a thing the renderer work must decide or a field the model must
grow. Ordered by how much they cost.

**G-30 is retired.** The hostname is authored: `host: rabbitmq.jorisjonkers.dev`
on `platform-rabbitmq`'s `management` exposure, with one named route under it.
This domain is the estate's evidence for authoring rather than deriving (the
host does not follow the Service id), and the IngressRoute and the Gatus URL now
both trace to that declaration. The id is not reused and nothing is renumbered.

| id | gap |
|---|---|
| [G-01](#g-01) | **Three Services release independently and reconcile as one unit.** Detailed above. Two derivations over one domain file disagree about what a unit is |
| <a id="g-02"></a>G-02 | **A sidecar has no identity of its own, and no restart target.** [0064](../../../../../docs/adr/model/0064-sidecars-are-workload-vocabulary.md) grades the field: `postgres-exporter` now declares its own `memory`, `cpu` and `hardening`, those render as container-level `resources` and `securityContext`, and eligibility sums both containers (2112Mi, not 2Gi). Two things it deliberately does not answer. **Identity**: [0024](../../../../../docs/adr/model/0024-identity-per-workload.md) puts the ServiceAccount on the Workload, and a pod has one, so a grant scoped "to the exporter" is in practice held by the database container beside it, the boundary is a comment, not a control. **Restart target**: `rotation: {tolerates: restart}` on the exporter's grant derives `{kind: Deployment, name: postgres}`, which under `Recreate` takes the datastore down to rotate a read-only connection string. A sidecar-scoped restart target is not expressible. `probes` staying on the Workload is a decision rather than a gap: a failing exporter must not hold its Workload out of service |
| <a id="g-03"></a>G-03 | **The image digests here are illustrative, and the repository paths are the lock's.** Three third-party aliases, `postgres` → pgvector, `rabbitmq`, `valkey`, plus `postgres-exporter`, resolve through an images lock this example set does not reproduce. Nothing in layer 1 names a registry, so `docker.io/pgvector/pgvector` and `quay.io/prometheuscommunity/postgres-exporter` are the lock's mapping standing in for a lock entry. Third-party is *not* a reason to float a tag: `pgvector/pgvector:pg17` moves on every upstream build and this Workload is `Recreate` on an RWO volume, so any reschedule is a fresh pull |
| [G-04](#g-04) | **Deployment or StatefulSet is not derived, it is chosen.** Detailed above. `stateful: true` ends up selecting only a health timeout class |
| <a id="g-05"></a>G-05 | **`replicas` has no input in this domain.** The rule is "from `minAvailable`, bounded by the size of the eligible node set". No Workload here declares `minAvailable`, the field is ungraded, and the eligible sets are four and seven. `1` is rendered because an RWO volume forces it, so the number is right and the derivation that is supposed to produce it never ran. The same absence removes every PDB in the domain |
| <a id="g-06"></a>G-06 | **The `disk` dimension has no node label.** `disk` is matched against `disks[].media` and `disks[].usable_gib` in the node contract, and no label expresses "carries a disk of media nvme or ssd with at least 100Gi usable", and a per-media boolean could express `media` as two ORed `nodeSelectorTerms` and could not express `size` at all. This render materialises the computed eligible set as `kubernetes.io/hostname In [four nodes]`. That is the set exactly, and it hard-codes four node names into the tree: a fifth node satisfying the dimension is not admitted until someone re-renders. Whether that is correct (a new node *is* a new node contract, hence a new render) or a defect is undecided. `arch` has the opposite problem, two label sources, `kubernetes.io/arch` and the node contract's 110 labels, 55 of them under a prefix named after an archived repository |
| [G-07](#g-07) | **`disk` filters the first placement; the PV binding wins thereafter, and the tree says neither.** Detailed above, including `E_DISK_BINDING_CONFLICT` and the two `size` values that are not the same fact |
| <a id="g-08"></a>G-08 | **An Asset's change-propagation mechanism is unstated, and its hash has no input here.** `onChange: restart` must make the pod template change when the file does, and there are two mechanisms, a content-hashed ConfigMap name or a checksum annotation. No chapter picks one; rendering both would be two records of one fact. This render uses the hashed name and cannot compute it: `config/postgresql.conf` lives in the Service repository, which the example set does not reproduce, so the suffix is a marker rather than a hash. `onChange` also has exactly two values and postgres supports `pg_ctl reload`, so an Asset whose change needs a reload has no way to say so, under `Recreate` a one-line config edit is a full outage |
| <a id="g-09"></a>G-09 | **One env file, two containers, no partition rule.** Env files are per **Workload** and this Workload has two containers. `POSTGRES_DB` / `POSTGRES_USER` belong to the database; `DATA_SOURCE_NAME` belongs to the exporter. Nothing partitions them, so the whole file reaches both, and the database container holds the exporter's connection string in its environment, which is a real widening inside the pod and the mirror image of the split-path work that produced the grant |
| <a id="g-10"></a>G-10 | **Env literals: inline `env:` or a ConfigMap?** Chapter 10 says "literal keys become plain env entries, and `${secret:…}` keys become `envFrom` secretRef entries"; the registered `kubernetes` adapter emits a `configmap.yaml`. The `auth` render in this example set takes the first reading and emits no ConfigMap; the `knowledge` render takes the second and puts every literal in one. This render follows chapter 10 and keeps `configmap.yaml` for the Asset alone. Three renders, two answers, and a decision taken during serialisation is exactly what chapter 30 forbids |
| <a id="g-11"></a>G-11 | **`init-databases.sh` is a derived catalog with no producer.** 98 lines creating one database and one owning user per consumer, `auth_db`, `agents_db`, `knowledge_db`, `n8n_db`, which the inbound edge set already knows. Chapter 16 lists it as an inbound derivation; chapter 10 refuses it as an Asset because an Asset may not be executable. So it is a Deliverable, and nothing registered produces it. It also reads `/run/secrets/<name>`, a Docker Compose convention that does not exist in Kubernetes, then falls back to env vars |
| <a id="g-12"></a>G-12 | **Three Durability Classes, three backup shapes, no producer.** `irreplaceable` on `postgres-data` derives a backup job, a retention sweep **and** an off-cluster copy, plus a restore rehearsed before the first production apply. `recoverable` on `rabbitmq-data` derives a job and a sweep and no copy. `reconstructible` on `valkey-data` derives nothing, correctly. No adapter reads `durability`, and even with one, three values have no declaring site anywhere in layer 1: the schedule, the retention window and the off-cluster destination. Not rendered rather than invented. This is the largest hole in the domain, and the estate's own backup-coverage record says PVC-level snapshots are impossible here (no VolumeSnapshot CRDs, no CSI snapshot support on `local-path`), so an application-level job is the *only* mechanism, and it has no producer |
| <a id="g-13"></a>G-13 | **No chapter fixes the label set.** Four labels here, and `app.kubernetes.io/instance` carries more weight in this domain than anywhere else, for it is the only thing on an object saying which of three Services in one namespace it belongs to. `name` + `instance` are the selector, and a selector is immutable on a Deployment, so changing the convention later is a delete-and-recreate on every workload in the estate. The `auth` and `knowledge` renders in this set use four labels and three respectively |
| <a id="g-14"></a>G-14 | **`automountServiceAccountToken` is underivable, and `delivery: env` breaks the obvious rule.** "No grant → no token" would cover rabbitmq and valkey. It gets postgres wrong in the *other* direction: postgres holds a grant and still needs no token, because `delivery: env` means the Vault Secrets Operator performs the read and the pod never authenticates to Vault. The derivation needs to read `delivery`, and no chapter states it at all |
| <a id="g-15"></a>G-15 | **`runAsNonRoot: true` with no UID, and no fsGroup, against three RWO volumes.** The class renders the control "with the UID from the image" and no pinned input carries a UID: the images lock carries digests. This bites harder here than anywhere else in the example set: all three Workloads mount a `local-path` volume that a non-root uid must be able to write, and a freshly provisioned local-path directory is root-owned. Without `fsGroup`, postgres cannot `initdb` into its own PV. The intent's prose says uid 999 and says the PV is already owned by 999; neither sentence is a field, and if the image's `USER` is a name rather than a number the kubelet cannot verify non-root and the pod fails `CreateContainerConfigError` |
| <a id="g-16"></a>G-16 | **The hardening class does not say where its controls land.** `runAsNonRoot` and `seccompProfile` are rendered at pod level, `readOnlyRootFilesystem` and `capabilities` at container level (the latter two have no pod-level form). That split is a serialisation choice, and this domain is where it bites: the pod-level half covers `postgres-exporter`, a container the Workload did not declare hardening for, while the container-level exception applies only to the container it is written on. Which is arguably right, and is decided by nothing |
| <a id="g-17"></a>G-17 | **PVC capacity cannot be derived, and all three claims are unappliable without it.** Capacity is platform-assigned and the author is forbidden to write it, yet no pinned input carries an assignment: the node contract publishes `disks[].usable_gib` and no rule allocates a number to a claim. For an existing claim the bound PV's capacity would come from the ClusterState snapshot, and there is no snapshot here. Rendered as `storage: null`, which parses and does not apply |
| <a id="g-18"></a>G-18 | **The durability annotation key is a convention this render chose.** `durability` must reach the object somehow, because the model's second demand on the separately-defined delivery work is that a destructive operation on a non-`reconstructible` claim is refused, and a delivery mechanism can only honour that by reading something on the object. No chapter names a key, a label-vs-annotation, or a value vocabulary |
| <a id="g-19"></a>G-19 | **No scrape `interval` or `scrapeTimeout`.** Omitted on both ServiceMonitors, which silently takes the metrics stack's global default, a value decided outside the model. **Closed**: one `monitors: {interval, timeout}` in the Platform document, named by every emitted monitor |
| <a id="g-20"></a>G-20 | **Per-domain objects have no owning Service directory, and this domain forces the decision.** `namespace.yaml` and the namespace-wide `default-deny` NetworkPolicy are one object per **domain**; the `kubernetes` adapter emits per **Service directory**. `auth` has one Service so nothing collides. Here, three identical Namespace objects at three paths is `E_PATH_COLLISION` waiting for a second writer. Both are hoisted to the domain level in this render, which is a resolution, not a rule. Whichever Service directory were picked instead, that Service would own an object governing its two neighbours, and deleting it from the domain file would delete the namespace's default-deny posture as a side effect |
| <a id="g-21"></a>G-21 | **Every platform-component fact is a Platform document input this example set does not carry.** Marked `CONTEXT` in the files: cluster DNS, the edge, the metrics stack and the Secret Store selectors in the NetworkPolicies; `release: metrics-stack` on both ServiceMonitors; `entryPoints` and `certResolver` on the IngressRoute; the Vault address and port; the Kubernetes auth mount name in `vso.yaml`. The shapes are derived; the values must come from the pinned context |
| [G-22](#g-22) | **A provider's ingress is only as complete as the composed union.** Detailed above. Five of eight consumers are absent, and the rendered policy cuts them off, correctly, for the fragment set it was given |
| <a id="g-23"></a>G-23 | **The Secret Store egress rule needs a branch on `delivery`.** Chapter 16 derives "egress to the Secret Store" from *any grant in the Workload's effective set*. The one grant in this domain is `delivery: env`: the VSO operator performs the read and writes a Secret, and the pod never opens a connection to Vault. So the rule as written permits a flow that does not happen, while the flow that does, the operator's pod reading this path, is governed by a policy in `vso-system` that no Service declares and nothing renders. Rendered anyway, because executing the model as written is the point |
| <a id="g-24"></a>G-24 | **VSO object naming, and who applies the objects.** The Secret and VaultStaticSecret names are the granted path with the mount and the `data/` segment removed and `/` replaced by `-`, mechanical and collision-free, because one path has one reader set, and stated in no chapter. Separately: the `vso` adapter writes into its own estate-wide `apps/vso-secrets/` directory with its own kustomization, so the Service's `kustomization.yaml` must *not* list `vso.yaml`, and which kustomization applies a Service's VSO objects is undecided |
| <a id="g-25"></a>G-25 | **One VaultAuth per estate, or one per Workload?** This render emits one per holding Workload, which is what makes the per-Workload Vault role load-bearing for `env` delivery: the read happens under `data-system.postgres`, bound to exactly its own effective grant set. The registered adapter emits one VaultAuth in `vso-system` on the operator's own ServiceAccount and role, under which the operator reads every path for everyone and the derived roles do nothing |
| <a id="g-26"></a>G-26 | **The Vault policy and Kubernetes auth role have no producer.** `vso` emits `VaultConnection`, `VaultAuth`, `VaultStaticSecret`, `VaultDynamicSecret` and a ServiceAccount; none is a policy or an auth role, and no other registered adapter writes to Vault. The `read` capability on `secret/data/platform/postgres/exporter` that the whole file depends on is derived by the model and applied by nothing. The same hole as auth's G-02, reached from `delivery: env` rather than `delivery: self` |
| <a id="g-27"></a>G-27 | **Architecture is never checked against the locked digest.** `platform-rabbitmq` and `platform-valkey` declare no `arch`, so all seven nodes are eligible, four amd64 and three arm64. The images lock resolves an alias to **one** digest, and a single-architecture digest scheduled onto a Pi is an `exec format error` at runtime. The model holds both facts and compares them nowhere. `platform-postgres` writes `arch: [amd64]` because pgvector publishes no arm64 pg17 build, and that too is an unverified assertion by the author rather than a fact read from the lock |
| <a id="g-28"></a>G-28 | **Two of three Workloads have no env file in the example set.** The model requires one per Workload; only `platform-postgres.base.env` is reproduced, so `rabbitmq` and `valkey` render with no `env` at all. Inventing entries for files that exist would be worse than rendering none |
| <a id="g-29"></a>G-29 | **Default-deny cannot ship non-enforcing, and this is the namespace to prove it on.** `networking.k8s.io/v1` has no audit, dry-run or log-only mode, and k3s's embedded kube-router has none either, and a policy is enforced the moment it selects a pod. Chapter 16 sequences render-only → audit (zero undeclared flows over 14 days) → enforce, and the audit stage needs a CNI carrying a non-enforcing policy stage that no decision has picked. Enforcing the four policies in this domain on day one cuts five live consumers off the datastore ([G-22](#g-22)) |
| <a id="g-31"></a>G-31 | **The forward-auth `Middleware` object has no producer.** This is the example set's first rendered route with `audience: authenticated`, so it is the first that needs one. The registry says `traefik` emits IngressRoutes "with middleware references", references only, and nothing emits the Middleware those references resolve to |
| <a id="g-32"></a>G-32 | **An exposure in this domain feeds an env value in another, and the predicate is undefined.** This route is what puts `rabbitmq` among the nine hostnames `auth-api`'s `AUTH_CORS_ALLOWED_ORIGINS` maintains by hand today. Chapter 16's open item 1 says the derivation is probably "inbound edges declaring a browser surface"; no field declares one, so the list stays hand-maintained and this route contributes to it invisibly |
| <a id="g-33"></a>G-33 | **`alertClass` renders no rule in this tree, and that is now correct.** Two Services here declare a class, `page` on the datastore eight others queue behind, `urgent` on the broker, and `platform-valkey` declares no `observability` block at all, which is how a Service says it wants none. What the class renders is nothing: it is published as a resolved fact and the monitoring stack that owns PromQL, severity and receiver routing reads it from the projection ([chapter 10](../../../10-service-intent.md#observability)). The `scrape` surface beside it is what renders the two `ServiceMonitor` objects above. That boundary answers a specific hole rather than a preference: in the generation being replaced the class was supposed to derive objects inside the model and derived none, no registered adapter rendered a `PrometheusRule` (zero occurrences under `src/`, either generation), the Gatus `alerts` block carried no mapping from an Alert Class to a receiver, threshold or send-on-resolved, and the notifier route from `alertClass` + `owner` had no producer at all. What the model still guarantees is the part that failed: a declared class must have a signal. `platform-postgres` clears that on its exporter sidecar’s `scrape` surface, because Gatus derives from `exposure` and a datastore is correctly not exposed; `platform-valkey`, which has neither, would be `E_ALERT_CLASS_WITHOUT_SIGNAL` and so declares no block |
| <a id="g-34"></a>G-34 | **The Gatus derivation does not compose for this exposure.** The rule is `exposure` + `probes.readiness`. `platform-rabbitmq` routes its `management` surface, 15672, an HTTP UI, and declares `probes.readiness: {tcp: 5672}` (an AMQP accept). Different port, different protocol: the route supplies the path and nothing supplies a status. And the exposure is `audience: authenticated`, so an unauthenticated prober is answered by forward-auth with a redirect, and a guessed `[STATUS] == 200` would be wrong by construction. The entry is rendered with **no `conditions`**, which is not valid Gatus configuration and will not load. That is the finding, not a formatting choice |
| <a id="g-35"></a>G-35 | **No `rbac` adapter, and no `networking` adapter.** Chapter 30's two largest true gaps, and both land in this namespace. Every NetworkPolicy in this tree is what a future `networking` adapter must emit; the only implementation is in the generation being deleted, so coverage for the kind goes from unregistered to absent. RBAC matters more here than elsewhere: three Services' Secrets sit in one namespace, and the only thing keeping `valkey`'s ServiceAccount from reading `platform-postgres-exporter` is that **no Role grants `get secrets` in `data-system`**, an absence, not a boundary, and nothing renders a Role in either direction |

## What this example is meant to prove

- **A namespace is not a trust boundary, and the tree can be read to check it.**
  Three Services, three identities, three policies, one namespace. Nothing is
  isolated by the wall; everything is isolated by a declared edge set evaluated
  per pod, plus a ServiceAccount name.
- **Independence is structural until the reconcile unit takes it back**
  ([G-01](#g-01)).
- **`disk` becoming node selection, and then stopping mattering**
  ([G-07](#g-07)), the one dimension whose effect expires.
- **Two surfaces from one Workload**: `postgres` 5432 and `metrics` 9187 on one
  Service object, the second served by a sidecar, feeding a ServiceMonitor that
  names a port rather than an integer.
- **`Recreate` derived from a volume rather than authored** ([G-04](#g-04)), and
  what that costs on the Service eight others queue behind.
- **All three Durability Classes in one file**, deriving three different backup
  shapes, of which the only one that renders correctly is the one that renders
  nothing.
- **Three third-party images meeting `restricted` identically**, postgres by
  declaring the paths its entrypoint writes rather than by relaxing a control,
  and the honest note that "meets the restricted class" is an assertion by the
  author for all three, checked by nothing until a pod crash-loops
  ([G-15](#g-15), [G-27](#g-27)).
- **Inbound derivation is a composition property** ([G-22](#g-22)): the provider
  declares nothing and receives five rules from two other domains, and would
  receive five more from domains not in this fragment set.
- **A hostname that does not follow its Service id**: `platform-rabbitmq`
  serving `rabbitmq.jorisjonkers.dev`, which is why `host` is authored and not
  derived, and why the failure a derivation would produce is one nobody checks.
- **Providing a port is not exposing it**: three surfaces on one Workload, one
  named by a route and reachable from the edge, two reachable only by consumers
  that named a surface.
