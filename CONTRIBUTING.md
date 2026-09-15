# Contributing

This is a source-available proprietary project owned by Joris Jonkers.

External contributions are not accepted unless Joris Jonkers explicitly asks
for them. Public pull requests may be closed without review.

If you were invited to contribute:

1. keep changes scoped to the requested repository and issue
2. do not include secrets, private data, local scratch files, or generated
   planning artifacts
3. do not hand-edit `CHANGELOG.md`; release-please owns changelog updates
4. include the relevant tests or validation output in the pull request
5. use impersonal, professional commit and pull request wording

New prose is written without em-dashes: use a comma, a colon, a full stop or
parentheses instead. A test (`npm test`) fails if a tracked text file gains an
em-dash, and the same test flags any file on the transitional allow list that
no longer has one, so rewrite batches take their files off the list in the same
pull request.

Security vulnerabilities must be reported privately as described in
`SECURITY.md`.

## The shape of a change

Most changes are a fix, a chore, a test, or documentation, and touch one
document or one gate. A change is bigger than that shape when it:

- adds or changes a rule this repository enforces (a ledger row, its
  enforcement, and a failing fixture, together;
  [0104](docs/adr/architecture/0104-every-enforced-rule-has-an-id-a-row-and-a-fixture.md)),
- adds a gate (its npm script and its CI job, in the same pull request;
  [0102](docs/adr/architecture/0102-the-gate-grows-with-the-code.md)), or
- changes what `spec/v1` says the model means, in which case it lands with
  the ADR that decides it, in both implementations while `emf/` exists, and
  with every oracle file the change touches.

`AGENTS.md`'s Boundaries section states which of these an agent may do on its
own and which need to be asked about first.

## When a change takes a decision

A decision is a choice between real alternatives that a later reader would
otherwise have to reconstruct: which family a new rule joins, which layer
owns a capability, why a threshold sits where it does. An ADR records it, in
the domain directory the decision belongs to
([`docs/adr/README.md`](docs/adr/README.md)), in the same pull request as the
change it justifies. A mechanical addition inside an already-decided shape
(another fixture in an existing family, another row in an existing table)
does not need one.

## Conventional Commits

Every pull request title, and every commit in it, uses a Conventional
Commits type release-please reads: `feat`, `fix`, `chore`, `docs`, `test`,
`refactor`, and `feat!` / a `BREAKING CHANGE:` footer for a major.
`scripts/check-pr-title.ts` is the one check, runnable locally and run again
in CI as its own workflow, pr-title, non-gating. It also refuses agent
attribution anywhere in the title, the body, or a commit: no
`Co-Authored-By` trailer naming a coding agent, no "generated with" banner,
no link back to an agent session.

## What runs where

Every gate in [`docs/architecture.md#gates`](docs/architecture.md#gates)
runs as its own job in `.github/workflows/ci.yml`, aggregated by one
required check, `Pipeline Complete`, that fails when any gate job fails, is
cancelled, or is skipped. Five more workflows under `.github/workflows/` run
beside it, none of them gating:

| workflow | runs on | does |
|---|---|---|
| pr-title | every pull request | Conventional Commits and attribution, described above |
| repository-hygiene | every pull request | the estate's shared hygiene guard |
| add-to-project | an issue or pull request opening | files it onto the project board |
| claim-issue | a pull request opening, editing, or closing | claims (or, on close, releases) the issue a closing keyword or the branch name names, by label only, never releasing a parent (see AGENTS.md's Claiming a ticket section) |
| release | a push to `main` | release-please, and publishing the npm package once a release is tagged |

## Release candidates and releasing

Every pull request from a branch of this repository (not a fork, not
Dependabot, not Renovate) publishes a release candidate under the `rc`
dist-tag, from the `release-candidate` job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml); a fork's
`GITHUB_TOKEN` cannot publish, so the job does not try. Releasing `main`
itself, the version scheme, and how a consumer pins a published artifact are
[`VERSIONING.md`](VERSIONING.md)'s contract, not repeated here.
