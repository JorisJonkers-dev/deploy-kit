---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/16-dependencies.md#audit-before-enforce
rests-on: ["0003"]
---

# Render-only is v1's network-policy stage; promotion waits on the CNI

## Rests on
Rendering the policy set has value without loading it — the tree is reviewable,
diffable and complete — so v1's obligation is discharged by the render alone.
False if: a rendered-but-unloaded policy set misleads someone into believing the
estate is segmented, badly enough that not rendering would be safer. Settled by:
a full estate render whose policy set is reviewed and diffed, with the tree
stating plainly that nothing enforces it yet.

## Why
Chapter 16 sequences three stages — render-only, audit, enforce — and the audit
stage is unreachable today. `networking.k8s.io/v1` has no audit, dry-run or
log-only mode, k3s's embedded kube-router controller has none either, and a
policy is enforced the moment it selects a pod. Enforcing `data-system`'s
policies on day one cuts five live consumers off the datastore.

R11 recorded that as blocking, and it is blocking the wrong thing. What v1 owes
is the **model**: the derived allow set, the baseline rules, and a producer that
emits them ([0074](0074-networking-adapter-emits-policy.md)). Loading the result
into a cluster is delivery and rollout, and the exit criterion for the first
stage is already written down: the CNI decision lands
([0036](0036-cni-selection.md)). So the render is not waiting on the CNI; the
promotion is.

Saying so explicitly matters because the alternative readings are both bad. Making
v1 depend on a CNI lab evaluation puts a hardware-and-experiment task on the
critical path of a model, which is what [0059](0059-v1-scope-stopping-rule.md)'s
stopping rule exists to prevent. And emitting policies with a selector that
matches nothing — a tree that looks complete — would mean the audit stage
compares observed flows against objects that were never in force, which is worse
than an empty namespace: it is a policy that lies.

The honest cost is stated rather than mitigated: for the length of the
render-only stage the estate is segmented on paper and open east-west in fact.
That was already true before this decision. What changes is that the gap is a
recorded stage with an exit criterion instead of an unnumbered gap row.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Block v1 on 0036 | Default-deny is real rather than rendered when v1 ships | Puts a CNI lab evaluation on a model's critical path, which 0059's stopping rule refuses |
| Emit policies selecting nothing until promoted | The tree looks complete from day one | A policy that selects nothing is a policy that lies, and the audit diff would be against objects never in force |
| Ship enforcing, per namespace, starting with an empty one | Real enforcement, incrementally | The first non-empty namespace is `data-system`, whose five consumers are exactly what an audit stage exists to discover safely |

## Reversibility
Undo cost today: none — this decides which stage v1 is in, and the stages are
already specified. Becomes irreversible once: never; promotion is the intended
next step, not a reversal.

## Consequences
- R11 leaves the blocking set: the render is complete and the policy set is
  reviewable, and an unpicked CNI stops holding up a model decision — paid by
  nobody.
- The estate stays open east-west until promotion, and the model now says so in
  the stage table rather than in a gap list — paid in honesty, and it is
  unchanged from today in fact.
- 0036 becomes the single gate on promotion, so the CNI decision inherits a
  clear consumer: the audit stage and its zero-undeclared-flows-over-14-days
  criterion — paid by whoever runs that evaluation.
- A reader of the rendered tree could mistake rendered policy for enforced
  policy, so the stage has to be visible where the tree is read, not only in the
  chapter — paid in one line of the rendered README.
