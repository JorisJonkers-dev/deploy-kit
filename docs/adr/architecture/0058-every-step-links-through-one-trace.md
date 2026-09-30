---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: docs/architecture.md#path-authority
rests-on: ["0003", "0006"]
---

# Every step creates its targets, then links them through one trace, adapters build typed objects, and one serializer owns the bytes

A step first instantiates every target from its source, then fills references by
looking each one up in the trace: the source-to-target record every mapping
writes. A trace link records the mapping's name, the source element and the
target element; a render link also records its adapter and its planned path.
Inside a step a `Map` from source to target is the lookup; the step returns its
model and its links, and the use-case concatenates them into the run's trace.
Attribution is a query over it: a Deliverable's adapter is the one render link
that produced it. `E_PATH_COLLISION` is a query over the path plan's links,
before any adapter runs. Adapters build typed objects from a narrow Kubernetes and
Vault object model that declares only the fields this estate sets. One serializer,
in the infrastructure ring, turns the finished object set into bytes and owns key
order, indentation and the one `GENERATED` line.

## Rests on

Layer 3 holds no decisions ([0003](../model/0003-three-model-pipeline.md)), and
every output is a function of pinned, digested inputs
([0006](../model/0006-pinned-inputs.md)).

**False if:** an adapter mapping needs a value not in the finished Resolved
Deployment, needs another mapping's output, or must emit a construct the object
model cannot express. **Settled by:** the first rewrite slice's golden diff of
`minimal`'s rendered tree and a double render compared byte for byte, with every
adapter going through the one serializer and RULE-034 enforced.

## Why

**Create, then link.** Recursive linking fails on forward references. The
lowering shows why: a route names a Process, and the lowered route must point at
the lowered Process. Keeping the authored reference was a live defect, and the
falsifier of [0012](../model/0012-shared-intent-descends-and-is-lowered.md).
Resolution needs the same pass across projects: an edge's address comes from a
provider's Resolved Process in another project.

**A list of links.** It is inspectable and serialisable, and every query is a
filter. A `Rule<S, T>` interface or a `Transformer` class would come before two
steps need the same helper, and the sketch needs casts, so the generic buys no
safety.

**No adapter can read another.** A render mapping takes a Resolved Deployment
element and its planned path, and returns objects. It is never handed the trace;
only the use-case appends to it. The function's signature holds the rule, and
depcruise holds the imports.

**Typed objects make "no decisions" a compile error.** A string builder can
write any field. A narrow object model cannot set what its type does not carry,
so a new field is a deliberate edit. The upstream client types make every field
optional and settable; types generated from a live cluster would make a
pinned-input tool depend on a cluster.

**One serializer, text last.** Formatting owned by every adapter would make
determinism a problem per adapter; one module owns it, and adapter tests assert a
field, not whitespace.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Link by recursive calls as each target is built | one pass | forward references fail or loop |
| A generic `Transformer` holding the trace | one API | framework before the second need |
| Attribution set by each adapter | no trace to keep | an adapter could set the wrong owner |
| Each adapter emits YAML text | nothing to build | determinism becomes a problem per adapter |
| `@kubernetes/client-node` types | complete and maintained | every field settable, so an adapter can invent a decision |

## Reversibility

Undo cost today: nothing is built: minutes. Becomes irreversible once: an
out-of-tree adapter depends on the render mapping's signature
([0037](../model/0037-six-registered-adapters-satisfy-one-port.md)).

## Consequences

- The Resolved Deployment must carry every value an adapter serializes. Today's
  committed `minimal` tree uses ports, the scrape target and cadence, the runtime
  and policy peers that the projection lacks, so chapter 20's model gains them
  before the first render slice can reproduce it.
- The model-driven implementation keeps QVTo's own trace and Acceleo's own
  templates; the two share mapping names, not code.
