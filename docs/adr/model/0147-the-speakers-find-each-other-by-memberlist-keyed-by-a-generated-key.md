---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-30
normative: spec/v1/14-platform-intent.md#node-agents
rests-on: ["0001", "0005"]
---

# The speakers find each other by memberlist, keyed by a key the `node` Project's own Vault policy job generates

The `l4-speaker` Node Agents run memberlist, so a speaker notices within
seconds that another node has gone and takes over its addresses. Memberlist's
traffic is keyed by a value no one writes by hand: a generated key under the
`node` Project's own prefix, written by that Project's own Vault policy job and
delivered by the Secret Store's operator, as any Project's generated key is
([Node Agents](../../../spec/v1/14-platform-intent.md#node-agents),
[Generated keys](../../../spec/v1/10-project-intent.md#generated-keys)). Where
the platform names no Vault policy job, the speakers find each other through
the API alone. Settled in
[The l4-speaker runs without memberlist](https://github.com/JorisJonkers-dev/deploy-kit/issues/733).

## Rests on

The estate is one maintainer on one cluster
([0001](0001-estate-scale-and-ownership.md)): the LAN's DNS and LAN routes sit
on two pool addresses, and a gap no one is watching lasts until it closes by
itself. The speaker's key is random and stable and contended by nobody, so it
is derived rather than authored ([0005](0005-derivation-is-total.md)).

**False if:** a node that leaves the network keeps its addresses for much longer
than memberlist's detection, measured near 6.6 seconds in
[#372](https://github.com/JorisJonkers-dev/deploy-kit/issues/372), with every
speaker running the rendered key. **Settled by:** the `node` handover, its
speakers logging that memberlist started, and a node pulled from the LAN with
its addresses answering from another node within that gap.

## Why

**Without memberlist a lost node is noticed late.** A speaker otherwise learns
that a peer is gone only from the API, once the node is `NotReady` after the
node-monitor grace period, about 40 seconds. With memberlist, #372 measured 5.3
seconds for a deleted announcing pod and 6.6 for a node that left the network,
and accepted those gaps for DNS. MetalLB also warns that without memberlist the
speakers must run on every node, which the render does not do: it holds them to
the nodes of the pools' sites.

**The key is generated the way every other key is.** A value whose only
requirement is to be random and stable is written by its own Project's Vault
policy job ([0101](0101-a-generated-key-is-written-by-the-vault-policy-job.md)),
so nothing a person runs creates it and no value is in Git. The `node` Project
gets the same job, Vault policy and auth role as any Project with a generated
key, under `secret/data/node-system/`, which the platform's writer role already
admits for its namespace. MetalLB's own way, a controller that creates the
Secret at start, would be a second mechanism for the same kind of value, and its
key would be lost with the Secret.

**The operator restarts the speakers together.** A speaker reads its key only at
start. A Vault restored without the key gets a new one within the hour, and a
speaker that started after that would hold a key its peers do not. A changed
key therefore restarts the whole DaemonSet, so the speakers move to it in one
roll.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Fail over through the API alone | nothing to render | a lost node's addresses wait for the grace period, and MetalLB's all-nodes condition is not met |
| The controller creates the Secret (`--ml-secret-name`, `--deployment`) | no Vault dependency for `node` | a second way to make a random value; the key dies with the Secret, and the controller gains Secret writes |
| A key authored in the Platform document | no derivation | a secret value in Git |

## Reversibility

Undo cost today: the speaker's variables and mount, the `node` Project's Vault
documents and its policy job, and the spec text, in an afternoon. Becomes
costly once: something depends on the speakers' membership, such as alerting on
a lost member.

## Consequences

- The `node` Project carries a Vault policy job, a VSO connection, an auth and a
  static secret, and its unit is Ready only once the job has written the key.
- A speaker does not start until the Secret is synced: on a fresh cluster the
  speakers wait on the Secret Store and its operator.
- The hosts must pass memberlist's traffic on 7946, TCP and UDP, between the
  speakers' nodes, as they do for the old path's speakers.
