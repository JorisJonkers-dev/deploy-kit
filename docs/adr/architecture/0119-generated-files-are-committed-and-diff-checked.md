---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#generated-files
rests-on: ["0006"]
---

# A generated file is committed and diff-checked in CI, and an oracle file is never generated

## Rests on
Resting on [0006](../model/0006-pinned-inputs.md), a generator run over the
same committed inputs produces the same bytes, so a committed copy can be
regenerated and compared. False if: a generator's output differs between two
runs over one commit. Settled by: the first generator's CI check (the JSON
Schema from #38) passing on a clean tree and failing on a hand edit.

## Why
A derived file that is not committed is invisible to review and to anything
that reads the repository without running a build. A derived file that is
committed but not checked drifts from its source the first time someone forgets
to regenerate it.

Oracle files look similar and are the opposite. They record what the model
means, reviewed by hand, and the parity contract compares two implementations
against them. If CI regenerated an oracle from either implementation, that
implementation would be tested against itself.

The claim is open because no generator exists yet; #38 brings the first.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Generate at build time, never commit | No diffs to review | Readers of the schema or the catalogue need a build, and a source change can land without anyone seeing what it produced |
| Commit without a diff check | Readable artifacts | They drift silently |
| Let CI refresh oracle files | No hand-editing | An implementation becomes its own oracle |

## Reversibility
Undo cost today: nothing exists. Becomes irreversible once: consumers read the
committed artifacts, such as editors using the JSON Schema.

## Consequences
- A change to a generator's source commits the regenerated file with it. Paid by
  its author, in one command.
- An oracle change is always a reviewed hand edit. Paid by whoever changes the
  model, and it is the point.
