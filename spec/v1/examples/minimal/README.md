# The minimal example

The smallest complete thing the model renders: **one project, one Application, one
Process**, and no field that is not required but two: a mount of the
Platform document's `media` library, the one worked mount of a
[Library](../../10-project-intent.md#libraries), and a `gpu` term, the one
worked [GPU share](../../10-project-intent.md#a-gpu-is-requested-not-only-selected). Read this before the three larger
worked projects (`auth`, `knowledge` and `data`), each of which exists to
exercise a hard case.

| | |
|---|---|
| authored | [`notes.project.yml`](notes.project.yml): 40 lines of declaration, and [`env/notes-api/base.env`](env/notes-api/base.env): 2 keys |
| rendered | [`rendered/`](rendered/): 15 files, 13 objects, 5 of the 8 adapters |
| gaps | none. Every value in the tree derives from a declaration, a pinned fact, or a policy in [Platform Intent](../platform/platform.intent.yml) |

## What the declaration buys

Forty-two authored lines reach thirteen objects. Nothing in the middle column was
written by anyone:

| authored | derived | rendered |
|---|---|---|
| `project: notes` | namespace `notes-system`, the Reconcile Unit, the Project's directory | `Namespace`, both `kustomization.yaml` |
| `id`, process `name`, `runtime` | the fixed label set ([0039](../../../../docs/adr/model/0039-the-label-set-is-fixed.md)) | every object's labels, and the `Deployment` selector |
| `image: notes-api` | the digest, `runAsUser`, `runAsGroup` from the images lock ([0020](../../../../docs/adr/model/0020-hardening-is-one-platform-posture.md)) | the container image and `securityContext` |
| `placement` | requests and limits: memory request equals limit, cpu request with no limit | `resources` |
| no `hardening` block | the `restricted` class: non-root, read-only root, all capabilities dropped, no privilege escalation, seccomp `RuntimeDefault` | `securityContext`, pod and container |
| no grant | `automountServiceAccountToken: false` ([0031](../../../../docs/adr/model/0031-identity-per-process.md)) | the pod spec |
| `probes` + `startupBudget: 20s` | the probe cadence from Platform Intent, a startup probe on the **liveness** endpoint, `progressDeadlineSeconds: 60` ([0016](../../../../docs/adr/model/0016-probes-are-siblings-and-startup-targets-liveness.md)) | all three probes |
| `cutover: continuous` | a `blue-green` switchover in the Resolved Deployment ([chapter 55](../../55-delivery.md#switchover)), rendered as a `Canary` whose webhooks ask the Release Gate; the Deployment carries no `replicas` and no Service is rendered for it, because Flagger generates both ([chapter 30](../../30-deliverables.md#flagger-ready-objects)) | the strategy, the Services |
| `provides: http: 8080` | the port name, the Application, the ingress rules | the `Canary`'s service port, from which Flagger generates the Services; the `NetworkPolicy` |
| `exposure` + `audience: anonymous` | the tier, its middleware chain, and the route priority ([0023](../../../../docs/adr/model/0023-exposure-is-declared-by-audience.md)) | `IngressRoute` |
| `observability` | a `PodMonitor` naming the `http` surface, selecting pods by `instance` so the canary is scraped too, and the Platform document's cadence ([chapter 10](../../10-project-intent.md#observability)) | a `PrometheusRule`: rules, severity and receivers are the monitoring stack's |
| `libraries: [{library: media, subPath: Notes, access: write}]` | the library's node as the only eligible one, its `gid` as a supplemental group, and the project's volume onto its directory with the claim bound to it ([0104](../../../../docs/adr/model/0104-a-library-is-a-host-directory-the-platform-grants.md)) | the node affinity, `supplementalGroups`, the volume mount below `Notes`, and `libraries.yaml`'s `PersistentVolume` and `PersistentVolumeClaim`, neither ever pruned |
| `gpu: {class: transcode, model: [t1000]}` | the T1000 as the one matching card, so `nvidia`'s `resource` and `runtimeClass` from the Platform document ([0106](../../../../docs/adr/model/0106-a-gpu-request-is-derived-from-placement.md)) | the container's `nvidia.com/gpu` limit and the pod's `runtimeClassName` |
| the env file's two literals | the Runtime Profile keys and `PORT`, which are a build error to author | the container's `env` |

## What is absent, and why

Every absence below is a decision, not an omission:

| absent | because |
|---|---|
| `PodDisruptionBudget` | `replicas` derives as 1, and a budget over a single replica blocks a drain forever ([0022](../../../../docs/adr/model/0022-a-derived-value-has-one-declaring-site.md)) |
| a claim of the Process's own, backup `CronJob`, `fsGroup` | no `volumes`, so no Durability Class and nothing to back up ([0018](../../../../docs/adr/model/0018-durability-class-derives-a-backup.md)); the library is the platform's, backed up outside the render, and a library takes `fsGroup` away ([chapter 10](../../10-project-intent.md#the-uid-is-a-pinned-input-and-the-volume-needs-a-group)) |
| `engine` | required only where a volume derives a backup, and refused otherwise |
| Vault policy, auth role, `VaultStaticSecret` | no grant, so no identity holds privilege ([0040](../../../../docs/adr/model/0040-vault-policy-is-a-deliverable.md)) |
| `Role`, `RoleBinding` | never rendered for a Process; the absence is checked instead ([0041](../../../../docs/adr/model/0041-no-process-rbac-in-v1.md)) |
| `writablePaths`, and any `emptyDir` | this image writes nothing, so the read-only root holds unrelaxed ([0020](../../../../docs/adr/model/0020-hardening-is-one-platform-posture.md)) |
| `Middleware` | estate-scoped, and rendered once in the platform edge project: this Application only *references* it ([0046](../../../../docs/adr/model/0046-the-foundation-is-declared.md)) |
| a `dependsOn` edge | nothing to depend on, so the NetworkPolicy carries only the two baseline rules and the two ingress rules the exposure and the scrape imply |

## Reading it beside the diagrams

The pipeline this example walks through is
[chapter 00's three-model pipeline](../../diagrams/00-overview-three-model-pipeline.drawio.svg); the
shape of the authored file is
[chapter 10's model](../../diagrams/10-project-intent-model.drawio.svg); and the
route from a declaration to an object is
[chapter 16's derivation map](../../diagrams/16-derivation-map-deliverables-workload.drawio.svg).
This Application uses one path through each of them, which is what makes it the
example to start from.
