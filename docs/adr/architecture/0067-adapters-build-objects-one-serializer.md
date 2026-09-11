---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: docs/architecture.md#serialization
rests-on: ["0003"]
---

# Adapters build typed objects; one serializer owns the bytes

## Rests on
Every Deliverable this estate emits is expressible as a typed object built from
fields the model can name, and turning objects into bytes needs no per-adapter
choice. False if: an adapter must emit a construct the object model cannot
express (a comment carrying meaning, a document whose key order is semantic)
in which case that adapter is deciding something at serialization time.
Settled by: the double render over the three worked domains producing a
byte-identical tree with every adapter going through the one serializer.

## Why
[Chapter 30](../../../spec/v1/30-deliverables.md#the-rule) requires a
Deliverable's content to be a pure function of the Resolved Deployment, and
determinism to hold byte for byte. An adapter that formats its own text owns
key order, indentation, quoting and line endings, so those become sixteen
separate problems and sixteen separate places for a machine-dependent
difference to enter. One serializer makes determinism one module's
responsibility, and the double-render check then has one place to fail.

The typed object model earns its place for a second reason, which is stronger.
Layer 3 contains no decisions ([0003](../model/0003-three-layer-meta-model.md)),
and a string builder cannot be held to that: any field can be written, including
one no chapter assigns. A narrow object model declaring only the fields this
estate sets turns the rule into a compile error: an adapter cannot set what the
type does not carry, so a new field is a deliberate edit to the model rather
than a line inside a renderer.

That is also why the upstream client types are the wrong choice. In them every
field is optional and settable, which is precisely the property the narrow model
exists to remove. Generating types from a live cluster is worse: it makes a
tool whose whole premise is pinned inputs
([0006](../model/0006-pinned-inputs.md)) depend on a cluster to build.

The objects are Kubernetes-shaped on purpose. Chapter 30 already refuses a
target-neutral deliverable IR (an abstraction with one consumer is shaped
entirely by that consumer) and a narrow model of the kinds this estate emits is
not that abstraction; it is a description of the output.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Each adapter emits YAML text | Nothing to build; matches the generation being replaced | Key order and determinism become sixteen problems, and adapter tests degrade into whitespace comparison, which is how a golden diff starts getting regenerated instead of read |
| Use `@kubernetes/client-node` types | Complete, maintained, covers every field | Every field optional and settable, so nothing stops an adapter inventing a decision; and a runtime dependency pinned for types alone |
| Generate types from the cluster's OpenAPI | Exact for the versions in use, and covers the CRDs | Makes a build step depend on live cluster state, in a tool whose premise is that nothing reads live state |

## Reversibility
Undo cost today: dropping to per-adapter text is a per-adapter rewrite, and
widening the object model is additive and cheap. Becomes irreversible once: the
serializer's output is the committed golden tree, because any change to key
order or formatting then rewrites fifty files in one diff and every review after
it reads through that noise.

## Consequences
- A field the object model cannot express cannot be rendered, so a genuinely
  new Kubernetes field costs an edit to the model before it costs an edit to an
  adapter, paid by whoever needs the field, deliberately.
- The single `GENERATED` header line lives in the serializer as a constant, so
  no adapter can add commentary and the rendered tree stays comment-free, paid
  by nobody; it is the property the estate asked for.
- Adapter tests assert object graphs, which means they say nothing about the
  final bytes; the byte-level guarantee comes from the golden tree and the
  double render instead, paid in one extra test tier, deliberately placed at
  the highest seam.
- CRDs the estate uses (Traefik, VSO, Gatus, Prometheus) need hand-written
  narrow types too, and a CRD upgrade that changes a field is a model edit that
  the pinned schema validation will catch, paid at upgrade time, visibly.
