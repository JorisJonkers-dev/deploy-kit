---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/10-project-intent.md#observability
rests-on: ["0004", "0005"]
---

# Observability is one optional block on the Application that names what to scrape, and the model derives only the monitor from it

An Application declares one optional `observability` block, or none. It holds
`scrape` alone: a Process, a surface from that Process's `provides`, and a path,
from which the model derives a ServiceMonitor, or a PodMonitor for a blue/green
Process. How urgent an alert is, and whom it wakes, is the monitoring stack's:
its own rule groups and the Platform document's routing.

## Rests on

The monitor follows from the declared surface, the port `provides` already
declares, and the Platform document's one cadence
([0005](0005-derivation-is-total.md)); only the path is authored, because only
the framework inside the container knows it. A receiver is a shared channel, so
it is platform-assigned ([0004](0004-contention-decides-authority.md)).

**False if:** a declared `scrape` renders no monitor. **Settled by:**
`spec/v1/examples/minimal/rendered/apps/notes/servicemonitor.yaml`.

## Why

**Absent is a complete answer.** An Application with nothing to scrape declares
nothing; `platform-valkey` has no block.

**An urgency nobody reads is not intent.** An Application once stated an alert
class beside its scrape, and no derivation read it: it was carried into the
published projection for a stack that routes on its own rule groups instead.
A field that changes nothing an author can see is ceremony, so the block holds
the signal and nothing else.

**The monitor is the model's; the rules are not.** A monitor needs only the
declared surface, the path and the cadence, so it is a Deliverable of the
`prometheus` adapter. Rule expressions, severity and receivers belong to the
monitoring stack: PromQL in a tenant's project file would be a mechanism in
layer 1.

**What the exporter publishes is the author's to say.** An exporter that
describes other objects (kube-state-metrics, a proxy) labels its series with
theirs, and only its author knows it does. Without `honorLabels` the scrape's
own labels win, every series names the exporter, and a rule joined on namespace
and pod silently matches nothing it means; the estate's alerts did exactly that.
The monitoring stack cannot guess it from the series, so the scrape states it.

**A surface, not a port.** `scrape` names a surface, so the port has one
declaring site, and a sidecar's surface can be scraped without the sidecar
authoring anything ([0015](0015-sidecars-are-process-vocabulary.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| An authored alert class beside the scrape | an Application states its own urgency | nothing reads it; the stack routes on its rules |
| Derive rules from a platform catalog | the model owns PromQL, severity and receivers | configuration of a stack the model does not operate |
| Scrape by port number | direct | a second declaring site for the port |

## Reversibility

Undo cost today: add a field back to the block and to the projection: a day.
Becomes irreversible once: a monitoring stack routes on a field of the
published projection.

## Consequences

- An Application that wants monitoring declares a scrape surface, adding an
  exporter where it has none; `platform-postgres` scrapes its exporter sidecar.
- The monitoring stack owns rules, severity and receivers, paid by whoever runs
  that stack.
