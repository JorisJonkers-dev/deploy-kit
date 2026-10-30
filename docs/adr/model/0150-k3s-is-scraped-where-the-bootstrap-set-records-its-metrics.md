---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-30
normative: spec/v1/14-platform-intent.md#k3ss-metrics
rests-on: ["0004"]
---

# k3s is scraped where the bootstrap set records its metrics, as the metrics stack's own ServiceAccount

The kubelet, the API server and the cluster's DNS are part of k3s, which the
bootstrap set records rather than declares, so no scrape surface can name
them. The bootstrap set records where each serves its metrics, and the metrics
stack's Project renders their monitors and the read they take, as
[Flux's metrics](0121-flux-is-scraped-where-the-bootstrap-set-records-its-metrics.md)
already are. The rules are in
[k3s's metrics](../../../spec/v1/14-platform-intent.md#k3ss-metrics).
Settled in
[Scrape the kubelet, cAdvisor, the API server and CoreDNS where the bootstrap set records them](https://github.com/JorisJonkers-dev/deploy-kit/issues/724).

## Rests on

Where k3s serves its metrics is a fact of how the platform installed it, the
same for every Project, so the platform states it
([0004](0004-contention-decides-authority.md)).

**False if:** a kubelet, the API server or the cluster's DNS that the
bootstrap set records is not a target of the estate's Prometheus.
**Settled by:** the observability example's committed tree, and `up{job="kubelet"}`
and `up{job="apiserver"}` reading 1 on the estate path's Prometheus.

## Why

**Without them the cluster's own signals go quiet.** Every `container_*` series
comes from cAdvisor, so out-of-memory kills, CPU and memory panels, full
volumes and a kubelet that stops all lose their alert, and most of the default
rule groups evaluate to nothing.

**Recorded beside Flux, not declared.** Flux's controllers were the same case
and are recorded in the bootstrap set. k3s's components are recorded beside
them, each optional, so a cluster records only what it runs.

**A node discovery, not a Service.** The kubelet has no Service; the old path
had the operator maintain one in `kube-system`. A `ScrapeConfig` discovering
nodes reaches every kubelet without writing into a namespace no Project owns.

**The read is derived.** What scraping k3s takes, nodes, their kubelets'
metrics and the API server's `/metrics`, is fixed by what is scraped, and the
last is a path no resource rule can name. Declaring it on the stack's Process
would add a non-resource rule to the model for one consumer. The render
derives it from the record instead, bound to the stack's own ServiceAccount,
with a token Secret that Kubernetes fills in, so the scrape configuration
references a key rather than a path on the pod.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Have the operator maintain a kubelet Service in `kube-system` | an operator flag the render does not see, and objects in a namespace no Project owns | the node discovery needs neither |
| Declare the read on the stack's Process | a non-resource rule in the `api` language for one consumer | the read follows from what is scraped |
| A bearer token file on the pod | a path the scrape reads from the pod's filesystem, which the operator discourages | a Secret reference is the operator's supported form |
| Scrape etcd too | a target that does not exist on a sqlite-backed k3s | the API server serves the datastore's metrics |

## Reversibility

Cheap. The record is optional and its derivations render nothing without it.

## Consequences

- The metrics stack's first Process's ServiceAccount reads nodes, their
  kubelets' metrics and the API server's `/metrics`, cluster-wide.
- The operator's Prometheus selects every `ScrapeConfig` the render writes.
- Neither the kubelets nor the API server enter the metrics stack's egress
  while policies render and apply nothing.
