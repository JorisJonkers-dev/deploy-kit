---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-27
normative: spec/v1/55-delivery.md#pause-and-rollback
rests-on: ["0001", "0006"]
---

# A Retry is rendered, not restarted: one pin annotation that composition carries onto every gated pod template

A **Retry** analyses a failed release again. A workflow in the Estate
repository records when it ran on the Project's pin file, and composition
carries that time into the Project's artifact as an annotation on the pod
template of every Deployment a Canary targets. The annotation is part of what
the share holds, so it moves the pin once and stays in every later render
([chapter 55](../../../spec/v1/55-delivery.md#pause-and-rollback)).

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)), so a change the cluster should keep has to be
one of those inputs: a change made on the cluster alone is one the next
reconcile takes back. The estate is one maintainer
([0001](0001-estate-scale-and-ownership.md)), so a Retry is a human act, run by
hand like a Pause or a Rollback.

**False if:** a Retry starts more than one analysis of a gated member, or a
later composition that changes nothing else starts another. **Settled by:**
retry a Project whose canary failed, and check that Flagger records one new
revision per gated member and none on the next reconcile.

## Why

**Flagger analyses again only on a new pod template.** A Canary that fails is
rolled back to the primary and waits, and nothing but a change to its target's
pod template, or to a configuration object it tracks, starts another analysis.
A failure whose cause lay outside the release, a node, a dependency or the
gate itself, leaves nothing to change in the Project's repository, so the
release has to be told to try again from outside it.

**Restarting on the cluster starts two analyses.** `kubectl rollout restart`
writes an annotation onto the pod template that the render does not hold. Flux
removes it on its next reconcile, and Flagger reads that removal as a second
new revision, analysed after the first. A change Flux applies as desired state
is never removed, so it is exactly one revision.

**A pin annotation, because the pin file is already where a human acts.** A
Pause and a Rollback are recorded there
([0084](0084-pause-and-rollback.md)), composition already reads them as an
input, and the Estate repository's history already says who did what and why.
A Retry is one more annotation on the same file, one commit, and composition
moves the pin the way it moves any other.

**Only the gated Deployments.** A Process that switches by rolling update has
no analysis to repeat, and a new pod template would only restart it.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| `kubectl rollout restart` on the cluster, as before | nothing to build | Flux reverts the annotation, which Flagger reads as a second release; and it needs a cluster credential in the hand that runs it |
| A counter instead of a time | a shorter value | the workflow would read before it writes, and the time says when on its own |
| Annotate every workload of the Project | one patch, no Canary to find | restarts every rolling and stop-start Process for an analysis none of them runs |
| Write the annotation on the pin source's Kustomization as a patch | the artifact is not republished | a patch on the source can be applied to the artifact it replaces, the reason the release's label travels in the artifact |
| Remove the Retry on a resume, as a Pause's annotations are | one prefix to clear | every gated pod template changes again, which Flagger analyses as one more release |

## Reversibility

Undo cost today: one annotation, its patches in composition and one estate
workflow, a day. Becomes expensive once the dashboard links to the workflow as
the way to try a failed release again.

## Consequences

- The Estate repository carries a retry workflow beside pause, resume and
  rollback, one commit to a pin file, paid once.
- Every gated pod template of a retried Project carries the annotation for as
  long as the pin does, paid by nobody: it changes only when a Retry runs.
- A Retry republishes the Project's artifact and starts a Rollout for the
  release already pinned, paid by whoever reads the notifications.
- A Project that is paused and not rolled back cannot be retried: its pin
  would not move, so the workflow refuses it, paid by whoever must resume it
  first.
