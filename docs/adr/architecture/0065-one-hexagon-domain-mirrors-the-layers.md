---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: docs/architecture.md#layers
rests-on: ["0003"]
---

# One hexagon, two use-cases, and a domain whose folders are the three layers

> **Amended 2026-09-08.** Still two use-cases, one core — but `publish` no
> longer renders anything. A repository validates its Intent Fragment and pushes
> it by digest; every adapter runs in `compose`
> ([0098](../model/0098-one-publication-path.md)). The role-flag evidence below
> is the state the decision was taken in.

## Rests on
Every module the compiler needs is assignable to exactly one of seven rings, and
the two runtimes the model describes are two use-cases over one core rather than
two programs. False if: a module has to import outward to do its job, or the
publish-time and central runs need different domain rules rather than different
inputs. Settled by: `npm run lint:boundaries` passing over the full compiler
with no rule relaxed and no exception list.

## Why
The model already names the layers, and the code that renders it kept its own
unrelated shape. The generation being replaced put resolution inside the
renderer, and the estate paid for it in vocabulary: three mutually incompatible
documents all claiming `deployment.jorisjonkers.dev/v2`, with no word for which
one was wrong ([0003](../model/0003-three-layer-meta-model.md)). Naming the
folders after the layers is not decoration. It means a reviewer reading
[chapter 20](../../../spec/v1/20-resolved-deployment.md) and a reviewer reading
`src/domain/resolved/` are looking at the same thing, and a rule that lands in
the wrong ring is visible as a wrong import rather than as a wrong idea.

The two runtimes in [chapter 30](../../../spec/v1/30-deliverables.md#adapters) —
five fragment producers in the Service repository, eleven central adapters over
the union — are the reason to be careful here. They differ in *what documents
they receive*, not in what a Service means. One core with two use-cases keeps
the invariants in one place; two applications would put them in a third package
that both import and neither owns.

Type names come from [`CONTEXT.md`](../../../CONTEXT.md) unchanged, which is
what makes the mapping legible in both directions: `Service`, `Workload`,
`IntentFragment`, `ResolvedDeployment`, `Deliverable`, `Adapter`,
`ReconcileUnit`.

The alternative that looks cheapest is a role flag, and the tree already shows
what it costs. Today's registry decides which of three input shapes an adapter
receives with one string comparison, `adapter.input === "canonical-artifacts"`,
and the five `deployment-fragment` adapters match no branch of their own — they
fall through and are handed the wrong document. A role that lives in a string
is a role the type system cannot check.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Two hexagons with a shared kernel | Three packages to version and publish; every invariant change touches two applications | The invariants would live in a package neither application owns, and at one maintainer and one release train the split buys isolation nobody needs |
| One application switching on a role flag | One entry point, least wiring | Exactly the shape that hands five adapters the wrong document today; a role in a string is unenforceable, and the failure is silent rather than a compile error |
| Conventional hexagonal folder names (`domain/`, `ports/`, `infrastructure/`) | Instantly legible to anyone who knows the pattern | Says nothing about which chapter a rule came from, and the whole point of naming the layers was that the middle one is a contract rather than an implementation detail |

## Reversibility
Undo cost today: a folder rename and an import rewrite, mechanical, under a day
while the compiler is small. Becomes irreversible once: adapters outside this
repository import from a published path, because the folder names then appear in
other repositories' import statements and moving them is a major toolkit
release.

## Consequences
- A rule that cannot be placed in a ring is a rule whose layer nobody has
  decided, and the import graph says so before review does — paid by whoever
  writes it, at the moment they write it.
- Every effect the domain needs must be declared as a port before it can be
  used, so adding one filesystem read is a visible design change rather than an
  import — paid by the author, in one interface.
- Folder names now depend on `CONTEXT.md`, so renaming a concept is a rename in
  three places: the glossary, the chapters, and the tree — paid by whoever
  renames, and the reason the glossary landed first.
- The publish-time use-case and the central one share a core, so a change to
  Service semantics cannot apply to one and not the other — which is the point,
  and it also means neither can be optimised independently.
