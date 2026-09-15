---
name: gate-triage
description: Go from a failing CI job, a lint error, or a quoted rule id to its ledger row and the ADR that decided it. Use when a check is red and the fix is not obvious from the error text alone, when the user pastes a CI failure or a RULE-NNN / REQ-NNN id, or when the user asks "why does this gate exist" or "what enforces this".
---

# Gate triage

A failing gate almost always names, or can be traced to, an id in one of two
ledgers. Go to the row before guessing at a fix: the row names the enforcer,
the fixture, and (for a rule) the ADR that decided it exists at all.

## Steps

1. **Find the id.** A `RULE-NNN` in the failure text names a row in
   [`docs/architecture-rules.md`](../../../docs/architecture-rules.md); a
   `REQ-NNN` names a row in
   [`docs/requirements.md`](../../../docs/requirements.md). No id in the
   text: match the failing command to the `gate` column of
   [`docs/architecture.md`](../../../docs/architecture.md#gates), which names
   the npm script or workflow job, then find the ledger row(s) whose
   `enforced by` cell names that same script.
2. **Read the row.** The rule ledger's proof column names the fixture and,
   backticked, the witness: the exact literal the fixture asserts on. The
   behaviour ledger names the test file. Open both before touching source.
3. **Find why the rule exists.** A `gates` or `layering` family row usually
   traces to an ADR in `docs/adr/architecture/`; grep the ADR set for the
   rule's own wording, or check
   [`docs/architecture.md`](../../../docs/architecture.md) for the section
   the failing gate is named after; its prose links the ADR.
4. **Fix at the right layer.** If the fixture is wrong (rewritten past the
   case it proved), fix the fixture. If the rule's enforcement drifted from
   what the ledger states, fix the enforcement or the row, whichever the tree
   actually needs, and re-run the meta test
   (`npm run lint:rules` or `npm run lint:requirements`). If the rule itself
   is wrong, that is a decision: write an ADR (see the `adr` skill) that
   supersedes the one that decided it, never a reversal in place.
5. **A rule with no row, or a row with no enforcement:** that is what
   `lint:rules` and `lint:requirements` themselves catch; use the `new-rule`
   skill to add the missing piece rather than silencing the meta test.

## Claiming a ticket

If the fix is the ticket's deliverable and it is not yet claimed, claim it
first ([`AGENTS.md`](../../../AGENTS.md#claiming-a-ticket)).
