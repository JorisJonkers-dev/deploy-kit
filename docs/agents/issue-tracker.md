# Issue tracker: GitHub

Issues and specs for this repository live as GitHub issues in
`JorisJonkers-dev/deploy-kit`. Use the `gh` CLI for every operation; it infers
the repository from `git remote -v` when run inside a clone.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a
  heredoc for a multi-line body.
- **Read an issue**: `gh issue view <number> --comments`, and also
  `--json labels,parent` when a sub-issue relationship matters.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments`
  with `--label` and `--state` filters as needed.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` /
  `--remove-label "..."`. Run `gh label list --repo <owner>/<repo>` once
  before passing a label this repository has not proven exists: the estate
  taxonomy is prefixed (`type:`, `area:`, `component:`, `priority:`,
  `status:`), and a plain `bug` or `enhancement` does not exist here.
- **Close**: `gh issue close <number> --comment "..."`.

## Cross-repository references, written in full

A citation to an issue or pull request in another repository is always the
full `owner/repo#number` form (`JorisJonkers-dev/workspace#45`), never the
bare `#number` this repository's own issues use. GitHub shares one number
space per repository, so a bare number citing another repository silently
resolves to the wrong thing, or to nothing.

## Pull requests as a triage surface

**PRs as a request surface: no.** This is a source-available proprietary
repository (see [`CONTRIBUTING.md`](../../CONTRIBUTING.md)): an external pull
request is not a feature request to triage, and may be closed without review.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Claiming a ticket

This repository's own claim procedure sits in
[`AGENTS.md`](../../AGENTS.md#claiming-a-ticket), not here: claiming moves
`status: in-progress` on, `status: ready-for-agent` off, on the issue and its
parent, before the first edit, and moves it back when the work lands or is
abandoned. `.github/workflows/claim-issue.yml` does the same for a pull
request that closes, fixes or resolves an issue an agent forgot to claim by
hand, or whose branch name embeds one, using labels only: it cannot set the
project board's own field, and on release it only ever releases the issue
itself, never the parent, which stays a human's call.
