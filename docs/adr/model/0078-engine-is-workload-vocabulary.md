---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#workload
rests-on: ["0005"]
---

# `engine` is layer-1 vocabulary: what the process is, not how it is instrumented

## Rests on
What a Workload's data *is* (a Postgres cluster, a RabbitMQ broker, a directory
of files) is a fact only the owner can state and one the platform must key
several derivations off. False if: every derivation that wants it can get it from
something already declared without inferring from an image name. Settled by:
three derivations reading the same field (the backup method, the database
catalog an inbound edge implies, and an Asset's change response) with none of
them consulting `runtime` or an image alias.

## Why
[0077](0077-durability-derives-a-backup.md) needs to know how to back a volume
up, and the answer differs per datastore: `pg_dump`, a definitions export, a
file copy. Nothing in the model says which a Workload is.

The obvious candidates both fail. `runtime` selects the Runtime Profile (`jvm`,
`python`, `node`, `static`, `none`) which is how a process is *instrumented*,
and `platform-postgres` runs a third-party image whose `runtime` is correctly
`none`; R22 already records `runtime` being asked to imply too much, so
overloading it further is a known mistake. Inferring from the image alias means a
backup method that changes silently when an image is swapped, and the images lock
is a mapping to digests rather than a taxonomy.

Putting it in platform data fails differently: which Services are Postgres is a
fact the Service knows first, and a context republish before a new datastore can
be backed up puts a platform round-trip in front of a Service change.

So it is layer-1 vocabulary, and it stays inside the layer-1 rule because it
states a **fact about the Workload** rather than a mechanism. It names no
Kubernetes kind, no command and no schedule; the platform maps it to those.

It pays for itself three times, which is the argument for a closed vocabulary
rather than a one-off field on the volume. R7's `init-databases.sh` is a derived
catalog of one database and one owning user per consumer, a derivation that only
makes sense for `engine: postgres`. R23 asks whether an Asset change means
restart or reload, and `postgres` supports `pg_ctl reload` while most images do
not. Both currently have no way to ask what the process is.

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
| Platform-side mapping keyed by Service Id | Nothing new in layer 1 | Puts a fact the Service knows first into platform data, and a new datastore needs a context republish before it can be backed up |
| A field on the volume rather than the Workload | Scoped to where the backup happens | Two other derivations want it and neither is about a volume; and a Workload's engine is a property of the process, not of one of its mounts |

## Reversibility
Undo cost today: one optional field, refused where it means nothing, deletable
while nothing keys off it. Becomes irreversible once: repositories author it and
the backup derivation reads it, because removing it then means re-deriving
backup methods from something else for every datastore in the estate.

## Consequences
- Two error codes make the pairing explicit: a Workload holding a backed-up
  volume must declare an engine, and one declaring an engine with no such volume
  is refused, paid by the author, at build time, and it keeps the field from
  becoming decoration.
- The vocabulary is closed, so an estate adding a datastore the catalog does not
  cover is a platform change first, paid by whoever adds it, deliberately.
- R7 and R23 now have a field to key off, which does not decide them; it removes
  the reason they could not be decided, paid by whoever takes those rows.
- One more layer-1 field to document, validate and complete in an editor, on a
  Workload that already carries eight, paid in schema surface, and it is the
  first new authoring field this rebuild has added.
