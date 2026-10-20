---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-20
normative: spec/v1/55-delivery.md#release-order
rests-on: ["0003", "0005"]
---

# A gated member starts only after the stop-start Processes it requires in its own Project have started

A `blue-green` member's new version may start only once every Process it
reaches through a `required` edge in its own Project, and that switches
`stop-start`, has started the version its Deployment holds. The Release Gate
answers that in its first question, from Processes the member's release-gate
inputs name. Nothing else between the Applications of one Project is ordered.

## Rests on

The order follows from edges already declared, so no project authors it
([0005](0005-derivation-is-total.md)). Layer 2 carries what the gate reads, and
the gate decides from it, not from anything authored for it
([0003](0003-three-model-pipeline.md)).

**False if:** a release of a Project restarts a `stop-start` provider while a
`blue-green` member that requires it starts its new version, and that member's
new copy runs before the provider is available again.
**Settled by:** a release of `hindsight` in which TEI is recreated and the
api's Canary waits in `may-start` until TEI's Deployment is available.

## Why

**A Project's Applications release together, so an edge between them ordered
nothing.** Reconcile Units order Projects
([0033](0033-reconcile-unit-derived.md)), and every Application of a Project
shares one unit. Every release changes every pod template, so a dependency was
restarted at the moment the Processes that need it started. On 2026-10-17
`hindsight`'s TEI was recreated while the api's and the worker's canaries
started. Both crashed on `Failed to connect to TEI server`, and the release was
held and then rolled back
([#481](https://github.com/JorisJonkers-dev/deploy-kit/issues/481)).
`immich-server` crash-looped the same way against its own Postgres on
2026-10-18.

**The gate is already asked at exactly the right moment.** `may-start` is asked
once per member per revision, before its new version scales up, and it already
holds a member until its migration and prepare Processes complete
([0052](0052-an-application-is-the-release-unit.md)). One more condition there
orders the start without a new mechanism or a new object.

**Only a `stop-start` provider leaves a gap.** A `blue-green` provider keeps its
old version serving while its new one is analysed, so no consumer ever starts
without one. Waiting for it could deadlock too: its promotion waits on its own
barrier, which can wait on the consumer. A `stop-start` provider asks no gate,
so a wait for it cannot be part of a cycle.

**Names, never revisions.** Naming a provider's revision would make it part of
the consumer's revision, and every release of the provider would release the
consumer. The gate reads the provider's Deployment instead, when it is asked.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One Reconcile Unit per Application, ordered by its edges | ordering for every switchover, inside a Project and across one | splits every Project's pin, artifact and Kustomization, rewrites [0033](0033-reconcile-unit-derived.md), and Flux's health check still cannot tell a `blue-green` provider's analysis from a stall |
| A startup gate: an init container per required edge that waits for the provider's surface | every switchover covered, no gate change | a platform-declared image in every consuming pod, and it waits for a surface that answers, not for the provider's current version |
| Order nothing, and require a Process to tolerate its dependencies restarting | no change but the chapter | every Process carries its own wait, as `hindsight` had to ([hindsight#6](https://github.com/JorisJonkers-dev/hindsight/pull/6)), and one that does not crash-loops a release |
| Also wait for `blue-green` providers | one rule for every provider | a deadlock through two barriers, for a gap that does not exist |

## Reversibility

Undo cost today: one optional field on a gate member and one condition in the
gate: an hour. Becomes costly once: Processes drop their own waits because the
gate orders their start.

## Consequences

- An Application whose members gain or lose a provider this way changes its
  revision once, since the field is part of its element.
- A provider that never becomes available holds its consumer's release: the gate
  answers no, and the consumer's old version keeps serving.
- A `stop-start` consumer is still started when Flux applies it, and a provider
  restarted after a member started is still the member's to tolerate.
- An older Release Gate ignores the field and orders nothing, as before.
