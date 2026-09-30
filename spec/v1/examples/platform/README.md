# The worked Platform Intent

Two documents sit here, because the Platform document names the second by
digest and neither is readable without the other.
[`platform.intent.yml`](platform.intent.yml) is the second authored document
([chapter 14](../../14-platform-intent.md)), what the estate offers, published
as an Intent Fragment by digest like any project and composed with the three
worked projects. It replaces the Cluster Context example that used to sit here:
same facts, now with a chapter, a kind, and a publication path
([0045](../../../../docs/adr/model/0045-platform-intent-is-the-second-authored-document.md)).

Every block is a value the contention test put on the platform's side
([0004](../../../../docs/adr/model/0004-contention-decides-authority.md)), and
nothing in it names a Kubernetes field, a Traefik key, a k3s flag or a command
([0011](../../../../docs/adr/model/0011-authored-values-name-model-concepts.md)):

| block | why it is the platform's | decided in |
|---|---|---|
| `substrate` | cluster facts that decide other decisions, named for what they are | [0049](../../../../docs/adr/model/0049-datastore-and-restore.md), [0030](../../../../docs/adr/model/0030-secret-delivery-is-env-file-or-self.md) |
| `bootstrap` | what must exist before the first rendered object can apply | [0046](../../../../docs/adr/model/0046-the-foundation-is-declared.md) |
| `tiers` | the shared edge is finite; four edge facts, and the Traefik Service each tier is | [0023](../../../../docs/adr/model/0023-exposure-is-declared-by-audience.md), [0011](../../../../docs/adr/model/0011-authored-values-name-model-concepts.md) |
| `durability` | a backup window is one node's IO, a destination one remote target | [0018](../../../../docs/adr/model/0018-durability-class-derives-a-backup.md) |
| `engines` | the method is an image; nothing authored is executable | [0011](../../../../docs/adr/model/0011-authored-values-name-model-concepts.md) |
| `monitors` | one scrape cadence for the estate, because ingest is shared and no Application knows better. It is the whole observability surface of this document: no receiver map, no severity mapping, no rule catalog ([chapter 14](../../14-platform-intent.md#monitor-cadence)) | [0025](../../../../docs/adr/model/0025-observability-is-one-optional-block.md) |
| `hardening` | one posture for every container the estate renders: thirty declarations of the only legal value are thirty copies of one decision. A Process authors no hardening at all, and there is no per-control exception surface to author, because a relaxation carried with a reason is an override under another name ([chapter 14](../../14-platform-intent.md#hardening-policy)) | [0020](../../../../docs/adr/model/0020-hardening-is-one-platform-posture.md) |
| `probes`, `ephemeral` | one cadence and one size for the estate | [0016](../../../../docs/adr/model/0016-probes-are-siblings-and-startup-targets-liveness.md), [0020](../../../../docs/adr/model/0020-hardening-is-one-platform-posture.md) |
| `providers` | something the estate reaches and does not deploy: a fact, not a hole | [0024](../../../../docs/adr/model/0024-dependency-edges-resolve-against-the-union.md), [0045](../../../../docs/adr/model/0045-platform-intent-is-the-second-authored-document.md) |

Two values are **deliberately unflattering**, because they are what the estate
has: `secretsEncryption: false`, which makes every `delivery: env` and `file`
grant fail `E_SECRETS_AT_REST_REQUIRED`, and `networkPolicyController: embedded`
with `cni: flannel`, which keeps default-deny render-only
([0035](../../../../docs/adr/model/0035-network-policy-is-default-deny-and-render-only.md)).
Both are the gates working.

**Not here, deliberately.** The foundation (Vault, VSO, the two Traefik
instances, Prometheus, Gatus) is declared as Applications in project files the
platform owns ([0046](../../../../docs/adr/model/0046-the-foundation-is-declared.md));
those files are the next worked example to write. Hostnames
nobody deploys and nobody depends on are a ledger, not a Platform fact.

## The node contract

[`node-contract.yml`](node-contract.yml) is the second pinned input this
directory holds: the generated document that publishes what each node can hold,
named by `metadata.nodeContract` above
([chapter 60](../../60-setup.md#node-facts),
[0048](../../../../docs/adr/model/0048-node-facts-are-authored-once.md)). It is the
other half of every placement comparison. A Process declares hard dimensions and
layer 2 matches them against exactly these facts, never against a live cluster
([0017](../../../../docs/adr/model/0017-placement-is-hard-dimensions.md)).

What it takes from chapter 60, and what is the example's own, is stated in its
own header. The short version: the seven nodes, their totals, disks, cards and
every capability count are the chapter's; the seven reserves, the two GPU
memory figures and which node carries four of the capabilities are the
example's, because the chapter gives the count and not the node.

One value is worth reading twice. Three nodes publish `media: sdcard`, which is
not a medium any Process may ask for: the contract's vocabulary is deliberately
the wider one, because a contract that rounds a fact to the nearest admissible
word is a contract nobody can check against the machine
([0048](../../../../docs/adr/model/0048-node-facts-are-authored-once.md)).
