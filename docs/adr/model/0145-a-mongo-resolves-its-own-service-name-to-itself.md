---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-30
normative: spec/v1/20-resolved-deployment.md#a-replica-set-member-finds-itself
rests-on: ["0005"]
---

# A mongo resolves its own Service's name to itself, so the replica set member that name configures finds itself

A Process whose engine is `mongo` records its Service's name as `selfNames`, and
its pod resolves that name to its own loopback. The rule is in
[A replica set member finds itself](../../../spec/v1/20-resolved-deployment.md#a-replica-set-member-finds-itself).
Found while preparing
[Hand MongoDB over to the estate path once mongo-backup is released](https://github.com/JorisJonkers-dev/deploy-kit/issues/748).

## Rests on

Derivation from declared intent covers the live estate
([0005](0005-derivation-is-total.md)): the live MongoDB is a one-member replica
set, and a render that cannot start it as one does not cover it.

**False if:** `mongod` 8.0 starts a member whose configured host resolves to an
address that is not its own as anything but `REMOVED`, or a member configured by
a name its pod resolves to `127.0.0.1` fails to find itself.
**Settled by:** a member configured as `mongo.data-system.svc.cluster.local`
whose name resolved to another container started `REMOVED`, "waiting for
reconfig or remote heartbeat", and the same member with the name aliased to
`127.0.0.1` was `PRIMARY` within seconds (Docker, `mongo:8.0`, 2026-10-30).

## Why

**The member is configured by the name its consumers reach it by.** A driver
that connects with the replica set's name reads the member hosts from the
server and connects to those, so the configured host must be one every
consumer resolves to the Process: its Service's name. A Pod IP changes on every
restart, and `localhost` is advertised to every consumer, which then cannot
reach it.

**`mongod` checks that name against itself on every start.** Where the name
resolves to an address the pod does not hold, as a ClusterIP Service's does,
the check connects through it and asks whether it reached itself. That holds
only where the substrate turns the traffic back to the pod it left and the
pod's own policy admits it. The render sees neither, and where either fails the
member is removed from its own set and serves no write until someone
reconfigures it by hand: an outage that reads as the consumer's fault.

**A loopback alias takes the substrate out of the check.** Resolved to
`127.0.0.1` inside the pod, the name is one of the pod's own addresses, and the
check needs no connection at all. Every other pod resolves it through the
cluster's DNS, so nothing a consumer sees changes. It holds for a headless
Service and a ClusterIP one alike, and before the pod is ready, when a headless
Service publishes no address yet.

**Only `mongo`.** Of the engines in [chapter 14](../../../spec/v1/14-platform-intent.md#engines),
only a replica set checks its own name; a Postgres, a RabbitMQ or a Valkey
serves whatever name it is reached by.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Render a `mongo`'s Service headless | one Service kind more | the name resolves to the pod only once it is ready, and through DNS; the check still depends on what the cluster's DNS answers at start |
| A StatefulSet with a per-pod name, as the old path runs | a second workload kind, and a second Service | a stable per-pod name is the one thing a single-member set needs, and an alias gives it with the kind every other Process renders |
| Configure the member as `localhost` and have consumers connect directly | every consumer's connection string changes | the member is advertised as `localhost`, and a consumer that names the set cannot reach it |
| Leave the check to the substrate | none | a removed member is an outage the render cannot predict or see |

## Reversibility

Cheap: one field and one alias, on one engine's Processes. Removing it leaves a
member configured by its Service's name to the substrate's check again.

## Consequences

- A `mongo` Process's pod renders `hostAliases` with its Service's name at
  `127.0.0.1`.
- A replica set handed over from another name is reconfigured to the Service's
  name once, while the old member still runs where that name reaches it.
- No other engine's pod changes.
