---
tier: decision
status: proposed
claim: settled
date: 2026-09-14
normative: docs/architecture-rules.md#rules
rests-on: ["0001"]
---

# Every enforced rule has an id, a ledger row and a fixture that proves it fires, and a rule not enforced yet says so with a reason

## Rests on

Every rule this repository enforces is enforced by a named thing on disk: a
rule in the dependency-cruiser ruleset, a rule id in the ESLint configuration,
a gate script, or a file that carries the rule itself. So a ledger of {id,
family, sentence, enforcer, fixture} rows can be checked by reading the tree
in both directions, rather than by trusting whoever last touched either side.
False if: a rule exists that no artifact on disk enforces, which would leave a
row with nothing to resolve to and no way to tell it from a rule quietly
deleted. Settled by: `scripts/lint-rules.ts` resolving every enforced row's
enforcer against the tree, and every rule the two rule configurations name
being claimed by exactly one enforced row, with none left over.

## Why

[0069](0069-boundaries-enforced-on-the-graph.md) put the layer boundaries on
the module graph because review is not the control that catches the
maintainer's own mistakes ([0001](../model/0001-estate-scale-and-ownership.md)).
That left a second-order gap, and it is the one this decision closes: a rule
can stop being enforced without anything going red. Delete a ruleset entry,
turn an ESLint rule off, rewrite a negative fixture past the case it was
written for, and the suite stays green, because a rule that no longer fires
breaks nothing. The coverage ratchet
([0101](0101-coverage-is-a-ratchet.md)) does not see it either: the lines still
run.

The fix is the shape the other meta gates already take: state the rule as a
comparison over two things that exist on disk. Here the comparison runs both
ways, and the second direction is what makes it more than a document. Forwards,
a row must resolve: its enforcer must be configured, and its fixture must be a
real test that mentions the literal it asserts on, so deleting the case takes
the witness with it. Backwards, every rule the configurations name must be
claimed by exactly one **enforced** row, so a rule added without a row fails,
and so does a live rule quietly moved to the pending list.

That backwards direction is the whole answer to the obvious objection, which is
that a pending list is where rules go to be forgotten. A row may be pending only
while nothing enforces it; the moment something does, pending stops being an
available answer. What is left is a pending row that names a ticket and a
reason and claims no fixture, which is a decision on the page rather than an
omission off it.

The id is `RULE-NNN` and the family is a column rather than a prefix. The id is
what a failure quotes and what a grep finds, so it has to survive
reclassification: a family-prefixed id would become a lie the first time a rule
moved between families, and renumbering to fix that would break every citation
already written. `REQ-NNN` in
[the behaviour ledger](0103-a-behaviour-ledger-names-what-a-test-proves.md) is
a separate namespace on purpose: that ledger answers what a person can rely on,
this one answers what a tool enforces, and one rule can serve several
behaviours.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| No ledger; trust each rule's own negative fixture | Nothing to write or maintain | A fixture proves a rule fires while the fixture exists. Nothing notices the rule and its fixture leaving together, which is exactly how a ruleset decays |
| Fold the rules into `docs/requirements.md` | One document instead of two | A rule and a behaviour answer different questions, and one row cannot carry both an enforcer and a proof of a guarantee without one of them becoming decoration |
| A family-prefixed id, such as `LAY-004` | The family is readable in the id | Every reclassification breaks a citation, and the pressure is then to leave a rule in the wrong family rather than renumber. The family is a column, which can be revised for free |
| Pending rows in a separate file, out of the table | The enforced table stays short and clean | The point of a pending row is to be read beside the enforced ones. A second file is a list nobody opens |
| A severity column, so a rule can land as a warning first | A gentler path for a new rule | A warning in CI is a rule nobody enforces. A rule not worth failing a build for is a pending row with a reason, which is the same information without the false green |

## Reversibility

Undo cost today: deleting one document, one gate script and two test files.
Becomes irreversible once: never; the ledger describes this repository's own
tree, and nothing outside it reads either.

## Consequences

- Adding a rule to either rule configuration without a ledger row fails the
  suite. Paid by whoever adds the rule, in the same pull request, which is
  where the reason for it is freshest.
- An enforced row must name a fixture that asserts on a literal, so a rule
  whose failure output nobody has ever looked at cannot be written down as
  enforced. Paid once per rule.
- The ledger knows only about rules this repository names. The two presets
  (`recommended` and `strictTypeChecked`) carry far more rules than any row
  here, and they are one row between them; a preset silently narrowing in a
  minor release is not something this gate would see. Paid by whoever upgrades
  the linter.
- Most rows are pending today, because `src/` does not exist. That is the
  ledger working: the vocabulary and the machinery land before the code they
  will hold, so the compiler's first module meets them rather than prompting
  them. Paid down by
  [issue #30](https://github.com/JorisJonkers-dev/deploy-kit/issues/30), which
  every pending row names.
