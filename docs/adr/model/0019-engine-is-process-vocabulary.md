---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-project-intent.md#process
rests-on: ["0005"]
---

# `engine` is layer-1 vocabulary: what the process is, not how it is instrumented

## Rests on
What a Process's data *is* (a Postgres cluster, a RabbitMQ broker, a directory
of files) is a fact only the owner can state and one the platform must key
several derivations off. False if: every derivation that wants it can get it from
something already declared without inferring from an image name, or a provider
whose engine owns databases gets its catalog without declaring it. Settled by:
the two derivations that read the same field (the backup method and the
database catalog an inbound edge implies), with neither consulting `runtime` or
an image alias, and an accepted Postgres on a `reconstructible` volume.

## Why
[0018](0018-durability-class-derives-a-backup.md) needs to know how to back a volume
up, and the answer differs per datastore: `pg_dump`, a definitions export, a
file copy. Nothing in the model says which a Process is.

The obvious candidates both fail. `runtime` selects the Runtime Profile (`jvm`,
`python`, `node`, `static`, `none`) which is how a process is *instrumented*,
and `platform-postgres` runs a third-party image whose `runtime` is correctly
`none`; R22 already records `runtime` being asked to imply too much, so
overloading it further is a known mistake. Inferring from the image alias means a
backup method that changes silently when an image is swapped, and the images lock
is a mapping to digests rather than a taxonomy.

Putting it in platform data fails differently: which Applications are Postgres is a
fact the Application knows first, and a Platform document republish before a new datastore can
be backed up puts a platform round-trip in front of an Application change.

So it is layer-1 vocabulary, and it stays inside the layer-1 rule because it
states a **fact about the Process** rather than a mechanism. It names no
Kubernetes kind, no command and no schedule; the platform maps it to those.

It pays for itself twice, which is the argument for a closed vocabulary rather
than a one-off field on the volume. Beside the backup method, R7's
`init-databases.sh` is a derived catalog of one database and one owning user
per consumer, a derivation that only makes sense for `engine: postgres`. An
Asset's change response once made a third, and it went when every Asset change
became a restart ([0014](0014-file-shaped-configuration-is-an-asset.md)).

**It is declarable wherever a derivation reads it, and refused only where none
does.** A backed-up volume needs its method, so a Process holding one must
declare its engine. A Postgres needs its catalog whatever its volume is worth,
so an engine that owns databases is accepted on a `reconstructible` volume too:
refusing it there would leave its consumers' databases with nobody to derive
them from. An engine that derives neither a backup nor a catalog, a `valkey` on
a `reconstructible` volume, is still refused, because it would be decoration.

The vocabulary is closed and small (`postgres`, `rabbitmq`, `valkey`, `files`)
because a value with no platform behaviour behind it is a label, and the estate
already carries one of those in the Durability Class this pairs with. Adding a
value is a platform change: a method in the catalog, and whatever else keys off
it.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Extend `runtime` to cover datastores | One field instead of two, and it already exists | `runtime` is instrumentation and `platform-postgres`'s is correctly `none`; R22 records this exact overload as a live defect |
| Infer from the image alias | Nothing authored | An image swap silently changes what the platform thinks it is backing up, and the lock maps aliases to digests rather than to kinds |
| Platform-side mapping keyed by Application Id | Nothing new in layer 1 | Puts a fact the Application knows first into platform data, and a new datastore needs a Platform document republish before it can be backed up |
| A field on the volume rather than the Process | Scoped to where the backup happens | Two other derivations want it and neither is about a volume; and a Process's engine is a property of the process, not of one of its mounts |

## Reversibility
Undo cost today: one optional field, refused where it means nothing, deletable
while nothing keys off it. Becomes irreversible once: repositories author it and
the backup derivation reads it, because removing it then means re-deriving
backup methods from something else for every datastore in the estate.

## Consequences
- Two error codes make the pairing explicit: a Process holding a backed-up
  volume must declare an engine, and one declaring an engine that derives
  neither a backup nor a catalog is refused, paid by the author, at build time,
  and it keeps the field from becoming decoration.
- The vocabulary is closed, so an estate adding a datastore the catalog does not
  cover is a platform change first, paid by whoever adds it, deliberately.
- R7 now has a field to key off, which does not decide it; it removes the
  reason it could not be decided, paid by whoever takes that row.
- One more layer-1 field to document, validate and complete in an editor, on a
  Process that already carries eight, paid in schema surface, and it is the
  first new authoring field this rebuild has added.
