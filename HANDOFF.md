# v1 simplification — implementation handoff

## Mission

Implement the accepted simplification in
[`review/SIMPLIFICATION-ANALYSIS.md`](review/SIMPLIFICATION-ANALYSIS.md).
Deliver a coherent v1 model in which Service Intent declares local facts and the
platform/its adapters own shared policy and stack-specific mechanics.

This is an implementation task, not another design exploration. Preserve the
decisions below. Raise a blocker only when evidence contradicts a decision or an
external estate fact is required to prove it.

## Read first

1. Read [`CLAUDE.md`](CLAUDE.md), including its linked estate-wide contract.
2. Read [`docs/adr/README.md`](docs/adr/README.md), then ADRs 0003–0006.
3. Read the proposal and every currently normative section it names:
   `spec/v1/10-service-intent.md`, `14-platform-intent.md`, and
   `20-resolved-deployment.md`.
4. Read ADRs 0021, 0030, 0031, 0079, 0089, and 0097 before changing their
   claims.

`spec/v1` is normative. ADRs justify the specification and must be amended when
their normative claim changes; they must not become a competing source of field
definitions, error tables, or worked YAML.

## Non-negotiable decisions

### 1. No generic overrides

Delete `overrides`, the overridable-derivations table, and `E_UNKNOWN_OVERRIDE`.

The only local exception is an optional capacity declaration:

```yaml
replicas:
  count: 2
  reason: Capacity retained after the Frankfurt consolidation; replicas are spread across two nodes.
```

Rules:

- Absent `replicas` resolves to one.
- `count` is greater than one.
- `reason` is required whenever `replicas` is present.
- The effective count continues to determine whether a PDB is rendered.
- No generic replacement, free-form exception map, or new override vocabulary
  is allowed.

If an old override is a recurring workload-class pattern, repair the central
derivation and prove it against the estate. If it is irreducible Service
knowledge, propose one narrowly named field with its authority and validation;
do not add it silently.

The historic deadline exception does **not** pre-authorize a `runtime: static`
multiplier. Inventory actual deadline differences and their rollout evidence
first; only then select and test the corrected derivation.

### 2. Observability configuration belongs to the observability service

Intent retains only the Service facts:

```yaml
alertClass: urgent

scrape:
  port: 8081
  path: /api/actuator/prometheus
```

Remove from the Intent model and Platform Intent:

- scrape interval and timeout;
- receiver map;
- engine-keyed alert rule catalog;
- Intent-level PrometheusRule and notifier-route derivations; and
- validation that exists only to maintain that removed catalog.

Create or identify a versioned configuration owned by the observability service.
Its runner consumes resolved Service facts and owns ServiceMonitor/PodMonitor
shape, cadence, external checks, PromQL, receiver routing, and log collection.
It is stack configuration, not a second Service DSL.

Preserve the safety property: every Service with an alert class other than
`none` must publish an observable signal. In v1, accept a `scrape` surface or an
explicitly supported external health surface. The observability runner must fail
if it cannot map that signal and class to active monitoring and a receiver.

Do not move `probes`, `startupBudget`, or the release gate into the runner.
Readiness/liveness are application facts and remain inputs to the model's
atomic-Service gate.

### 3. Cutover is explicit, not a boolean promise

Replace `zeroDowntime` with a required Workload field:

```yaml
cutover: rolling
```

The only values are:

- `rolling`: continuity is required. Reject it with
  `E_CUTOVER_UNHONOURABLE` when declared storage prevents a surge, including
  `ReadWriteOnce` storage.
- `recreate`: the owner accepts stop-then-start. Derive the safe Kubernetes
  strategy.

There is no default. Do not expose Kubernetes tokens or mechanics (`RollingUpdate`,
`maxSurge`, `maxUnavailable`) to Service authors. The adapter derives them from
the cutover intent and storage facts.

### 4. Examples teach causality

Every worked example explicitly writes every applicable authored field, including
values that equal defaults. Important facts link to their visible effect inline
or in the companion rendered README.

```yaml
lifecycle: service      # derives a long-running workload object and participates in the Service gate
runtime: jvm            # selects the JVM runtime profile
engine: postgres        # with durable storage, selects the backup implementation
cutover: recreate       # RWO storage makes a rolling cutover impossible
```

Do not write derived settings as though the Service author owns them.
`lifecycle`, `runtime`, and `engine` are authored facts; make their effects
visible rather than removing or misclassifying them. The examples must cover both
meaningful forms where applicable: metrics/no metrics, durable/reconstructible,
rolling/recreate, and endpoint probes/`probes: none`.

## Required execution order

Work in this order to retain a valid, observable migration path:

1. **Baseline.** Record `git status`, run `npm run verify`, and identify known
   renderer gaps. Do not rewrite unrelated user changes.
2. **Observability boundary.** Define the runner/configuration contract; migrate
   the existing catalog, receiver map, cadence, and rule fixtures out of Intent;
   add proof that every non-`none` class maps to a signal and receiver.
3. **Cutover contract.** Add `cutover`, migrate all example Workloads, remove
   `zeroDowntime`, and add acceptance/refusal coverage for rolling plus RWO and
   recreate plus RWO. Diff generated strategy behavior against accepted policy.
4. **Overrides removal.** Add named replicas; migrate the known capacity case;
   inventory and resolve deadline differences; then remove generic overrides and
   the table. Do not remove the old path before the deadline inventory passes.
5. **Documentation coherence.** Update the normative chapters, affected ADRs,
   all worked inputs, rendered fixtures/READMEs, derivation matrices, and model
   diagrams in the same change.
6. **Proof.** Run the full verification suite and inspect the generated/rendered
   diff for every changed behavior.

If the implementation does not yet have a renderer, write executable schema or
fixture-level checks at the narrowest layer available and clearly report the
remaining renderer proof as a blocker. Never represent an unimplemented
derivation as verified.

## Guardrails

- Do not delete health surfaces, startup budgets, probe derivation, or the
  release gate.
- Do not delete placement, hardening exceptions, writable paths, secrets,
  access/delivery semantics, `lifecycle`, `runtime`, `engine`, statefulness,
  volumes, or durability.
- Do not add delivery mechanics, appliers, pruning, field managers, or co-test
  gates to `spec/v1`; those belong in the deferred delivery boundary.
- Do not introduce a broad exception mechanism to make a migration easier.
- Keep authored tokens conceptual. Kubernetes serialization belongs in adapters.
- Treat illustrative rendered files as fixtures, not proof of live deployment.
  Validate changed policy against real estate evidence where the task has access
  to it.
- Preserve unrelated work in a dirty worktree.

## Completion criteria

Do not call this complete until all of the following are true:

- no `overrides`, overridable-derivations table, or `E_UNKNOWN_OVERRIDE` remains;
- `replicas` is the only local capacity exception and always has a reason;
- every deadline difference in the estate render is explained by the corrected
  central rule, not an escape hatch;
- `zeroDowntime` is absent and every Workload declares `cutover`;
- an RWO Workload with `cutover: rolling` fails with
  `E_CUTOVER_UNHONOURABLE`, while `cutover: recreate` renders safely;
- observability policy vocabulary is absent from Intent and Platform Intent;
- every non-`none` alert class maps through the runner configuration to both a
  signal and receiver;
- worked examples make applicable authored concepts and their effects visible;
- corresponding ADRs are amended and still point to valid normative anchors;
- `npm run verify` passes; and
- the final report names changed files, rendered behavior changes, evidence run,
  and any remaining external proof required.

## Handoff report format

Report concisely:

1. What changed, grouped by the four decisions.
2. Evidence for the deadline rule, cutover refusals, and observability mappings.
3. Commands run and their results.
4. Any unresolved external-state proof, stated as a blocker with the exact
   evidence needed.
