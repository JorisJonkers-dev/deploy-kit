---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-24
normative: spec/v1/10-project-intent.md#cutover-is-declared-not-promised
rests-on: ["0001", "0005"]
---

# `cutover` names the promise, `continuous` or `interrupted`, one Application answers it alike, and `continuous` derives a blue/green switchover

`cutover` keeps its question (must the next revision keep serving while it cuts
over?) and changes its answers from `rolling | recreate` to
`continuous | interrupted`. `continuous` derives a blue/green switchover: the
new version starts beside the old one and takes traffic only once every member
of its Application has passed analysis, as
[chapter 55](../../../spec/v1/55-delivery.md#switchover) performs it.
`interrupted` derives a stop-start switchover. Four consequences follow, each
specified in the chapters rather than here:

- Every `lifecycle: application` Process of one Application has the same
  effective `cutover`, or the Application is refused.
- A `continuous` Process is eligible only on a node that fits two copies of
  it, amending [0061](0061-placement-is-hard-dimensions.md).
- Only a `continuous` Application carries release-gate inputs, and only a
  `continuous` Application must publish readiness.
- The Resolved Deployment records the derived switchover beside the granted
  cutover.

## Rests on

The derivation is total ([0005](0005-derivation-is-total.md)): the switchover a
Process gets is a function of its declared `cutover`, its lifecycle and its
volumes, so nothing about it is authored. The estate is one maintainer and one
cluster ([0001](0001-estate-scale-and-ownership.md)), so a rule that makes a
worked Application split in two costs one maintainer one edit, not a
negotiation.

**False if:** a worked Process's switchover cannot be read off its `cutover`,
its lifecycle and its volumes alone, or an Application that switches as one
can keep its promise with members answering the cutover question differently.
**Settled by:** once the resolvers exist (#92 and its model-driven twin),
derive the switchover and the release-gate presence for every worked Process in
both implementations and compare them with the committed Resolved Deployment
oracles; the mixed-cutover refusal already runs in both.

## Why

**The old words named a mechanism that is no longer the switch.** `rolling`
was the Kubernetes `RollingUpdate` strategy spelled in layer 1, which
[0097](0097-authored-values-name-model-concepts.md) forbids, and once delivery
switches a continuous Process blue/green
([0127](0127-delivery-is-part-of-the-model.md)) it also misdescribes what
renders. `continuous` and `interrupted` name the owner's promise, and the
mechanism stays the adapters'.

**One Application, one answer.** The Application switches as one
([0062](0062-application-is-the-release-unit.md)). A continuous member beside
an interrupted one puts a stop-start gap inside a unit that promised to keep
serving: the continuous member's new version waits at the barrier while its
interrupted sibling is down, so neither answer is true of the unit. The worked
`knowledge` Application was exactly this (a continuous API and an interrupted
ingest worker holding a ReadWriteOnce volume), and splitting it into
`knowledge` and `knowledge-ingest` is the refusal's intended fix: the part that
cannot keep serving is its own Release Unit.

**Twice the room, counted where eligibility is.** Blue/green runs the new copy
beside the old one for the length of the analysis. A canary that cannot
schedule would sit `Pending` until its deadline and read as a failed release, so
the need is checked where eligibility already is, per Process, and not by
reserving capacity estate-wide.

**No gate where nothing switches.** An `interrupted` Application stops before it
starts, so there is no moment at which a new version waits while an old one
serves. It carries no release-gate inputs, and a single-Process interrupted
worker with no listener is not refused for publishing no readiness.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep `rolling \| recreate` | no rename in any file | `rolling` names a Kubernetes strategy in layer 1 and misdescribes a blue/green switch |
| `blue-green \| recreate` | readable to anyone who knows the mechanisms | names the mechanism; the day the switch is not Flagger's, every file is wrong |
| Allow mixed cutovers, recreating the interrupted member after the barrier | no Application has to split | the unit's promise is false for as long as the interrupted member is down, and the barrier waits on a member that is not serving |
| Reserve release headroom estate-wide instead of per Process | covers several releases at once | costs capacity on every node all the time, for a concurrency the estate rarely has |

## Reversibility

Undo cost today: rename two literals back in both implementations and the
examples, hours. Becomes expensive once repositories author against a
published schema: renaming a value then is a schema-version migration
([0039](0039-artifact-schema-versioning.md)). The split `knowledge` example is
cheap to merge back, but only by accepting the refusal's premise as false.

## Consequences

- Every example and fixture spells the new values; the refusal fixtures are
  renamed to match, paid once, now.
- `knowledge` splits into `knowledge` and `knowledge-ingest`, and the variables
  and grants both share move to the project header, paid by joris in the
  worked example and in the live estate at adoption.
- An owner of a stateful Process with a stateless sibling writes two
  Applications, paid in one extra `id` and one extra Release Unit.
- Blue/green halves the node capacity a continuous Process may claim, paid by
  every continuous Process whose request is more than half its best node's
  allocatable.
