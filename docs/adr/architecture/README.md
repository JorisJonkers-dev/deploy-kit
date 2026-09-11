# Architecture: the compiler's own structure

These ADRs decide how the compiler is built: its layering, its ports, its error
model, how output is serialized, and which gates hold the structure in place.
They are **not model decisions**. Nothing here can change what the model means,
and no chapter of `spec/v1` depends on one.

The consequence for the contract every ADR satisfies is one field: a
`normative:` pointer here names a section of
[`docs/architecture.md`](../../architecture.md), the normative document for code
structure, rather than a section of `spec/v1`. Everything else is unchanged
(frontmatter schema, a falsifiable claim per premise, `rests-on` naming premises
only, the Alternatives table, the citation rule) and `scripts/lint-adrs.mjs`
enforces all of it here exactly as it does for the model, anchor check included.

Numbers come from the one estate-wide sequence, so a citation resolves without
knowing which domain it lands in. The register is
[`../README.md`](../README.md), the same one the model uses.

The scope boundary is stated in
[chapter 00](../../../spec/v1/00-overview.md#programme-scope).
