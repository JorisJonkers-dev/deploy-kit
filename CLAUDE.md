# Agent contract

The estate-wide conventions live in one place and are **not duplicated here**:

**https://github.com/JorisJonkers-dev/workspace/blob/main/CLAUDE.md**

Read it before doing anything non-trivial in this repository. It covers the
things that most often go wrong, including:

- **Pull request labels.** The estate uses a prefixed taxonomy — `type:`,
  `area:`, `component:`, `priority:`, `status:`. Plain `bug` / `enhancement` /
  `documentation` do **not** exist, and `gh pr create` fails with
  `'bug' not found`. Run `gh label list --repo <owner>/<repo>` once before
  passing `--label`.
- **Verify the value, not the command.** An exit code, a `Ready` condition or
  an accepted object is not evidence that a consumer sees what you intended.
- Traps around workflow runs, `zsh` word-splitting, and detached submodule
  HEADs.

Duplicating that content into every repository guarantees the copies drift, so
this file stays a pointer. Add repo-specific guidance below.

---

## This repository

`deploy-kit` holds the deployment model, its decision record, and (as it lands)
the compiler that renders it.

**ADRs justify; `spec/v1` is normative.** An ADR carries no field lists, no
error-code tables and no worked YAML — those live in the chapter its
`normative:` pointer names. Where the two disagree, the spec wins and the ADR is
what gets fixed.

Before changing anything under `docs/adr/` or `spec/v1/`:

- Read [`docs/adr/README.md`](docs/adr/README.md) for the register and the
  citation rule, and `docs/adr/0003`–`0006` for the model's premises.
- Run `npm run lint:adrs`. It enforces frontmatter schema, register integrity,
  qualified citations (a bare `ADR-` token outside a link fails), normative
  anchors resolving against real headings in `spec/v1`, and content shape.
- A **decision** names only **premises** in `rests-on`. A decision-to-decision
  dependency is prose, not frontmatter.
- A `claim:` other than `settled` requires an `owner:`.
- Adding a `## ` heading to a chapter that an ADR points at, or renaming one,
  breaks the anchor check. Change both together.

Delivery mechanics and co-testing are **defined separately** — see
[`docs/adr/deferred/README.md`](docs/adr/deferred/README.md). Do not specify an
applier, a prune pass, a field manager or a co-test gate in `spec/v1`; state the
model-level rule and point at the deferred set.

`deploy-config-schema` is the repository this one replaces. It stays alive and
authoritative until `deploy-kit` can render the estate; do not treat it as dead.
