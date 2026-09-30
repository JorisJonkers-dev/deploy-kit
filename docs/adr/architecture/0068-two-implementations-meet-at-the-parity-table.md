---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: docs/architecture.md#the-parity-contract
rests-on: ["0003", "0006"]
---

# Two hand-written implementations meet at the oracles the parity table lists, each tree keeps its own rule for generated files, and constraint parity is checked by code

The TypeScript production implementation and the model-driven implementation
under `emf/` are both written by hand. Neither is generated from the other, and
neither is tested against the other. Each is tested on its own against the
committed oracle files the table in
[`docs/architecture.md#the-parity-contract`](../../architecture.md#the-parity-contract)
lists, with the implementation each binds; `resolved.json` binds the production
implementation only. An oracle file is reviewed by hand and never written by CI;
a tool may write a candidate. A generated file in the root tree is committed and
diff-checked in CI; the model-driven tree generates its Java and Xtext sources at
build time and commits neither. Constraint parity is a derived check: a test
lists every specification code three ways (the Complete OCL invariant named by
it, the TypeScript check named by it, the refusal fixture whose diagnostics name
it) and fails on any gap. A behaviour row that proves a production-only oracle is
marked production-only and needs no model-driven witness.

## Rests on

The layer boundaries give points where a run's state is a complete document
([0003](../model/0003-three-model-pipeline.md)), and pinned inputs make each a
function of the input ([0006](../model/0006-pinned-inputs.md)), so two
independent implementations can be held equal through committed files without
running beside each other.

**False if:** the two disagree on a case every oracle binding both covers and no
oracle fails, or a constraint is enforced by one implementation and caught by no
check. **Settled by:** both implementations green against every oracle the table
marks as binding both, and the code parity test failing on today's gap:
`E_UNKNOWN_ENV_SCOPE` has a TypeScript check and no invariant or fixture.

## Why

**The course requires a second implementation.** The graded work uses Ecore,
Xtext, OCL, QVT-Operational and Acceleo, and grades the modelling artifacts as
authored work, so neither side may be generated from the other. Two
hand-written implementations can drift, so equality is proven.

**Oracles name the side that is wrong.** A diff between two runs never does. A
committed canonical copy at each boundary lets each suite run alone.

**The table is the contract.** A record that restated the oracle list went stale
when `resolved.json` became production-only and `effective.json` was added.
Pointing at the table keeps one list.

**Generated files follow their tree.** A derived file that is not committed is
invisible to review; one committed but unchecked drifts. The model-driven build
regenerates its Java from the metamodel on every build, where a committed copy
would be a second, staler one
([0073](../../../emf/docs/adr/emf/0073-source-and-target-metamodels-are-hand-written.md)).

**Names are the key for constraint parity.** The OCL names every invariant after
its code, and the TypeScript checks are one function per code with the same
name, so the three-way comparison needs no hand-kept ledger of constraints.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Generate one implementation from the other | no structural parity tests | the course grades both as authored work, and a generated side cannot fail on its own |
| Diff the two implementations' outputs in CI | no committed intermediate files | a red diff does not say which side is wrong |
| Only the rendered tree as oracle | uses what exists | a resolution bug and a rendering bug look the same |
| A hand-written `CONS-NNN` constraint ledger | a readable register with stable ids | a third ledger duplicating what the names already say |
| Let CI refresh oracle files | no hand edits | an implementation becomes its own oracle |

## Reversibility

Undo cost today: the parity test and a ledger marker: an hour. Becomes
irreversible once: the model-driven implementation is deleted at its sunset,
when this record's two-implementation half goes with it
([0071](../../../emf/docs/adr/emf/0071-emf-is-coursework-scoped-and-self-contained.md)).

## Consequences

- An oracle file changes in the pull request that changes the behaviour it
  records, and both implementations go red until both are fixed.
- The behaviour ledger gains a production-only marker, and the model-driven
  witness check skips rows carrying it.
- The constraint parity test is to be written, owned by joris, and fails first
  on `E_UNKNOWN_ENV_SCOPE`.
