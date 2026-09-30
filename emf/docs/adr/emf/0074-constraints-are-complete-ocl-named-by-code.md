---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#constraints
rests-on: ["0070"]
---

# Constraints are Complete OCL invariants named by the diagnostic code they emit

The same Complete OCL constraints also run in the Xtext-generated editor,
which marks each violation while a source file is edited. Diagnostics in the
build keep the code and JSON Pointer contract; the editor shows the code as
the message.

## Rests on
Resting on [0070](0070-the-model-is-expressible-in-the-emf-toolchain.md), the
claim is that every constraint the specification defines is expressible as an
OCL invariant evaluated standalone, and that each refused case yields the same
set of `(code, path)` pairs from OCL as from Zod. False if: a constraint
needs Java code outside OCL, or the containment chain cannot produce the JSON
Pointer the TypeScript side reports. Settled by: every refused case's
diagnostics parity green in `emf/tests/parity`, and the constraint parity test
finding an invariant for every code a TypeScript check emits
([0068](../../../../docs/adr/architecture/0068-two-implementations-meet-at-the-parity-table.md)).

## Why
OCL is the course's constraint language, and the TypeScript side's constraints
are checks named by the same codes. The two are held together by that naming
and by committed diagnostics, not by translation.

Complete OCL files sit beside the metamodel rather than inside it, which keeps
structure and rules apart the way the wire schemas and the domain invariants
are apart in `src/`. Naming each invariant by its code makes the mapping from a
failed invariant to a diagnostic a name read, not a table to keep in step.

The path is part of the contract, so it is computed, not described: the
containment chain gives each containing feature and index, which is what a
JSON Pointer into the canonical intent document is.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| OCLinEcore annotations inside the `.ecore` | One file per layer | Mixes structure and rules in the file the descriptor exporter reads |
| Java validators via EMF's validation framework | No OCL learning curve | The course grades OCL, and Java validators duplicate the TypeScript code in a third form |
| Compare codes only, not paths | No path computation | A diagnostic at the wrong object would pass |

## Reversibility
Undo cost today: nothing exists. Becomes irreversible once: never; deleted with
`emf/`.

## Consequences
- Every new constraint is a ledger row, a Zod check, an OCL invariant and a
  refused fixture in one pull request. Paid by its author.
- OCL evaluation order is unspecified, so diagnostics compare as a set, never a
  list. Paid by nobody; it is the contract.
