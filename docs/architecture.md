# The compiler's structure

Normative for **code**, the way [`spec/v1`](../spec/v1/00-overview.md) is
normative for the model. Decisions recorded in
[`docs/adr/architecture/`](adr/architecture/README.md) point their `normative:`
field at sections of this document, and `scripts/lint-adrs.mjs` checks that the
anchor exists. Adding or renaming a `## ` heading here therefore breaks the
anchor check for any ADR that names it; change both together.

The boundary with the model is absolute: nothing here can change what the model
means. Where this document and a spec chapter appear to disagree about a model
rule, the chapter wins and this document is what gets fixed.

Sections are written as the compiler acquires them. A heading with no content
below it is a section not yet decided, and an ADR may not point at one.

## Layers

Seven directories under `src/`, innermost first. A layer may reach inward and
may not reach outward, and the graph is checked rather than described:
[`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) encodes every rule
below, and `npm run lint:boundaries` fails on a violation.

| directory | holds | may import |
|---|---|---|
| `domain/` | layer 1 aggregates, layer 2 derivation, the ports the core declares | itself only |
| `objects/` | the typed Kubernetes object model layer 3 builds | nothing |
| `wire/` | Zod schemas per document family per `schemaVersion`, and the mappers into the domain | `domain/`, `zod` |
| `adapters/` | the registered adapters, one directory each, shared code in `adapters/shared/` | `domain/`, `objects/`, `adapters/shared/` |
| `application/` | the use-cases; orders derivation, performs no IO of its own | `domain/`, `wire/`, `adapters/`, `objects/` |
| `infrastructure/` | port implementations: filesystem, `oras`, hashing, the serializer, the writer | `domain/`, `objects/` |
| `cli/` | argument parsing, diagnostic rendering, exit codes, wiring | everything |

Four of those rules exist for a reason worth stating once.

**The domain reads nothing ambient.** No filesystem, network, clock,
environment or crypto. Hashing arrives through a port, which is what keeps
`renderHash` a pure function of the pinned inputs rather than of the machine.

**The domain does not know the wire shape.** Zod declares what a human writes;
the domain is a different shape, reached through an explicit mapper. This is
what lets two `schemaVersion`s coexist without the core carrying both.

**No adapter reads another adapter.** An adapter that consumes another's output
turns evaluation order into semantics, and attribution and path-collision
detection stop being provable. Shared code goes to `adapters/shared/`.

**Nothing depends on the CLI.** Diagnostic rendering and exit-code mapping are
the outermost ring; a use-case that reached them could not be called by a test.

## Ports

## Error model

## Serialization

## Path authority

## Testing

## Gates

Four gates hold the structure, and each exists because its absence has already
cost something in the generation this compiler replaces.

| gate | command | catches |
|---|---|---|
| boundaries | `npm run lint:boundaries` | a layer reaching outward, an adapter reading another adapter, a cycle, a module reachable from no entry point |
| types | `npm run typecheck` | `strict` violations; `@ts-nocheck` is an ESLint error and `@ts-expect-error` needs a description |
| decisions | `npm run lint:adrs` | frontmatter, register integrity, citations, normative anchors per domain |
| tests | `npm test` | behaviour, plus the coverage floor |

The reachability half of the boundary gate is the one worth naming. Coverage
alone rewards a module for having tests: chapter 30 records 1,967 lines of dead
renderer that survived a `--lines 90` gate because its own test files imported
it. Reachability asks a different question — does anything real call this —
and the two together are what coverage was mistaken for.

Both the boundary ruleset and the decision-record lint carry negative fixtures.
A gate that has only ever run against a clean tree is untested: nothing proves
it would fail.
