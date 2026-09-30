---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/30-deliverables.md#adapters
rests-on: ["0003"]
---

# The registry is the enumeration of adapters, every adapter satisfies one typed port, and every Deliverable is attributed to exactly one adapter

The set is six central adapters (`kubernetes`, `networking`, `prometheus`,
`traefik`, `vault-policy`, `vso`), enumerated in
[chapter 30](../../../spec/v1/30-deliverables.md#adapters). Nothing renders that
is not registered, and changing the set is a decision of its own. Every adapter
satisfies one typed port: the Resolved Deployment and its planned paths in,
attributed Deliverables out, deterministic, with no ambient read
([chapter 30](../../../spec/v1/30-deliverables.md#the-adapter-port)). Every
Deliverable is produced by exactly one adapter, and a path claimed twice is
`E_PATH_COLLISION`.

## Rests on

Layer 3 holds no decisions ([0003](0003-three-model-pipeline.md)): an adapter
serializes what layer 2 decided, so one input shape serves every adapter, and
"who produced this object" always has one answer.

**False if:** an adapter needs a value that reaches it only through a second
input shape or an ambient read, or a rendered file lands at a path no adapter
was handed. **Settled by:** the adapter contract suite run once for every
registered adapter, and the rendered-tree golden diff, in which every file is
attributed to one adapter.

## Why

**Dead code satisfied the quality gate.** In the replaced generation, two
complete renderer trees coexisted and only one ran: 1,967 unreachable lines sat
inside a `--lines 90` coverage gate because their own tests imported them. A
registry that is the enumeration, checked for reachability, prevents a second
generation from surviving unnoticed
([0060](../architecture/0060-boundaries-enforced-on-the-graph.md)).

**An untyped seam mispriced the work.** The replaced registry typed its render
function as `(input: never)`, dispatched on a hand-set string, and carried
`@ts-nocheck` in four adapters. Two "working renderers that were never
registered" turned out to consume a different model, so registering one was a
rewrite. One typed input, the Resolved Deployment, removes the dispatch: every
adapter is central ([0047](0047-one-publication-path.md)).

**Attribution is what makes a diff readable.** It lets a diff say which
subsystem produced a file, and lets the ledgers ask who produced an object
([0038](0038-bidirectional-ledgers.md)). Deriving it from what the path plan
handed each adapter ([0036](0036-path-authority-is-layer-2.md)) means it is a
query, not a second registry.

**No target-neutral IR.** A neutral deliverable format with one consumer would
be shaped entirely by Kubernetes and wrong for the second target the day it
arrived. If a second target exists, that is the time to lift the abstraction.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A count of adapters recorded beside the registry | a number to cite | a second copy that was amended four times in one week |
| Several input shapes, dispatched by a flag | adapters read what they like | an adapter declaring the wrong shape reads `undefined` at render time |
| Direct rendering without adapters | fewer modules | loses attribution, so a diff cannot say which subsystem produced a file |
| A target-neutral deliverable IR | ready for a second target | shaped by its one consumer |

## Reversibility

Undo cost today: the registry and the port are small, and nothing out of tree
depends on them: hours. Becomes irreversible once: an out-of-tree adapter pins
the port, because narrowing a published port is a major release.

## Consequences

- Adding or removing an adapter is a decision and a chapter-30 edit, paid by
  whoever proposes it.
- Every adapter is tested once through the same contract suite, paid by the
  suite's author once.
- A kind owned by two adapters is impossible by construction, so a collision
  appears at path planning, before any adapter runs.
