---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-24
normative: spec/v1/55-delivery.md#migration-safety
rests-on: ["0001", "0006"]
---

# A migration is proven against the serving version, and undone only while nothing new serves

A changelog publishes only with a compatibility proof from the application's
own CI. The serving revision's test suite must pass against the migrated schema,
every changeset must roll back, and a non-transactional changeset must stand
alone in its release. The fragment records which revision the proof ran
against, and the Release Gate holds a release whose proof names a revision that
no longer serves. A held release's migration is undone by a rendered, suspended
down Job, which the gate unsuspends only while nothing new serves. The rules are
[chapter 55](../../../spec/v1/55-delivery.md#migration-safety)'s, and the undo is
[chapter 55](../../../spec/v1/55-delivery.md#failure-and-undo)'s.

## Rests on

What the cluster runs is a function of pinned inputs
([0006](0006-pinned-inputs.md)): the proof names the exact serving revision it
ran against, so the gate compares two digests rather than trusting that a test
suite was recent enough. The estate is one maintainer on one cluster
([0001](0001-estate-scale-and-ownership.md)), so the application's own CI is
where both versions and the changelog already exist, and no shared migration
service is worth running.

**False if:** a migration that passed its proof breaks the version still
serving, or the gate undoes a migration while a promoted member depends on it.
**Settled by:** release a changelog that drops a column the serving `knowledge`
revision reads and observe the fragment refuse to publish. Then fail the
barrier of a release whose migration ran and observe the down restore the
serving tag, with no member promoted.

## Why

**The model cannot read a changelog.** Whether a changeset is compatible with
the serving version depends on what that version's code does with the schema,
which only its own tests know. The model's part is to require the proof, record
what it was run against, and refuse to act on a stale one.

**Expand, then contract, enforced instead of remembered.** "Stop using it in N,
remove it in N+1" is a convention every team writes down and eventually
forgets. Running N's suite against N+1's schema makes the early removal a red
build.

**Undo only while nothing new serves.** A down run after any member was promoted
removes a schema the promoted member needs. The four conditions are exactly the
state in which the database is the only thing that changed. Outside it,
automatic undo would trade a held release for an outage, so the gate alerts
instead.

**A non-transactional changeset is never undone automatically.** It can fail
halfway, and no rollback is proven against a halfway state. Standing alone in
its release keeps that risk off every other changeset.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Trust the author to write backwards-compatible changesets | no CI work | the convention fails silently, and the serving version breaks mid-release |
| Never undo; always fix forward | nothing to render | a held release leaves a migrated schema under the old version indefinitely, and an operator undoes it by hand under pressure |
| Undo on every failure, including after promotion | simplest rule | removes the schema a promoted member reads, turning a held release into an outage |
| Run migrations after the switch | no compatibility window | the new version starts against the old schema, which is the same problem pointed the other way |

## Reversibility

Undo cost today: supersede this record and drop the down template, a day. It
becomes expensive once application CI pipelines depend on the proof steps and
releases stop being written defensively.

## Consequences

- Every application repository with a changelog runs the serving revision's
  suite against its migrated schema before it publishes. Its owner pays in CI
  minutes.
- A release proven against a revision that has since been replaced is held
  until it is proven again. Whoever raced the other release pays.
- A failure during promotion, or in a release with a non-transactional
  changeset, pages someone instead of undoing itself. The Application's owner
  pays.
- The render carries one suspended Job per migrating Application that normally
  never runs, paid once by the adapter that renders it.
