---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-29
normative: spec/v1/14-platform-intent.md#fluxs-metrics
rests-on: ["0004"]
---

# Flux is scraped where the bootstrap set records its metrics, and the metrics stack's egress reaches every scrape port

Flux's controllers are scraped through a port and path the Platform document
records on the bootstrap set's Flux entry. The metrics stack's Project renders
the one monitor for them in its own namespace. The metrics stack's own egress
is derived as well: to every declared scrape port, and to that one Flux port.
Settled in
[Scrape Flux's own controllers from the observability Project](https://github.com/JorisJonkers-dev/deploy-kit/issues/655).

## Rests on

Contention decides authority ([0004](0004-contention-decides-authority.md)).
Flux serves every Project and is no Project's, so how it is reached is the
platform's to record, beside the rest of what the bootstrap set pins.

**False if:** one Project could own Flux's scrape without the choice of
Project being arbitrary. **Settled by:** a render test, where the Platform
document records the port and the metrics stack's render alone carries the
monitor and the egress, and no project file can name Flux.

## Why

**A scrape names a declared Process, and Flux is none.** Flux is in the
bootstrap set
([0046](0046-the-foundation-is-declared.md)): it applies the render, so it
cannot be in it. Nothing renders its pods or their labels, so a scrape surface
declared for it would name nothing. The port and path are the install's facts,
so they are recorded where the install's other facts are, as `sourceRef`
already is.

**The monitor is the metrics stack's, in its own namespace.** The metrics
stack is what scrapes, so its Project renders the monitor beside its other
objects ([0116](0116-a-project-owns-every-object-it-delivers.md)). A
`namespaceSelector` reaches Flux's namespace, so nothing is written into a
namespace no Project owns. Flux's own install already admits scraping on its
side.

**Egress is the other half of every scrape.** The ingress from the metrics
stack at each scrape port was derived, and the metrics stack's own egress was
not. Once its policy selected it, the rendered Prometheus could reach the
cluster's DNS and nothing else, so it would have scraped nothing. Flux's scrape
needs the same rule, so both are derived together: to each scrape port where
the Process runs, and to Flux's port in Flux's namespace alone.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Do not scrape Flux; read its objects' state through kube-state-metrics | none; `gotk_resource_ready` already arrives | loses reconcile durations and the controllers' own health, about 1480 series live |
| Let a monitoring Project declare a scrape of a namespace it does not own | one generic field | any Project could then scrape anything, and a scrape no longer names a declared Process |
| Render the monitor into Flux's namespace, as fleet-infra does | none | the object would belong to no Project's namespace, and Flux's install already admits the scrape |
| Leave the metrics stack's egress open | no rule to derive | the one Process that reaches every namespace would be the one without a policy |

## Reversibility

Cheap. The field is optional: removing it removes the monitor and the Flux
egress at the next render. The scrape-port egress follows the declared scrapes,
so it changes with them.

## Consequences

- The Platform document's `bootstrap.flux` gains an optional `metrics` block,
  a minor addition.
- The metrics stack's Project renders a `PodMonitor` for Flux's controllers
  wherever the block is set.
- The metrics stack's Processes gain two egress rules: to every scrape port,
  and to Flux's port.
- fleet-infra's `observability/flux-monitoring` is replaced once observability
  hands over.
