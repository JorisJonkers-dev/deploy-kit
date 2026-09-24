# The minimal example

The smallest complete thing the model renders: **one project, one Application, one
Process**, and no field that is not required. Read this before the three larger
worked projects (`auth`, `knowledge` and `data`), each of which exists to
exercise a hard case.

| | |
|---|---|
| authored | [`notes.project.yml`](notes.project.yml): 26 lines of declaration, and [`env/notes-api/base.env`](env/notes-api/base.env): 2 keys |
| rendered | [`rendered/`](rendered/): 9 files, 10 objects, 5 of the 6 adapters |
| gaps | none. Every value in the tree derives from a declaration, a pinned fact, or a policy in [Platform Intent](../platform/platform.intent.yml) |

It is also the **only** worked example that renders on today's pinned inputs.
The other three all hold a `delivery: env` or `delivery: file` grant, and
`secretsEncryption` is `false`, so every one of them fails
`E_SECRETS_AT_REST_REQUIRED` ([0028](../../../../docs/adr/model/0028-secrets-at-rest-gate.md))
until that flag lands. This Application holds no grant at all, so the gate has
nothing to refuse.

## What the declaration buys

Twenty-six authored lines reach ten objects. Nothing in the middle column was
written by anyone:

| authored | derived | rendered |
|---|---|---|
| `project: notes` | namespace `notes-system`, the Reconcile Unit, the path plan | `Namespace`, both `kustomization.yaml` |
| `id`, process `name`, `runtime` | the fixed label set ([0072](../../../../docs/adr/model/0072-the-label-set-is-fixed.md)) | every object's labels, and the `Deployment` selector |
| `image: notes-api` | the digest, `runAsUser`, `runAsGroup` from the images lock ([0082](../../../../docs/adr/model/0082-images-lock-carries-uid-and-gid.md)) | the container image and `securityContext` |
| `placement` | requests and limits: memory request equals limit, cpu request with no limit | `resources` |
| no `hardening` block | the `restricted` class: non-root, read-only root, all capabilities dropped, seccomp `RuntimeDefault` | `securityContext`, pod and container |
| no grant | `automountServiceAccountToken: false` ([0087](../../../../docs/adr/model/0087-token-mounted-only-for-delivery-self.md)) | the pod spec |
| `probes` + `startupBudget: 20s` | the probe cadence from Platform Intent, a startup probe on the **liveness** endpoint, `progressDeadlineSeconds: 60` ([0088](../../../../docs/adr/model/0088-startup-probe-targets-liveness.md)) | all three probes |
| `cutover: continuous` | `RollingUpdate`, `maxSurge: 1`, `maxUnavailable: 0`, derived from the declared intent and the absence of volumes | the strategy |
| `provides: http: 8080` | the port name, the Application, the ingress rules | `Service`, `NetworkPolicy` |
| `exposure` + `audience: anonymous` | the tier, its middleware chain, and the route priority ([0093](../../../../docs/adr/model/0093-route-precedence-is-derived.md)) | `IngressRoute` |
| `observability` | a `ServiceMonitor` naming the `http` surface and the Platform document's cadence ([chapter 10](../../10-project-intent.md#observability)) | a `PrometheusRule`: rules, severity and receivers are the monitoring stack's, which reads `alertClass` from the projection |
| the env file's two literals | the Runtime Profile keys and `PORT`, which are a build error to author | the container's `env` |

## What is absent, and why

Every absence below is a decision, not an omission:

| absent | because |
|---|---|
| `PodDisruptionBudget` | `replicas` derives as 1, and a budget over a single replica blocks a drain forever ([0089](../../../../docs/adr/model/0089-replicas-derived-no-minavailable.md)) |
| `PersistentVolumeClaim`, backup `CronJob` | no `volumes`, so no Durability Class and nothing to back up ([0077](../../../../docs/adr/model/0077-durability-derives-a-backup.md)) |
| `engine` | required only where a volume derives a backup, and refused otherwise |
| Vault policy, auth role, `VaultStaticSecret` | no grant, so no identity holds privilege ([0073](../../../../docs/adr/model/0073-vault-policy-is-a-deliverable.md)) |
| `Role`, `RoleBinding` | never rendered for a Process; the absence is checked instead ([0075](../../../../docs/adr/model/0075-no-process-rbac-in-v1.md)) |
| `writablePaths`, and any `emptyDir` | this image writes nothing, so the read-only root holds unrelaxed ([0092](../../../../docs/adr/model/0092-writable-paths-are-declared.md)) |
| `Middleware` | estate-scoped, and rendered once in the platform edge project: this Application only *references* it ([0096](../../../../docs/adr/model/0096-the-foundation-is-declared.md)) |
| a `dependsOn` edge | nothing to depend on, so the NetworkPolicy carries only the two baseline rules and the two ingress rules the exposure and the scrape imply |

## Reading it beside the diagrams

The pipeline this example walks through is
[chapter 00's three-model pipeline](../../diagrams/00-overview-three-model-pipeline.drawio.svg); the
shape of the authored file is
[chapter 10's model](../../diagrams/10-project-intent-model.drawio.svg); and the
route from a declaration to an object is
[chapter 16's derivation map](../../diagrams/16-derivation-map-deliverables.drawio.svg).
This Application uses one path through each of them, which is what makes it the
example to start from.
