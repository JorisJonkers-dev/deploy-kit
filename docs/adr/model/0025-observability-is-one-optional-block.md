---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/10-project-intent.md#observability
rests-on: ["0004", "0005"]
---

# Observability is one optional block on the Application, whole or absent, and the model derives only the monitor from it

An Application declares one optional `observability` block, whole or absent.
From its `scrape` (a Process, a surface from that Process's `provides`, and a
path) the model derives a ServiceMonitor, or a PodMonitor for a blue/green
Process. From `alertClass` it derives nothing: the class is carried into the
Resolved Deployment as a published fact the monitoring stack reads. A class
without a scrape is `E_ALERT_CLASS_WITHOUT_SIGNAL`. The model renders no
`PrometheusRule`.

## Rests on

The monitor follows from the declared surface, the port `provides` already
declares, and the Platform document's one cadence
([0005](0005-derivation-is-total.md)); only the path is authored, because only
the framework inside the container knows it. A receiver is a shared channel, so
it is platform-assigned ([0004](0004-contention-decides-authority.md)).

**False if:** an Application declaring `alertClass` without `scrape` renders, or
a declared `scrape` renders no monitor. **Settled by:** the refusal fixture
`spec/v1/examples/refusals/alert-class-without-signal.project.yml` with its
committed diagnostics, and `spec/v1/examples/minimal/rendered/apps/notes/servicemonitor.yaml`.

## Why

**Absent is a complete answer.** An Application with nothing to scrape declares
nothing; `platform-valkey` has no block. A `none` member would mean "I wrote the
field to say I did not want it".

**A class without a signal wakes nobody.** That was the estate's old failure:
Gatus watched 41 endpoints and notified nobody. So a class without a scrape is
refused. A warning would be a log line in a one-maintainer estate.

**The monitor is the model's; the rules are not.** A monitor needs only the
declared surface, the path and the cadence, so it is a Deliverable of the
`prometheus` adapter. Rule expressions, severity and receivers belong to the
monitoring stack: PromQL in a project file would be a mechanism in layer 1. A
rule catalog relocated into the observability Application's configuration once
reproduced fifteen lines in a forty-five line file and changed nothing for an
author, so it was deleted.

**A surface, not a port.** `scrape` names a surface, so the port has one
declaring site, and a sidecar's surface can be scraped without the sidecar
authoring anything ([0015](0015-sidecars-are-process-vocabulary.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A required `alertClass` with a `none` member | every Application writes the field | an omission already says it |
| Derive rules from a platform catalog | the model owns PromQL, severity and receivers | configuration of a stack the model does not operate |
| Warn on a class with no signal | nothing blocks on a monitoring gap | both live holes were silences |
| Scrape by port number | direct | a second declaring site for the port |

## Reversibility

Undo cost today: make the block required or add a rule derivation, in the schema
and one adapter: a day. Becomes irreversible once: a monitoring stack routes
on-call from the published `alertClass`, because the projection is then an
interface another system reads.

## Consequences

- An Application that wants a class but has no scrape surface adds an exporter
  or declares no block; `platform-postgres` clears it on its exporter sidecar.
- The monitoring stack owns rules, severity and receivers, and reads classes
  from the projection, paid by whoever runs that stack.
- The `release: metrics-stack` label trap sits with the stack that writes rules.
