---
tier: decision
status: accepted
claim: settled
date: 2026-09-14
normative: docs/architecture.md#gates
rests-on: ["0001"]
---

# A behaviour ledger names every guarantee and the test that proves it, and a meta test holds the two together

## Rests on

Every guarantee this repository makes is provable by naming the one test file
that would fail if the guarantee stopped holding, so a ledger of {id,
sentence, test file} triples can be checked by reading the tree rather than by
trusting whoever last touched it. False if: a guarantee exists that no single
test file proves, which would leave a row with nothing honest to cite.
Settled by: the behaviour ledger holding one row per gate this repository
enforces, each resolving to a real, non-empty test file, with none left over.

## Why

The coverage ratchet ([0063](0063-coverage-and-mutation-are-ratchets.md)) notices a line
that stops running, but not a test file that is renamed, emptied or deleted
while the code it once proved stays in place and green. Nothing before this
connected a sentence a contributor relies on to the test that makes it true,
so that sentence could go silently unproven and nothing in the suite would
say so.

The fix is the same shape as the boundary gate and
[the script-to-workflow check](0064-a-gate-is-a-script-or-a-named-job.md): state
the rule as a comparison over things that already exist on disk (markdown
tables and a directory of test files), rather than as a convention to
remember. A row that no longer resolves, a file that exists but holds no
test, an id two rows carry, or an id cited where no row backs it: each is a
comparison a script can run, not a habit a reviewer can forget, which matters here for
the same reason as [0001](../model/0001-estate-scale-and-ownership.md): one
person reading their own diff later is not a second pair of eyes.

The rows live in one file per area of the model under `docs/requirements/`,
and `docs/requirements.md` is the front page: the explanation, the list of
areas, and the one address every citation names. Several pull requests add
rows at once, each in its own lane of the model; one table they all append to,
under a row count they all change, made every one of them conflict with every
other. Split by area, two lanes add rows to two files, and the ids stay one
sequence the gate holds unique across every file. The gate also refuses a row
on the front page and an area file with no row, so the shape cannot drift
back into one table.

This ledger is deliberately not
[`docs/architecture-rules.md`](../../architecture-rules.md). That one lists the
rules a tool enforces, each keyed to its enforcer; this one lists the
behaviours a person depends on, each keyed to the test that fails when it
stops being true. A behaviour can rest on several
rules, and a rule can serve several behaviours, so keeping the ledgers apart
keeps each one answerable to a different question.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| No ledger; trust the existing gates and their own tests | Nothing to write or maintain | Exactly the failure mode this decision exists to close: a test file can be renamed, emptied or deleted while the code it covered stays in place, and nothing today would say so |
| A checklist item in the pull request template | Visible to a human reviewer | There is no second reviewer here, and a template item is unchecked by habit long before it is unchecked on purpose |
| One table in `docs/requirements.md`, under a stated row count the gate checks | One file to read, and a count that says how big the ledger is | Every pull request that adds a row changes the same count line and appends to the same last line, so pull requests in parallel always conflict; the count catches nothing the per-row checks miss |
| Fold behaviours into `docs/architecture-rules.md` | One document instead of two | A rule and a behaviour answer different questions; merging them would make the rule ledger's per-rule enforcer story and this ledger's per-behaviour test story compete for the same row |

## Reversibility

Undo cost today: deleting one document and one gate script. Becomes
irreversible once: never; the ledger describes this repository's own tree and
nothing outside it reads either.

## Consequences

- A row must name a real, non-empty test file, so adding a guarantee with no
  test to cite is not representable; the guarantee waits until it has one.
  Paid by whoever adds a row, once per row.
- Renaming, emptying or deleting a test file a row names fails the suite
  instead of merging quietly, and the failure names the row. Paid by whoever
  touches that file, in the same pull request.
- A new row goes in its area's file and takes the next free id across every
  area file, so two pull requests adding rows at once conflict only when they
  take the same id, and then the gate names both files. Paid by whoever adds a
  row, once per row.
- The ledger no longer says how many rows it holds; `npm run
  lint:requirements` reports the count instead. Paid by whoever wants the
  number, once.
