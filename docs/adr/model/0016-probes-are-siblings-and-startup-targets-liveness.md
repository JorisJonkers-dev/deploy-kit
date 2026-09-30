---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/10-project-intent.md#probes
rests-on: ["0005"]
---

# Readiness and liveness are sibling declarations with their own targets, the startup probe polls liveness, and probe cadence is platform policy

`readiness` and `liveness` each carry their own `path` and `port`, or `tcp` and
a port, and neither falls back to the other. A Process with nothing to probe
says `probes: none`. The startup probe polls the liveness target, with its
period and failure threshold from `startupBudget`; a Process with readiness and
no liveness gets no startup probe. How often any probe runs is set once, in the
Platform document. The chapter's
[probe derivation](../../../spec/v1/10-project-intent.md#what-the-probe-derivation-completes)
states the values.

## Rests on

A liveness probe pointed at a readiness endpoint restarts pods during
dependency outages. A startup probe that exceeds its threshold kills the
container, the same consequence, so it asks the liveness question too. Cadence
is an estate concern, not a per-Process one.

**False if:** a pod whose readiness reports unready because a dependency is
down survives its liveness window without a restart, or a Process's liveness
endpoint is legitimately unavailable during warm-up. **Settled by:** a process
whose single health endpoint checks a dependency, the dependency taken down
past the derived liveness window, and `restartCount` read; and the rendered
estate, where every startup probe points at a declared liveness target and no
adapter chooses a timing.

## Why

**Readiness means can I serve; liveness means am I wedged.** When liveness
probes the readiness endpoint, a dependency outage fails readiness, which fails
liveness, which restarts the pod: a degraded application becomes a crash-loop.
The replaced generation made liveness fall back to the readiness path, and two
live processes (`app-ui`, `agents-login`) relied on it. Requiring both does not
stop an author pointing them at one endpoint; it stops them doing so without
noticing.

**`tcp` and `none` are needed.** `postgres` and the rest of the data tier probe
with `tcpSocket`; `knowledge-ingest-worker` has nothing to probe, and `probes:
none` tells that apart from an oversight.

**The startup target was a decision taken during serialisation.** Nothing said
which endpoint the startup probe polls, so a renderer picked one. Polling
readiness imports the crash-loop into the startup path. A Process without a
liveness endpoint is bounded by its progress deadline alone, which is narrower
and honest.

**Cadence was hand-copied.** Readiness and liveness timing was written
identically in four deployments, its reasoning in comments no tool reads.
Stated once in the Platform document, retuning is one republish and one diff.
Deriving it from `startupBudget` would invent a relationship: how long a JVM
takes to warm says nothing about how often to poll it once warm.
`initialDelaySeconds` is `0`, because the startup probe already gates the
others.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Liveness falls back to the readiness path | every default inherits the dependency-outage crash-loop | makes the worst wiring the easiest |
| Omit liveness unless authored | a wedged process is never restarted | trades a loud failure for a silent one |
| HTTP-only probes | the data tier needs fake HTTP sidecars | the stateful Applications are TCP-native |
| Startup probe targets readiness | matches the common convention | restarts the container on someone else's outage |
| A third authored `probes.startup` block | explicit | a third block for a value derivable from one already there |
| Cadence from `startupBudget` | one authored number | the relationship is invented |

## Reversibility

Undo cost today: one derivation and one Platform document block; probes are
patchable on a live pod template. Becomes irreversible once: Processes ship
liveness endpoints distinct from readiness, because a restored fallback would
silently repoint them.

## Consequences

- Every HTTP Process authors two endpoints, even when deliberately identical,
  paid by application authors.
- A dependency outage degrades an Application to unready instead of restarting
  it, provided liveness checks process health only.
- A liveness endpoint unavailable during warm-up blocks startup too, which
  surfaces as a crash-loop at first render, paid by that Process's owner.
- Retuning the estate's probes is one Platform document republish, and every
  rendered probe changes in one diff.
