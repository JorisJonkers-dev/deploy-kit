---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#what-the-probe-derivation-completes
rests-on: ["0005"]
---

# The startup probe targets liveness, and probe cadence is platform policy

## Rests on
A startup probe and a liveness probe ask the same question of a process, so one
declaration serves both, and the cadence at which any probe runs is an estate
concern rather than a per-Workload one. False if: a Workload's liveness endpoint
is unavailable during startup for a reason that is not a defect (a process that
serves liveness only after warm-up), making the startup probe unable to use it.
Settled by: rendering the estate's probes with every startup probe pointing at a
declared liveness target and every readiness and liveness probe naming a cadence
from the context, with no timing chosen inside an adapter.

## Why
The derivation was partial in a way that violates the layer rule.
`startupBudget` gives the startup probe its period and failure threshold, and
nothing says **which endpoint it polls**, so a renderer picked one, which is a
decision taken during serialisation and chapter 30 forbids exactly that. The
worked projection shows the shape of the hole: `startup: {periodSeconds: 5,
failureThreshold: 120}` with no target at all. Readiness and liveness cadence was
worse: not derived anywhere, hand-written identically in all four first-party
deployments, with the reasoning left in comments (*"JVM cold start (~250–300 s);
the 600 s startupProbe budget covers it"*), that no tool can read.

The target is the liveness endpoint, and the argument is
[0014](0014-probes-are-siblings.md)'s own. Exceeding a startup probe's failure
threshold **kills the container**, the same consequence a failing liveness probe
has. So a startup probe pointed at a readiness endpoint reproduces precisely the
defect 0014 exists to prevent: a dependency goes down, readiness fails, startup
never succeeds, and the pod crash-loops on someone else's outage. Readiness
means *can I serve traffic*; that is not a question whose wrong answer should
restart a process. Liveness means *is my process wedged*, which is the right
question to ask repeatedly while waiting for a slow start.

That the wider convention points startup probes at readiness is not evidence
against this. The convention exists because most charts declare one endpoint and
call it both, which is the fallback 0014 already refused.

A Workload declaring readiness and no liveness derives **no startup probe**,
because there is nothing safe to poll, and its start is bounded by the progress
deadline alone. That is a narrower guarantee, and it is honest: the alternative
is to invent a target.

Cadence goes to the Platform Intent for the reason scrape timing did
([0079](0079-alert-class-derives-from-a-rule-catalog.md)): it is one operational
default shared by the estate, and stating it makes a render a complete
description of how a pod is checked. Deriving it from `startupBudget` was the
parametric-looking option and the relationship is invented: how long a JVM takes
to warm says nothing about how often it should be polled once warm.
`initialDelaySeconds` is `0` on both, because the startup probe already gates
them; a delay on top would be a second waiting period nobody declared.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| The startup probe targets readiness | Matches the common convention, and startup does ask "is it up" | A failing startup probe restarts the container, so this imports 0014's crash-loop-on-a-dependency-outage into the startup path |
| A third authored `probes.startup` block | Most explicit, and 0014's no-fallback principle taken to its end | A third block on every Workload for a value derivable from one already there, when chapter 10 says timings and thresholds stay derived |
| Fixed cadence constants in the spec | No context field, impossible to drift per cluster | Changing the estate's probe cadence becomes a spec amendment rather than a context republish with a lock |
| Derive cadence from `startupBudget` | One authored number drives every timing | The relationship is invented; cold-start duration does not imply steady-state polling frequency |

## Reversibility
Undo cost today: one derivation and one context field; probes are patchable in
place on a pod template. Becomes irreversible once: never. Every value here is
mutable on a live object, which is why getting it wrong is survivable and
getting it undecided was not.

## Consequences
- R14 closes, and no adapter chooses a probe target, which is what made the old
  behaviour a layer violation rather than merely a gap, paid by nobody.
- A Workload with readiness and no liveness gets no startup probe, so a slow
  starter without a liveness endpoint is bounded only by its progress deadline,
  paid by that Workload's owner, who can declare liveness and get the budget.
- Probe cadence becomes a pinned input, so retuning the estate's probes is a
  context republish and a new lock, and every rendered probe changes in one diff,
  paid in one more pinned value, and it replaces four hand-copied blocks.
- A liveness endpoint that is unavailable during warm-up now blocks startup as
  well as liveness, which is stricter than today; the fix is a liveness endpoint
  that answers while warming, which is what liveness means, paid by whoever owns
  such a process, and it surfaces as a crash-loop at first render rather than
  later.
