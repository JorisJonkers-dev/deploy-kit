# Diagrams

One drawing per chapter diagram, committed as an SVG with the editable draw.io
diagram embedded in it. GitHub renders the SVG inline in the chapter; opening
the same file in draw.io recovers the drawing, so there is no second source file
to keep in step.

Each chapter also keeps its former mermaid block at its foot, under
`## Diagram sources`, as the text form of the same structure. Where the two
disagree the SVG is the diagram and the mermaid is what gets fixed
([chapter 00](../00-overview.md#chapters)).

## The palette

Colour carries the layer, so a reader can place a box without a legend.

| fill | stroke | means |
|---|---|---|
| `#dbeafe` | `#1e40af` | Service Intent — hand-authored by a Service's owner ([chapter 10](../10-service-intent.md)) |
| `#e0e7ff` | `#4338ca` | Platform Intent — hand-authored by the platform ([chapter 14](../14-platform-intent.md)) |
| `#e2e8f0` | `#475569` | a pinned input, a lock, or a recorded fact |
| `#fef3c7` | `#b45309` | layer 2 — a decision the platform made ([chapter 20](../20-resolved-deployment.md)) |
| `#d1fae5` | `#047857` | layer 3 — a serialized Deliverable ([chapter 30](../30-deliverables.md)) |
| `#fee2e2` | `#b91c1c` | a refusal: an error code, or a render that does not happen |
| white, dashed border | `#64748b` | defined separately from the model ([`docs/adr/deferred/`](../../../docs/adr/deferred/README.md)) |
| `#f5f3ff` | `#6d28d9` | a UML `«enumeration»` — a closed vocabulary |

Conventions that hold across every drawing:

- **Orthogonal connectors only.** No curves and no diagonals, so a line can be
  followed across a dense diagram.
- **Solid arrow**: a derivation, or a step that must happen. **Dashed arrow**: a
  reference, a feedback path, or something defined separately.
- **Filled diamond**: UML composition — the part cannot exist without its whole.
- **A class diagram puts its root at the top**, children below it, and their
  children below those. Enumerations are separate `«enumeration»` nodes rather
  than inline lists, gathered in one panel.
- **Labels are plain text with manual line breaks**, which is what keeps the
  exported SVG real text rather than a rasterised image — it stays searchable,
  selectable and small.

## The derivation map is two drawings

[Chapter 16](../16-dependencies.md#the-derivation-map)'s map is split in half —
declarations and pinned facts reaching **assignments**, then declarations and
assignments reaching **Deliverables**. As one drawing it is roughly ninety edges
in one frame, which no layout makes readable. The split is also where the two
properties live: totality is a statement about the first half, and
in-degree-at-least-one about the second.

In the second drawing the Deliverable column is the middle one, and layer 2
sits to its right. Reading is inward from both sides: an edge from the left is a
declaration that reaches the object directly, with no assignment in between, and
is drawn in light grey; an edge from the right comes from a layer-2 assignment.
That order is what keeps the drawing free of connectors running across boxes —
with layer 2 in the middle, every direct edge had to cross it.
