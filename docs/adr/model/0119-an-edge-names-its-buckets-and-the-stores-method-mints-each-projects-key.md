---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-26
normative: spec/v1/16-dependencies.md#the-bucket-catalog
rests-on: ["0004", "0005"]
---

# An edge into an object store names its buckets, and the store's catalog method mints each project's key

An edge into an `s3` Process names the buckets its consumer uses, and each is
`<project>-<name>`. The store's catalog method creates them, mints one key per
consuming project scoped to its buckets, and writes the key where that project
reads it. An object store is backed up by the files method over its data blocks
and the snapshots it writes of its metadata, never over the metadata database it
keeps open.

## Rests on

An object store is contended by every project that keeps files in it, so its
configuration is the platform's ([0004](0004-contention-decides-authority.md)),
and what the inbound edges already say is derived, never authored again
([0005](0005-derivation-is-total.md)).

**False if:** a consumer needs a bucket whose name no project and edge name
derive, or a store cannot create a key through its admin API. **Settled by:** a
project moved onto the estate path whose buckets and key appear with no
bootstrap step, and a store rebuilt from nothing that hands every project its
old key back.

## Why

**The bucket catalog is the database catalog's twin.** The catalog is derived
from the inbound edges and applied by the engine's own method
([0102](0102-the-database-catalog-is-applied-by-its-engines-method.md)), so the
same identity, the same Job and the same handover rules hold, and the Vault
policy job stays engine-agnostic.

**The edge names the buckets, because a project uses more than one.** The live
store holds 12 buckets for 9 consumers. Karakeep keeps its assets and its
Litestream replica apart, and Overleaf keeps five. One bucket per project would
merge them into prefixes, which means changing each application's configuration
and copying every object at handover. `<project>-<name>` keeps every live
name, as `<project>_db` kept every database.

**The method mints the key, because a pre-generated key is a step per
consumer.** Today an operator generates each key into Vault before its consumer
exists, and a bootstrap Job imports it. When the method creates the key and
writes it to the project's derived document, a new consumer needs nothing
first. Importing the document where it already exists makes the run repeatable,
and makes a store rebuilt from nothing hand out the same keys again.

**The backup never reads a database being written.** The store keeps its
metadata in an embedded database it holds open, so a copy of those files is not
a consistent backup. The store writes consistent snapshots of it on its own
schedule. The live database sits on a `reconstructible` volume, the snapshots
and the data blocks on volumes the files method archives, so no new method is
needed. The data blocks are never changed in place.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One bucket per project, named `<project>` | the shortest rule | seven live buckets merge into prefixes: an application change in each and an object copy at handover |
| The operator pre-generates every key | the method only imports | a manual Vault write before every new consumer, which is what the catalog removes |
| Convert the store's metadata to SQLite, which the files method copies consistently | one volume | a one-off conversion, and the store's own warning that SQLite is slower |
| No backup until a method for the store exists | nothing to build | its buckets hold uploads and replicas that cannot be rebuilt, so this would leave a gap unsolved |

## Reversibility

Undo cost today: one edge field, one platform field and one method image: a
day. Becomes costly once: consumers read keys the method minted, and taking the
method away means writing each key by hand again.

## Consequences

- An object store's Platform entry names a `catalog` method and the admin
  surface it applies the catalog over.
- A legacy store's serving location names its admin token until it moves.
- Live keys are adopted once at handover, by copying each from its current
  document to the project's derived one.
- A bucket the platform owns, such as a public website's, is no edge's to name.
