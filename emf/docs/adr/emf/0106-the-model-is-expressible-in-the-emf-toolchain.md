---
tier: premise
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#scope-and-sunset
---

# The v1 model is expressible in the EMF toolchain without changing the model

## Rests on
Every structure, constraint, derivation and rendered byte `spec/v1` defines can
be carried by Ecore, Complete OCL, an Xtext grammar, a QVT-Operational
transformation and Acceleo templates, so the second implementation needs no
change to `spec/v1` and no field the TypeScript compiler lacks. False if: a
parity case can only be made green by editing a chapter, an oracle file, or
the parity contract to suit a tool. Settled by: the `emf` job green on every
parity case under `spec/v1/examples/` with `git diff --stat spec/v1
docs/architecture.md` over the whole `emf/` history touching only oracle files
both implementations were already failing.

## Why
Every decision in this domain assumes the course's toolchain can carry the
model as it stands. If it cannot, the choice is between bending the model to a
tool that will be deleted and failing a parity case on purpose, and that choice
has to be visible rather than made quietly in a template. The claim is open
because nothing has been built: the likeliest counterexamples are the YAML
subset Xtext has to parse, byte-exact output from Acceleo, and derivations over
the whole composed union in QVTo.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Assume it and say nothing | No premise to maintain | A model change made to suit a coursework tool would look like a model decision |
| Allow the EMF side a documented subset of the model | Less work in October | The course project is graded on the whole pipeline, and a subset makes parity a claim about part of the model |

## Reversibility
Undo cost today: deleting this file. Becomes irreversible once: never; the
premise describes a test, and a counterexample is recorded as a gap, not built
around.

## Consequences
- A counterexample is written into this file as evidence and raised as a model
  question in its own pull request, never absorbed into `emf/`. Paid by whoever
  finds it, in one issue.
- The model stays tool-neutral: nothing in `spec/v1` depends on Ecore, Eclipse
  OCL, Xtext, QVTo or Acceleo. The Essential OCL statements in the chapters'
  rule tables are OMG notation, not tool input, and the Complete OCL invariants
  under `emf/` are held to them. Paid by nobody while this holds.
