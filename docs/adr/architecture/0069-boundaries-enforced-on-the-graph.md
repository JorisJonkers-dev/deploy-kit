---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: docs/architecture.md#gates
rests-on: ["0001"]
---

# Layer boundaries and reachability are gates on the module graph, not review notes

## Rests on
Every rule that keeps the layering honest is expressible as a constraint on the
import graph, and a violation is therefore machine-detectable before review.
False if: a boundary the design depends on cannot be stated as a graph rule —
one that needs to know what a function does rather than what it imports.
Settled by: the fourteen boundary fixtures, each crossing exactly one boundary,
each reported by the rule that names it.

## Why
This repository is maintained by one person, so review is not a control that
arbitrates between people ([0001](../model/0001-estate-scale-and-ownership.md));
it is the same person reading their own work later. Gates that catch the
maintainer's own mistakes are the ones worth building, and a layering rule is
exactly that kind of mistake: an import added at speed, correct locally, wrong
for the graph.

The generation being replaced is the evidence. Its adapters read manifests from
disk inside `render`; its registry declared `render: (input: never)` and
laundered the argument through a double cast at both call sites; `strict: true`
sat alongside `@ts-nocheck` in ten files with the lint rule that would catch it
switched off. None of that is a hard problem to see — it is a problem nothing
was watching for.

Reachability is the second half, and it is the half coverage cannot do.
[Chapter 30](../../../spec/v1/30-deliverables.md#adapters) records 1,967 lines
of dead renderer across 14 modules, reachable from neither entry point, imported
only by its own 11 test files, and sitting inside a `--lines 90` coverage gate
that guarded every pull request. Coverage asked whether the code had tests and
the answer was yes. The question worth asking is whether anything real calls it,
which is a graph question.

Two implementation notes follow from this being a graph gate rather than a lint.
The ruleset is read as documentation — it is the one place the hexagon is stated
in enforceable form, so its rules carry comments explaining the boundary rather
than the syntax. And it carries negative fixtures like any other check: a gate
that has only run against a clean tree is untested, which was true of the ADR
lint until it got fixtures too.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| ESLint `no-restricted-imports` alone | No new dependency; runs in the editor | Sees one file at a time, so it cannot express a cycle, an orphan, or "no adapter may import a *different* adapter" — and the last one is what keeps attribution provable |
| Review discipline plus a documented layering | Nothing to install or maintain | The generation being replaced had a documented layering and shipped a dead generation, disk reads inside `render`, and ten `@ts-nocheck` files |
| Enforce boundaries with package boundaries (workspaces) | Compile-time enforcement, no extra tool | Publishing, versioning and project-reference overhead for one package with one maintainer; the graph rule fails CI just as hard |
| Coverage thresholds alone | Already configured | Exactly the configuration that kept 1,967 dead lines alive |

## Reversibility
Undo cost today: deleting a config file and one npm script. Becomes
irreversible once: never — the gate constrains this repository's own tree and
nothing outside it depends on the rules existing.

## Consequences
- A legitimate new boundary crossing requires editing the ruleset, which makes
  it a recorded decision rather than an import — paid by the author, in one
  diff a reviewer can see.
- The orphan rule needs an exemption list for real entry points, and that list
  is a place a dead module could hide, so it stays as short as the entry points
  actually are — paid in vigilance, on one line.
- The wrapper script skips while `src/` does not exist, and a skip that is not
  printed is a gate that quietly passes; it prints — paid by nobody, and it is
  the reason the skip is loud.
- Two tools now describe the same boundary — the lint for the fast local signal
  and the graph rule as the authority — so a rule added to one and not the other
  is a divergence; the graph rule wins by definition — paid by whoever adds a
  rule.
