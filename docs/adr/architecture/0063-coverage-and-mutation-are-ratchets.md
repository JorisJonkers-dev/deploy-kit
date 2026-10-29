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

Mutation runs on every push to `main`, never on a pull request. It does not
test every mutant: it runs Stryker incrementally against the report of the last
green run on `main`, a mutant is tested again when its module changed or the
test that killed it changed, and every other result comes from that report. A
survivor fails `main` after the merge, and the fix is the next pull request.
The score is still over every mutant. The run is
parallel shards, each handed a disjoint share of every module's top-level
statements balanced by the time each took in that report, and one job merges their reports into the report a single run would
have written: that report decides the score and is the next run's baseline. A
push that changes no module, no test, nothing the gate runs under and no
dependency runs no shard, and the last report stands. A full run tests every
mutant once a week, in the same shards, gates nothing, and opens an issue naming
each mutant left undetected.

## Rests on

One maintainer reads their own diffs
([0001](../model/0001-estate-scale-and-ownership.md)), so slack nobody decided
is slack nobody notices. Coverage and mutation scores are deterministic
functions of the tree, so a threshold with no slack fails only when a change
lowers what the suite reaches.

A mutant's outcome depends on its module and on the tests that reach it.
Measured for
[the decision on the compiler's structure](https://github.com/JorisJonkers-dev/deploy-kit/issues/361),
the full run on every push was 79.8 percent of CI minutes. All 10 mutants it
caught sat in files the pull request changed, and all 14 of its spurious red
jobs sat in files the pull request did not change.

**False if:** two runs of one commit report different coverage totals, or
different mutant outcomes. **Settled by:** two consecutive
`npm run test:coverage` runs and two consecutive `npm run test:mutation` runs on
one commit reporting identical totals and outcomes, which is how both numbers
were first set.

**False if:** a mutant falls in no shard's share, or in two. **Settled by:**
the report of the last green `main` run of 16 October 2026 placing every one of
its mutants in exactly one shard, and `test/mutation-shard.test.ts` holding
every top-level statement of the tree to exactly one.

**False if:** the weekly full run finds an undetected mutant in a module no
pull request changed since the run before it. **Settled by:** one incremental
run with a test file changed and no module changed, which tested again exactly
the mutants that file's tests had killed, and by each weekly run after it.

## Why

**A floor below reality protects nothing.** The replaced repository's floor of
80 percent sat well under what the suite reached, and 1,967 lines of dead
renderer survived a `--lines 90` gate because their own tests imported them. A
threshold with no slack is one half of the answer; reachability is the other
([0060](0060-boundaries-enforced-on-the-graph.md)).

**Coverage proves a line ran, not that a test noticed it change.** Mutation
testing is the check on the check. Headroom subtracted from a measured 100 would
be slack invented for a failure mode no run produced.

**A run pays for what changed.** Testing every mutant on every push
bought no catch outside the changed files, and its only yield there was red
jobs that a second run turned green. Stryker's incremental mode keeps the
result of a mutant whose module and whose killing test are both unchanged, so
a change that only weakens a test still re-tests what that test killed.

**A pull request spends no more than five minutes on mutation, so it spends
none.** A static mutant, one made when its module loads, runs every suite, so a
handful of them outweighs hundreds of the rest: with each test kept as itself,
a pull request's stage still ran twice that budget. Skipping static mutants on
a pull request (`ignoreStatic`) kept it near the budget but not inside it, and
named false survivors: a mutant in a schema built when its module loads, which
a test also reaches, ran against only its covering tests on a module loaded
unmutated. Running on every push to `main` still fails on a weak test, the
same day, without holding every pull request. Each run writes how long its
stage took to its summary, so the cost stays visible.

**A test is itself until its own code changes.** Stryker's Vitest runner
places no test in its file, so Stryker read one edit anywhere in a test file
as every test in it changed: a pull request that added one test to an
end-to-end suite re-tested every mutant that suite killed, and the gate ran
many times longer than the suite it tests. The baseline is
rewritten before a shard reads it, so a test keeps its identity while its own
code, every declaration of its file it names, and the code of every
`describe` around it are unchanged, compared as tokens. Names are compared as
text, so a shadowed name over-counts a change and never hides one; whatever
cannot be read that way leaves its file to Stryker's own reading. A helper in
another module was never compared at all, which the full run already covers.

**One job is the slowest gate, and it holds every merge.** Measured for
[the sharding decision](https://github.com/JorisJonkers-dev/deploy-kit/issues/464),
one incremental job was the slowest gate by far. Shards finish in the time of the largest one. A shard is cut by
top-level statement, not by file, because one large module would leave its
shard running alone: Stryker mutates only a node a range holds whole, and every
node but the file itself sits inside one top-level statement, so every mutant
lands in exactly one shard. A statement is the finest such cut; a range inside
one drops the mutant of every node that spans it. The shares are balanced by
the tests each statement's mutants ran in `main`'s report, not by how many
mutants it holds: a mutant made when a module loads runs every suite, and one
made inside a function stops at its first killing test, so equal counts left
the shard holding the load-time mutants running long after the rest. Every
shard of a run reads the one report a single job chose, since shards that
planned from different reports would overlap, and the merge refuses ranges
that overlap or leave a statement out.

**A change that reaches no mutant pays nothing.** Incremental mode would take
every result from `main`'s report anyway, so a release or a docs push runs no
shard. A dependency or a configuration the gate runs under still runs it: the
results are kept, but the run proves the toolchain still works.

**The full run stays, as the check on the shortcut.** Incremental mode compares
modules and test files, and nothing else: a changed fixture, test helper or
dependency moves no mutant. The weekly run tests all of them. It gates nothing
because nothing waits on it; a survivor becomes an issue, and the fix is a
pull request the next push's run then holds.

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
| Stryker's own reading of a test file, every test changed by any edit | no rewrite of the baseline | one new test re-tested what its whole file killed, many times the suite's own run |
| Smaller test files, so an edit invalidates less | no script | a file is still the unit, and a fixture shared across files would be copied |
| Incremental mutation on every pull request | a survivor never reaches `main` | the stage ran twice the five minutes a pull request may spend |
| Static mutants skipped on a pull request (`ignoreStatic`) | most of the time back | still near the budget, and false survivors in schemas built when a module loads |
| Every mutant on every pull request | no result is ever taken from an earlier run | four fifths of CI minutes, for no catch outside the changed files |
| One incremental job over every module | no merge step | the slowest gate, holding every merge, release pull requests included |
| Shards by whole file | each file in one report | one large module leaves its shard running alone |
| Shares balanced by mutant count | needs no report to plan | a load-time mutant costs many plain ones: one shard ran half again as long |
| Shards by a range inside a statement | a finer balance | drops the mutant of every node that spans the cut |
| Mutate only the files a pull request's diff names | no report to carry between runs | a pull request that only weakens a test mutates nothing |
| The full run alone, weekly, with no run on `main`'s pushes | the cheapest pipeline | a survivor lands on `main` and is found a week late |

## Reversibility

Undo cost today: numbers in two config files. Becomes irreversible once: never.

## Consequences

- A change adding lines without tests, or a mutation no test kills, fails the
  gate, so its author writes the test or lowers the number in the open.
- The guard that runs a gate as a script is never covered in-process; it is
  counted, and one process-level test per gate proves it still runs.
- Mutation runs are not part of `npm run verify`; they run as their own CI job.
- A push's mutation result rests on the report of the run before it. A run
  that finds none tests every mutant, split across the shards.
- A survivor reaches `main` before any run names it, and `main` is red until
  the pull request that fixes it lands.
- One top-level statement is the smallest share a shard takes, so a change that
  re-tests every mutant of one large statement waits on that statement.
- A pull request passes the gate without a shard running; so does a push that
  changes only documents, the release files or `emf/`.
- A mutant can sit undetected on `main` for up to a week when only a fixture,
  a test helper or a dependency changed. The weekly issue is where it surfaces.
