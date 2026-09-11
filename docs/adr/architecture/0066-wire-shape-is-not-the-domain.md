---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: docs/architecture.md#the-wire-boundary
rests-on: ["0007"]
---

# Zod declares the authoring shape, and a mapper turns it into the domain

## Rests on
The shape a human writes and the shape the core reasons about differ enough that
one type cannot be both, and the difference is exactly what a mapper per document
family absorbs. False if: a mapper is a field-for-field copy across every
document family, in which case the second type is ceremony. Settled by: the
first `schemaVersion` bump: two wire schemas and two mappers land, and `git
diff --stat src/domain/` over that change is empty.

## Why
TypeScript types vanish at runtime, so validation has to come from a value
rather than a type. Zod inverts the relationship correctly: declare the schema,
derive the type, and (since v4) emit JSON Schema from the same declaration, so
the editor's completion list and the loader's error message cannot disagree.
That much is settled by the goal.

What is not obvious is whether `z.infer` should *be* the domain model, and the
answer is no, for a reason the model already committed to.
[0007](../model/0007-schema-version-separable.md) makes the data model's version
separate from the package's, and [chapter
40](../../../spec/v1/40-composition.md#version-rollout) requires composition to
accept a range rather than an equality: fragments published by repositories on
different `schemaVersion`s land in one run. If the inferred type is the domain
type, two supported versions mean two domains, and every derivation rule
branches on which one it was handed. With a mapper per version, skew is absorbed
at the boundary and the core has one shape.

The authoring shape is also optional where the domain is total. A field with a
platform default is absent in the file and present after resolution; a domain
type carrying that optionality forces every consumer to re-decide the default,
which is how a default becomes two defaults. The same asymmetry is why JSON
Schema is generated from the **input** variant: the schema describes what a
human writes, not what validation leaves behind.

The cost is real and worth naming: a mapper is code that does nothing
interesting, and it must be kept honest by tests at the use-case seam rather
than by inspection.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| `z.infer` is the domain type | Zero mapping code; one declaration for everything | Two supported `schemaVersion`s become two domains, so every rule branches on the version it was handed, and renaming an authored key becomes a core refactor |
| Zod `.transform()` constructs domain objects during parsing | No separate mapper; parse and construct in one pass | Couples JSON Schema generation to domain construction, and the generated schema then describes the post-transform shape, which is not what a human writes |
| Hand-written interfaces plus a separate validator | Full control over both shapes | Two declarations kept in step by hand, which is the drift this repository exists to remove |

## Reversibility
Undo cost today: collapsing the mapper is deleting a function per document
family and re-pointing the domain at the inferred type, hours, mechanical.
Becomes irreversible once: a second `schemaVersion` is in the supported range,
because the core would then have to carry both shapes and the collapse is no
longer a deletion but a redesign.

## Consequences
- Zod is forbidden in the domain by the boundary ruleset, so a validation rule
  that belongs to the core has to be expressed as a domain invariant rather than
  a refinement, paid by the author, in a slightly longer route to the same
  check.
- A cross-field rule that JSON Schema cannot express stays runtime-only, so the
  editor will not catch it and the message has to carry the whole explanation,
  paid by the author of the rule, once.
- Every document family costs a schema, a mapper and a type, so adding one is a
  visible three-file change rather than a one-line inference, paid at authoring
  time, and it is what keeps the boundary from eroding.
- The generated JSON Schema describes the input variant, so it cannot be reused
  to validate a resolved artifact; layer 2's documents get their own schemas,
  paid in one more generated file.
