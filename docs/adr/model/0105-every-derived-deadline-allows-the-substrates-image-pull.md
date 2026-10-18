---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-18
normative: spec/v1/14-platform-intent.md#substrate-facts
rests-on: ["0004", "0005"]
---

# Every derived deadline allows the substrate's image pull, which the Platform document states once

A Process's progress deadline, a `prepare` Process's run deadline, and with
them the Release Gate's, each add the substrate's `imagePull` to what the
Process's own `startupBudget` derives. `imagePull` is how long an image pull
takes on the slowest node a pod may land on. The Platform document states it,
measured. A substrate that states none allows nothing for a pull.

## Rests on

How long a node takes to pull an image is the same for every Process that
lands there, and no project can know it, so it is the platform's
([0004](0004-contention-decides-authority.md)). Every deadline already derives
from what the Process declares, so this is one more input to that derivation,
not a value any Process restates
([0005](0005-derivation-is-total.md)).

**False if:** a rollout on the slowest node reports `ProgressDeadlineExceeded`
while its pod becomes Ready inside the deadline the derivation gave it.
**Settled by:** a first rollout of a new revision on a Pi that the estate's
`imagePull` covers, measured against the kubelet's `Successfully pulled image
... in` events.

## Why

**The budget covers the start, and the deadline also covers the pull.** A
`startupBudget` is what the Process needs once its container runs. The
Deployment's deadline starts counting before the image is on the node. On
2026-10-14 the Release Gate's 30-second deadline met a 94-second pull on
`enschede-pi-1`, and `apps-delivery` failed as stalled while its pod came up
Ready a moment later
([#422](https://github.com/JorisJonkers-dev/deploy-kit/issues/422)). Every
first rollout on a slow node read the same way.

**One number, measured, beats a margin per Process.** The pull depends on the
node and the registry, not on the Process. A Process author raising their
budget to cover it would falsify the one input the startup probe also reads,
and the hatch for exactly that was closed
([Why the hatch closed](../../../spec/v1/20-resolved-deployment.md#why-the-hatch-closed)).

**On top, not multiplied.** The pull happens once per start, so three budgets
plus one pull, not three of each.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A larger multiplier on `startupBudget` | no new field | a fast Process with a big image still fails, and a slow one with a small image waits far too long |
| An allowance per disk medium, from the eligible nodes | precise per Process | a table nobody has measured per medium yet, and the slowest eligible node decides it anyway |
| Keep every Process off `sdcard` nodes | no deadline change | the Pis would run almost nothing until their disks are replaced |
| Let each Process declare its own pull time | local control | a fact about the node, written once per Process and wrong the moment the node changes |

## Reversibility

Undo cost today: one optional substrate field and one term in the deadline
derivation: an hour. Becomes costly once: an estate's rollouts rely on it, and
dropping it brings back the failed first rollout on every slow node.

## Consequences

- Stating `imagePull` changes every Application's revision, since every
  deadline moves. The next composition releases each Application once.
- An estate whose nodes are all fast states a small value or none.
- A slower node or a larger image is fixed by measuring again and raising the
  one value, never by a Process's budget.
