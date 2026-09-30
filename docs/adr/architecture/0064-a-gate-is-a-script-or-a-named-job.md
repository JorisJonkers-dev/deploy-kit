---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: docs/architecture.md#gates
rests-on: ["0001"]
---

# A gate is an npm script or a named CI job, lands with its CI job in one pull request, and a test holds the two lists equal

The gates are the repository's npm scripts that CI runs plus the CI jobs no npm
script wraps (package contents, actionlint, CodeQL, the model-driven build). A
new gate's script and its CI job land in the same pull request.
`test/pipeline-wiring.test.ts` compares `package.json`'s scripts and the named
jobs against the `run:` lines and jobs across `.github/workflows/*.yml`, and
fails when a script runs in no workflow and is not listed pending with a reason,
or when a workflow names a script `package.json` does not define. Gates are
grouped into CI jobs; one required check aggregates them and fails when any is
failed, cancelled or skipped.

## Rests on

One maintainer reads their own diff later, which is not a second pair of eyes
([0001](../model/0001-estate-scale-and-ownership.md)), so a gate that silently
stops running is found late or never.

**False if:** a gate can be added, or a workflow step edited to call another
script, and merge cleanly while the two lists disagree. **Settled by:**
`test/pipeline-wiring.test.ts` failing on each of its fixtures, extended to the
named jobs.

## Why

**A gate never wired reads as a check that does not exist.** A script added to
`package.json` and never run in CI shows nothing red; a workflow step naming a
renamed script fails for a reason nobody meant to test. Splitting the single
aggregate job into one job per gate
([#23](https://github.com/JorisJonkers-dev/deploy-kit/issues/23)) made it
sharper: a job skipped by its own `if:` shows nothing red.

**The list has two kinds of entry.** Most gates are npm scripts. Some are
binaries or actions no script wraps, and wrapping them only to satisfy the
comparison would add a layer with one caller.

**A comparison, not a convention.** Two lists already exist, so the rule is
stated as their comparison. A local-only command (`lint:fix`, `format`,
`verify`) is recorded as pending with its reason, so the check tells the two
cases apart.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the two lists in sync by convention | nothing to maintain | correct locally, wrong for the whole, noticed late |
| A pull request template checkbox | visible to a reviewer | there is no second reviewer |
| Wrap every gate in an npm script | one list | a script per binary, each with one caller |
| Fail on any unreferenced script | simplest rule | forbids the local conveniences that exist on purpose |

## Reversibility

Undo cost today: one test file. Becomes irreversible once: never.

## Consequences

- RULE-059 covers named jobs as well as scripts.
- Adding a gate is a script, a job and, where it is a named job, a line in the
  test's job list, in one pull request.
