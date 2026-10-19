---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-19
normative: spec/v1/55-delivery.md#migration-safety
rests-on: ["0001", "0004"]
---

# The runner lints a release's SQL and bounds every lock it waits for, so a migration fails in CI or gives up instead of stalling

A fourth migration-safety obligation lints the SQL each changeset of a release
renders to, for statements that take a long lock or destroy data. A changeset
that means to do either says so in its own `comment`, rule by rule. The runner
connects with a lock timeout and a statement timeout of its own, so every
migration gives up instead of queueing behind a busy table.

## Rests on

One maintainer keeps every changelog
([0001](0001-estate-scale-and-ownership.md)), so a check written once, where
every migration already runs, is the only one that stays in step. No project
contends for how a migration waits on a lock, so the platform's runner decides
it ([0004](0004-contention-decides-authority.md)), and every migration image is
built `FROM` that runner
([0026](0026-migration-is-declared-on-the-application.md)).

**False if:** a release whose changesets the lint passed still holds a lock
long enough to stall the serving version, or a changeset the lint refused was
safe on every table it could reach.
**Settled by:** the first contract-step release that drops a column with a
`lint:` comment, and the first release that meets a held lock and fails after
the lock timeout instead of waiting.

## Why

**Reversibility proves undo, not safety while serving.** `update-testing-rollback`
applies, rolls back and applies again on an empty throwaway database, where
every lock is free and every table is small. A `CREATE INDEX` without
`CONCURRENTLY`, a `NOT NULL` column added to a large table, or a type change
that rewrites the table passes there and stalls the serving version in the
cluster. Moving off goose had dropped `squawk`, which used to refuse those,
from identity's CI ([identity#10](https://github.com/JorisJonkers-dev/identity/issues/10)).

**The SQL is what locks, so the SQL is what is linted.** A YAML change type
names an intent; only its rendered SQL shows whether it rewrites a table.
Liquibase renders a release with `update-sql` against the database the serving
revision left, which is exactly the release and nothing older.

**An exception is written where the change is.** Expand, then contract, means
a release does drop a column the serving version no longer reads. The
changeset names each rule it breaks and why, in its own `comment`, so the
exception is reviewed with the change and does not outlive it.

**A lock nobody can get must fail the migration, not the service.** Postgres
queues an `ALTER TABLE` behind any open transaction on the table, and every
later query queues behind the `ALTER`. A short lock timeout turns that into a
failed migration, which the release already knows how to hold and undo. A
statement timeout bounds the work itself, under the Job's own deadline.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Lint each changelog in its own repository's CI | no runner change | the same check, configuration and exception rule copied into every repository, drifting apart |
| Lint the YAML change types | no rendering step | a change type does not say which statements it emits, so it misses rewrites and flags safe changes |
| Exceptions in a file beside the changelog | one place to read them | an exception outlives the changeset it was for, and is reviewed apart from it |
| Timeouts set by a first `runAlways` changeset | no runner change | every changelog must carry it, and one that forgets runs unbounded |
| Timeouts on the owner role | set once per database | the platform's database catalog would own a migration concern, and a session can raise its own role's setting |

## Reversibility

Undo cost today: one CI command, one obligation row and two connection
settings in the runner: an hour. Becomes costly once: changelogs carry `lint:`
comments, which would then mean nothing, and releases rely on failing fast
instead of waiting.

## Consequences

- An application's CI runs one more step of the Migration Proof action, which
  fails the publish on any unexcused finding.
- A contract step that drops or rewrites names the rule in its changeset's
  `comment`, every time.
- A migration that needs longer than the statement timeout splits into
  smaller changesets, or sets its own `statement_timeout` first.
