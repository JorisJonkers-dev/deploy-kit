---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/10-project-intent.md#shared-intent
rests-on: ["0001", "0003", "0005", "0008"]
---

# What a Process holds may be declared at Project, Application or Process, and one lowering step puts it on the Process

Eight things a Process holds are **Shared Intent**: `secrets`, `env`,
`dependsOn`, `assets`, `writablePaths`, `placement`, `cutover` and
`startupBudget`. Each may be written at the Project header, on an Application or
on a Process, and a declaration at one level belongs to every Process below it.
Lists extend each other; where two levels declare the same thing, the lowest
declaration holds; restating the same thing identically at two levels is
refused. There is no removal syntax.

The descent is a **lowering**: one model-to-model step inside layer 1, from the
authored Project Intent to the **Effective Intent**, in which the shared
declarations sit on the Processes that hold them. Every later stage reads the
Effective Intent and never the authored levels. The chapter's
[Effective Intent section](../../../spec/v1/10-project-intent.md#the-effective-intent)
states the shape.

## Rests on

A Process's effective declaration of every family is computable from the
project file alone: all three levels are in that file, and each family's
identity is a function of what the author wrote, a grant's being its derived
read path ([0008](0008-vault-read-is-per-path.md)). One maintainer authors every
file ([0001](0001-estate-scale-and-ownership.md)), so the cost this removes is
duplication nobody else reviews. The lowering sits wholly inside layer 1
([0003](0003-three-model-pipeline.md)) and protects totality
([0005](0005-derivation-is-total.md)): a derivation that unioned levels itself
would be total only where its author remembered to.

**False if:** a Process's effective set needs a value the project file does not
hold, lowering changes a rendered Deliverable, or a stage downstream of the
lowering reads an authored level. **Settled by:** the Effective Intent oracle
(`expected/effective.json`) of each worked example, a render of the worked
estate from the documents as authored and from the same documents with every
shared declaration hand-copied onto its Processes, diffed byte for byte, and a
grep: none of the eight family names appears in a derivation's source outside
the lowering.

## Why

**The duplication was real.** Ten `OTEL_*` variables are byte-identical across
three Processes; `arch` and `site` describe where a product runs and were
restated per Process; `cutover` is the Application's own release question
answered by hand for each member; a CA bundle for a whole project was one Asset
written many times.

**Merge, lowest wins, identical refused.** Merging is what makes sharing worth
having: `knowledge`'s two Processes hold six grants, two in common. Refusing
the identical restatement keeps the effective set readable by reading: a lower
declaration always differs, visibly, from what it replaces. A Process that must
not hold a shared declaration is evidence it was never shared, and it moves
down a level.

**Placement is shared; a quantity is not.** `arch`, `site`, `disk`, `gpu` and
`capabilities` describe the node a pod needs. `memory` and `cpu` are summed per
container across a Process and its sidecars
([0017](0017-placement-is-hard-dimensions.md)), so they are refused above the
Process and required on it. A `cutover` shared from above does not reach a
`prepare` Process, which serves nothing
([0027](0027-prepare-processes-are-forward-only-setup.md)).

**Levels are an access boundary only for `secrets`, and only because identity
is per Process** ([0031](0031-identity-per-process.md)). A project-level grant
reaches three principals because three Processes hold it; there is no project
ServiceAccount and no project Vault role. `E_ROLL_AFFECTS_OTHER_READERS`
computes over the readers of a path whatever level granted it.

**A step, not an accessor.** An `effectiveGrants()` helper would union levels on
demand, once per caller, and the next derivation would be one forgotten walk
away from a Process that silently lost a declaration. With a step, the
Effective Intent's Process cannot be read at the wrong level, because the wrong
level is not in it, and the duplicate refusal has one evaluation site. The step
runs after the document's own constraints, so a duplicate points at the two
declarations the author wrote, and before composition, whose invariants are
about what Processes hold.

**This is not an override.** A lower level is the same authored field, written
where it belongs. Nothing here restates a derived value; `replicas` stays the
sole local exception ([0022](0022-a-derived-value-has-one-declaring-site.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| `secrets` alone, at two levels | every other family stays duplicated per Process | the argument for sharing was never about secrets |
| Refuse every declaration a level above already made | nothing may be shared unless every Process holds an identical set | refuses the merge the rule exists for |
| Merge and accept identical restatements silently | a restating block reads exactly like a replacing one | the one case a reader cannot tell by looking |
| A removal or subtract syntax | exceptions accumulate; the effective set can only be computed | an exception is evidence the thing was never shared |
| An `effective*()` accessor per family | each derivation walks the levels itself | a derivation reading the wrong level silently is the defect this prevents |
| Lower during resolution | a shared-intent bug and a derivation bug are the same change | the union is a layer-1 fact |
| Lower in the parser | a duplicate has nothing to point at | an author cannot act on a pointer into a merged value |

## Reversibility

Undo cost today: collapsing to Process-only is a schema edit and a mechanical
rewrite the lowering already computes: hours. Becomes irreversible once: Vault
policies are cut per Process from project-level grants and live credentials
exist under paths only some Processes hold.

## Consequences

- A shared declaration reaches every Process below it, including ones added
  later, so adding a Process silently widens what it holds unless the author
  moves the declaration down, paid by the project author and, for `secrets`, by
  every other reader of the path.
- A family added to Shared Intent later reaches every derivation without
  touching one, paid by the lowering, which grows one mapping per family.
- The Effective Intent has no schema version and no digest; the pinned-input
  chain runs from the authored documents ([0006](0006-pinned-inputs.md)).
- Both implementations carry a lowering, held equal by the Effective Intent
  oracle ([0068](../architecture/0068-two-implementations-meet-at-the-parity-table.md)).
