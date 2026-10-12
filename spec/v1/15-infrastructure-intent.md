# Chapter 15: Infrastructure Intent

Project Intent says what an Application needs, and Platform Intent says what the
platform offers it. Neither says what the machines are. That has been one YAML
file per node, the only hand-edited copy of a node's facts, from which the node
contract, the k3s label set and the nix host data are generated
([0048](../../docs/adr/model/0048-node-facts-are-authored-once.md)). Infrastructure
Intent is those files given a model: the third authored document, with a
metamodel of its own, read by the compiler the way the other two are.

It is specified here and used for placement now. A generator from it to NixOS
host configuration is the reason the model is shaped the way it is, and is not
built in v1 ([What is not built](#what-is-not-built)).

## The document

```yaml
apiVersion: intent.jorisjonkers.dev/v1
kind: Infrastructure
schemaVersion: 1.0.0
owner: joris
labelPrefix: platform.jorisjonkers.dev
cluster:
  name: production
  sites: [enschede, frankfurt]
  nodes:
    - name: enschede-gtx-960m-1
      site: enschede
      arch: amd64
      roles: [worker, utility]
      totals:  {cpu: 28800m, memory: 16384Mi}
      reserve: {cpu: 800m, memory: 1024Mi}   # illustrative; reconciled before the first apply
      gpus:
        - {vendor: nvidia, model: gtx960m, class: transcode, memory_mib: 2048}
      disks:
        - {media: ssd, usable_gib: 100}
        - {media: ssd, usable_gib: 500}
        - {media: hdd, usable_gib: 2048}
      capabilities: [nvidia, adguard]
```

One Infrastructure document per estate, published as an Intent Fragment by the
repository that owns the machines and composed like the other two
([chapter 40](40-composition.md#fragments)). It is read in the same YAML subset,
with the same schema refusals ([chapter 10](10-project-intent.md#reading-a-file)).

## The model

| class | holds | contained by |
|---|---|---|
| `Infrastructure` | `labelPrefix`, the one label namespace the estate owns; the `cluster` | the document |
| `Cluster` | `name`, `sites`, `nodes`; exactly one in v1 | `Infrastructure` |
| `Node` | `name`, `site`, `arch`, `roles`, `totals`, `reserve`, `gpus`, `disks`, `capabilities`, `taints` | `Cluster` |
| `Gpu` | `vendor`, `model`, `class`, `memory_mib` | `Node` |
| `Disk` | `media`, `usable_gib` | `Node` |
| `Taint` | `key`, `value`, `effect` | `Node` |

`site` names one of the cluster's `sites`, `E_UNKNOWN_SITE` otherwise, and a
node `name` is unique in the cluster, `E_DUPLICATE_NODE`. `arch`, a disk's
`media` and a GPU's `class` take the values chapter 10's closed vocabularies
give the placement dimensions that match them, plus `sdcard`, which a node may
hold and no Process may ask for
([0048](../../docs/adr/model/0048-node-facts-are-authored-once.md)). `reserve`
does not exceed `totals` in either quantity, `E_RESERVE_EXCEEDS_TOTAL`.

**A class is not a product.** A GPU's `model` is what the card is (`gtx960m`),
and its `class` what a Process may ask for (`transcode`). Two cards of one class
may differ in memory, which is why `memory_mib` is a field and not a label: a
Process asks by class and by memory, and only the structure can answer both
([chapter 10](10-project-intent.md#why-gpu-is-structured)).

**Every fact is declared.** No field is read back from the cluster: what a node
has is an input, pinned by digest, and what is running on it is not a fact
about the node at all ([chapter 20](20-resolved-deployment.md#cluster-state)).

## What placement reads

Placement matches a Process's dimensions against **allocatable**, each node's
`totals` minus its `reserve`, together with `site`, `arch`, `gpus`, `disks` and
`capabilities` ([chapter 10](10-project-intent.md#placement)). The node contract
is generated from this document and publishes exactly those facts, under
`labelPrefix`, in one casing; the compiler reads the contract, pinned by digest
through the Platform document's `metadata.nodeContract`
([chapter 20](20-resolved-deployment.md#the-images-lock)), so a placement result
is a function of this document through one generated artefact and no other.

| generated | from | read by |
|---|---|---|
| `node-contract.yml` | the cluster's nodes: allocatable and the facts above | the compiler, for eligibility |
| the k3s label set | every node fact under `labelPrefix`, and each node's `taints` | the live nodes, through nix |
| the nix host data | each node's facts, as JSON | `nix/hosts/<n>/default.nix`, which reads it and authors no label |

The label set is fixed by rule rather than written: a node carries
`<labelPrefix>/site`, `<labelPrefix>/arch`, one `<labelPrefix>/gpu-class-<class>`
per GPU class it holds, one `<labelPrefix>/disk-<media>` per medium, and one
`<labelPrefix>/capability-<capability>` per capability, and nothing else under
the prefix. Placement never names a label
([chapter 10](10-project-intent.md#labels-are-not-the-applications-to-name)),
so the spelling is the generator's to choose and the compiler's to read back.

## One cluster, written down

`Cluster` is a class with exactly one instance, and that is deliberate. The
estate runs one production cluster
([0001](../../docs/adr/model/0001-estate-scale-and-ownership.md)), and placement
is a per-node test inside it. Writing the cluster as the container of the nodes,
rather than leaving it implicit, is what lets a second cluster later be a second
instance rather than a new model, and what a parked decision on multi-cluster
and multi-tenant estates names as its seam
([0097](../../docs/adr/deferred/0097-multi-cluster-and-multi-tenancy-are-parked.md)).
A document with a second cluster is a schema refusal today.

## What is not built

- **The NixOS generator.** The nix host data stays generated JSON read by
  hand-written host files. A generator from this document to NixOS modules,
  with the labels and taints typed rather than handed to `services.k3s` as
  strings, and a NixOS test per node class that boots the generated host and
  checks the labels it carries, is the direction this model is shaped for, and
  is not part of v1. The survey behind that direction is
  [`docs/research/infrastructure-and-tenancy.md`](../../docs/research/infrastructure-and-tenancy.md#generating-hosts-with-nix).
- **Discovered facts.** Every fact is declared. A node-side collector that
  discovers features (Node Feature Discovery's model) would need each fact to
  carry its origin; nothing reads a discovered fact in v1.

## Open in this chapter

1. **Implementation.** Neither implementation reads this document yet: the
   node files stay the authored source until the reader, the schema and the
   generated contract land in both, tracked on #324. The codes this chapter
   defines are pending on the same ticket.
