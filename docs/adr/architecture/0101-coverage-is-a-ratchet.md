---
tier: decision
status: proposed
claim: settled
date: 2026-09-11
normative: docs/architecture.md#gates
rests-on: ["0001"]
---

# Coverage is a ratchet: the thresholds sit on what the suite reaches, and only rise

## Rests on
The coverage the suite reaches is a deterministic function of the tree, so a
threshold set at it fails only when a change lowers it. False if: two runs of
one commit report different totals, which would make a threshold with no slack
flaky. Settled by: two consecutive `npm run test:coverage` runs on one commit
reporting identical totals.

## Why
The floor this repository had, 80% of lines and 70% of branches over the
scripts, was chosen before anything was measured, and the suite sat well above
it. A floor below reality protects nothing: a change can delete a test, or add
an untested module, and stay green, because the slack absorbs it.
[Chapter 30](../../../spec/v1/30-deliverables.md#adapters) records where that
ends: 1,967 lines of dead renderer inside a `--lines 90` gate. Reachability
([0069](0069-boundaries-enforced-on-the-graph.md)) is one half of the answer,
and a threshold with no slack is the other.

A threshold that describes the suite can only be defended upward. Lowering it
becomes a visible line in a diff, argued in the pull request that needs it,
instead of slack nobody decided. Raising it is the normal case: a change that
reaches more moves the threshold up to the new number in the same pull request.

The include list is explicit, so a file no test reaches counts as zero rather
than being absent from the report. Ignore comments are counted and held at
zero, because one ignore is a line of slack granted by whoever is editing.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A fixed floor below the measured number | A change never fails on coverage alone | The slack is what let dead code through before; nothing notices a deleted test |
| Per-file thresholds at 100% | The strongest-sounding bar | It forces ignore comments rather than better tests, and proves lines ran rather than that anything was asserted |
| No thresholds, coverage reported only | No build ever fails over a percentage | A number nobody enforces drifts down one pull request at a time |

## Reversibility
Undo cost today: four numbers in one file. Becomes irreversible once: never.

## Consequences
- A change that adds lines without tests fails the gate even when the lines
  are trivial, so its author writes the test or lowers the number in the open.
  Paid by the author, in the pull request.
- Coverage proves a line ran, not that a test would notice it change. Mutation
  testing is the check on this check, and until it runs over a layer, coverage
  is that layer's only signal. Paid in trust, until then.
- The one-line guard at the bottom of each gate runs only when Node starts the
  file as a script, so its branch is never covered in-process. It is counted,
  not ignored. Paid in one branch per gate.
