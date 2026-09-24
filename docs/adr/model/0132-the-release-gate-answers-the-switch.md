---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-24
normative: spec/v1/55-delivery.md#the-release-gate
rests-on: ["0001", "0005"]
---

# A first-party Release Gate answers the switch from layer-2 data, holds every member at a barrier, and fails closed

The switch of a `blue-green` Application is performed by Flagger and decided by
a first-party **Release Gate**. The gate answers the two questions a Canary
asks: may this member's new version start, and may it be promoted. It answers
from the Application's release-gate inputs in the Resolved Deployment, holds
every member at a barrier until all have passed their analysis, and answers no
whenever it cannot answer. The delivery machinery, Flux, Flagger, the gate and
the edge proxies, is listed in the Platform document and never gated. Analysis
cadence is the platform's; the checks derive from each member's Runtime
Profile. The mechanics are [chapter 55](../../../spec/v1/55-delivery.md#the-release-gate)'s.

This supersedes [0071](0071-release-gate-inputs-are-layer-2.md), which derived
the gate's inputs into layer 2 and rendered nothing for them. The inputs stay in
layer 2, and gain the analysis each member is checked on; what changes is that
a controller now reads them, and a Canary per member is rendered to ask it.

## Rests on

The derivation is total ([0005](0005-derivation-is-total.md)): which Processes
are members, what each is analysed on, how long the unit waits and whether an
Application is gated at all follow from declarations already in layer 1 and the
Platform document. The estate is one maintainer on one cluster
([0001](0001-estate-scale-and-ownership.md)), so one small controller the
maintainer writes is cheaper than a service mesh or a multi-cluster
orchestrator.

**False if:** a `blue-green` Application's member receives new-version traffic
before every member has passed its analysis, or a release proceeds while the
gate is unreachable. **Settled by:** release `auth` with `auth-ui`'s analysis
forced to fail and observe that `auth-api` is never promoted; then stop the gate
mid-release and observe every Canary waiting.

## Why

**Flagger switches; nothing in it holds a unit.** Flagger's blue/green runs one
Canary per Deployment, and a dependency between Canaries is not a feature it
has. Its webhooks are where one plugs in: `confirm-rollout` before a Canary
scales up, and `confirm-promotion` before it is promoted. The Release Unit rule
needs exactly those two answers.

**From data, not from scripts.** The alternative that works today is a
loadtester running rendered `kubectl` and `jq`. That is executable code inside a
Deliverable, which [0012](0012-assets-not-code.md) forbids in spirit, and it
reads live objects to decide what the Resolved Deployment already says. A
controller reading the projection keeps the decision in the model.

**Staggered, not simultaneous.** Promotion copies each Canary's spec onto its
primary, member by member. No mechanism moves the traffic between an
Application's Processes at one instant, because that traffic crosses their own
Services, so the rule the model can keep is the barrier: no member promoted
until all have passed. The members tolerate one version of skew for the seconds
the promotions take.

**Fail closed.** A gate that lets releases through while it is down is a gate
that fails exactly when it is needed.

**The machinery is not gated.** A gate cannot gate its own release, and an edge
proxy bound to a host port cannot run two copies. Listing them in the Platform
document keeps the exception explicit and derived rather than a Process-level
opt-out.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep 0071: inputs in layer 2, nothing reads them | no controller to write | the Release Unit rule stays a promise; members roll independently |
| Loadtester scripts rendered into each Canary | ships today, as Blueshell does | executable code in a Deliverable, and a decision read from live objects instead of the model |
| An edge-level atomic flip through the Gateway API | one flip at the edge | only north-south traffic moves; Process-to-Process traffic still staggers, and the Tier adapter is rewritten |
| Fail open | releases continue during a gate outage | the barrier and the migration check silently lapse exactly then |

## Reversibility

Undo cost today: supersede this record, delete the gate's inputs' analysis
field, and render no Canary, a day. Becomes expensive once every continuous
Application releases through the gate: going back means every Application rolls
independently again.

## Consequences

- The estate runs a controller of its own, in its own repository, paid by joris
  ([#148](https://github.com/JorisJonkers-dev/deploy-kit/issues/148)).
- A gate outage stops every release, paid by whoever is releasing, and visible
  as an alert rather than as a silent pass.
- Surface-less workers switch blue/green too and consume real work while
  analysed, paid by their authors, who keep them idempotent.
- The Platform document gains a `delivery` block, paid once by the platform.
