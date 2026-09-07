# The worked Cluster Context

[`cluster-context.yml`](cluster-context.yml) is the pinned platform input the
three worked domains render against. It exists because the render-gap list said
it did not: *"every platform-component fact the render needs is a Cluster
Context input the example set does not carry"*.

Every block is a value some decision put on the platform's side of the
contention test ([0004](../../../../docs/adr/model/0004-contention-decides-authority.md)):

| block | why it is platform-assigned | decided in |
|---|---|---|
| `platform` | cluster facts that decide other decisions — datastore, server count, k3s version, flags, `secretsEncryption`, CNI | [0057](../../../../docs/adr/model/0057-datastore-and-restore.md), [0028](../../../../docs/adr/model/0028-secrets-at-rest-gate.md), [0036](../../../../docs/adr/model/0036-cni-selection.md) |
| `tiers` | the shared edge is finite, and a tier serving `authenticated` names the endpoint that authenticates for it | [0018](../../../../docs/adr/model/0018-exposure-by-audience.md), [0076](../../../../docs/adr/model/0076-middleware-has-one-producer.md) |
| `durability` | a backup window is one node's IO and an off-cluster destination is one remote target | [0077](../../../../docs/adr/model/0077-durability-derives-a-backup.md) |
| `engines` | nothing authored may be executable, so the method lives here and arrives with the blueprint packs | [0012](../../../../docs/adr/model/0012-assets-not-code.md), [0078](../../../../docs/adr/model/0078-engine-is-workload-vocabulary.md) |
| `observability` | a receiver is a shared notification channel and the scrape budget is shared ingest | [0079](../../../../docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md) |
| `probes` | one cadence for the estate, so a render is a complete description of how a pod is checked | [0088](../../../../docs/adr/model/0088-startup-probe-targets-liveness.md) |
| `ephemeral` | ephemeral storage is finite node disk | [0092](../../../../docs/adr/model/0092-writable-paths-are-declared.md) |
| `unmanagedSurfaces` | an edge may target one, and its coordinates are what the derived egress rule selects | [0019](../../../../docs/adr/model/0019-registered-unmanaged-surfaces.md), [0090](../../../../docs/adr/model/0090-edges-resolve-against-the-register.md) |

Two values in it are **deliberately unflattering**, because they are what the
estate actually has and the render must be honest about them:

- `secretsEncryption: false`, which makes every `delivery: env` and
  `delivery: file` grant in the worked domains fail
  `E_SECRETS_AT_REST_REQUIRED`. That is the gate working, not the example being
  wrong ([chapter 60](../../60-setup.md#secrets-at-rest)).
- `cni: flannel`, which carries no non-enforcing policy stage, so the derived
  default-deny set stays render-only
  ([0084](../../../../docs/adr/model/0084-render-only-is-the-v1-policy-stage.md)).

The node contract is a separate pinned input and is not reproduced here
([0056](../../../../docs/adr/model/0056-node-facts-single-source.md), [chapter
60](../../60-setup.md#node-facts)).
