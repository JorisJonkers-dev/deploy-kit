---
tier: decision
status: proposed
claim: settled
date: 2026-09-21
normative: spec/v1/10-project-intent.md#the-effective-intent
rests-on: ["0003", "0005"]
---

# Shared intent is lowered onto the Process by a model-to-model step, and the Effective Intent is the only shape anything downstream reads

A declaration at the Project or an Application belongs to every Process below it
([0124](0124-shared-intent-descends-to-the-process.md)). That descent is a
**lowering**: one model-to-model step, inside layer 1, from the authored Project
Intent to the **Effective Intent**, in which the shared declarations sit on the
Processes that hold them and the Project and the Application hold only what
defines them.

The Effective Intent is a shape, not a second document: nobody authors it and
nothing publishes it. Every later stage (composition, the derivations of chapter
16, resolution into layer 2) reads it and never the authored shape, so no
derivation ever unions levels for itself.

## Rests on

Layer 1 is authored and layer 2 is derived, with the middle layer as the
contract between them ([0003](0003-three-model-pipeline.md)); the lowering sits
wholly inside layer 1 and changes nothing about that boundary. Derivation is
total ([0005](0005-derivation-is-total.md)), which is the property this step
protects: a derivation that had to union three levels itself would be total only
where its author remembered to. The step is therefore invisible to everything it
feeds: the Deliverables rendered from a lowered estate are the Deliverables
rendered from the same estate written with every declaration on its Process.

**False if:** lowering changes any rendered Deliverable, or any stage downstream
of it still reads an authored level. **Settled by:** render the worked estate
twice, once from the documents as authored and once from the same documents with
every shared declaration hand-copied onto its Processes, and diff the two
`rendered/` trees; the decision falls if a byte differs. The second half is a
grep: `secrets`, `dependsOn`, `assets`, `writablePaths`, `placement`, `cutover`
and `startupBudget` may appear in no derivation's source outside the lowering.

## Why

The union has to happen somewhere, and every other place it could happen makes
it happen many times. `spec/v1/16-dependencies.md` derives a NetworkPolicy from
a Process's edges, a Vault policy from its grants, an env projection from its
files and a nodeSelector from its placement. Under
[0124](0124-shared-intent-descends-to-the-process.md) each of those four
derivations would have to walk up to the Application and the Project first, and each
would be one forgotten walk away from a Process that silently lost a
declaration. That is not a hypothetical failure mode in this estate: the
`serviceAccountName()` defect recorded in
[0022](0022-grants-live-on-the-application.md), superseded by
[0124](0124-shared-intent-descends-to-the-process.md), was exactly a derivation
reading the wrong level, and nothing noticed because the level was documentation rather
than a shape.

**A step, rather than an accessor.** An `effectiveGrants()` helper would union
the levels on demand and the authored shape would stay the only model, which is
cheaper and gives up the property that matters: with a step, the Process class
in the Effective Intent *cannot* be read at the wrong level, because the wrong
level is not in it. The duplication refusal of
[0124](0124-shared-intent-descends-to-the-process.md) also wants one evaluation
site: computed in an accessor it fires once per caller, at whichever pointer the
caller happened to be at.

**Where it sits.** Before composition, because composition's invariants
(`E_DUPLICATE_PROCESS_NAME`, `E_ROLL_AFFECTS_OTHER_READERS`, chapter 40) are
about what Processes hold, and a reader set computed over authored levels
under-reports. After parsing and after the document's own constraints, because a
duplication diagnostic has to point at the two declarations the author wrote,
which only the authored shape still has.

**Both implementations do it as a transformation, and neither generates the
other's** ([0105](../architecture/0105-two-implementations-meet-at-committed-oracles.md)).
Under `emf/` it is a QVT-Operational transformation beside the one that derives
the Resolved Deployment, which is what makes the lowering visible as a model
transformation rather than as a loop
([`emf/docs/architecture.md#transformation`](../../../emf/docs/architecture.md#transformation)).
In the TypeScript implementation it is a use case over the domain model. The two
meet where every other stage does, at a committed oracle file.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| An `effective*()` accessor per family, authored shape only | four derivations in chapter 16 each walk the containment chain themselves, and a fifth added later is one forgotten walk from dropping a declaration; duplication checks fire once per caller | the defect this repeats is already in the record: a derivation that read the wrong level, silently ([0022](0022-grants-live-on-the-application.md), superseded by [0124](0124-shared-intent-descends-to-the-process.md)) |
| Lower during resolution, as part of deriving layer 2 | the union becomes part of a step that also decides mechanisms, so a shared-intent bug and a derivation bug are the same change; composition still sees authored levels and still under-reports reader sets | the union is a layer-1 fact and resolution is where layer 2 is decided; mixing them costs the boundary [0003](0003-three-model-pipeline.md) exists for |
| Lower in the parser, so only the effective shape ever exists | a duplication diagnostic has nothing to point at, because the two declarations the author wrote are gone by the time anything checks | a diagnostic whose pointer is the merged value is a diagnostic an author cannot act on |
| Publish the Effective Intent as a second authored document | a generated file in the project repository, reviewed as though authored, drifting from the file it came from | nobody authors it; a shape that exists only between two steps needs no file |

## Reversibility

Undo cost today: the step is one transformation and one pair of classes that
differ from the authored ones only by what they do not carry, so replacing it
with accessors is deleting the step and adding a union at each of chapter 16's
derivation sites: a day, and the oracle files do not move, because the authored
documents and the rendered trees are both unchanged by where the union happens.
Becomes irreversible once: a stage downstream of the lowering is written against
the Effective Intent and relies on a Process being complete, at which point the
union has to exist before that stage whatever it is called.

## Consequences

- No derivation anywhere downstream unions levels, so a family added to Shared Intent later reaches every derivation without touching one of them, paid by the lowering, which grows one mapping per family.
- The Effective Intent is a shape nothing publishes, so it has no schema version and no digest, and the pinned-input chain runs from the authored documents ([0006](0006-pinned-inputs.md)), paid by anyone reading a trace, who sees a step with no artefact.
- A duplicate is refused before the lowering and never during it, so the lowering itself is total and needs no error path, paid by the constraint set, which carries the refusal instead.
- Two implementations each carry a lowering, and a divergence between them shows up only where a committed oracle covers it, paid by the parity contract, which gains the lowered shape as a compared artefact.
- The Process class of the Effective Intent requires what the authored Process may omit (`placement`, `cutover`), so the two shapes differ in multiplicity and not only in what they carry, paid by the metamodel, which spells the requirement twice.
