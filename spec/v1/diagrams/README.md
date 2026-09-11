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
| `#dbeafe` | `#1e40af` | Service Intent: hand-authored by a Service's owner ([chapter 10](../10-service-intent.md)) |
| `#e0e7ff` | `#4338ca` | Platform Intent: hand-authored by the platform ([chapter 14](../14-platform-intent.md)) |
| `#e2e8f0` | `#475569` | a pinned input, a lock, or a recorded fact |
| `#fef3c7` | `#b45309` | layer 2: a decision the platform made ([chapter 20](../20-resolved-deployment.md)) |
| `#d1fae5` | `#047857` | layer 3: a serialized Deliverable ([chapter 30](../30-deliverables.md)) |
| `#fee2e2` | `#b91c1c` | a refusal: an error code, or a render that does not happen |
| white, dashed border | `#64748b` | defined separately from the model ([`docs/adr/deferred/`](../../../docs/adr/deferred/README.md)) |

Conventions that hold across every drawing:

- **Orthogonal connectors only.** No curves and no diagonals, so a line can be
  followed across a dense diagram.
- **Solid arrow**: a derivation, or a step that must happen. **Dashed arrow**: a
  reference, a feedback path, or something defined separately.
- **Filled diamond**: UML composition; the part cannot exist without its whole.
- **A class diagram is a tidy tree, laid out layer by layer downwards**, so it
  has **no edge crossings**. Every node sits exactly one layer below its parent,
  **a parent's edges share one horizontal bus** so its children read as one
  aligned fan, and each parent's bus sits at its own height so no two fans
  overlay. The relation's name rides the child's vertical drop, **close to the
  target**, which is what lets the run be shared: the drops are at distinct x,
  so the names never pile up. Two relations that mean the same thing are named
  the same thing, even where they come from different sources; `secrets` is
  `secrets` whether it hangs off the Service or off a Workload.

  **Two edges to the same box share their exit and their run**, and part only
  on the way down, so `readiness` and `liveness` read as one relation with two
  ends rather than two lines crossing the drawing. Where two edges say the same
  thing about the same box, the name is written **once**, as its own text below
  every run that feeds that box, so it lands on neither a line nor an arrow
  head.

  **Closed vocabularies are not drawn.** They were tried as a panel and then as
  nodes beside their owning class; both made the model harder to read, the first
  by making a reader chase a name across the drawing and the second by adding a
  line per vocabulary. An attribute's type already names its vocabulary, so the
  values live in a table in the chapter instead
  ([chapter 10](../10-service-intent.md#the-closed-vocabularies)).

  A relation that spans two or more layers is **not drawn at all**; the chapter
  states it in prose. A line that long is what made this drawing unreadable
  twice. A relation between two nodes on one layer is drawn either as a short
  run in the band **below** their row, clear of the fan that feeds them from
  above, or, where the two boxes face each other across an empty gap, as a
  single straight line side to side.

  Chapter 10's is **generated** by
  [`scripts/diagrams/class-diagram.py`](../../../scripts/diagrams/class-diagram.py)
  from the mermaid block that mirrors it, so the two cannot drift. Edit the
  mermaid, re-run the script, re-export. Every other diagram is drawn by hand in
  draw.io.
- **Labels are plain text with manual line breaks**, which is what keeps the
  exported SVG real text rather than a rasterised image; it stays searchable,
  selectable and small.

## The derivation map is two drawings

[Chapter 16](../16-dependencies.md#the-derivation-map)'s map is split in half:
declarations and pinned facts reaching **assignments**, then declarations and
assignments reaching **Deliverables**. As one drawing it is roughly ninety edges
in one frame, which no layout makes readable. The split is also where the two
properties live: totality is a statement about the first half, and
in-degree-at-least-one about the second.

Both halves are **matrices, not graphs**. Arrows were tried twice and failed
twice: between two columns of twenty-five rows, ninety connectors are
indistinguishable however they are routed, and routing them around each other
put lines across boxes. A mark at a row-column intersection carries the same
edge with no connector to trace and nothing to cross.

Row colour is the layer the input belongs to (blue for a declared field, grey
for a pinned fact, amber for a layer-2 assignment), and the mark takes its row's
colour, so a Deliverable's column shows at a glance how much of it is declared
and how much is decided. The `in` and `out` counts are rendered from the same
edge list as the marks, which is what makes totality and in-degree-at-least-one
readable rather than asserted.