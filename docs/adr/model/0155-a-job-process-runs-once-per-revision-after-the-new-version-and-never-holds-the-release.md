---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-11-27
normative: spec/v1/10-project-intent.md#job-processes
rests-on: ["0005"]
---

# A job Process runs once per revision after the new version is applied, and never holds the release

`lifecycle: job` is a Process that runs to completion once per Application
revision, started when the revision is applied, and whose failure is reported
and nothing more. It declares an image, resources and a run deadline, and
nothing a serving Process has. The rules are
[chapter 10](../../../spec/v1/10-project-intent.md#job-processes)'s and the
place in delivery is [chapter 55](../../../spec/v1/55-delivery.md#release-order)'s.

## Rests on

The derivation is total ([0005](0005-derivation-is-total.md)): the object, its
name, its retry and its deadline follow from the lifecycle, the revision and the
`startupBudget`, so nothing about the run is authored. A prepare Process is the
other run to completion
([0027](0027-prepare-processes-are-forward-only-setup.md)); a job is its
counterpart after the release rather than before it.

**False if:** a post-release step in the estate must run only once the new
version is promoted, not merely applied. **Settled by:** the first job Process
whose work breaks against the old version still serving, which would earn a
promotion-ordered start.

## Why

**After, and not holding.** A warm-up or a notification has nothing to protect
the release from, so holding it on the step's success would trade a working
release for a side effect. A step that must hold the release is a prepare
Process.

**Started when applied, not when promoted.** Delivery is Flux pulling a pinned
render, and no mechanism orders a Job after a canary's promotion. Building one
is a second ordering path; stating that the job tolerates the old version
serving is honest and costs nothing to author.

**A Job named by the revision, created once.** A new revision is a new name and
so a new run; an unchanged revision is the same Job, which the applier never
updates, so it never runs twice. A time-to-live would delete the finished Job,
and the applier would then create it again; the prune of the next revision
removes the old one instead.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Start the Job after promotion | a gate and a second ordering path in delivery | nothing in delivery orders it today, and the job can tolerate the old version |
| Let a failure hold the release | none to build | a side effect would hold a working release; that is prepare's contract |
| `ttlSecondsAfterFinished` on the Job | none to build | the applier recreates the deleted Job, so the job would run again |

## Reversibility

Undo cost today: drop one literal, one refusal and one object builder, an hour.
Expensive once Projects declare job Processes whose work assumes the order.

## Consequences

- A job Process must be idempotent and must tolerate the old version still
  serving, paid by the author.
- A failed job is visible only on the Job and its pod, paid by whoever watches
  the Application.
