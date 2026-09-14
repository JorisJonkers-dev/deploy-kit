---
tier: decision
status: proposed
claim: settled
date: 2026-09-14
normative: docs/architecture.md#gates
rests-on: ["0001"]
---

# A new gate's script and its CI job land in the same pull request, and a test proves the two stay matched

> **Amended 2026-09-14.** A gate can also be a CI job with no npm script:
> the `emf` job runs Maven inside `emf/`
> ([0105](0105-two-implementations-meet-at-committed-oracles.md)). It lands in
> the pull request that adds the Maven build, joins `Pipeline Complete`, and is
> deleted with `emf/`.

## Rests on
The repository's own npm scripts are the whole list of gates, so the list a
pull request's checks show and the list `package.json` declares can be kept
equal by comparing text, without either list needing to trust the other.
False if: a script can be added, or a workflow step can be edited to call a
different script, and merge cleanly while the two lists disagree, with nothing
in the suite noticing. Settled by: `test/pipeline-wiring.test.ts` failing when
an npm script runs in no workflow and is not listed pending, and failing when
a workflow calls a script `package.json` does not define.

## Why
[0069](0069-boundaries-enforced-on-the-graph.md) already made review not the
control that catches the maintainer's own mistakes, for the same reason this
decision restates for CI ([0001](../model/0001-estate-scale-and-ownership.md)):
one person reading their own diff later is not a second pair of eyes. A gate
added to `package.json` and never wired into a workflow reads, on the page
that matters, as a check that does not exist; a workflow step that still names
a script renamed or deleted in the same change reads as a job that will fail
for a reason nobody intended to test.

Splitting the single `Pipeline Complete` job into one job per gate
([issue #23](https://github.com/JorisJonkers-dev/deploy-kit/issues/23)) makes
the failure mode sharper rather than milder: a job can now be skipped by its
own `if:`, silently, without the pull request page showing anything red, which
`Pipeline Complete`'s aggregation exists to catch at the job level. The same
drift can happen one layer down, between a gate's npm script and the step that
runs it, and nothing at that layer was watching for it before this.

The fix is the same shape as the boundary gate: state the rule as a comparison
over two lists that already exist (`package.json`'s `scripts`, and the `run:`
lines across `.github/workflows/*.yml`) rather than as a convention to
remember. A script that will never run in CI, because it mutates the working
tree or is a local convenience a real gate supersedes, is not a defect; it is
recorded once, with the reason, so the check can tell the two cases apart.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| No check; keep the two lists in sync by convention | Nothing to write or maintain | Exactly the failure mode 0069's evidence describes: correct locally, wrong for the whole, noticed only when someone goes looking |
| A checklist item in the pull request template | Visible to a human reviewer | There is no second reviewer here, and a template item is unchecked by habit long before it is unchecked on purpose |
| Fail on any script with zero references, no pending escape hatch | Simplest rule to state | Forbids the developer-only commands (`lint:fix`, `format`, the aggregate `verify`) that exist precisely because they are not meant to run in CI |

## Reversibility
Undo cost today: deleting one test file. Becomes irreversible once: never; the
check constrains this repository's own two lists and nothing outside it reads
either.

## Consequences
- Adding a gate script with no workflow step, or renaming one without updating
  the step, fails the suite instead of merging quietly. Paid by whoever adds
  or renames a gate, in the same pull request.
- A script that is not a gate (mutates the tree, or is a local convenience)
  needs an entry in the pending list with a reason, so leaving a script
  unwired is a decision on the page rather than an oversight off it. Paid
  once per such script.
- The check reads `run:` lines as text, so a script invoked through a variable
  or a matrix expansion would not be recognised; every gate today is a literal
  `npm run <name>` or `node scripts/<file>.ts`, and a future one that is not
  needs the check extended alongside it. Paid by whoever adds that shape.
