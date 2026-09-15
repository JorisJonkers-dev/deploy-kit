# Agent contract

@AGENTS.md

## Claude-specific notes

Everything above is the one agent contract every tool in this repository
reads; nothing repository-specific lives twice.

- **Skills load from `.claude/skills`**, a symlink to `.agents/skills`
  (`git ls-files -s .claude/skills` reads mode `120000`). This session
  confirmed the symlink exists and resolves on disk; it did not confirm the
  Claude Code skill loader itself discovers a skill through a symlinked
  directory rather than a real one; that needs a live check by whoever next
  opens this repository in Claude Code.
- **`.claude/settings.json`** is this repository's permission allowlist: its
  npm scripts, read-only `git` and `gh`, and nothing that installs a
  package, runs arbitrary code, or writes remote state, save the one label
  write `.github/workflows/claim-issue.yml` performs on GitHub's own side,
  outside Claude Code's permission surface entirely. It also enables the
  `mattpocock-skills`, `typescript-lsp` and `drawio` plugins this repository
  uses.
- **`.mcp.json`** holds `context7`, for library documentation lookups.
- **`docs/agents/`** configures the `mattpocock-skills` engineering skills
  (`triage`, `to-tickets`, `to-spec`, and the rest) for this repository: which
  issue tracker they read and write, which triage label strings map to the
  five canonical roles, and how they should consume `CONTEXT.md` and
  `docs/adr/`. It was written by the `setup-matt-pocock-skills` skill's own
  convention, not by hand.
