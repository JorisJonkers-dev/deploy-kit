---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: docs/architecture.md#layers
rests-on: ["0003", "0005"]
---

# The compiler is a chain of typed models, each step a module of named mappings, and a directory exists once it holds a module

The compiler reads Project Intent and Platform Intent, lowers them to the
Effective Intent, resolves the Resolved Deployment, and adapts it to the
Deliverable Set, which one serializer writes. Each arrow is a step: a pure
function from one typed model to the next, in its own directory (`read/`,
`check/`, `lower/`, `resolve/`, `adapters/<name>/`). The metamodels sit
innermost, in `model/`, and every step imports only `model/`. No step imports
another step; the use-case in `application/` runs the steps in order and passes
each model on. A step is a module of named mappings, one exported function per
source concept to target concept, named as the model-driven implementation names
the same mapping (`lowerProcess` beside `Process::lower`), with its guard first.
Queries stay separate and pure, beside the metamodel they navigate. A directory,
and the dependency rules that constrain it, exists once it holds a module. Type
and folder names come from [`CONTEXT.md`](../../../CONTEXT.md) unchanged.

## Rests on

The model is three layers with a contract in the middle
([0003](../model/0003-three-model-pipeline.md)), and every layer-2 value is a
derivation from declared intent ([0005](../model/0005-derivation-is-total.md)).
So the compiler is a function from one typed model to the next, several times
over, and its structure can be the chain itself.

**False if:** a step needs a model that is not its own input, or another step's
internals, to produce its output. **Settled by:** the first rewrite slice
rendering `minimal` end to end through `read`, `lower`, `resolve` and the
adapters, with each step importing only `model/`, and `npm run lint:boundaries`
proving it. The tree runs the chain as far as the Effective Intent today;
`resolve/` and the adapters join it in the slices that follow.

## Why

**The chain is the structure the model already has.** Every intermediate model
is a value a test compares against an oracle: `intent.json`, `effective.json`,
`resolved.json`, `dependencies.json`, the rendered tree. A directory per step
puts one transformation in one place, which is what a reader opening one rule
needs.

**Metamodels in the middle.** Every step imports the model it reads and the model
it writes, so the metamodels are the one thing everything shares, and "no step
imports another" replaces four ring rules with one sentence. That is the course's
metamodel-based transformation pattern, with plain TypeScript functions in place
of an engine.

**Named mappings, no framework.** One function per concept keeps a rule readable
alone. There is no rule interface and no transformer class; a generic appears
when two mappings need the same trace machinery, not before
([0058](0058-every-step-links-through-one-trace.md)).

**A directory exists once it holds a module.** A seven-ring layout was settled
before most rings had code: three rings and three of four declared ports stayed
empty while four ledger rows enforced rules over nothing. Rules for `cli/` land
with the first command.

**Why not a role flag.** The replaced generation dispatched adapters on a
hand-set string and handed five of them the wrong document. A role in a string is
a role the type system cannot check; typed models between steps are.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Seven hexagonal rings, two use-cases | a conventional shape | one transformation spreads over three rings, and empty rings carry rules |
| Ring names kept, steps nested in `domain/` | a smaller depcruise diff | a second, nested ruleset for "a step never imports another" |
| One application switching on a role flag | one entry point | the failure is silent rather than a compile error |
| A generic rule engine first | one shape for every mapping | builds the framework before the second mapping needs it |

## Reversibility

Undo cost today: `src/` holds 32 files and only the parsers and the lowering
move: a day. Becomes irreversible once: an out-of-tree adapter imports a
`model/` path, because the adapter port is a published surface
([0037](../model/0037-six-registered-adapters-satisfy-one-port.md)).

## Consequences

- The ledger rows that name rings change with the depcruise rules, each with its
  fixture, and one new row forbids a step importing another step.
- `docs/architecture.md#layers` and `#ports` are rewritten to the chain in the
  same slice.
- The model-driven implementation shares the mapping names and nothing else
  ([0068](0068-two-implementations-meet-at-the-parity-table.md)).
