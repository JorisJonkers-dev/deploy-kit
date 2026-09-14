---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-14
normative: docs/architecture.md#scope-and-sunset
rests-on: ["0106"]
---

# The EMF implementation is coursework-scoped, lives entirely under `emf/`, and is deleted when two conditions hold

## Rests on
The premise here is
[0106](0106-the-model-is-expressible-in-the-emf-toolchain.md): the toolchain
can carry the model unchanged. False if: deleting `emf/` and the root lines the
architecture lists as naming it leaves anything in the repository broken or
changes any behaviour of `src/`. Settled by: the sunset pull request's CI green
with exactly those removals and no other change outside `spec/v1/examples/`.

## Why
The course requires the EMF toolchain; the estate does not. The TypeScript
compiler is the implementation the estate will run, and the proposal
(`docs/mde/task-0-proposal/Sections/07-tooling.tex`) already argued that a JVM
and Eclipse toolchain buys nothing for the deployment workflow. The Java tree is
therefore built to be removed.

Removal is cheap only if nothing outside `emf/` knows it exists. So the Maven
build, its modules, its checks, its ledgers and its decisions live under
`emf/`, and the root names it only where it must: CI, the ADR lint's domain
list and its test, and the parity contract's pointer.

"Temporary" alone names no moment, so the sunset is two conditions. The grade
alone is not enough: if the TypeScript compiler still lags when the grade is
recorded, deleting `emf/` would delete the only complete implementation.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Remove after the course ends, by date | Simplest to state | A date says nothing about whether the TypeScript compiler can stand alone yet |
| Keep it permanently as a second implementation | No sunset work | Every model change in two languages, forever, for a toolchain the estate does not use |
| EMF decisions and checks in the root `docs/` and `scripts/` | One register, one place to look | Sunset becomes picking files out of shared directories, and the root stops being TypeScript |

## Reversibility
Undo cost today: moving files out of `emf/`, an hour. Becomes irreversible
once: never; the point of the layout is that deleting it is always one pull
request.

## Consequences
- The root gains a CI job, a lint step, a lint domain entry with its test, and
  one architecture section, and loses all but the section at sunset. Paid in
  that pull request.
- EMF ADR numbers come from the estate-wide sequence, so a number used under
  `emf/docs/adr/` is never reused under `docs/adr/`, and the reverse. Paid by
  whoever picks the next number, by checking both registers.
- `emf/` cannot import TypeScript tooling: its own checks are JUnit through
  Maven. Paid in duplicated check code, deleted with it.
