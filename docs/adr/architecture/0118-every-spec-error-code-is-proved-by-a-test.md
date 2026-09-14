---
tier: decision
status: proposed
claim: settled
date: 2026-09-14
normative: docs/architecture.md#error-model
rests-on: ["0001"]
---

# Every error code the specification defines is proved by a test, or pending on the ticket that will prove it

## Rests on
The error codes the chapters define are the contract CI asserts on, so a code
no test names is a refusal nothing proves the compiler makes. False if: a code
can be defined in a chapter, exercised by no test, and missing from the pending
list, and `npm run verify` still passes. Settled by: `test/codes-lint.test.ts`
failing that case, and failing a pending code a test already exercises.

## Why
The chapters define 59 codes. Before this, three were named by any test, and
nothing said which of the other 56 were waiting on what. A code defined and
never exercised reads exactly like one that is implemented, and the difference
shows up only when an author asks why a refusal never fires.

The pending list turns that silence into a plan: every unexercised code names
the ticket whose work will exercise it and why it cannot be exercised before.
The check runs in both directions, so a code a test starts exercising must leave
the list in the same change, and the list cannot outlive the work it describes.

The reverse check catches drift the other way: a code cited in a decision or a
test that no chapter defines is a rule the specification never states. Retired
codes, delivery codes owned by the deferred set, and historical records are out
of scope by name.

A Java test and a refused case's committed `diagnostics.json` count as
exercising, so the two implementations meet this rule on the same codes.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Wait for the rule registry (#44) | No interim list | #44 depends on work not yet started, and every code until then stays unaccounted for |
| Count a mention in an example comment as exercised | 28 codes covered at once | A comment proves nothing fires |
| Keep the list in a Markdown ledger | Visible to readers | A third ledger with its own lint, for data that one gate reads and #44 replaces |

## Reversibility
Undo cost today: deleting one gate and its test. Becomes irreversible once:
never; the constraint ledger from #44 absorbs the list.

## Consequences
- A change that adds a code to a chapter adds a test or a pending entry. Paid by
  its author, in one line.
- A change that makes a code fire removes it from the pending list. Paid by
  its author, because the gate fails until they do.
- A test names a code by writing it; a fixture that wants a code-shaped string
  without exercising a real code has to assemble it. Paid by test authors, once.
