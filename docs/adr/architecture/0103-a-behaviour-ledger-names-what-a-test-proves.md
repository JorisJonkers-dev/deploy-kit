---
tier: decision
status: proposed
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
Settled by: `docs/requirements.md` holding one row per gate this repository
enforces today, each resolving to a real, non-empty test file, with none left
over.

## Why

The coverage ratchet ([0101](0101-coverage-is-a-ratchet.md)) notices a line
that stops running, but not a test file that is renamed, emptied or deleted
while the code it once proved stays in place and green. Nothing before this
connected a sentence a contributor relies on to the test that makes it true,
so that sentence could go silently unproven and nothing in the suite would
say so.

The fix is the same shape as the boundary gate and the script-to-workflow
check landing alongside it: state the rule as a comparison over things that
already exist on disk (a markdown table and a directory of test files),
rather than as a convention to remember. A row that no longer resolves, a
file that exists but holds no test, a stated count that drifts from the rows
actually present, or an id cited where no row backs it: each is a comparison
a script can run, not a habit a reviewer can forget, which matters here for
the same reason as [0001](../model/0001-estate-scale-and-ownership.md): one
person reading their own diff later is not a second pair of eyes.

This ledger is deliberately not `docs/architecture-rules.md`
([issue #29](https://github.com/JorisJonkers-dev/deploy-kit/issues/29), not
yet landed). That one will list the rules a tool enforces, each keyed to its
enforcer; this one lists the behaviours a person depends on, each keyed to
the test that fails when it stops being true. A behaviour can rest on several
rules, and a rule can serve several behaviours, so keeping the ledgers apart
keeps each one answerable to a different question.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| No ledger; trust the existing gates and their own tests | Nothing to write or maintain | Exactly the failure mode this decision exists to close: a test file can be renamed, emptied or deleted while the code it covered stays in place, and nothing today would say so |
| A checklist item in the pull request template | Visible to a human reviewer | There is no second reviewer here, and a template item is unchecked by habit long before it is unchecked on purpose |
| Fold behaviours into `docs/architecture-rules.md` once it lands | One document instead of two | A rule and a behaviour answer different questions; merging them would make the rule ledger's per-rule enforcer story and this ledger's per-behaviour test story compete for the same row |

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
- The stated row count is one more thing to update by hand when a row is
  added or removed; forgetting it fails the same test rather than drifting
  unnoticed. Paid once per row added or removed.
