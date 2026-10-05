---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/10-project-intent.md#migration
rests-on: ["0001", "0005", "0006"]
---

# Migration is declared on the Application: one Liquibase system, one derived database per project, a proof against the serving version, and an undo only while nothing new serves

An Application that derives a database says how its schema moves: a Liquibase
YAML changelog the platform's runner applies, `self` for an image that migrates
itself, or `none`. A project has one database; every consuming Application of
it reads that database, and exactly one of them moves the schema and alone
holds the owner role.

The database catalog is derived data: the inbound edges to a provider that owns
databases name each consuming project's database, owner role and data role, and
the catalog renders as data while the platform owns the method. An edge derives
the consuming Process's data-only credential, delivered `self`; the edge may say
only its rotation tolerance. The owner role is derived, never granted.

A changelog publishes only with a compatibility proof from the application's
own CI: the serving revision's suite passes against the migrated schema, every
changeset rolls back, and a non-transactional changeset stands alone in its
release. The Release Gate holds a release whose proof names a revision that no
longer serves, and unsuspends the rendered down Job only while nothing new
serves ([chapter 55](../../../spec/v1/55-delivery.md#migration-safety)).

## Rests on

The derivation is total ([0005](0005-derivation-is-total.md)): the migration
image, identity, roles, deadline and database follow from the changelog path,
the project and the edges. The proof names the exact serving revision
([0006](0006-pinned-inputs.md)), so the gate compares two digests instead of
trusting a recent test run. One maintainer ports every migration once
([0001](0001-estate-scale-and-ownership.md)).

**False if:** a first-party migration cannot be a Liquibase YAML changelog, two
Applications of one project need two schemas, a consumer needs a database no
edge implies, a proven migration breaks the serving version, or the gate undoes
a migration a promoted member depends on. **Settled by:** the estate's
migrations ported to changelogs; the `data` project's derived catalog diffed
against `init-databases.sh`'s four databases; a changelog dropping a column the
serving `knowledge` revision reads refused at publish; and a failed barrier
after a migration restoring the serving tag with no member promoted.

## Why

**A migration is not a program that runs.** It has an up and a down, a schema,
an owner role and a tag per revision. As a Process it was a combination of
fields, indistinguishable from forward-only setup with no down
([0027](0027-prepare-processes-are-forward-only-setup.md)). A field on the
Application says which kind it is.

**One system.** The runner, its undo, its proof and its linting are written
once, against one changelog format. Third-party images that migrate themselves
stay `self`, outside the proof, as a recorded gap.

**One database per project.** `knowledge` and `knowledge-ingest` split when
their cutovers differed, and both still read one live `knowledge_db`. A catalog
entry per Application would invent a database nobody has.

**The catalog is data, the method is the platform's.** 98 lines of
`init-databases.sh` created one database per consumer, which the graph already
knew. An executable Asset is refused
([0014](0014-file-shaped-configuration-is-an-asset.md)), and rendering the
script would put a procedure in the render, reviewable only by running it.

**Credentials are issued, not stored.** Vault's database engine mints a
credential per role, and the application fetches it itself
([0029](0029-a-grant-is-a-union-on-engine.md)), so no password is rendered or
rotated by hand. An application Process that can alter the schema holds the
privilege a separate migration identity exists to withhold, so a hand-written
owner-role grant is refused.

**The gate starts it, so the gate must hold it.** The Release Gate starts a
migration once its proof holds and undoes it only under its conditions, and it
decides from its inputs alone ([0052](0052-an-application-is-the-release-unit.md)).
So the inputs carry what those decisions read: the migration identity, the
revision the release was proven against, and whether a changeset of it cannot
run in a transaction. They do not carry the Jobs' names, which hold the
revision's tag: the revision is the digest of an element the inputs are part
of, and the gate learns it from the Canary that asks. An Application nothing
gates has nobody to start its migration, so a changelog there is refused
rather than rendered as Jobs that never run.

**Derived, and written down once.** The identity, the owner role, the
database, the deadline and the requests are functions of the Application id,
the project and the Platform document, so none is authored. They are still
recorded, in the Resolved Deployment's migration plan, because the adapters
read that document and nothing else
([0003](0003-three-model-pipeline.md)): an adapter handed three facts about a
migration would have to derive the rest while serialising, which is a decision
taken where no schema, no lock and no projection shows it.

**Expand then contract, enforced.** "Stop using it in N, remove it in N+1" is a
convention teams forget. Running N's suite against N+1's schema makes the early
removal a red build. A down after any member was promoted removes a schema that
member needs, so automatic undo stops there and the gate alerts instead.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A migration as a `prepare` Process holding the owner role | the Process machinery stays authorable | the discriminator is a combination of fields |
| Per-tool runners chosen per Application | no porting | every proof, undo and linter once per tool |
| One database per consuming Application | no project join | wrong for the live estate |
| Record three facts of a migration and hand the adapters the Platform document for the rest | the Resolved Deployment stays smaller | layer 3 would derive the identity, the database and the terms while serialising, a decision no projection shows |
| Let the gate read `testedAgainst` and `nonTransactional` off the Jobs it unsuspends | no change to the gate's inputs | the gate's decisions would read two kinds of object, and a first release, which has no down Job, would have nowhere to say so |
| Render an ungated Application's migration Jobs unsuspended | an `interrupted` Application could declare a changelog | the migration would run with no proof checked and nothing to hold the rollout on its result |
| Render the init script from a template | matches today exactly | a procedure in the render surface |
| A static credential per consumer at a KV path | no database engine | a hand-rotated database password |
| Trust authors to write compatible changesets | no CI work | the convention fails silently mid-release |
| Undo on every failure | simplest rule | turns a held release into an outage after promotion |

## Reversibility

Undo cost today: one field, six refusals and one derivation in both
implementations: a day. Becomes expensive once: changelogs exist in
repositories and databases carry revision tags, or a live owning user was
created by this catalog with dynamically issued credentials.

## Consequences

- Every first-party migration ports to a Liquibase YAML changelog with a
  baseline, paid by joris in each repository
  ([#148](https://github.com/JorisJonkers-dev/deploy-kit/issues/148)).
- A project's second consuming Application declares `migration: none`.
- `self` migrations have no proof and no undo, paid by the owner of every
  third-party image that migrates itself.
- A reader Application outside the migrating release is proven by nothing yet;
  the worked `knowledge-ingest` is that case, and it is an open question.
- A project reaching two database providers is not modelled; the day a second
  provider appears, this record is rewritten.
