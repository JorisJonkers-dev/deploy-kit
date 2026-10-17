---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-17
normative: spec/v1/14-platform-intent.md#the-vault-policy-job
rests-on: ["0001", "0005"]
---

# A derived estate Job bounds each attempt, retries until one succeeds, and runs on no node that boots from an SD card

The Vault policy job and every catalog method are Jobs that every Reconcile
Unit holding a grant waits on. Their deadline bounds one attempt, the start
included, rather than the whole Job. The Job retries until an attempt succeeds.
It is placed on the nodes that fit what it asks for and that hold no `sdcard`
medium.

## Rests on

The estate is one maintainer and one cluster
([0001](0001-estate-scale-and-ownership.md)), so a failure that only a person
can clear lasts until that person notices it. Where the Job may run is derived
from facts the node contract already publishes
([0005](0005-derivation-is-total.md)), and not authored again.

**False if:** a derived estate Job fails for a reason that a retry never
clears, and retrying it hides that failure. **Settled by:** a policy or catalog
Job whose first attempt runs past its deadline, followed by a later attempt
that completes, with no person deleting anything.

## Why

**One slow start failed the estate path.** On 2026-10-17 a changed policy set
named a new policy Job. It landed on a Pi that boots from a USB stick, where
creating its container took about 85 seconds. The Job's 120-second deadline
covered the whole Job, so the Job failed for good, and every estate-path
Project went Not ready behind it
([#472](https://github.com/JorisJonkers-dev/deploy-kit/issues/472)).

**A content-hashed name cannot recover.** The Job is named by its inputs
([Vault configuration is rendered, not applied](../../../spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied)),
so a failed Job keeps its name until those inputs change. The applier never
recreates it, and nothing else does either. The failure has to end inside the
Job.

**Retrying is safe.** Both Jobs write the same documents again, and the hourly
CronJob already does that with the same pod. A retry repeats an hourly run, so
it adds nothing new.

**The deadline still bounds a hang.** On the pod, it fails one attempt that
starts too slowly or stops responding, and the controller starts another. The
unit then reports progress rather than a stall, and recovers by itself once an
attempt completes.

**The slowest disks are the wrong place for a gate.** The node contract already
says which nodes boot from SD cards
([0048](0048-node-facts-are-authored-once.md)). It keeps any Process from
asking for one. This decision does not let a Process ask for one either. It
keeps the one derived Job that everything waits on off those nodes.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Raise the deadline only | one platform value | a long enough stall still fails the Job for good, and only a person can clear it |
| `ttlSecondsAfterFinished`, so the applier recreates the Job | no retry semantics | a completed Job is deleted too, so every interval reruns it and can wedge the units again |
| Stop waiting on the Job's health | units never wedge | an Application can start before its policy exists, which is the ordering the unit gives |
| Keep the Job on any node, retrying | no placement rule | each attempt on a saturated USB stick is as slow as the first, so recovery waits on that node's disk |
| Let a Process ask to avoid `sdcard` | a general dimension | no Process needs it today, and the vocabulary would invite asking for the medium itself |

## Reversibility

Undo cost today: the two adapters, the resolved field and the spec text, in an
afternoon. Becomes costly once: other derived Jobs follow the same shape and
something comes to read a Failed Job as the policy job's answer.

## Consequences

- A policy or catalog Job is never `Failed`. While it retries, its unit shows a
  health check that timed out, with the Job still in progress.
- Retried attempts leave their pods behind until the Job is replaced: at most
  one per `deadline`.
- The render carries the job's eligible nodes. A node contract in which none of
  them fits is refused at build with `E_PLACEMENT_UNSATISFIABLE`.
- A Pi is still eligible for every Process that asks for nothing that rules it
  out.
