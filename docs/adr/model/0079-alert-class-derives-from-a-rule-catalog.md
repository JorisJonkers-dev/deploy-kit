---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#what-the-class-derives
rests-on: ["0004"]
---

# An Alert Class derives rules from a platform catalog, and a class without a signal is refused

## Rests on
The rules worth alerting on are a property of what a Workload is and what it
exposes, not of who owns it, so a platform catalog plus a declared urgency
derives every alert the estate needs. False if: a Service needs a rule whose
expression only its owner could write, often enough that authored PromQL becomes
the normal case. Settled by: rendering the estate and finding every Service with
a class above `none` carrying at least one rule at the severity its class
implies, with no Service needing an authored expression to be adequately
alerted.

## Why
[0021](0021-observability-scrape-and-alert-class.md) says receivers, notifier
routes, Gatus checks, ServiceMonitors and PrometheusRules all derive from two
declarations. Three Services declare three different Alert Classes and all three
produce zero objects. There is exactly one `PrometheusRule` in the estate, and
Gatus monitors 41 endpoints while notifying nobody — its ConfigMap has `storage`
and `ui` and no `alerting` section at all. The declaration has been inert in both
directions.

The rules come from a catalog because PromQL is a mechanism. A baseline set keyed
off `scrape` — target absent, restart loop, probe failure — covers what "is it
working" means for anything, and `engine`
([0078](0078-engine-is-workload-vocabulary.md)) covers what it means for a
Postgres or a RabbitMQ specifically. The class supplies severity and receiver,
which is what it already claims to be: urgency, never routing. A receiver is a
shared notification channel, so by
[0004](0004-contention-decides-authority.md) the mapping is platform-assigned,
and it is one mapping feeding both producers — a Service declaring `page` means
the same thing whether the signal came from a scrape or from an endpoint check.

**The refusal is the part that matters.** `platform-postgres` declares `page`,
the loudest value in the vocabulary, and produces no monitoring object at all:
Gatus derives from `exposure` and a datastore is correctly not exposed, and no
adapter reads the class. So the estate's most urgent Service is wired to nothing,
and nothing says so. `E_ALERT_CLASS_WITHOUT_SIGNAL` makes a class above `none`
require a signal source — a `scrape` surface on some Workload, or an exposure
Gatus can check. A warning would not do: in a one-maintainer estate a warning is
a line in a log, which is how 41 endpoints came to notify nobody.

The kinds move to one adapter for a reason the estate has already been bitten
by. A `PrometheusRule` without `release: metrics-stack` is accepted by the API
server, its Kustomization goes Ready, the operator logs nothing, and the rules
never evaluate. That label rule belongs to exactly one producer, so
`ServiceMonitor` and `PodMonitor` come with `PrometheusRule` rather than staying
in the `kubernetes` adapter — which is already the largest by kind count and
would otherwise hold half of monitoring.

Scrape timing joins them (R25). Omitting `interval` and `scrapeTimeout` takes
the metrics stack's global default, a value decided outside the model, so a
render would not be a complete description of how the estate is scraped. The
Cluster Context states both and every emitted monitor names them; the ingest
budget is shared, so the value is not a Service's to set.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Authored rules per Service | Highest fidelity to what each owner considers broken | PromQL in a domain file is a mechanism in layer 1, and every Service reimplements up-ness and restart detection |
| Derive only an absent-target rule | Small and hard to get wrong | `platform-postgres` declaring `page` would get one rule that fires only when scraping breaks, which is not what `page` means |
| Derive a synthetic check for a Service with no signal | Nothing is ever silently unmonitored | Invents a signal the Service never declared, and reaching a readiness probe from outside the pod is a mechanism nobody asked for |
| Warn on a class with no signal | Nothing blocks on a monitoring gap | A warning is a log line here; the two live holes are both silences, which is the argument for a refusal |
| `kubernetes` keeps all three monitoring kinds | No new adapter, no amendment | The `release: metrics-stack` label rule would live in the adapter that also emits Deployments and PVCs, and monitoring would have two owners once rules landed |

## Reversibility
Undo cost today: a catalog, a mapping, one adapter, and two kinds moved back —
days, nothing applied. Becomes irreversible once: the receivers are wired and
on-call depends on them, because the mapping then encodes who gets woken and
changing it is an operational change rather than a refactor.

## Consequences
- R6 closes, and so does R25; Gatus's `alerting` section is derived from the same
  mapping, which closes the 41-endpoints-notify-nobody hole with a decision
  already being made — paid by whoever republishes the context with a receiver
  set.
- `platform-postgres` cannot render until it declares a `scrape` surface or drops
  to a class that needs no signal, so the first render after this decision fails
  for the estate's most important datastore — paid by its owner, once, and it is
  the exact defect the refusal exists to surface.
- Two kinds change owner, so attribution for existing `ServiceMonitor` and
  `PodMonitor` objects moves; a field-manager transition is delivery's problem
  and is one more reason the delivery definition inherits a list rather than a
  surprise — paid at adoption.
- The catalog is platform data, so a rule that turns out to be wrong is fixed
  once for the estate rather than per Service — which is the benefit, and also
  means one bad rule pages for everything at once.
- Scrape timing is now explicit in every monitor, so changing the estate's
  interval is a context republish and a new lock rather than an invisible chart
  default — paid in one more pinned value.
