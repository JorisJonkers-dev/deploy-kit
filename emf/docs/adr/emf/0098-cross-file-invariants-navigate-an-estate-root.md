---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-09
normative: docs/architecture.md#constraints
rests-on: ["0070"]
---

# Cross-file invariants navigate an Estate root that contains every document of a set, instead of reading the resource set through `allInstances()`

The documents of a set are read into one **Estate** root object that contains
every Project, the Platform document and the Infrastructure document. An
invariant over more than one document is written in the context of `Estate`
and navigates containment; no invariant calls `allInstances()`. An invariant
over one document stays on that document's own classes. The section that
states it is [the constraints chapter](../../architecture.md#constraints).

## Rests on

The v1 model is expressible in the EMF toolchain without changing the model
([0070](0070-the-model-is-expressible-in-the-emf-toolchain.md)), and the
specification already composes every document into one union before checking
what they break together
([chapter 40](../../../../spec/v1/40-composition.md#the-estate-wide-invariants)),
so a root that holds the union is the model's own shape, not an artefact of
OCL.

**False if:** an invariant over the composed documents cannot be written by
navigation from an `Estate`, or the refusals the cross-file invariants produce
change when they move onto it. **Settled by:** every invariant that reads
`allInstances()` today rewritten in the context of `Estate`, with the refused
fixtures' diagnostics byte-identical before and after, tracked on
[#324](https://github.com/JorisJonkers-dev/deploy-kit/issues/324).

## Why

**The course review named the cost.** The Task 1 feedback recorded that
cross-file constraints "require EMF allInstances() scans with explicit safety
guards, introducing performance and evaluation complexity when files are
loaded individually". The guards exist because `allInstances()` ranges over
whatever resource set a document happened to be read into: an invariant over
the set holds trivially over a document read alone, so the pipeline reads each
file alone first and the set together second, and an invariant's meaning
depends on which reading is running.

**A root makes the scope a value, not a circumstance.** Navigating from
`Estate` reaches exactly the documents the set contains, read once; there is no
second reading, no trivially true pass, and nothing whose extent depends on the
resource set. It is also how chapter 40 already describes the check: the
estate-wide invariants hold over the composed union, which is an object.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep `allInstances()` with its guards and document the cost | nothing to change | the two readings and the trivially true pass stay, and an invariant's meaning still depends on its resource set |
| Move cross-file checks out of OCL into Java or QVT | full control over evaluation | the constraints stop being Complete OCL named by code ([0074](0074-constraints-are-complete-ocl-named-by-code.md)) |
| Cross-document references resolved as EReferences, still evaluated per document | no root class | a reference does not bound the scope of a quantifier over every Project |

## Reversibility

Undo cost today: nothing implements it yet; this record. Becomes irreversible
once: the invariants are written against `Estate` and the two-reading pipeline
is removed.

## Consequences

- The metamodel gains one root class, and every cross-file invariant moves
  onto it, paid once in [#324](https://github.com/JorisJonkers-dev/deploy-kit/issues/324).
- The pipeline reads a set once, so a refusal over a single document and one
  over the set come from the same pass.
- Until #324 lands, the invariants read the set through `allInstances()` as
  the constraints chapter records.
