# Agent contract

The estate-wide conventions live in one place and are **not duplicated here**:

**https://github.com/JorisJonkers-dev/workspace/blob/main/CLAUDE.md**

Read it before doing anything non-trivial in this repository. It covers the
things that most often go wrong, including:

- **Pull request labels.** The estate uses a prefixed taxonomy: `type:`,
  `area:`, `component:`, `priority:`, `status:`. Plain `bug` / `enhancement` /
  `documentation` do **not** exist, and `gh pr create` fails with
  `'bug' not found`. Run `gh label list --repo <owner>/<repo>` once before
  passing `--label`.
- **Verify the value, not the command.** An exit code, a `Ready` condition or
  an accepted object is not evidence that a consumer sees what you intended.
- Traps around workflow runs, `zsh` word-splitting, and detached submodule
  HEADs.

Duplicating that content into every repository guarantees the copies drift, so
this file stays a pointer. Everything below is repository-specific.

## What this repository is

`deploy-kit` holds the deployment model (`spec/v1`), its decision record
(`docs/adr/`), and the compiler that renders it: a TypeScript production
implementation under `src/` (not yet landed) and, for the length of a
university course, a model-driven implementation under `emf/`. Start at
[`README.md`](README.md) for the shape of the model, or
[`docs/adr/README.md`](docs/adr/README.md) for why each rule is what it is.

**ADRs justify; `spec/v1` is normative.** An ADR carries no field lists, no
error-code tables and no worked YAML: those live in the chapter its
`normative:` pointer names. Where the two disagree, the spec wins and the ADR
is what gets fixed. The same relationship holds a second time, for code
instead of the model: [`docs/architecture.md`](docs/architecture.md) is
normative for the compiler's own structure, and
[`docs/architecture-rules.md`](docs/architecture-rules.md) is the ledger of
every rule a tool enforces on it.

## Stack

- Node, pinned exactly in [`.nvmrc`](.nvmrc); `nvm use` before anything else.
- TypeScript, ESM only (`"type": "module"`), run directly by Node's type
  stripping: no build step for tooling, ever (`test`, `scripts/`).
- Vitest for the suite, ESLint (`strictTypeChecked`, with type information)
  and Prettier for style, dependency-cruiser for the module graph, Stryker for
  mutation testing.
- `emf/` is a second, separate stack: Maven and Tycho on JDK 21, building
  Ecore, Xtext, OCL, QVT-Operational and Acceleo. It has its own `AGENTS.md`
  equivalent in [`emf/docs/architecture.md`](emf/docs/architecture.md); this
  file only routes an agent into it, per
  [the parity contract](#the-model-driven-implementation-under-emf).

## Setup

```bash
nvm use             # the exact Node .nvmrc pins
npm ci
npm run verify       # lint, format, typecheck, every contract, tests + coverage
```

`npm run lint:adrs` alone runs the decision-record contract; `npm test` runs
the suite without enforcing coverage.

## Every npm script

Every script `package.json` defines, verbatim. A test
([`test/agents-contract.test.ts`](test/agents-contract.test.ts), enforced by
`npm run lint:agents`) fails the moment `package.json` gains a script this
table does not name, so a new gate cannot go undocumented.

| script | what it runs |
|---|---|
| `lint` | ESLint over the tree |
| `lint:fix` | ESLint, applying every fix it can |
| `lint:adrs` | the decision-record contract: frontmatter, register, citations, normative anchors |
| `lint:links` | every relative link and heading anchor in tracked Markdown |
| `lint:manifests` | every rendered example object against pinned Kubernetes and CRD schemas |
| `lint:boundaries` | the compiler's layer boundaries and module reachability on the dependency graph |
| `lint:requirements` | the behaviour ledger, [`docs/requirements.md`](docs/requirements.md) |
| `lint:rules` | the rule ledger, [`docs/architecture-rules.md`](docs/architecture-rules.md) |
| `lint:codes` | every specification `E_` code, exercised or pending |
| `lint:docs` | README.md and CONTRIBUTING.md, held to the scripts, paths, coverage numbers and Node version they name |
| `lint:agents` | this table, held to `package.json`'s real script list |
| `lint:meaning` | a citation to a superseded decision with no successor named, a retired term read as current, a stale count |
| `lint:secrets` | a committed secret, against the default ruleset and this repository's own allowlist |
| `report:pr` | comments a pull request's shape and coverage (CI only) |
| `publish:rc` | publishes a release candidate from a pull request (CI only) |
| `format` | Prettier, applied |
| `format:check` | Prettier, checked only |
| `typecheck` | `tsc --noEmit` |
| `test` | the suite, no coverage enforced: the fast local loop |
| `test:coverage` | the suite, with the coverage ratchet enforced |
| `test:mutation` | Stryker, against the break score in `stryker.config.json` |
| `verify` | every gate above, in the order CI runs them as separate jobs |

## Testing strategy

Normative in [`docs/architecture.md#testing`](docs/architecture.md#testing).
Four seams carry the suite once the compiler lands: the use-cases, the adapter
port, the rendered tree, and the CLI. Every gate, including the ones that hold
this repository's own documents rather than code, carries a negative fixture:
a gate that has only ever run clean is untested.

Coverage is a ratchet
([0101](docs/adr/architecture/0101-coverage-is-a-ratchet.md)): the thresholds
in `vitest.config.ts` sit on what the suite reaches, over an explicit include
list, and only ever rise. Mutation testing holds the same shape with a break
score in `stryker.config.json`. Neither covers `emf/`, which measures itself.

## Code style

ESLint's `strictTypeChecked` preset plus this repository's own rules (no
`any`, no `I`-prefixed interface, no floating promise, no fixed sleep in a
test, and the rest of the `toolchain` and `tests` families in the rule
ledger), Prettier for formatting, and the layer boundaries in
[`docs/architecture.md#layers`](docs/architecture.md#layers) enforced on the
module graph rather than by review. `CONTEXT.md` is the naming authority: a
type, a folder or a diagnostic that names a model concept uses the word
`CONTEXT.md` defines, unchanged.

## Boundaries

Agreed alongside issue #21, and binding on every agent regardless of which
tool runs it.

- **Always:** claim the ticket before the first edit, and release it when the
  work lands (see [Claiming a ticket](#claiming-a-ticket) below). Write the
  test with the change, in the tier that proves it. Run `npm run verify`
  before pushing. Branch off `main`, and give the pull request a
  conventional-commit title. Record a decision as an ADR in the same pull
  request; `spec/v1` wins where the two disagree. Add a rule's ledger row,
  enforcement and failing fixture together. Run `gh label list` before
  passing `--label`.
- **Ask first:** lowering any threshold (coverage, mutation, a lint rule).
  Adding a runtime dependency. Changing the layers, a dependency rule or its
  enforcement. Changing what `spec/v1` says the model means. Anything that
  touches release, publishing or rulesets.
- **Always, while `emf/` exists:** land a model change in both
  implementations and in the oracle files it affects, in one pull request.
  Keep every Java build file, check, ledger and decision inside `emf/`, and
  check both ADR registers before taking a number.
- **Never:** generate one implementation from the other, regenerate an oracle
  file in CI, or add a root dependency on anything under `emf/`. Push to
  `main` or force-push a shared branch. Edit a version or `CHANGELOG.md` by
  hand. Reverse a settled ADR in place; supersede it instead. Hand-edit a
  generated file. Specify an applier, a prune pass, a field manager or a
  co-test gate in `spec/v1`. Cite a bare ADR number. Commit on a detached
  HEAD, or to a path the hygiene guard denies. Treat `deploy-config-schema` as
  dead.

## Claiming a ticket

Picking up an issue is part of doing the work, not a separate step to skip
under pressure.

1. **Before the first edit**, move the issue to in progress: `status:
   in-progress` on, `status: ready-for-agent` off, the same status on the
   project board, and the parent epic moved with it.
2. **When the work lands or is abandoned**, move it back so the board never
   shows work in progress that nobody holds.

This is the procedure; it is not the guarantee. `.github/workflows/claim-issue.yml`
claims (and releases) the issue a pull request names, so a claim an agent
forgot corrects itself. It reads a claim only where GitHub itself would read
one: a closing keyword (`closes`, `fixes`, `resolves`, and their
inflections) immediately naming an issue, or the branch name's leading
number. A number merely mentioned ("follows #115", "blocked by #39") is
never a claim; reading it as one is the exact shape of a real incident. On
claim, the parent is claimed too, if it has one and is not already claimed.
**On release, only the issue the pull request itself names is released,
never its parent**: one child pull request closing is not evidence the
whole epic is done, so the parent's status is a human's call, or a later
workflow's that checks every child.

That workflow can only add and remove labels: setting the project board's
own field needs a token scope the default `GITHUB_TOKEN` does not carry, so
a board left out of step with its labels needs a human or an app-token
workflow to fix, and the claim workflow says so in its own log rather than
claiming a fix it cannot make. It is non-gating: it never joins
`Pipeline Complete`.

## Repository skills

Four skills live in [`.agents/skills/`](.agents/skills/), and
`.claude/skills` is a committed symlink to that directory
(`git ls-files -s .claude/skills` reads mode `120000`) so Claude Code loads
the same set without a copy to drift. Every skill routes into the documents
above instead of restating them.

| skill | what it does |
|---|---|
| [`adr`](.agents/skills/adr/SKILL.md) | Writes a decision record to this repository's own ADR contract: the right domain directory, the next estate-wide number (checking both registers while `emf/` exists), the frontmatter, premises only in `rests-on`, an Alternatives table, the register row, and an anchor that resolves. |
| [`spec-change`](.agents/skills/spec-change/SKILL.md) | Edits a spec chapter as one change: its anchors, the ADRs that point at it, `CONTEXT.md`'s vocabulary, the worked examples, the rendered trees, the oracle files, the diagrams, and both implementations' declarations. |
| [`gate-triage`](.agents/skills/gate-triage/SKILL.md) | Goes from a failing CI job or a quoted rule id to its ledger row and the ADR that decided it, so a red gate resolves to the document that explains it rather than a guess. |
| [`new-rule`](.agents/skills/new-rule/SKILL.md) | Adds a rule ledger row, its enforcement and a failing fixture that proves it, in one change, per [0104](docs/adr/architecture/0104-every-enforced-rule-has-an-id-a-row-and-a-fixture.md). |

`.claude/settings.json` holds this repository's permission allowlist (its npm
scripts, read-only `git` and `gh`, and the one labelled write the claim step
needs) and enables the `mattpocock-skills`, `typescript-lsp` and `drawio`
plugins. `.mcp.json` holds `context7`.

## Agent skills

### Issue tracker

GitHub Issues, through the `gh` CLI. See
[`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The estate `status:` set, including `status: ready-for-agent` and
`status: ready-for-human`. See
[`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: `CONTEXT.md` plus `docs/adr/`, with `spec/v1` normative over
both. See [`docs/agents/domain.md`](docs/agents/domain.md).

## Repeated procedures

- **Citing a decision.** Never a bare ADR number; a citation is always a
  link. Citing a superseded ADR without linking its successor in the same
  sentence fails `npm run lint:meaning`.
- **Cross-repository references.** Written in full
  (`JorisJonkers-dev/workspace#45`), never bare (`workspace#45`), the same
  rule `docs/agents/issue-tracker.md` states for the issue tracker.
- **Opening a pull request.** Use the `pr-composer` skill: draft, get the
  maintainer's approval, then open. Conventional-commit title, no agent
  attribution anywhere in the title, body or commits
  ([REQ-012](docs/requirements.md)).
- **Checking a rule's id.** Grep `docs/architecture-rules.md` for a
  `RULE-NNN`, or use the `gate-triage` skill.
- **Adding a gate.** Its npm script and its CI job land in the same pull
  request ([0102](docs/adr/architecture/0102-the-gate-grows-with-the-code.md));
  `test/pipeline-wiring.test.ts` fails otherwise.

## Where to read deeper

- [`CONTEXT.md`](CONTEXT.md): the vocabulary, and the naming authority for
  code.
- [`spec/v1/00-overview.md`](spec/v1/00-overview.md): the normative model.
- [`docs/adr/README.md`](docs/adr/README.md): the decision register, the
  citation rule, and the domain table.
- [`docs/architecture.md`](docs/architecture.md): the compiler's own
  structure, normative for code.
- [`docs/architecture-rules.md`](docs/architecture-rules.md) and
  [`docs/requirements.md`](docs/requirements.md): the rule ledger and the
  behaviour ledger, two different questions kept in two different documents.

## The model-driven implementation under `emf/`

The MDE course requires the compiler to be built with Ecore, Xtext, OCL,
QVT-Operational and Acceleo, so `emf/` holds the model-driven implementation:
a second, hand-written Java implementation beside the TypeScript production
implementation (Maven and Tycho, JDK 21, no Eclipse IDE to build, but
loadable in Eclipse for the course's examiners). It is deprecated from the day
it lands and deleted at its sunset:

- **The root stays TypeScript.** Every pom, module, check, ledger and
  decision of the Java side lives under `emf/`. The root references it only
  from CI (the `emf` job, the `emf` ADR lint step and CodeQL's `java-kotlin`
  entry), `test/emf-wiring.test.ts` with its ledger rows, the `emf` domain in
  `scripts/lint-adrs.ts` and its test, the release-please and Renovate
  configuration, and
  [`docs/architecture.md#the-parity-contract`](docs/architecture.md#the-parity-contract).
- **Never generate one implementation from the other.** Both are tested,
  separately, against committed oracle files under `spec/v1/examples/`.
- **A model change lands in both implementations** and in the oracle files,
  in one pull request.
- EMF decisions live in [`emf/docs/adr/`](emf/docs/adr/README.md), numbered
  from the root's sequence. Check both registers before taking a number, and
  lint with `node scripts/lint-adrs.ts emf`.

`deploy-config-schema` is the repository this one replaces. It stays alive
and authoritative until `deploy-kit` can render the estate; do not treat it
as dead.

## MDE coursework material

`docs/mde/` holds a university course's reports, lecture decks and background
reading. Every PDF there has a Markdown conversion beside it, with its
figures in a sibling `-images/` directory. **Start from
[`docs/mde/INDEX.md`](docs/mde/INDEX.md)**: it says which document covers
which topic, down to the section anchor and the PDF page, so open one section
of one `.md` rather than reading a PDF end to end. Some of these run to 400
pages.
