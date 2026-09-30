---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: docs/architecture.md#gates
rests-on: ["0001"]
---

# Coverage and mutation are ratchets: each threshold sits on what the suite reaches, is measured rather than assumed, and only rises

The coverage thresholds in `vitest.config.ts` sit on what the suite reaches,
over an explicit include list, so a file no test reaches counts as zero.
Ignore comments are counted and held at zero. The mutation break score in
`stryker.config.json` is 100 over `src/**/*.ts`, with no headroom subtracted.
Both only rise: a change that reaches more raises them in the same pull request,
and lowering one is a line in a diff argued in the open. `scripts/` joins the
mutation target once its gates can run inside Stryker's sandbox. A record states
the rule; the measured numbers live in the CI report, never here.

## Rests on

One maintainer reads their own diffs
([0001](../model/0001-estate-scale-and-ownership.md)), so slack nobody decided
is slack nobody notices. Coverage and mutation scores are deterministic
functions of the tree, so a threshold with no slack fails only when a change
lowers what the suite reaches.

**False if:** two runs of one commit report different coverage totals, or
different mutant outcomes. **Settled by:** two consecutive
`npm run test:coverage` runs and two consecutive `npm run test:mutation` runs on
one commit reporting identical totals and outcomes, which is how both numbers
were first set.

## Why

**A floor below reality protects nothing.** The replaced repository's floor of
80 percent sat well under what the suite reached, and 1,967 lines of dead
renderer survived a `--lines 90` gate because their own tests imported them. A
threshold with no slack is one half of the answer; reachability is the other
([0060](0060-boundaries-enforced-on-the-graph.md)).

**Coverage proves a line ran, not that a test noticed it change.** Mutation
testing is the check on the check. Headroom subtracted from a measured 100 would
be slack invented for a failure mode no run produced.

**Counts are not decisions.** Mutant counts embedded in a record go stale on the
next commit, and each measurement then invites an in-place edit. The rule
("100 over `src/**`") is what a reviewer holds.

**`scripts/` waits for a reason.** Two defect classes keep several gate scripts
out of Stryker's sandbox (git-index reads, and smoke tests that only run as a
subprocess); mutating them now would score the sandbox, not the tests.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A fixed floor below the measured number | never fails on coverage alone | the slack let dead code through |
| Per-file 100 percent coverage | the strongest-sounding bar | forces ignore comments, proves lines ran |
| Coverage reported, not enforced | no build fails over a percentage | drifts down one pull request at a time |
| A break score of 100 minus headroom | tolerates timeout noise | noise no run produced |
| Record the mutant counts beside the rule | the number sits in the record | stale on the next commit |

## Reversibility

Undo cost today: numbers in two config files. Becomes irreversible once: never.

## Consequences

- A change adding lines without tests, or a mutation no test kills, fails the
  gate, so its author writes the test or lowers the number in the open.
- The guard that runs a gate as a script is never covered in-process; it is
  counted, and one process-level test per gate proves it still runs.
- Mutation runs are not part of `npm run verify`; they run as their own CI job.
