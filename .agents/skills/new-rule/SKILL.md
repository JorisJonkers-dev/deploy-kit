---
name: new-rule
description: Add a rule ledger row, its enforcement, and a failing fixture that proves it fires, as one change. Use when the user wants a new lint or dependency-cruiser rule, a new architecture constraint enforced, or asks to "add a rule" or "enforce" something not already in docs/architecture-rules.md.
---

# New rule

Per
[0104](../../../docs/adr/architecture/0104-every-enforced-rule-has-an-id-a-row-and-a-fixture.md):
every enforced rule has a greppable id, a row, and a fixture that proves it
fires, added together. `npm run lint:rules` is the meta test that holds the
three in agreement; nothing here should be a step this skill performs
separately from what that command checks.

## Steps

1. **Read [`docs/architecture-rules.md`](../../../docs/architecture-rules.md)
   first**, in full: the id scheme (`RULE-NNN`, a flat estate-wide sequence,
   family as a column never a prefix), the Families table, and the
   "Considered and rejected" table. A rule resembling one already rejected
   there starts from that argument, not from scratch.
2. **Take the next `RULE-NNN`.** Grep the document's own rows; do not reuse
   an id from `docs/requirements.md`, a different, non-overlapping sequence.
3. **Pick the enforcer kind.** `depcruise:` a named rule in
   `.dependency-cruiser.cjs`; `eslint:` a rule id `eslint.config.js`
   configures; `npm:` a script `package.json` defines; `file:` a file that
   carries the rule itself, when no existing tool can express it (a ledger
   document, a workflow's own shape).
4. **Write the fixture first, red.** A `.test.ts` file containing a case that
   violates the rule, asserting on a literal from the failure the enforcer
   emits (the witness). Confirm it fails before the enforcement exists.
5. **Add the enforcement**, and confirm the fixture goes green.
6. **Add the ledger row**, with the fixture link and the witness in
   backticks, in family order. Update the document's stated row count (and
   pending count, if this rule starts pending).
7. **If the rule cannot be enforced yet**, add it as
   `pending (#NNN): reason` instead, naming no fixture, and skip steps 4 to
   5; a pending row still needs the ticket that will bring it.
8. **Run `npm run lint:rules`.** Its converse check also fails if the
   enforcer above is now configured but claimed by no row, or claimed twice.
9. **If the rule decides something** (a layering rule, a denylisted
   dependency, anything an ADR would need to justify), write the ADR too (see
   the `adr` skill); a mechanical addition to an existing family usually does
   not need one.

## Claiming a ticket

Claim the ticket before the first edit if it is not already claimed
([`AGENTS.md`](../../../AGENTS.md#claiming-a-ticket)).
