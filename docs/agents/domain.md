# Domain Docs

How the engineering skills should consume this repository's domain
documentation when exploring it. Single context, one layout, no
`CONTEXT-MAP.md`.

## Before exploring, read these

- **`CONTEXT.md`** at the repository root: the vocabulary. One term, one
  meaning; also the naming authority for code.
- **`docs/adr/`**: read the ADRs that touch the area about to change.
  `docs/adr/model/` decides the v1 model, `docs/adr/architecture/` decides
  the compiler's own structure, and `docs/adr/deferred/` is parked co-testing
  work and the retired push-delivery design, not linted and not binding.
- **`spec/v1/`**: normative for the model. **Where a spec chapter and an ADR's
  `normative:` pointer disagree, the chapter wins and the ADR is what gets
  fixed.** This is the one rule every other domain document in this
  repository restates instead of overriding: `CONTEXT.md` defines words,
  `spec/v1` is normative about the rules those words participate in, and
  `docs/adr/` records why, in that order.
- **`docs/architecture.md`**: the same relationship again, for code instead
  of the model: normative for the compiler's structure, with
  `docs/architecture-rules.md` as its rule ledger.

## File structure

```
/
├── CONTEXT.md
├── spec/v1/                  ← normative for the model
├── docs/
│   ├── architecture.md       ← normative for code
│   ├── architecture-rules.md ← the rule ledger
│   ├── requirements.md       ← the behaviour ledger
│   └── adr/
│       ├── model/            ← v1 model decisions, point at spec/v1
│       ├── architecture/     ← compiler decisions, point at docs/architecture.md
│       └── deferred/         ← co-testing and retired delivery, not linted
└── emf/                       ← a second implementation, with its own
                                  docs/adr/ numbered from the same sequence
```

## Use the glossary's vocabulary

When output names a domain concept (an issue title, a refactor proposal, a
test name), use the term `CONTEXT.md` defines, unchanged. Do not drift to a
retired synonym: `lint:meaning` fails on "Service Intent", "Cluster Context"
and any other term `CONTEXT.md`'s "Words to use carefully" section marks
retired, read outside a quotation.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than
silently overriding it, and check whether the ADR is itself superseded before
raising the conflict: a citation to a superseded decision needs its successor
named in the same sentence, or `lint:meaning` fails on it too.
