---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-24
normative: spec/v1/30-deliverables.md#flagger-ready-objects
rests-on: ["0005"]
---

# The render leaves Flagger's objects to Flagger, so Flux and Flagger never own the same field

For every `blue-green` Process the render carries a Canary and omits what
Flagger generates: the three Services, the replica count, and the primary. Every
selector is written on a label Flagger does not rewrite, except the disruption
budget, which selects the primary. The Canary's analysis asks the Release Gate
through webhooks and renders no metric query of its own. The rules are
[chapter 30](../../../spec/v1/30-deliverables.md#flagger-ready-objects)'s, and
what Flagger generates is
[chapter 55](../../../spec/v1/55-delivery.md#what-the-render-leaves-to-flagger)'s.

## Rests on

The derivation is total ([0005](0005-derivation-is-total.md)): the Canary, the
autoscaler and every selector follow from the switchover layer 2 records and the
Platform document's cadence. Nothing about them is authored per Application.

**False if:** Flux and Flagger both write a field of one object in a reconcile,
seen as a replica count or a Service selector flapping during a release.
**Settled by:** release `auth` and observe `auth-api-primary` keep two replicas
throughout, no drift reported on any rendered object, and the network policy
admitting traffic to the primary and the canary alike.

## Why

**Two owners of one field fight until one loses.** Flux resets what the render
says and Flagger rewrites what it manages. A rendered Service or replica count
on a Canary's target is a field both believe is theirs, and the release flaps
between them.

**Selectors on a label nothing rewrites.** Flagger renames
`app.kubernetes.io/name` on the primary, so a policy selecting it stops matching
the pods that serve the moment a release is promoted. `instance` is copied
unchanged to both copies, which is what a network policy and a pod monitor need.

**A capacity exception as an autoscaler with equal bounds.** Flagger copies an
autoscaler to the primary and scales its source to zero between releases, so a
count in the Deployment is either reset or wrong. Equal bounds keep the count a
declaration rather than a scaling policy.

**Analysis asks the gate, and renders no query.** Which metric proves a member
healthy is the Release Gate's, from the member's `checks`
([0132](0132-the-release-gate-answers-the-switch.md)). A query and a threshold
in every Canary would be a second copy of that decision per Process.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Render the Services and let Flagger adopt them | fewer generated objects | Flagger rewrites their selectors, so Flux and Flagger own the same field |
| Keep `replicas` on the Deployment | no autoscaler object | Flagger scales the source to zero and Flux scales it back |
| Flagger's built-in metrics in every Canary | no gate webhook per iteration | built-in metrics need a mesh or an ingress provider, and a threshold per Canary duplicates the gate's decision |
| Keep selecting `app.kubernetes.io/name` and add a second policy per primary | no selector change | doubles every policy, and breaks again for the canary |

## Reversibility

Undo cost today: supersede this record and render plain Deployments again, a day.
Becomes expensive once every continuous Application releases through Flagger.

## Consequences

- Each `blue-green` Process renders one more object, and one more where it
  declares `replicas`, paid by the `kubernetes` adapter.
- Every network policy selector changes label, paid once across the estate at
  adoption.
- A scraped `blue-green` Process is scraped per pod, paid by the monitoring stack
  in scrape targets.
- The Release Gate answers one webhook per analysis iteration per member, paid by
  the gate ([#148](https://github.com/JorisJonkers-dev/deploy-kit/issues/148)).
