---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-16
normative: spec/v1/16-dependencies.md#applying-the-catalog
rests-on: ["0004", "0005"]
---

# The database catalog is applied in the cluster by its engine's method, which adopts a database that exists and writes the Secret Store's database roles

A Job in the unit of the Project that runs the datastore runs the engine's
catalog method beside the datastore, before any Application of another Project
that reads a database starts, and every hour. While that Project is still on the
old path it has no unit, and the estate-scoped artifact applies the Job instead.
It creates each estate-path project's database and its owner and data roles,
adopts a database that already exists, and writes the database roles the Secret
Store issues credentials from. While the datastore is on the old path, it signs
in with the login the old path keeps, which the handover ledger names.

## Rests on

A datastore and the Secret Store are contended by every project, so their
configuration is the platform's ([0004](0004-contention-decides-authority.md)),
and what the inbound edges already say is derived, never authored again
([0005](0005-derivation-is-total.md)). The catalog is that derivation, with the
method the platform's ([0026](0026-migration-is-declared-on-the-application.md)),
and writing to a live system is delivery, done in the cluster by an identity of
the render ([0087](0087-in-cluster-consumers-read-the-render.md)).

**False if:** a project's database must exist before the unit that applies its
catalog does, the unit that applies a catalog waits on a namespace or a Process it
does not bring up, or the Secret Store's database connection can only be
configured by a person. **Settled by:** a project moved onto the estate path whose
database and credentials appear with no `cluster.sh` stage, and a Project that
runs its own Postgres, as immich does, reconciling from an empty namespace.

## Why

**The method knows what it signs in as.** Creating a database, its roles and the
statements a Vault database role runs are the engine's, so the engine's image
does all of it, as a backup's method knows how to dump. The Vault policy job
stays engine-agnostic.

**Its privilege is rendered, not granted by hand.** The method's identity holds
a policy the render writes, naming the admin login's document and the exact
database roles of the catalog. The policy job writes it like any identity's, so
no bootstrap stage widens a fixed role.

**Adopting keeps the old path working.** The estate already runs databases under
the same names, owned by roles the old path made. Reassigning their objects to
the owner role once, and making the old owner a member of it, hands the schema
to the estate path while every old-path login keeps its access until that path
is retired. Re-running reassigns what the old owner created since.

**The datastore's Project applies it.** The catalog exists because of the
datastore, so it is that Project's object
([0116](0116-a-project-owns-every-object-it-delivers.md)). In the
estate-scoped unit, a catalog for a datastore a Project runs itself deadlocked
twice: its ServiceAccount went into a namespace only that Project's unit
creates, and its Job waited on a Process that unit would start, while the unit
waited on the estate-scoped one
([#482](https://github.com/JorisJonkers-dev/deploy-kit/issues/482)). Every
estate Project was held with it. In the datastore's own unit both exist, the Job
retries until the datastore answers, and a failed catalog holds only that
datastore's readers. A shared datastore's catalog still names every Project
that reads it, the one provider-side list the move keeps.

**Only estate-path projects.** A legacy project's database is still the old
path's, so the catalog never takes over a database an old-path Application owns.

**The old path's login, named, while it serves.** The datastore's own derived
login does not exist while the old path runs it, and copying the superuser
password by hand is a step someone forgets after a restore. The ledger's serving
location names where the old path keeps it, and goes with the location.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The Vault policy job writes the database roles | the method writes only to the datastore | the policy job's fixed role gains `database/roles/*`, a bootstrap rerun, and the creation statements move away from the engine that defines them |
| `cluster.sh` creates each database and login | nothing to build | a person runs a stage for every project moved, which is what this removes |
| Reassign objects without keeping the old owner a member | a cleaner role graph | every old-path login loses its schema the moment the catalog applies, before its route moves |
| A one-time copy of the admin login into the derived path | no ledger field | a Vault write by hand, and a second copy of the superuser password to keep in step |
| Apply the catalog for legacy projects too | one rule for all | the estate path would take over databases old-path Applications still migrate |
| Keep every catalog in the estate-scoped unit, and create the namespace there first | no move | the Job still waits on a Process the Project's own unit starts, so the estate-scoped unit deadlocks on it and holds every Project |
| A unit of its own per datastore | a catalog failure holds no workload | one more unit and pin source per datastore, and it still has to follow the Project that runs the datastore |

## Reversibility

Undo cost today: one platform field, one ledger field, one Job and its method:
a day. Becomes costly once: Projects read credentials the catalog's roles issue,
and removing it means writing their logins by hand again.

## Consequences

- An engine that owns databases names a `catalog` method in the Platform
  document, and its image is locked like a backup's.
- A legacy datastore's serving location names its `admin` login until it moves.
- The Secret Store's database connection admits the owner and data roles the
  method writes, configured once with the connection itself.
- A database the old path created is adopted, never recreated, and nothing is
  ever dropped by the method.
