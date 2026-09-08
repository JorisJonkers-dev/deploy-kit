# The worked Platform Intent

[`platform.intent.yml`](platform.intent.yml) is the second authored document
([chapter 14](../../14-platform-intent.md)) — what the estate offers — published
as an Intent Fragment by digest like any domain and composed with the three
worked domains. It replaces the Cluster Context example that used to sit here:
same facts, now with a chapter, a kind, and a publication path
([0095](../../../../docs/adr/model/0095-platform-intent-is-the-second-authored-document.md)).

Every block is a value the contention test put on the platform's side
([0004](../../../../docs/adr/model/0004-contention-decides-authority.md)), and
nothing in it names a Kubernetes field, a Traefik key, a k3s flag or a command
([0097](../../../../docs/adr/model/0097-authored-values-name-model-concepts.md)):

| block | why it is the platform's | decided in |
|---|---|---|
| `substrate` | cluster facts that decide other decisions, named for what they are | [0057](../../../../docs/adr/model/0057-datastore-and-restore.md), [0028](../../../../docs/adr/model/0028-secrets-at-rest-gate.md) |
| `bootstrap` | what must exist before the first rendered object can apply | [0099](../../../../docs/adr/model/0099-bootstrap-set-is-recorded.md) |
| `tiers` | the shared edge is finite; four edge facts, and the Traefik Service each tier is | [0076](../../../../docs/adr/model/0076-middleware-has-one-producer.md), [0097](../../../../docs/adr/model/0097-authored-values-name-model-concepts.md) |
| `durability` | a backup window is one node's IO, a destination one remote target | [0077](../../../../docs/adr/model/0077-durability-derives-a-backup.md) |
| `engines` | the method is an image; nothing authored is executable | [0097](../../../../docs/adr/model/0097-authored-values-name-model-concepts.md) |
| `observability` | a receiver is a shared channel, the scrape budget shared ingest | [0079](../../../../docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md) |
| `probes`, `ephemeral` | one cadence and one size for the estate | [0088](../../../../docs/adr/model/0088-startup-probe-targets-liveness.md), [0092](../../../../docs/adr/model/0092-writable-paths-are-declared.md) |
| `providers` | something the estate reaches and does not deploy — a fact, not a hole | [0090](../../../../docs/adr/model/0090-edges-resolve-against-the-register.md), [0095](../../../../docs/adr/model/0095-platform-intent-is-the-second-authored-document.md) |

Two values are **deliberately unflattering**, because they are what the estate
has: `secretsEncryption: false`, which makes every `delivery: env` and `file`
grant fail `E_SECRETS_AT_REST_REQUIRED`, and `networkPolicyController: embedded`
with `cni: flannel`, which keeps default-deny render-only
([0084](../../../../docs/adr/model/0084-render-only-is-the-v1-policy-stage.md)).
Both are the gates working.

**Not here, deliberately.** The foundation — Vault, VSO, the two Traefik
instances, Prometheus, Gatus — is declared as Services in domain files the
platform owns ([0096](../../../../docs/adr/model/0096-the-foundation-is-declared.md));
those files are the next worked example to write. The node contract is its own
pinned input, named above by digest
([0056](../../../../docs/adr/model/0056-node-facts-single-source.md)). Hostnames
nobody deploys and nobody depends on are a ledger, not a Platform fact.
