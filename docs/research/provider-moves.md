# Moving a provider under its consumers

How a provider that many Applications depend on (Postgres, RabbitMQ, the
`auth` Application) can change version or location with near-zero downtime.
Researched 2026-10-09; see [the index](README.md#method) for the markers used.

The redesign this informs: every provider surface with consumers gets a
**Stable Address**, an ExternalName Service in a fixed estate namespace that
names the active Instance; a change the engine catalog calls data-incompatible,
or a change of location, derives a **Move**: a second Instance, a sync, a
**Fence** on the old Instance, a flip of the Stable Address, and reverse
replication so a rollback loses nothing while the old Instance is retained.
Today a consumer's coordinates are the literal
`<process>.<namespace>.svc.cluster.local` rendered into its own artifact
([chapter 20](../../spec/v1/20-resolved-deployment.md)), so a provider that
moves changes every consumer's render, and each consumer flips when its own pin
moves.

## Indirection

### ExternalName

An ExternalName Service makes the cluster DNS answer with a CNAME: "No
proxying of any kind is set up"
([Service](https://kubernetes.io/docs/concepts/services-networking/service/#externalname)).
Three consequences follow from the documentation:

- **No port remapping.** The field reference describes `externalName` as an
  alias that "discovery mechanisms will return", with "No proxying"
  ([ServiceSpec](https://kubernetes.io/docs/reference/kubernetes-api/service-resources/service-v1/)),
  so a client connects to whatever port the target serves. A Stable Address
  cannot hide a port change; a port change stays an expand-and-contract change
  ([chapter 50](../../spec/v1/50-lifecycle.md#expand-and-contract)).
- **Host and TLS name mismatch.** The documentation warns that HTTP requests
  carry a `Host` header the origin may not recognise and that a TLS server
  cannot present a certificate for the name the client used
  ([Service](https://kubernetes.io/docs/concepts/services-networking/service/#externalname)).
  Harmless for plain in-cluster Postgres or AMQP; it matters for an HTTP
  surface behind name-based routing or TLS.
- **No policy by name.** NetworkPolicy selects pods, namespaces and CIDR
  blocks, never Services
  ([NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/)).
  A consumer's egress must admit the pods of every Instance it may reach, which
  is why the redesign admits every Instance while a Move is open.

The alternatives are heavier: a selectorless Service with hand-managed
EndpointSlices (port-capable, but IP-based and blind to a namespace move), or a
proxy hop. Gateway API's `TCPRoute` forwards a listener to a backend Service
with port remapping and is in the Standard channel since v1.6.0
([TCP guide](https://gateway-api.sigs.k8s.io/guides/tcp/)), at the cost of a
gateway in every connection's path.

### What bounds the flip

A flip reaches a consumer when its next lookup returns the new target.

| layer | behaviour | source |
|---|---|---|
| CoreDNS `kubernetes` plugin | answers with a TTL of 5 seconds by default; k3s's Corefile sets no `ttl` | [kubernetes plugin](https://coredns.io/plugins/kubernetes/), [k3s Corefile](https://raw.githubusercontent.com/k3s-io/k3s/master/manifests/coredns.yaml) |
| CoreDNS `cache` plugin | k3s sets `cache 30`, a ceiling only: "TTL only caps the cache duration and does not extend it" | [cache plugin](https://coredns.io/plugins/cache/) |
| JDK | "The default behavior in this implementation is to cache for 30 seconds"; negative answers 10 seconds; the security manager can no longer be enabled from JDK 24 | [java.security](https://raw.githubusercontent.com/openjdk/jdk/master/src/java.base/share/conf/security/java.security), [JEP 486](https://openjdk.org/jeps/486) |
| Go | no answer cache; `resolv.conf` re-read at most every 5 seconds | [dnsclient_unix.go](https://raw.githubusercontent.com/golang/go/master/src/net/dnsclient_unix.go) |
| glibc, Node | no answer cache in the library; `nscd` caches when it runs | [nscd(8)](https://man7.org/linux/man-pages/man8/nscd.8.html), [Node dns](https://nodejs.org/api/dns.html) |
| PgBouncer | resolves at connect time, cached per `dns_max_ttl`; on a change, "existing server connections are automatically closed when they are released" | [config](https://www.pgbouncer.org/config.html) |
| HikariCP | `maxLifetime` 30 minutes; `keepaliveTime` 2 minutes | [README](https://raw.githubusercontent.com/brettwooldridge/HikariCP/dev/README.md) |

So a new connection sees the new target within about 30 seconds on the JVM and
5 seconds elsewhere (that the CNAME carries the 5-second TTL is a **settle by
drill**: `dig` an ExternalName Service on the cluster). An *established*
connection never sees the flip: a pooled JVM connection can stay on the old
Instance for up to 30 minutes. Whatever closes old connections, not the DNS
change, is what moves consumers. That is the Fence's job, and it is why
consumers must reconnect and re-resolve.

GitHub's MySQL high-availability redesign reached the same conclusion from the
other side: "Clients cache DNS names for a preconfigured time", and the new
design "removes VIP and DNS changes altogether"
([GitHub](https://github.blog/engineering/infrastructure/mysql-high-availability-at-github/)).
For a homelab estate a short-TTL CNAME plus a fence that closes connections is
the proportionate version of that.

## The closest analogue: RDS Blue/Green

AWS RDS Blue/Green Deployments keep a green copy in sync by replication and
switch it in place of the blue one; a switchover "typically takes under a
minute with no data loss and no need for application changes"
([overview](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/blue-green-deployments-overview.html)).
Its switchover, in order
([switching](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/blue-green-deployments-switching.html)):

1. guardrails: green healthy and caught up, no long-running writes or DDL on
   blue;
2. stop new writes on both;
3. drop connections to both and refuse new ones;
4. wait for replication to catch up;
5. rename: green takes blue's name and endpoints, blue becomes `-old`;
6. allow connections, then writes on the new primary.

The old primary stays read-only (`default_transaction_read_only` for
PostgreSQL, `read_only` for MySQL) until cleared by hand, which is the guard
against writing to both. A timeout, 300 seconds by default and settable from
30 to 3600, rolls everything back if exceeded. AWS asks that clients not raise
the DNS TTL "beyond five seconds", or applications "will continue to send write
traffic to the blue environment". And for PostgreSQL, an application that
overrides `default_transaction_read_only` can write during the switchover,
writes "lost on rollback".

What the Move takes from it: the guardrail step before the fence; a timeout
that holds and rolls back; the old Instance left read-only, never writable
again without a decision; and a stated DNS TTL ceiling. What the Move adds:
reverse replication for a lossless rollback, which RDS does not offer, and a
dependency graph that says which consumers to watch after the flip.

## A move method per engine

Every engine needs the same five operations: **sync** from old to new across
the version change, a **lag probe** precise enough to say "caught up", a
**fence** that stops writes on the old Instance and closes its clients, an
**unfence** on the new one, and **reverse** sync for rollback. The table gives
what each engine documents; the sections below give the evidence.

| engine | sync | lag probe | fence | reverse possible when |
|---|---|---|---|---|
| PostgreSQL | logical replication: publication and subscription, schema copied by hand | publisher and subscriber LSNs | `default_transaction_read_only`, then terminate backends | settle by drill |
| MySQL | binlog replication with GTIDs | GTID sets compared | `super_read_only` | only along a supported upgrade path, not downward |
| MariaDB | binlog replication | (not researched) | `read_only` (not researched) | not downward: the replica must be the same or later |
| Valkey | `REPLICAOF`, partial or full resync | replication offsets, per byte | `CLIENT PAUSE ... WRITE` | not established; replicas upgrade first |
| RabbitMQ | Federation or Shovel between clusters | queue depth on the old cluster | `max-connections: 0` on the vhost, then `close_all_connections` | only while no new feature flag is enabled |
| MongoDB | `mongosync`, or a replica-set rolling upgrade | `mongosync` progress | `setUserWriteBlockMode` | after lowering the compatibility version, if no incompatible data exists |
| Garage | a generic S3 copy; no Garage-to-Garage sync documented | (none) | `garage bucket deny --write` per key | no downgrade documented |
| MinIO and S3 | bucket or site replication, or `mc mirror --watch` | (no numeric metric) | (per-key policy, unverified) | site and two-way bucket replication are bidirectional |
| Kafka | MirrorMaker 2, offsets translated through checkpoints | `replication-latency-ms`, `checkpoint-latency-ms` | (ACLs, unverified) | a second flow in the opposite direction; KRaft not after finalising |
| NATS JetStream | stream `sources` or `mirror`, one-way | source `lag` (field unverified) | (unverified) | a second source in the opposite direction |
| OpenSearch | the replication plugin, or reindex from remote | replication status | `index.blocks.write` | snapshots move forward one major only |
| Elasticsearch | cross-cluster replication (Platinum and above) | (unverified) | `index.blocks.write` | snapshots never restore into an earlier version |

### PostgreSQL

- **Sync.** Logical replication lists "Replicating between different major
  versions of PostgreSQL" as a use case
  ([logical replication](https://www.postgresql.org/docs/current/logical-replication.html)):
  `wal_level = logical`, `CREATE PUBLICATION` on the old Instance,
  `CREATE SUBSCRIPTION` on the new, which copies the initial data and then
  streams ([quick setup](https://www.postgresql.org/docs/17/logical-replication-quick-setup.html)).
- **What it does not carry.** DDL, large objects, views and **sequence data**:
  "if some kind of switchover or failover to the subscriber database is
  intended, then the sequences would need to be updated to the latest values"
  ([restrictions](https://www.postgresql.org/docs/current/logical-replication-restrictions.html)).
  The engine method must copy sequences inside the fence. PostgreSQL 19's
  release notes (beta at the time of writing) add `ALL SEQUENCES` publications
  and `ALTER SUBSCRIPTION ... REFRESH SEQUENCES`
  ([release 19](https://www.postgresql.org/docs/19/release-19.html)), which
  would remove the special case once both sides run 19.
- **Fence.** `default_transaction_read_only` makes each new transaction
  read-only, but a session can set its transaction read-write again
  ([client configuration](https://www.postgresql.org/docs/17/runtime-config-client.html)),
  the same gap RDS warns about. Terminating every client backend after setting
  it closes that gap for existing sessions; a role-level revoke would close it
  for new ones.
- **Not a Move path:** `pg_createsubscriber` needs both sides on the same
  major version ([pg_createsubscriber](https://www.postgresql.org/docs/17/app-pgcreatesubscriber.html)),
  and CloudNativePG's in-place major upgrade shuts down every pod, leaving "the
  entire PostgreSQL cluster, including replicas, unavailable to applications"
  ([CNPG upgrades](https://cloudnative-pg.io/docs/1.27/postgres_upgrades/)).
- **Reverse.** The documentation states no direction rule, and the protocol
  page lists versions 1 to 4 with server floors (version 4 from server 16)
  without saying how they are negotiated
  ([protocol](https://www.postgresql.org/docs/current/protocol-logical-replication.html)).
  Whether a 17 publisher feeds a 16 subscriber is a **settle by drill**, and
  the catalog row must not claim it until the drill runs.
- **Pooler.** PgBouncer's `PAUSE` waits until every server connection is
  released and holds new clients until `RESUME`; `RECONNECT` serves "a gradual
  switchover", and "If all connections need to be switched at the same time,
  PAUSE is recommended instead"
  ([usage](https://www.pgbouncer.org/usage.html)). A pooler in front of
  Postgres would turn the write pause into a wait rather than errors.

### MySQL and MariaDB

- MySQL "supports replication from an older source to a newer replica for
  version combinations where we support upgrades", and "Replication from newer
  sources to older replicas might be possible, but is generally not supported"
  ([compatibility](https://dev.mysql.com/doc/refman/8.4/en/replication-compatibility.html)).
  Upgrades cannot skip an LTS series: 5.7 to 8.4 goes through 8.0
  ([upgrade paths](https://dev.mysql.com/doc/refman/8.4/en/upgrade-paths.html)).
- The fence is `super_read_only`: "the server prohibits client updates even
  from users who have CONNECTION_ADMIN or SUPER"; plain `read_only` lets those
  users write
  ([system variables](https://dev.mysql.com/doc/refman/8.4/en/server-system-variables.html)).
- `Seconds_Behind_Source` is "useful only for fast networks" and can mislead
  with a multithreaded replica
  ([SHOW REPLICA STATUS](https://dev.mysql.com/doc/refman/8.4/en/show-replica-status.html));
  comparing GTID sets is the precise probe.
- MariaDB: "In general, the replica should be of the same or a later version
  than the primary"
  ([replication overview](https://mariadb.com/docs/server/ha-and-performance/standard-replication/replication-overview)).
  MariaDB replicates from MySQL 8.0 only from 10.6.21, 10.11.11, 11.4.5 and
  11.7.2, without MySQL's GTIDs
  ([MariaDB and MySQL](https://mariadb.com/docs/release-notes/community-server/about/compatibility-and-differences/replication-compatibility-between-mariadb-and-mysql)).

A MySQL or MariaDB major upgrade therefore cannot reverse-replicate. That is
the case the redesign's `rollback: forward-only` acknowledgement exists for.

### Valkey

- `REPLICAOF` with partial resync from the backlog, or a full resync by RDB
  snapshot; offsets count bytes, so comparing them is exact
  ([replication](https://valkey.io/topics/replication/)).
- Valkey "is compatible with Redis OSS 7.2 and all earlier open-source Redis
  versions", but "RDB files produced by Redis CE 7.4 and later are not
  compatible" ([migration](https://valkey.io/topics/migration/)).
- "You should always upgrade replicas before upgrading primaries", and data
  replicated to replicas "will always be sent in a backward compatible format"
  ([releases](https://valkey.io/topics/releases/)): forward is safe, the
  reverse is not established.
- `CLIENT PAUSE ... WRITE` blocks only writes and is the mode `FAILOVER` uses
  internally before demoting the primary
  ([CLIENT PAUSE](https://valkey.io/commands/client-pause/),
  [FAILOVER](https://valkey.io/commands/failover/)). The page states both that
  this mode "will stop all replication traffic" and that "interactions with
  replicas will continue normally": a **settle by drill** before it is the
  fence.

### RabbitMQ

RabbitMQ documents two upgrade strategies: rolling, the recommended one, and
blue-green, which deploys a new cluster, syncs definitions, connects the two
with Federation, switches consumers, drains, then switches publishers
([upgrade](https://www.rabbitmq.com/docs/upgrade),
[blue-green upgrade](https://github.com/rabbitmq/rabbitmq-website/blob/main/docs/blue-green-upgrade.md)).
A vhost limit of `max-connections: 0` blocks new client connections
([vhosts](https://www.rabbitmq.com/docs/vhosts)); the limit is an admission
check ([rabbit_vhost_limit.erl](https://github.com/rabbitmq/rabbitmq-server/blob/main/deps/rabbit/src/rabbit_vhost_limit.erl)),
so existing connections most likely stay open (inferred from the source, not
documented) and the fence must close them with `rabbitmqctl
close_all_connections -p <vhost>`
([rabbitmqctl](https://github.com/rabbitmq/rabbitmq-website/blob/main/docs/man/rabbitmqctl.8.md)).
Feature flags, once enabled, "cannot be disabled", and
after enabling one the cluster cannot roll back to the older version
([feature flags](https://www.rabbitmq.com/docs/feature-flags)): reverse is
possible only while the new cluster enables no new flag. The blue-green order
(consumers first, drain, publishers last) differs from a database's: a broker's
"caught up" means the old queues are empty, not that a log position matches.

### MongoDB

`mongosync` replicates one cluster into another until a `commit`, and blocks
writes during the cutover with `setUserWriteBlockMode`
([mongosync](https://www.mongodb.com/docs/mongosync/current/),
[setUserWriteBlockMode](https://www.mongodb.com/docs/manual/reference/command/setUserWriteBlockMode/)).
Upgrades go one major at a time and end by raising the feature compatibility
version ([replica set upgrade](https://www.mongodb.com/docs/manual/release-notes/8.0-upgrade-replica-set/));
lowering it again fails with `CannotDowngrade` if incompatible data exists
([setFeatureCompatibilityVersion](https://www.mongodb.com/docs/manual/reference/command/setFeatureCompatibilityVersion/)).
The retention window must therefore end before the compatibility version is
raised, or rollback is not binary.

### Object storage

- **Garage** upgrades minor versions node by node without downtime; major
  versions must be taken one at a time, and no downgrade is documented
  ([upgrading](https://garagehq.deuxfleurs.fr/documentation/operations/upgrading/)).
  Access is per key and bucket: `garage bucket allow --read --write --owner`
  grants ([quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)),
  and `garage bucket deny`, "Deny key from reading or writing to bucket",
  takes `--write` alone, which is the fence
  ([CLI](https://github.com/deuxfleurs-org/garage/blob/main/src/garage/cli/structs.rs),
  [smoke test](https://github.com/deuxfleurs-org/garage/blob/main/script/test-smoke.sh)).
  No Garage-to-Garage sync is documented; for growing a cluster the Kubernetes
  cookbook's advice is that "your only real option is to spin up a new Garage
  cluster with increased size and migrate all data over"
  ([cookbook](https://github.com/deuxfleurs-org/garage/blob/main/doc/book/cookbook/kubernetes.md)),
  so a generic S3 copy is the sync.
- **MinIO** site replication links peers so "either site can take the write",
  requires matching server versions and mandatory versioning; bucket
  replication is one- or two-way; `mc mirror` copies current objects only,
  without version history
  ([site replication](https://docs.min.io/enterprise/aistor-object-store/administration/replication/site-replication/),
  [bucket replication](https://docs.min.io/enterprise/aistor-object-store/administration/replication/bucket-replication/),
  [mc mirror](https://docs.min.io/enterprise/aistor-object-store/reference/cli/mc-mirror/)).
  Its community repository now reads "THIS REPOSITORY IS NO LONGER
  MAINTAINED", ships source only under the AGPL v3, and points to a separate
  free edition ([README](https://github.com/minio/minio/blob/master/README.md)),
  which weighs against adopting it as a platform engine.

### Streams and search

- **Kafka** MirrorMaker 2 replicates topics under a source-alias prefix,
  preserves partitioning, and can replicate consumer group offsets "to help
  migrate applications between clusters"
  ([geo-replication](https://kafka.apache.org/42/operations/geo-replication-cross-cluster-data-mirroring/)).
  Translated offsets go to a `<alias>.checkpoints.internal` topic and are
  written into the target's consumer groups only with
  `sync.group.offsets.enabled`, which defaults to false and runs every 60
  seconds "as long as no active consumers in that group are connected to the
  target cluster"
  ([MirrorCheckpointConfig](https://github.com/apache/kafka/blob/trunk/connect/mirror/src/main/java/org/apache/kafka/connect/mirror/MirrorCheckpointConfig.java));
  `IdentityReplicationPolicy` keeps topic names unchanged
  ([source](https://github.com/apache/kafka/blob/trunk/connect/mirror-client/src/main/java/org/apache/kafka/connect/mirror/IdentityReplicationPolicy.java)).
  The documentation has no failover or failback procedure, so how exactly a
  consumer flips without duplicates is **unverified**. A ZooKeeper-to-KRaft
  migration cannot be reverted once finalised
  ([KRaft](https://kafka.apache.org/39/operations/kraft/)).
- **NATS JetStream** keeps a copy of exactly one stream with `mirror`, to
  which clients cannot write, and merges several with `sources`, which also
  accept direct writes and are recommended "in new configurations"; both are
  one-way, and "Deletes in the origin stream are NOT replicated"
  ([source and mirror](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/source_and_mirror.md),
  [streams](https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/streams.md)).
  Promoting a mirror to a writable stream is **unverified**; a `sources`
  stream needs no promotion.
- **OpenSearch**'s replication plugin (Apache-2.0) starts, pauses, resumes and
  stops replication per index; on stop, "the follower index un-follows the
  leader and becomes a standard index that you can write to", and replication
  cannot be restarted
  ([plugin](https://github.com/opensearch-project/documentation-website/blob/main/_tuning-your-cluster/replication-plugin/index.md)).
  `index.blocks.write` set to `true` blocks writes
  ([clone](https://github.com/opensearch-project/documentation-website/blob/main/_api-reference/index-apis/clone.md)),
  and snapshots are "forward compatible by one major version"
  ([snapshots](https://github.com/opensearch-project/documentation-website/blob/main/_migrate-or-upgrade/snapshot-restore/index.md)).
- **Elasticsearch** cross-cluster replication is active-passive, follower
  indices reject writes, and a bidirectional topology is documented
  ([CCR](https://www.elastic.co/docs/deploy-manage/tools/cross-cluster-replication));
  the licence check enables it only on Platinum, Enterprise or a trial
  ([XPackLicenseState](https://github.com/elastic/elasticsearch/blob/main/x-pack/plugin/core/src/main/java/org/elasticsearch/license/XPackLicenseState.java)).
  "You can't restore a snapshot to an earlier version of Elasticsearch"
  ([snapshot and restore](https://www.elastic.co/guide/en/elasticsearch/reference/current/snapshot-restore.html)).

### Reverse replication is the weak point

Forward sync across a version change is documented for every engine above.
The reverse direction is where they diverge, and in most of them a one-way gate
closes it: MySQL and MariaDB replicate only upward, Valkey sends data
backward-compatibly only from older primaries, RabbitMQ feature flags and
MongoDB's compatibility version cannot be undone once raised, Kafka's KRaft
migration cannot be reverted after finalising, and search snapshots move only
forward. Three rules follow for the catalog:

1. **Reverse is a per-engine, per-version column**, stating always, same-major
   only, or never, with its source. A row with no source says never.
2. **The retention window ends before any one-way gate is raised** on the new
   Instance (a feature flag, a compatibility version), or the gate itself ends
   the window.
3. **A Move whose reverse is impossible needs an explicit acknowledgement**,
   because the promise of a lossless rollback cannot be kept for it.

## What others publish about the write pause

- Shopify's shard rebalancing is "entirely online and with virtually zero
  consumer-facing downtime"; at cutover "writes to the source database must
  stop", enforced by an application-level multi-reader single-writer lock, and
  "The only opportunity for downtime is during the cutover"
  ([Shopify](https://shopify.engineering/mysql-database-shard-balancing-terabyte-scale)).
- GitHub's `gh-ost` tails the binary log instead of using triggers and "is
  able to suspend all writes to the master when throttling"
  ([gh-ost](https://github.blog/news-insights/company-news/gh-ost-github-s-online-migration-tool-for-mysql/)).
- Martin Fowler's Blue-Green Deployment separates schema change from the
  switch, and Parallel Change names expand, migrate, contract, which "Most
  database refactorings follow"
  ([BlueGreenDeployment](https://martinfowler.com/bliki/BlueGreenDeployment.html),
  [ParallelChange](https://martinfowler.com/bliki/ParallelChange.html)).

Every one of them pays its downtime at the same place: the moment writes stop
on the old store and start on the new. The Move's write pause is that moment,
and its length is the final lag at the fence plus the time to flip and unfence.

## Coordinating with the release machinery

Flagger's `confirm-rollout` and `confirm-promotion` webhooks pause a rollout
until they return success ([webhooks](https://docs.flagger.app/usage/webhooks));
Argo Rollouts' `prePromotionAnalysis` can "block the Service selector switch"
([blue/green](https://argoproj.github.io/argo-rollouts/features/bluegreen/)).
Both gate one workload's switch. Neither couples a provider's change to its
consumers, which is why the Move's steps run as Jobs started by the Release
Gate rather than as a Canary.
