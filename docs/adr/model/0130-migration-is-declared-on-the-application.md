---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-24
normative: spec/v1/10-project-intent.md#migration
rests-on: ["0001", "0005"]
---

# Migration is declared on the Application: one Liquibase system, one database per project, and one Application that moves it

An Application that derives a database says how its schema moves: a Liquibase
YAML changelog the platform's runner applies, `self` for an image that migrates
itself, or `none`. The estate has one migration system. A project has one
database, every consuming Application of it reads that database, and one of
them moves the schema and alone holds the owner role. The shape, the refusals
and the derivations are
[chapter 10](../../../spec/v1/10-project-intent.md#migration)'s; the runner is
[chapter 14](../../../spec/v1/14-platform-intent.md#migration-policy)'s; when a
migration runs is [chapter 55](../../../spec/v1/55-delivery.md#migrations)'s.
This amends [0080](0080-database-catalog-is-derived-data.md): its catalog
derived one database per consuming Application, and now derives one per
consuming project.

## Rests on

The derivation is total ([0005](0005-derivation-is-total.md)): the migration
image, the identity that runs it, the roles, the deadline and the requests
follow from the changelog path, the project and the Platform document, so the
author writes the path and nothing else. The estate is one maintainer
([0001](0001-estate-scale-and-ownership.md)), so porting every first-party
migration to one system is one person's work, done once.

**False if:** a first-party migration in the estate cannot be expressed as a
Liquibase YAML changelog, or two Applications of one project need two schemas
of their own. **Settled by:** port the estate's first-party migrations to
changelogs the runner applies, and find each project's consuming Applications
reading one database.

## Why

**Declared on the Application, not a Process.** A migration has an up and a
down, a schema, an owner role and a tag per revision, and none of those is a
property of a program that runs. Modelled as a Process with a lifecycle of its
own, the discriminator was a combination of fields (a prepare Process that
happens to hold the owner role and declare a changelog), and forward-only setup
steps, which have no down, sat beside it with the same shape. A field on the
Release Unit says which kind it is.

**One system.** Every form of the runner, its undo, its compatibility proof and
its schema linting is written once, against one changelog format. Third-party
images that migrate themselves stay `self`, outside the proof, as a recorded gap.

**One database per project.** The worked `knowledge` project split into two
Applications when their cutovers differed
([0128](0128-cutover-names-the-promise.md)), and both still read one live
`knowledge_db`. A catalog entry per Application would have given the worker a
second database it does not have. The live estate has one database per project,
so the catalog follows the project, and one Application of it moves the schema.

**The credential an edge derives, with one override.** An edge to a provider
that owns databases derives the consuming Process's data-only credential,
delivered `self` and tolerating a reload by default. The one thing an
application may say about it is that its client cannot reload: the edge carries
`credentials: {rotation}`, and nothing else, because the delivery of a minted
credential is fixed (a non-KV grant is always `self`) and its path and role are
the catalog's.

**The owner role is derived, never granted.** An application Process that can
alter the schema is the privilege a separate migration identity exists to
withhold, so a hand-written grant of it is refused rather than tolerated.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A migration as a `prepare` Process holding the owner role | the Process machinery (env files, identity, placement) stays authorable for the runner | the discriminator is a combination of fields, and forward-only setup with no down looks the same |
| Per-tool runners (Flyway, Atlas, Prisma) chosen per Application | no porting | every proof, undo and linter written once per tool |
| One database per consuming Application, as [0080](0080-database-catalog-is-derived-data.md) had it | no amendment | wrong for the live estate: two Applications of one project share one database |
| The owner role granted by hand where needed | less derivation | the separation it exists for becomes a convention nobody checks |
| A full grant authored on the edge (delivery, path, role) | the author sees every term | the role and path are the catalog's, and a minted credential's delivery is fixed; only the rotation tolerance is the application's to know |

## Reversibility

Undo cost today: drop one field and six refusals from both implementations, a
day. Becomes expensive once changelogs exist in repositories and databases carry
revision tags: moving off Liquibase then means porting every changelog again.

## Consequences

- Every first-party migration ports to a Liquibase YAML changelog with a
  baseline, paid by joris in each application repository
  ([#148](https://github.com/JorisJonkers-dev/deploy-kit/issues/148)).
- The platform runs and pins a runner image, paid by joris in its own
  repository.
- A project's second consuming Application declares `migration: none`, paid in
  one line per such Application.
- `self` migrations have no compatibility proof and no undo, a gap paid by the
  owner of every third-party image that migrates itself.
- A project whose Applications reach two database providers is not modelled:
  one database per project assumes one provider, which the estate's one
  Postgres satisfies, and the day a second appears this record is re-opened.
