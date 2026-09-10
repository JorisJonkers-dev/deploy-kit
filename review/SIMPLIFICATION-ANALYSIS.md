# Proposal — simplify v1 around service facts, not platform policy

## Decision

Adopt the following v1 simplification as one coherent change:

1. Remove the generic `overrides` mechanism. Make capacity the sole explicit
   exception with `replicas: {count, reason}` on a Workload. Correct general
   derivation rules when a supposedly exceptional value is actually a workload
   class, rather than restoring a general escape hatch.
2. Remove the observability rule catalog, receiver map, and scrape cadence from
   the Intent model. The model retains the two Service facts it can know:
   `alertClass` and `scrape {port, path}`. A versioned observability
   configuration, owned and run by the observability service, turns those facts
   into ServiceMonitors, rules, probes, routes, and receivers.
3. Replace `zeroDowntime` with required `cutover: rolling | recreate`.
   `rolling` means continuity is required and is refused for an RWO-backed
   Workload; `recreate` explicitly accepts its single-pod cutover. Kubernetes
   strategy remains derived.
4. Make the worked examples complete teaching artifacts: write every applicable
   authored field explicitly and annotate the observable effect of the important
   facts. Do not duplicate derived settings as if the author owned them.

This is deliberately a subtraction. It keeps the model's useful distinction:
the Service declares facts only it knows; the platform derives mechanics and
arbitrates shared policy. It removes the places where v1 turns platform policy
or a rare exception into permanent domain vocabulary.

## Why this is the right cut

The model is strongest where a small declaration eliminates repeated Kubernetes
mechanics: declared volumes decide whether a rollout can surge; health surfaces
feed the release gate; placement produces a consistent resource shape. Those are
load-bearing derivations and stay.

The excess is the chain around them: derive a value, enumerate every possible
exception to it, add a generic override structure, and maintain an error and a
platform table for values nobody has demonstrated they need to change. The same
pattern appears in observability, where a Service fact is expanded into an
Intent-level catalog of PromQL, receiver wiring, and cadence policy. That makes
the authoring model own configuration of a monitoring stack it does not operate.

The proposal follows existing model principles rather than replacing them:

- Authority belongs with the party that can resolve contention
  ([0004](../docs/adr/model/0004-contention-decides-authority.md)).
- Runtime mechanics are derived from declared intent, not copied into each
  Service ([0030](../docs/adr/model/0030-runtime-mechanics-derived.md)).
- A derived value that is wrong for a whole workload class needs a better rule,
  not an escape hatch.
- Authored names describe model concepts, not Kubernetes fields
  ([0097](../docs/adr/model/0097-authored-values-name-model-concepts.md)).

The repository currently describes a proposed v1 model and illustrative rendered
fixtures; several documents expressly record renderer gaps. Therefore the
evidence here establishes a design simplification, not a claim that every stated
derivation is already implemented or live. Implementation must prove its result
against the estate before it replaces the current behavior.

## The resulting boundary

| Concern | Service Intent owns | Platform / adapter owns |
|---|---|---|
| Health | readiness and liveness surfaces; cold-start budget | probe periods, thresholds, startup probe, deadline, release gate |
| Cutover | whether the Service requires a rolling or accepts a recreate cutover | Kubernetes strategy, surge, unavailability; rejection of an impossible rolling cutover |
| Capacity | an exceptional replica count and its reason | default of one, PDB shape, placement |
| Metrics and alert urgency | metrics port/path and alert class | scrape cadence, ServiceMonitor/PodMonitor shape, checks, rules, receivers and notifier routes |
| Lifecycle and data identity | `lifecycle`, `runtime`, `engine`, volumes and durability | object kind, runtime profile, backup implementation and retention policy |

This table is also the test for future fields. If the field expresses a local
fact a Service owner uniquely knows, it belongs in Intent. If it selects shared
policy, stack configuration, or a Kubernetes tuning value, it belongs in the
platform or its adapter.

## 1. Replace generic overrides with one honest capacity exception

### Decision

Delete `overrides`, its closed overridable-derivations table, and
`E_UNKNOWN_OVERRIDE`. Replace the one legitimate non-derived input with:

```yaml
replicas:
  count: 2
  reason: Capacity retained after the Frankfurt consolidation; the replicas are spread across two nodes.
```

When absent, `replicas` derives to `1`. `count` must be greater than one and
`reason` is required, so the field cannot become a verbose spelling of the
default. The resolved deployment continues to derive the PDB only when the
effective replica count exceeds one.

No other runtime or platform value may be locally overridden. A demonstrated
exception triggers one of two responses:

1. If it recurs by workload class, amend the central derivation and re-render
   the estate.
2. If it is genuinely a new local fact that only the Service knows, introduce a
   narrowly named field with its own authority, validation, and example.

That is intentionally more demanding than adding another item to a generic
table. It prevents an unbounded exception system from becoming the normal
configuration interface.

### Evidence and correction

The current table has nine overridable derivations plus a `volumeSize` row that
exists only to say it is not overridable
([Platform Intent](../spec/v1/14-platform-intent.md#there-is-nothing-to-override-here)).
The worked `auth` example uses only `replicas`; the historic `app-ui` deadline is
the motivating case for ADR 0031. The table's `routePriority` is especially
misaligned: route precedence is explicitly derived to prevent per-Service
hand-tuning ([0093](../docs/adr/model/0093-route-precedence-is-derived.md)).

The previous analysis overreached in one respect: it asserted that a
runtime-specific deadline multiplier is already the correct replacement for the
historic `app-ui` exception. The evidence proves that a single
`startupBudget × 3` rule did not represent that case; it does not yet prove the
right classification or multiplier. This proposal makes the correct decision at
the policy level: investigate that value as a derivation-rule problem during
implementation, using all workloads and their live rollout evidence. It does not
pre-commit v1 to a speculative `runtime: static` rule.

### Consequences

- Capacity reads plainly as capacity; it is no longer disguised as an override
  of a rendering decision.
- `startupDeadline`, probe cadence, token mounting, backups, scrape cadence,
  and route ordering return to being central policy, where they can be tested
  estate-wide.
- The implementation has to validate the deadline derivation against the real
  estate before removing the current historic exception. That is a contained
  migration gate, not a reason to preserve generic machinery.

## 2. Move observability mechanics to the observability service

### Decision

Keep the following Intent facts:

```yaml
alertClass: urgent

scrape:
  port: 8081
  path: /api/actuator/prometheus
```

Remove these from `Platform Intent` and the domain model:

- the `observability.scrape` interval and timeout;
- the `receivers` map;
- the engine-keyed `ruleCatalog`;
- Intent-level derivation of `PrometheusRule` and notifier routes; and
- model errors whose only purpose is to enforce that catalog.

Replace them with a versioned, purpose-built observability configuration owned
by the observability service. Its runner consumes the resolved Service facts and
contains the stack-specific configuration: ServiceMonitor or PodMonitor shape,
cadence, Gatus-style checks where appropriate, PromQL rules, receiver routing,
and logging collection. It is normal observability configuration, not another
authored Service DSL.

Keep one composition-time guarantee at the Intent boundary: a Service above
`alertClass: none` must publish an observable signal. In v1, that means a
`scrape` surface or an explicitly supported external health surface. The runner
must fail its build if it cannot map that signal and class to an active
observability configuration. This preserves the valuable "cannot silently
unwire" property without putting the rule contents in the domain model.

### What stays in the model

Do not move `probes` or `startupBudget` to the runner. Readiness and liveness
are facts about the application process, and the Service release gate uses the
declared readiness surface. The model therefore retains the health interface and
derives its mechanics; the observability service owns the independent monitoring
mechanism. A Workload with no listener continues to say `probes: none`.

This distinction matters: moving the checks would make the release gate depend
on an out-of-band configuration and would weaken the atomic Service switchover
specified in [the release gate](../spec/v1/20-resolved-deployment.md#the-release-gate).

### Evidence

The current model holds receiver mappings, scrape cadence, and an engine-keyed
rule catalog in Platform Intent, while deriving ServiceMonitors, PrometheusRules,
and notifier routes from `scrape` and `alertClass`
([Platform Intent](../spec/v1/14-platform-intent.md#observability-is-not-configured-here),
[Resolved Deployment](../spec/v1/20-resolved-deployment.md#authority)). ADRs
[0021](../docs/adr/model/0021-observability-scrape-and-alert-class.md) and
[0079](../docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md) correctly
identify the original failure—endpoints that alerted nobody. The required
property is that every declared urgency reaches a real signal and receiver, not
that the Intent model owns PromQL or receiver names.

## 3. Make cutover intent explicit and enforceable

### Decision

Replace `zeroDowntime: boolean` with a required Workload field:

```yaml
cutover: rolling
```

Its closed vocabulary is deliberately small:

| Value | Meaning | Validation |
|---|---|---|
| `rolling` | The next revision must keep serving capacity during its cutover. | Refuse it if declared storage prevents a surge, including an RWO volume. |
| `recreate` | The owner accepts a stop-then-start cutover. | Render the safe recreate strategy where storage requires it. |

The adapter maps these intent tokens to Kubernetes strategy details. It does not
expose `RollingUpdate`, `maxSurge`, or `maxUnavailable` as authoring vocabulary.
There is no default: requiring a choice makes the availability consequence visible
in every Workload and lets composition reject an impossible promise with
`E_CUTOVER_UNHONOURABLE`.

### Evidence

Today rollout strategy derives from `zeroDowntime` and volumes
([Resolved Deployment](../spec/v1/20-resolved-deployment.md#authority)). The
runtime-mechanics ADR says RWO-backed workloads cannot safely surge and records
the estate's 21 `Recreate` / 9 `RollingUpdate` split
([0030](../docs/adr/model/0030-runtime-mechanics-derived.md)). A boolean that
can request continuity while the derived substrate requires recreation is a poor
contract. The new field turns that silent contradiction into a visible decision
and a build refusal.

## 4. Make examples show effects, not hidden magic

### Decision

Every worked domain example must declare every applicable authored field,
including values that equal a model default. It must also link each important
fact to a visible effect in either an inline comment or its companion rendered
README. Examples must not restate derived values as authored configuration.

For example:

```yaml
lifecycle: service      # derives a long-running workload object and participates in the Service gate
runtime: jvm            # selects the JVM runtime profile
engine: postgres        # together with durable storage, selects the backup implementation
cutover: recreate       # RWO storage makes a rolling cutover impossible
```

`lifecycle`, `runtime`, and `engine` are authored facts. Calling them "derived
fields" was inaccurate; the issue is that their derived consequences are too
easy to miss. The examples must expose those consequences without changing who
owns the values.

The minimal example remains small only by having fewer applicable concepts; it
is not allowed to conceal applicable ones. The full examples must include both
positive and negative forms where the vocabulary needs them: e.g. metrics versus
no metrics, durable versus reconstructible storage, rolling versus recreate
cutover, and probe endpoints versus `probes: none`.

## Explicit non-goals

This proposal does not remove:

- health surfaces, startup budgets, probe derivation, or the Service release
  gate;
- placement, hardening exceptions, writable-path declarations, secrets, and the
  access/delivery matrix;
- `lifecycle`, `runtime`, `engine`, statefulness, volumes, or durability; or
- derivation itself.

Those concepts either capture irreducible Service knowledge or replace far more
complex repeated mechanics. The target is generic escape hatches and
stack-specific policy represented in the wrong layer.

## Implementation order and proof

Make this a single proposal but land it in dependency order:

1. Add the observability-runner configuration contract and migrate the existing
   catalog, receivers, cadence, and generated rule fixtures into it. Demonstrate
   that every non-`none` Service class has an active signal and receiver.
2. Introduce required `cutover`; migrate every Workload; reject `rolling` plus
   RWO storage; and diff rendered strategies against the accepted estate policy.
3. Add named `replicas`, migrate the known capacity declaration, inventory real
   deadline differences, then correct and verify the central deadline rule.
   Only after that proof, remove `overrides` and its table.
4. Rewrite all examples and rendered READMEs so every authored fact has a visible
   consequence. Update the model and derivation diagrams at the same time.

The acceptance gate is not a prose review. It is:

- every existing example validates under the new schema;
- an RWO workload with `cutover: rolling` is rejected, and one with
  `cutover: recreate` renders safely;
- no generic override syntax, override table, or `E_UNKNOWN_OVERRIDE` remains;
- all non-`none` alert classes resolve to an observability signal and receiver
  through the runner configuration;
- `replicas` is the only local capacity exception, always with a reason;
- a complete estate render has no unexplained deadline difference; and
- the repository's ADR, manifest, boundary, link, and test checks pass.

The ADR work should amend 0031, 0030, 0021, 0079, 0089, and 0097 where their
normative claims change, rather than layering competing decisions on top of
them. The resulting model has fewer concepts, a sharper authority boundary, and
examples that make its behavior inspectable.
