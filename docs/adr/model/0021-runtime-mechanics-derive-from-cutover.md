---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/20-resolved-deployment.md#derived-mechanics
rests-on: ["0001", "0005"]
---

# Runtime mechanics derive from declared intent, and `cutover` names the promise: `continuous` derives a blue/green switchover, `interrupted` a stop-start one

An Application declares what only it knows: its cold-start budget, whether its
next cutover must keep serving, its probe paths, what each volume's data is
worth, what each grant tolerates on rotation, and each Process's memory and cpu.
Everything else follows: the switchover and its strategy, probe timings, the
progress deadline, object kind, requests and limits, pod hardening, backup jobs
and sweeps. No derived value may be authored.

`cutover` is required and has no default. `continuous` derives a blue/green
switchover, the new version beside the old and taking traffic only once every
member has passed analysis
([chapter 55](../../../spec/v1/55-delivery.md#switchover)). `interrupted`
derives a stop-start switchover. Every `lifecycle: application` Process of one
Application has the same effective `cutover`, or the Application is
`E_RELEASE_UNIT_MIXED_CUTOVER`. `continuous` over a `ReadWriteOnce` volume is
`E_CUTOVER_UNHONOURABLE`. Only a `continuous` Application carries release-gate
inputs and must publish readiness. A `continuous` machinery Process rolls in
place instead, because the gate cannot gate itself
([0052](0052-an-application-is-the-release-unit.md)).

## Rests on

The derivation is total ([0005](0005-derivation-is-total.md)): the switchover a
Process gets is a function of its `cutover`, its lifecycle and its volumes. A
`ReadWriteOnce` volume cannot attach to two pods, so a Process holding one
cannot keep serving through a cutover. One maintainer runs the estate
([0001](0001-estate-scale-and-ownership.md)), so a rule that splits a worked
Application costs one edit.

**False if:** a Process declaring `continuous` over RWO renders, a Process with
no effective `cutover` renders, or a worked Process's switchover cannot be read
off its `cutover`, lifecycle and volumes. **Settled by:** the refusal fixtures
`cutover-continuous-over-rwo`, `cutover-missing` and `cutover-mixed` with their
committed diagnostics, the accepted `cutover-interrupted-over-rwo`, and the
rendered worked set, where every holder of an RWO volume derives a stop-start
switchover.

## Why

**Four identical blocks were one derivation done by hand.** All four
first-party Deployments carried the same rollout, probe and deadline values,
with comments recording what they cost to learn. A rule states the reasoning
once.

**The words name the promise, not the mechanism.** `rolling` and `recreate`
were Kubernetes strategies spelled in layer 1
([0011](0011-authored-values-name-model-concepts.md)), and a boolean
`zeroDowntime` once asked for continuity while the derived strategy stopped the
Process: it rendered, reported success and went dark on every roll. Checking the
promise against the storage at composition removes that trap.

**One Application, one answer.** The Application switches as one. A continuous
member beside an interrupted one puts a stop-start gap inside a unit that
promised to keep serving. The worked `knowledge` was exactly this, and splitting
it into `knowledge` and `knowledge-ingest` is the intended fix.

**Twice the room, where eligibility is checked.** Blue/green runs the new copy
beside the old for the length of the analysis, so a `continuous` Process is
eligible only on a node that fits two copies
([0017](0017-placement-is-hard-dimensions.md)). A canary that cannot schedule
would read as a failed release.

**No authored change response.** An Asset change restarts its Process
([0014](0014-file-shaped-configuration-is-an-asset.md)); a secret's rotation
reaches the Process the way its grant's required `rotation.tolerates` says.

**The progress deadline exceeds the budget.** It derives as the startup budget
times three, floored, so a JVM inside its cold start is never marked failed.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| `zeroDowntime: true/false` | one boolean | asked for continuity the storage could not give, and rendered anyway |
| `rolling` or `recreate` | matches Kubernetes | a mechanism in layer 1, and wrong once the switch is blue/green |
| An authored rollout strategy | direct control | a stateful Process with a forgotten stop-start strategy wedges |
| Per-member cutover within an Application | each Process answers for itself | a stop-start gap inside a unit that switches as one |
| A named override per derived value | an unusual Process is served at once | an override outlives its reason ([0022](0022-a-derived-value-has-one-declaring-site.md)) |

## Reversibility

Undo cost today: an authored field and one adapter call site: a day. Becomes
irreversible once: the hand-written manifests and their comments are deleted
from project repositories, because the rules are then the only record of what
the values cost to learn.

## Consequences

- A wrong rule mis-tunes every Process at once, on the first rollout after it
  ships, paid by the whole estate.
- An owner declaring `continuous` over RWO storage splits the part holding it
  into its own Application or accepts `interrupted`, paid at composition.
- A `continuous` Process needs twice its room on some eligible node.
- The Resolved Deployment records the derived switchover beside the declared
  cutover.
