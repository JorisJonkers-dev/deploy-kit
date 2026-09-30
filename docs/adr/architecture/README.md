# Architecture: the compiler's own structure

These records decide how the compiler is built: its chain of steps, its trace,
its error model, how output is serialized, and which gates hold the structure
in place. They are **not model decisions**. Nothing here can change what the
model means, and no chapter of `spec/v1` depends on one.

The one difference from a model record is its `normative:` pointer, which names
a section of [`docs/architecture.md`](../../architecture.md), the normative
document for code structure, or of
[`docs/architecture-rules.md`](../../architecture-rules.md), the ledger of rules
that structure is held to. Everything else is the register's contract, and
`scripts/lint-adrs.ts` enforces it here as it does for the model.

Numbers come from the one estate-wide sequence; the register is
[`../README.md`](../README.md). The scope boundary is stated in
[chapter 00](../../../spec/v1/00-overview.md#programme-scope).

The records here bind the TypeScript tree. The model-driven implementation
under `emf/` decides its own structure in
[`emf/docs/adr/`](../../../emf/docs/adr/README.md), and
[0068](0068-two-implementations-meet-at-the-parity-table.md) is the contract
between the two.
