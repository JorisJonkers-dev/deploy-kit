# The worked Platform Intent

Two documents sit here, because the Platform document names the second by
digest and neither is readable without the other.
[`platform.intent.yml`](platform.intent.yml) is the second authored document
([chapter 14](../../14-platform-intent.md)), what the estate offers, published
as an Intent Fragment by digest like any project and composed with the three
worked projects. It replaces the Cluster Context example that used to sit here:
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
| `monitors` | one scrape cadence for the estate, because ingest is shared and no Application knows better. It is the whole observability surface of this document: no receiver map, no severity mapping, no rule catalog ([chapter 14](../../14-platform-intent.md#monitor-cadence)) | [0021](../../../../docs/adr/model/0021-observability-scrape-and-alert-class.md), [0079](../../../../docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md) |
| `hardening` | one posture for every container the estate renders: thirty declarations of the only legal value are thirty copies of one decision. A Process authors no hardening at all, and there is no per-control exception surface to author, because a relaxation carried with a reason is an override under another name ([chapter 14](../../14-platform-intent.md#hardening-policy)) | [0016](../../../../docs/adr/model/0016-pod-hardening.md) |
| `probes`, `ephemeral` | one cadence and one size for the estate | [0088](../../../../docs/adr/model/0088-startup-probe-targets-liveness.md), [0092](../../../../docs/adr/model/0092-writable-paths-are-declared.md) |
| `providers` | something the estate reaches and does not deploy: a fact, not a hole | [0090](../../../../docs/adr/model/0090-edges-resolve-against-the-register.md), [0095](../../../../docs/adr/model/0095-platform-intent-is-the-second-authored-document.md) |

Two values are **deliberately unflattering**, because they are what the estate
has: `secretsEncryption: false`, which makes every `delivery: env` and `file`
grant fail `E_SECRETS_AT_REST_REQUIRED`, and `networkPolicyController: embedded`
with `cni: flannel`, which keeps default-deny render-only
([0084](../../../../docs/adr/model/0084-render-only-is-the-v1-policy-stage.md)).
Both are the gates working.

**Not here, deliberately.** The foundation (Vault, VSO, the two Traefik
instances, Prometheus, Gatus) is declared as Applications in project files the
platform owns ([0096](../../../../docs/adr/model/0096-the-foundation-is-declared.md));
those files are the next worked example to write. Hostnames
nobody deploys and nobody depends on are a ledger, not a Platform fact.

## The node contract

[`node-contract.yml`](node-contract.yml) is the second pinned input this
directory holds: the generated document that publishes what each node can hold,
named by `metadata.nodeContract` above
([chapter 60](../../60-setup.md#node-facts),
[0056](../../../../docs/adr/model/0056-node-facts-single-source.md)). It is the
other half of every placement comparison. A Process declares hard dimensions and
layer 2 matches them against exactly these facts, never against a live cluster
([0061](../../../../docs/adr/model/0061-placement-is-hard-dimensions.md)).

What it takes from chapter 60, and what is the example's own, is stated in its
own header. The short version: the seven nodes, their totals, disks, cards and
every capability count are the chapter's; the seven reserves, the two GPU
memory figures and which node carries four of the capabilities are the
example's, because the chapter gives the count and not the node.

One value is worth reading twice. Three nodes publish `media: sdcard`, which is
not a medium any Process may ask for: the contract's vocabulary is deliberately
the wider one, because a contract that rounds a fact to the nearest admissible
word is a contract nobody can check against the machine
([0123](../../../../docs/adr/model/0123-a-node-publishes-media-no-process-may-ask-for.md)).
