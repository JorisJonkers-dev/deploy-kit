# Rule ledger

This is not [`docs/requirements.md`](requirements.md). That ledger lists the
behaviours **a person depends on**: a sentence a contributor or a consumer can
rely on, keyed to the test that fails the moment it stops being true. This one
lists the rules **a tool enforces**: a dependency-cruiser check, an ESLint rule,
a gate script, each keyed to the enforcer that runs it and to the fixture that
proves it fires. A behaviour can rest on several rules, and one rule can serve
several behaviours, so the two ledgers stay separate on purpose, and their id
spaces (`REQ-NNN` and `RULE-NNN`) never overlap.

A rule can stop being enforced without anything saying so: a
dependency-cruiser entry deleted, an ESLint rule turned off, a negative fixture
rewritten past the case it was written for. The suite stays green either way,
because a rule that no longer fires breaks nothing.
[`scripts/lint-rules.ts`](../scripts/lint-rules.ts) is what holds this document
honest: every row parses and carries a declared family; every enforced row's
enforcer resolves against the tree; every enforced row names a real test file
that mentions the literal its fixture asserts on; every pending row carries a
ticket and a reason and names no fixture; every rule this repository configures
by name is claimed by exactly one enforced row; ids are unique across every
family file; every family file holds a row of its own family and this page holds
none; and every `RULE-NNN` cited anywhere in the tracked tree resolves to a row.

## The id

`RULE-NNN`, a flat estate-wide sequence, three digits, in a namespace of its
own so a grep for `RULE-017` finds the rule and a grep for `REQ-004` finds the
behaviour. The family is a **column, not a prefix**: a rule's family is a
reading aid that can be revised, and an id that encoded it would become a lie
the first time a rule was reclassified. The id is what a failure quotes, so it
has to outlive every opinion about where the rule belongs.

## Families

Eleven, the set [issue #21](https://github.com/JorisJonkers-dev/deploy-kit/issues/21)
named, each normalised to one word. None was added and none dropped: what this
repository's own enforcement changed is which families have enforced members:
today every one of the eleven has at least one, `cli` and `registry` since the
compiler landed. A family declared here and used by no rule
fails the gate, so the taxonomy cannot grow entries nothing stands behind. Each
family's rows live in its own file under
[`docs/architecture-rules/`](architecture-rules/), named for the family, so pull
requests adding rules to different families touch different files.

| family | covers | rows |
|---|---|---|
| layering | which ring may import which, on the module graph | [`layering.md`](architecture-rules/layering.md) |
| purity | ambient capability: what a ring may reach for beyond its own imports | [`purity.md`](architecture-rules/purity.md) |
| graph | the graph's shape: cycles, orphans, reachability, resolution | [`graph.md`](architecture-rules/graph.md) |
| dependencies | what may be imported from outside the tree | [`dependencies.md`](architecture-rules/dependencies.md) |
| naming | how modules, files and types are named | [`naming.md`](architecture-rules/naming.md) |
| tests | what a test may do, and must do | [`tests.md`](architecture-rules/tests.md) |
| toolchain | the compiler options, the lint presets, the coverage ratchet | [`toolchain.md`](architecture-rules/toolchain.md) |
| cli | the outermost ring's own conventions | [`cli.md`](architecture-rules/cli.md) |
| registry | the registries: adapters, and the estate-wide invariants | [`registry.md`](architecture-rules/registry.md) |
| diagnostics | the shape of a failure and the codes it carries | [`diagnostics.md`](architecture-rules/diagnostics.md) |
| gates | this repository's own documents and pipeline | [`gates.md`](architecture-rules/gates.md) |

## Rules

A row is enforced or pending, never both. An enforced row names its enforcer as
`kind:value`: `depcruise:` a rule in
[`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs), `eslint:` a rule id in
[`eslint.config.js`](../eslint.config.js), `npm:` a script in `package.json`,
`file:` a file that carries the rule itself. Its proof names the fixture and,
in backticks, the **witness**: the literal that fixture asserts on. Delete the
case and the witness goes with it, which is what makes the proof column
checkable rather than decorative.

A pending row reads `pending (#NNN): reason`, or `pending (n/a): reason` when no
ticket will bring it because it waits on something outside this repository's
plan. It names no fixture: pending may never read as proven. And because every
rule this repository configures by name must be claimed by an **enforced** row,
moving a live rule to pending fails the gate rather than quietly retiring it.

Each family file holds one table of five columns: `id`, `family`, `the rule`,
`enforced by`, `proved by`. A row's family cell names the file it sits in. The
fixture link's text is the test's path from the repository root
(`test/x.test.ts`) and its target is that path from the family file
(`../../test/x.test.ts`).

### Adding a rule

Put the row in its family's file, in id order, never on this page. Take the
next free id across every family file: one above the highest `RULE-NNN` in
`docs/architecture-rules/`, skipping any an open pull request already takes.
A rule that fits no family is a new family: a line in the Families table above
and a file of its own, which the gate requires together. A citation of a rule
names this page, `docs/architecture-rules.md`, not its family file.

## Considered and rejected

Proposing one of these again starts from the argument, not from scratch.

| rule | why not |
|---|---|
| A maximum file length, or a maximum function length | A number nobody can defend at the boundary. The rules that matter here are about edges in a graph, which have a truth value; a 41-line function does not |
| Inline suppressions for boundary rules, the way an `eslint-disable` comment works | An exemption a reviewer never sees is an exemption nobody decided. Where an exception is genuinely needed it belongs in the ruleset, named, with the reason beside it, which is the form every rule in the ledger already takes |
| One ESLint rule per layer, instead of the dependency-cruiser ruleset | ESLint sees one file at a time, so it can catch an import but never a cycle, an orphan or an unreachable subtree ([0060](adr/architecture/0060-boundaries-enforced-on-the-graph.md)). The fast local signal stays; the authority is the graph |
| Folding this ledger into `docs/requirements.md` | A rule and a behaviour answer different questions, and merging them would make the per-rule enforcer story and the per-behaviour test story compete for one row ([0065](adr/architecture/0065-a-behaviour-ledger-names-what-a-test-proves.md)) |
| A severity column, with `warn` as a value | A warning in CI is a rule nobody enforces. Every row above is an error, and a rule not worth failing a build for is a rule not worth a row |
