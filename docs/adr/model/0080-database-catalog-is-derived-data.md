---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/16-dependencies.md#the-database-catalog
rests-on: ["0005"]
---

# The per-consumer database catalog is derived data, and Vault mints the credentials

## Rests on
The inbound edge set already carries everything a database catalog needs — which
Services consume this provider, and therefore which databases and owning users
must exist — and the credential can be issued rather than stored. False if: a
consumer needs a database whose existence is not implied by an edge, or the
estate's Vault has no database secrets engine and configuring one is refused.
Settled by: rendering the `data` domain and diffing the derived catalog against
`init-databases.sh`'s four databases, with every credential resolved through a
`VaultDynamicSecret` and no password appearing in any rendered file.

## Why
Chapter 16 lists "a database and owning user per consumer" as an inbound
derivation and cites the evidence: 98 lines of `init-databases.sh` creating
`auth_db`, `agents_db`, `knowledge_db` and `n8n_db`, one per Service claiming a
Postgres credential. The graph already knows all four. Nothing produces them,
and chapter 10 refuses the obvious vehicle — an Asset may not be executable
([0012](0012-assets-not-code.md)) — so the script has no legitimate home in the
model.

The split that resolves it is the one
[0077](0077-durability-derives-a-backup.md) already made for backups: the render
emits **data** and the platform owns the **method**. A catalog naming each
consumer's database, owning user and Vault role is a `ConfigMap`; the image and
command that apply it come from the engine catalog with the pinned blueprint
packs. Rendering the shell script instead would satisfy 0012's letter — it would
be generated rather than authored — while putting a procedure in the render
surface, where a change to it is a diff no reviewer can validate except by
running it against a live database.

Credentials are **issued, not stored**. Vault's database secrets engine mints a
credential per role, and `vso` already emits the `VaultDynamicSecret` that
projects it, so no password is rendered, written to a Secret by a human, or
rotated by hand. That matters more here than elsewhere: a static database
password is the class of secret this estate holds the most of, and it is the
class [0028](0028-secrets-at-rest-gate.md) is most exposed by.

This was recorded `claim: open` for one reason: the issued credential lives at
`database/creds/<role>`, and no grant in the model could name that path — R20's
row exactly. Choosing dynamic credentials made that row load-bearing instead of
latent rather than working around it with a static password nobody wanted, and
[0085](0085-a-grant-is-a-union-on-engine.md) closed it the same day: a
`database` grant names a role and derives that read path, so the catalog is
renderable and this decision settles.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Render the shell script from a platform template | Matches today's artifact exactly; one file, no second concept | A procedure in the render surface, reviewable only by execution, and it makes the model's ban on executable content a formality |
| Render CRs for a database operator | Fully declarative and self-healing | Adds an operator and CRDs the substrate does not run — the same reason this lost for Vault policies |
| A static credential per consumer at a KV path | Works with the mount that exists, no database engine to configure, and grants align trivially | A hand-rotated database password is the secret class the estate already has too much of, and it hides R20 rather than answering it |
| Let the consumer author its credential path | Grant and credential align by construction | Path layout is platform-assigned by [0023](0023-grant-unit-is-the-path.md), and this hands it back to the Service |

## Reversibility
Undo cost today: a derivation, a `ConfigMap`, and a role name — hours, since
nothing has run. Becomes irreversible once: a live database's owning user is one
this catalog created and its credential is issued dynamically, because reverting
to a static password then means re-granting ownership inside a running database
rather than editing a render.

## Consequences
- R7 closes, and it promoted R20 to blocking on the way — which is how R19, R20
  and R21 came to be decided together rather than each waiting for a compiler to
  trip over it — paid by nobody, and it is the argument for choosing the option
  that exposes a gap over the one that hides it.
- Vault's database secrets engine becomes a platform fixture the estate must
  actually configure, with a connection to Postgres holding privilege to create
  roles — paid by the platform, and it is privilege that previously lived in a
  shell script's `psql` invocation.
- A consumer added to the edge set derives a database, so an edge is now a
  statement with a side effect in a datastore; removing the edge does **not**
  drop the database, because dropping data is destructive and gated by
  [0015](0015-durability-class-per-volume.md) — paid as a stale database nobody
  deletes, which is the safe direction.
- The catalog is one object per provider Workload, so its diff shows the estate's
  whole consumer set changing in one place — paid by nobody, and it is what
  makes an added consumer reviewable.
