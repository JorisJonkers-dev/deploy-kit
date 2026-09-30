---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: docs/architecture.md#the-wire-boundary
rests-on: ["0007"]
---

# Zod declares the authored metamodel, its output is the source model, and a second hand-written domain type waits for a second schemaVersion

One Zod schema per authored document family is the single source of the runtime
check, the TypeScript type and the generated JSON Schema, which is generated from
the schema's **input** variant because it describes what a human writes. The
schema's output is the source model every step receives, in the authored
vocabulary `CONTEXT.md` defines. A written name stays the name the author wrote,
and a check proves each one resolves inside its Application. There is no second hand-written domain model of an
authored document. When a second `schemaVersion` enters the supported range, the
older schema gets a pure function that lifts it to the current one, at the
reader, and the steps keep one shape. Zod is imported only by `model/` and
`read/`.

## Rests on

The data model's version is separable from the package's
([0007](../model/0007-schema-version-separable.md)). That premise is still
open: nothing yet publishes two versions at once.

**False if:** a second `schemaVersion` is in the supported range while the steps
still read one shape without a lifting function. **Settled by:** the slice that
deleted the hand-written Project and Platform domain models: every committed
`intent.json` stayed byte-identical, and the lowering, reading the schema's
output, writes `minimal`'s `effective.json` oracle.

## Why

**Validation needs a value.** TypeScript types vanish at runtime. Declaring the
schema and deriving the type means the editor's completion list and the loader's
error cannot disagree.

**Nothing read the second shape.** Every constraint read the Zod output, the
intent oracle compared the Zod output, and a domain `Platform` model was read by
nothing. The model-driven implementation has one source model per document,
because Xtext instantiates the metamodel directly.

**The parallel type renamed the model.** It said `grants`, `dependencies`,
`surfaces` and `proxy` where the author, `CONTEXT.md` and the metamodel say
`secrets`, `dependsOn`, `provides` and `traefik`: the drift
[0011](../model/0011-authored-values-name-model-concepts.md) exists to prevent.

**The version case stays cheap to add.** A lifting function at the reader
absorbs skew the day it exists. Building a mapper per family ahead of it cost
three shapes of one document for a case with no instance.

**Names stay names, and are checked once.** A route names its Process and
surface as the author wrote them, and `E_UNKNOWN_PROCESS` and
`E_UNKNOWN_SURFACE` prove each resolves inside its Application before the
lowering runs. A step looks a name up in the model it was handed; no second copy
of the document holds object references that could point at the wrong level.
The lowering's Effective Intent keeps the same names, which is what lets its
canonical JSON be an oracle two implementations meet at.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A hand-written domain model and a mapper per family | skew absorbed by design | three shapes of one document, renamed keys, a model nothing read |
| Zod `.transform()` builds linked objects during parsing | one pass | the generated JSON Schema would describe the post-transform shape |
| Hand-written interfaces plus a separate validator | full control | two declarations kept in step by hand |

## Reversibility

Undo cost today: reintroduce a mapper per family: a day, mechanical. Becomes
irreversible once: never; adding a parallel type later is additive.

## Consequences

- RULE-002 reads "Zod is imported only by `model/` and `read/`".
- The Effective Intent keeps a plain TypeScript type of its own, because it is a
  shape no human writes.
- A cross-field rule JSON Schema cannot express stays runtime-only, so its
  message carries the whole explanation.
