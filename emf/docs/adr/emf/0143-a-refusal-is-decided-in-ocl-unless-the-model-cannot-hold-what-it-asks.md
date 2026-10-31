---
tier: decision
status: accepted
claim: settled
date: 2026-10-30
normative: docs/architecture.md#constraints
rests-on: ["0070"]
---

# A refusal is decided in Complete OCL, unless the model cannot hold what it asks

Most of the refusals the specification names are invariants of the Complete OCL
file beside the source metamodel. A few are decided in Java, in the `cli`
bundle's pipeline, beside the parse. This record says which go where, and why
the line is drawn by what the model holds rather than by what is convenient to
write.

## Rests on

The model is expressible in the EMF toolchain
([0070](0070-the-model-is-expressible-in-the-emf-toolchain.md)). OCL is the
toolchain's language for a rule over a model, so a rule over the model is
written in it. A rule over something the model does not hold is outside what
OCL can see, and the toolchain gives it no other home than the code that reads
the files.

## Why

**OCL decides what one parsed model holds.** An invariant reads the objects of
the documents a set was read into, and nothing else. A rule over a Process's
cutover, its volumes, its grants, its routes or the Platform document's tiers
is a rule over that model, and its name is the code it emits, so `Constraints` maps a
failure to its diagnostic with no table.

**Three kinds of question are not about that model, and Java answers them:**

- **A file beside the project file.** The model names a dashboard or a rule file
  by path and holds none of its content: whether it is there, holds a uid, or
  lists rule groups is a fact of the file system. `ShippedFiles` reads it, as the
  Asset check already did.
- **A pinned input.** The images lock is a separate document of a separate
  metamodel that a set's check does not read as intent. Whether an image a pod
  runs as its own user is locked as root is decided where the lock is read.
- **A refusal placed at a position the invariant's path cannot write.** An
  invariant reports at its object, plus at most one feature named after `__`.
  An entry of a list of strings, such as one Project the mesh enrols, or a port
  a tier derives rather than one a project file writes, has no object of its
  own. `L4Checks`, `OperatedChecks` and `Pipeline.check` place these.

**What a Process holds across the union is asked only of a document that
holds.** Self delivery without a Vault client, and a secret placeholder on a
Client without one, read the env files beside the project, which are attached
before the document is checked. A tier's proxy under a Platform document with
no `apiAccess` is asked of the union by composition. The production
implementation asks these after each document's own checks pass, so a document
refused for its own shape is not refused for them as well. `Pipeline.refusals`
keeps that order with one named set of such codes.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Every refusal in OCL, with the files' contents and the lock loaded into the model first | a dashboard's JSON and a rule file's YAML become model objects only to be asked whether they parse; the lock joins the intent extent it is pinned against | the model would hold content it never resolves, to let a rule look at it |
| A second Complete OCL file for the pinned inputs | Eclipse OCL binds one Complete OCL document per package and thread, and a second file for a package already bound is never evaluated ([0098](0098-cross-file-invariants-navigate-an-estate-root.md)) | the file would be silently skipped |
| Widen the invariant's path convention to carry an index | `Constraints` would parse a position out of the invariant's name or its message | a path built from a name is the lookup table the convention exists to avoid |
| Every union-level code asked unconditionally | a document refused for its shape is refused again for a grant it holds, where the production implementation reports one refusal | parity is per diagnostic, so the extra one is a difference |

## Reversibility

Undo cost today: each Java check is one class or one method, called from one
place in `Pipeline.check`, and held by its own unit tests and by the refusal
oracles. Moving a check into OCL means bringing what it reads into the model
first: a day per kind. Becomes irreversible once: nothing, since every refusal
is compared by code, document and path, wherever it is decided.

## Consequences

- "Where is a refusal decided" has two answers, paid by a reader of the architecture, who finds both, and the reason for each group, in its constraints section.
- Four Java classes carry rules an examiner would look for in the `.ocl` file, paid by the course report, which defends the split rather than hiding it.
- The union-level codes are listed twice, as invariants and as the set `Pipeline.refusals` defers them by, paid by whoever adds such a code, who adds it to both.
