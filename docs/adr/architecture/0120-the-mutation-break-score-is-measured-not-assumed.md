---
tier: decision
status: proposed
claim: settled
date: 2026-09-15
normative: docs/architecture.md#gates
rests-on: ["0001"]
---

# The mutation break score is measured, not assumed, and stays over `src/` until `scripts/` clears its own sandbox

## Rests on

Two consecutive `npm run test:mutation` runs over `src/**/*.ts` (21 modules
today; `!src/cli/boundary.ts`, which
[0117](0117-the-process-lives-in-one-boundary-file.md) already excludes from
coverage, excludes nothing yet because that file does not exist) report the
same 868 generated mutants, 2 of them ignored on a named reason, 866 scored,
866 killed, 0 survived, 0 timed out, 0 uncovered, for a score of 100.00 both
times. False if: a third run over the same commit reports a different total,
a survivor, or a timeout. Settled by: the two runs recorded below, and by any
later re-run of `npm run test:mutation` on an unchanged `src/` disagreeing
with them.

> **Re-measured 2026-09-15.** #120 landed the Platform document's parser
> between the first measurement and this one, adding eight modules under
> `src/application/`, `src/domain/platform-intent/` and
> `src/wire/{intent-set,platform-intent}/` plus `src/wire/schema-diagnostics.ts`.
> The original measurement (13 modules, 608 mutants, 606 scored) is superseded
> by the numbers below; the two ignored mutants, the break score, and the
> scope decision are unchanged.

## Why

Issue #31 asks for a break score set at the measured score minus headroom for
timeout noise, and for the gate scripts under `scripts/` to join `src/` as
mutation targets. Both questions turned out to have answers only a real run
could give.

**The break score stays 100, with no headroom.** Two full runs, back to back,
on the same commit:

```
Run 1: 868 mutants, 2 ignored, 866 scored, 866 killed, 0 survived,
       0 timeout, 0 no coverage, score 100.00, 26s (Stryker), 33.0s wall
Run 2: 868 mutants, 2 ignored, 866 scored, 866 killed, 0 survived,
       0 timeout, 0 no coverage, score 100.00, 27s (Stryker), 28.6s wall
```

Identical mutant counts and identical outcomes on every mutant; the only
difference is wall-clock time, which swings with the machine's load rather
than with anything Stryker measured. Zero timeouts in two runs is not proof
that a timeout can never happen, but it is the same evidential standard the
coverage ratchet already accepts
([0101](0101-coverage-is-a-ratchet.md): "two consecutive runs... reporting
identical totals"). Headroom subtracted from 100 today would be a number
invented to cover a failure mode neither run produced, and the ratchet
principle both that decision and this one share is that slack nobody
measured is slack nobody can defend in review. The two ignored mutants are
`src/wire/project-intent/json-schema.ts`'s own `// Stryker disable next-line`,
already reasoned about in that file ("no field has a platform default yet"),
and are excluded from the score the same way Stryker excludes them from its
own denominator.

**`scripts/` does not join `mutate` in this pull request.** The measurement
attempt is why. Raising `mutate` to `["src/**/*.ts", "scripts/**/*.ts",
"!src/cli/boundary.ts"]` and pointing `vitest.mutation.config.ts` at the
suites that exercise `scripts/` (25 files, by the same "imports from scripts/"
scan `test/mutation-contract.test.ts` already runs for `src/`) does not
produce a number worth setting a threshold to, for two reasons Stryker's own
sandbox surfaces rather than anything about the gate scripts' logic:

1. `scripts/lint-codes.ts`, `scripts/lint-requirements.ts`,
   `scripts/lint-rules.ts` and `scripts/lib/tracked.ts` (used by the first
   three) call `git ls-files` against the real repository to build the
   tracked-file map their `*-contract.test.ts` real-repository assertions
   check. `scripts/lint-meaning.ts` and `scripts/lib/change-buckets.ts`'s own
   contract test do the same inline. Stryker copies the project into
   `.stryker-tmp/sandbox-*/`, a plain directory with no `.git` of its own,
   nested inside this worktree; `git ls-files` run there finds the worktree's
   real `.git` but, since the sandbox directory itself holds no tracked path,
   returns an empty tracked-file set. Including any one of
   `test/codes-lint.test.ts`, `test/requirements-contract.test.ts`,
   `test/rules-contract.test.ts`, `test/meaning-contract.test.ts` or
   `test/change-buckets.test.ts` in `vitest.mutation.config.ts` failed
   Stryker's initial dry run outright, a different one of the five each time,
   with errors shaped like "expected 0 to be greater than 100" and "expected
   [...49] to equal []". This is the same defect
   `test/mutation-contract.test.ts` already documents for
   `test/oracles.test.ts` and `src/`: "The gate suites read the git index...
   neither of which exists in Stryker's sandbox." It is not unique to
   `oracles.test.ts`; it is a property of every script that scans the tracked
   tree, and five of `scripts/`'s own contract tests have that property.
2. Excluding those five and running the rest (37 files, 3,558 mutants, taken
   against `src/`'s pre-#120 13 modules, so most of the 3,558 came from
   `scripts/`) got to 1,250 mutants tested, 160 survived (about 12.8%), 7
   timed out, before the run was stopped. `coverageAnalysis:
   "perTest"` attributes a mutant only to a test that reaches it in the same
   process; several of `scripts/`'s own suites (`test/pr-report.test.ts`,
   `test/pr-title-contract.test.ts`, `test/rc-publish.test.ts`,
   `test/manifest-contract.test.ts`, `test/package-contents-contract.test.ts`,
   `test/secret-scan-contract.test.ts`) exercise the gate mainly by
   `spawnSync`/`execFileSync`-ing it as a child process for a CLI-level smoke
   test, which is invisible to per-test attribution the same way
   [0100](0100-tests-run-in-process-on-vitest.md) already reasoned a gate
   started as a child process is invisible to coverage. A run heading for a
   double-digit survival rate is not a run a break score gets measured from;
   it is a run that says the suites need reshaping first.

Both defects are fixable, and the fix is the one 0100 already named: give
`lint-codes.ts`'s, `lint-requirements.ts`'s, `lint-rules.ts`'s and
`change-buckets.ts`'s real-repository assertions a self-contained fixture
tree the way `test/adr-lint-negative.test.ts`,
`test/requirements-lint-negative.test.ts` and `test/rules-lint-negative.test.ts`
already do (`git init` a throwaway repo under a temp directory, so `git
ls-files` has something of its own to answer from), and call every gate that
is currently smoke-tested by subprocess in-process instead, the way
`test/adr-lint-negative.test.ts` already calls `lintAdrs()` directly. Neither
is this ticket's work; both are named here so the next attempt starts from a
diagnosis instead of repeating this one. Until then, `scripts/` stays out, and
`RULE-064` keeps naming `src/` alone.

**The four-minute observation, and the ten-minute trigger.** `src/`'s two
runs took under 40 seconds wall-clock, nowhere near the roughly ten-minute
mark issue #31 names for moving to incremental mode on pull requests with a
full scheduled run. The partial `scripts/`-included run was still short of
that mark when stopped (about four minutes to 35% of 3,558 mutants, so a
completed run would plausibly clear ten minutes on this shared machine, though
contention from an unrelated concurrent Stryker run on this same host makes
that number unusable as a measurement). Because `scripts/` does not join the
scope, the trigger is not evaluated in earnest by this decision: `src/` alone
does not approach it, and `scripts/` is not yet in a state where a clean
timing number exists to compare against it.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Set `break` to a number below 100 today, to leave headroom for scripts/'s eventual timeouts | A threshold with no measurement behind it | Exactly the slack [0101](0101-coverage-is-a-ratchet.md) already rejected for coverage: a number nobody can defend in review, invented against a failure that has not happened |
| Add `scripts/**/*.ts` to `mutate` now and accept whatever score the run reports | One pull request instead of two | The reported score would be an artifact of which gates happen to have sandbox-safe tests today, not a measurement of how well any gate is tested; a break threshold set from it would break the build on the next unrelated change to an already-untested file |
| Exclude only the five broken contract test files, keep `scripts/**/*.ts` in `mutate`, and set `break` to whatever the full run reports | Ships the header line of #31's acceptance criteria today | The 12.8%-survived trend before the run was stopped means the honest number is well under any threshold worth keeping; shipping it either fails every pull request immediately or is set so low it gates nothing |
| Run mutation only on a nightly schedule instead of every pull request, sidestepping the runtime question entirely | No CI-time cost on pull requests | Issue #31's first acceptance criterion is the job on every pull request; a nightly-only job is the incremental-mode alternative the ticket already names for when runtime, not readiness, is the blocker |

## Reversibility

Undo cost today: four numbers and one glob pattern in `stryker.config.json`,
a `vitest.mutation.config.ts` include list, and this file's own retirement.
Becomes irreversible once: never; the measurement is this repository's own and
nothing outside it depends on the number staying 100 or the scope staying
`src/`.

## Consequences

- A single surviving or timed-out mutant on an unchanged `src/` fails
  `Pipeline Complete`'s `mutation` job, with no slack, because neither run
  produced one to budget for. Paid by whoever's change introduces it, in the
  pull request that does.
- `scripts/` stays untested for mutation until its own real-repository
  contract tests get a fixture the sandbox can answer and its
  subprocess-smoke-tested gates get an in-process call the way
  [0100](0100-tests-run-in-process-on-vitest.md) already asked every gate to
  have. That work is not scheduled by this decision; it is named so the next
  person measuring `scripts/` does not re-discover it. Paid by whoever picks
  it up.
- The HTML report is uploaded as a CI artifact on every run of the `mutation`
  job, success or failure, so a survivor or a timeout is inspectable without
  reproducing the run locally. Paid in one `actions/upload-artifact` step,
  once.
- The compiler's domain, application and wire code already sit under `src/`
  and are already mutated; issue #21's "join the targets when they land"
  clause for those three layers is met by the scope this decision keeps, not
  by anything it adds.
