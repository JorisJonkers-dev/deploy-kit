---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-30
normative: spec/v1/14-platform-intent.md#node-agents
rests-on: ["0005"]
---

# The device plugin names each card by its index, as the hosts' CDI specification does

The `gpu-device` Node Agent hands a GPU consumer each card by its index, never
its UUID, because the CDI specification the hosts install names cards by index.
The naming is fixed by the catalog, beside the agent's other privileges
([Node Agents](../../../spec/v1/14-platform-intent.md#node-agents)). Settled in
[The gpu-device Node Agent asks for GPU ids the hosts' CDI specification does not name](https://github.com/JorisJonkers-dev/deploy-kit/issues/730).

## Rests on

What a node's host is prepared with is already a recorded fact, and the agents
derive from it rather than restate it
([0005](0005-derivation-is-total.md)). A `gpus` entry asserts the host holds
the CDI specification
([chapter 15](../../../spec/v1/15-infrastructure-intent.md)), and the
specification the hosts' configuration writes names each card by index.

**False if:** a node with an `nvidia` card is prepared with a specification that
names cards by UUID, or by anything other than their index. **Settled by:**
`gpu-metrics` starting on the estate path under `nvidia-cdi` with its share, and
a GPU Process starting after the handover with its card.

## Why

**The id the plugin hands out is the name the runtime resolves.** The plugin
passes a consumer its card as `NVIDIA_VISIBLE_DEVICES=<id>`, and the `nvidia-cdi`
runtime resolves that as `nvidia.com/gpu=<id>` in the specification. Unset, the
plugin hands out UUIDs, which the specification does not hold, so the sandbox is
refused (`unresolvable CDI devices nvidia.com/gpu=GPU-…`). The plugin the old
path runs sets `index` for that reason.

**Fixed in the catalog, not authored.** Every host the estate runs writes the
specification the same way, so a Platform field would have one value and no
author to contend it. The catalog already fixes how the plugin shares a card.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The hosts switch their specification to UUIDs | the render stays as it is | a host change on every NVIDIA node, and every GPU pod's sandbox re-resolved on its next start, for no gain over the name the hosts already write |
| A substrate fact beside `gpus.<vendor>.runtimeClass`, such as `deviceNames: index` | a host that names cards otherwise is expressible | one value, no second host to state it for, and a field to keep in step with the host's configuration |

## Reversibility

Undo cost today: one variable in the catalog and its oracle, in an hour.
Becomes costly once: a host is prepared with a specification that names cards
differently, and the naming has to become a per-node fact.

## Consequences

- A GPU consumer that starts after the `node` handover gets its card from the
  rendered plugin, as it does from the old one.
- A host whose specification names cards by UUID would refuse every GPU
  sandbox; the fact that it does not is the host configuration's to keep.
