# The observability boundary, as configuration

The deployment model declares two facts and stops: `alertClass` on the Service,
`scrape {port, path}` on a Workload. Everything else in monitoring — cadence,
monitor kind, PromQL, severity, receiver routing, external checks — is
configuration of a monitoring stack this model does not operate. It lives here.

| file | owns |
|---|---|
| [`runner.config.yml`](runner.config.yml) | the versioned runner configuration: cadence, the class-to-receiver table, the rule catalog, and the mapping requirement |

## The two guarantees

1. **Composition refuses an unwired Service.** A Service above
   `alertClass: none` with no `scrape` surface on any Workload is
   `E_ALERT_CLASS_WITHOUT_SIGNAL` at composition — checked before any object
   exists.
2. **The runner fails, not warns.** If this configuration cannot map a resolved
   Service's signal and class to an active monitor and a receiver, the runner's
   build fails. That is what preserves the "cannot silently unwire" property
   ([0021](../../../../docs/adr/model/0021-observability-scrape-and-alert-class.md),
   [0079](../../../../docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md))
   without the Intent model owning PromQL.

## What moved out of Intent

| was in the model | now here |
|---|---|
| `observability.scrape {interval, scrapeTimeout}` | `scrape:` cadence, stated once |
| `receivers` map | `receivers:` keyed by Alert Class |
| engine-keyed `ruleCatalog` | `ruleCatalog:` keyed by signal source and `engine` |
| Intent-level PrometheusRule and notifier-route derivations | the runner's build, from resolved Service facts |

`probes`, `startupBudget` and the release gate did **not** move: readiness and
liveness are application facts and stay inputs to the model's atomic-Service
gate (spec/v1/20-resolved-deployment.md #the-release-gate).