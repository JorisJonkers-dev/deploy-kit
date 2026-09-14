---
tier: decision
status: proposed
claim: settled
date: 2026-09-14
normative: docs/architecture.md#the-wire-boundary
rests-on: ["0003"]
---

# The wire schema is the metamodel, and the rules one document decides are a registry beside it

## Rests on

Each model in the pipeline is a language with a definition, and a language
definition has four parts: an abstract syntax, a concrete syntax, a set of
well-formedness rules, and a semantics. False if: a part of the definition
exists that cannot be held in one declaration without duplicating another,
which would put the copies back. Settled by: `npm run lint:intent` parsing
every Service Intent document in this repository against
`src/wire/service-intent/`, with the chapter's class diagram, its
closed-vocabulary table and the committed JSON Schema all checked against that
same declaration and no second copy of any of them.

## Why

[0066](0066-wire-shape-is-not-the-domain.md) settled that the authoring shape
is not the domain model and that a mapper joins them. What it did not settle is
which of the two is the **language definition**, and that question has an answer
with consequences: the chapter's class diagram, its field tables, its
closed-vocabulary table and the JSON Schema an editor reads are four more
statements of the same language, and before this decision every one of them was
kept by hand.

The review that produced [issue #35](https://github.com/JorisJonkers-dev/deploy-kit/issues/35)
counted the cost: one class diagram kept in three notations, none of them
machine-readable, and 48 places where the chapters, the decision records, the
examples and the proposal disagreed, most of them one fact held in several
hand-maintained copies. A closed vocabulary was spelled out in a chapter table,
in a drawing and again as a constant in a test. Well-formedness was prose: 61
error codes, four negative fixtures, two of them proven to fire, and those by
reading YAML indentation.

The decision is therefore a placement, and it has two halves.

**The wire schema is the metamodel.** One export per class, named as the class
diagram names it, collected in one enumerable record. Everything else that
states the language is generated from it or checked against it. The concrete
syntax (which YAML the file is, and the placeholder grammar of the env files
beside it) lives in the same directory, because it is the same language's other
half, and a reader looking for what a document may say should find both in one
place.

**The rules one document decides are a registry beside it, in the domain.** A
rule is a pure function from a parsed document to a diagnostic list, registered
with its code, the metamodel class it constrains, its Essential OCL placement
and the chapter anchor that defines it. That is the same shape
[chapter 40](../../../spec/v1/40-composition.md#the-estate-wide-invariants)
already gives the estate-wide invariants, and it is what makes "a rule with no
fixture, no test or no specification anchor" a condition a script can detect
rather than an absence nobody can see.

Two placements follow, and both are deliberate. A rule that carries an `E_`
code is a **registry entry** and never a schema refinement, because the code is
what a refusal fixture names and what CI asserts on; folding
`E_ALERT_CLASS_WITHOUT_SIGNAL` into the schema would refuse the same documents
and report `schema`, losing the code. A rule the specification gives **no**
code, conversely, stays in the schema, because inventing one would add a
sixty-second error code to a register that is being reduced.

What the registry deliberately does not hold is stated as data beside it: every
rule that needs a second document names the input it is missing. That is a
boundary rather than a backlog, and it is what keeps the next two metamodels
from re-deciding which half is theirs.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the diagram and the tables by hand; use Zod only as a runtime check | Nothing to build; the drawing stays free to be drawn well | The state this decision leaves: four statements of one language, drifting, with the drift invisible because each artefact is internally consistent |
| Make the domain model the metamodel and generate the wire schema from it | The language definition sits in the pure layer, where the rules already are | The authoring shape carries what the domain deliberately drops: a `provides` map, an omitted `engine` meaning `kv`, an absent block meaning none. Generating those from the domain would put the authoring vocabulary back into the core, which is exactly what [0066](0066-wire-shape-is-not-the-domain.md) separated |
| A separate metamodel declaration that both Zod and the domain are generated from | One source for three things instead of two | A third notation to learn, a code generator to maintain, and nothing in the estate yet needs the third target. Zod already produces the runtime check, the TypeScript type and the JSON Schema from one declaration |
| Put every rule in the schema as a refinement | One place to look, and no registry to keep | A refinement cannot carry a code, a context, a placement or an anchor, so [issue #44](https://github.com/JorisJonkers-dev/deploy-kit/issues/44) would have nothing to register and a refusal fixture could not name what refused it |
| Evaluate every rule the specification defines, reading whatever a rule needs | Every rule proven in one place | Half of them need the composed union, the Platform document or a pinned lock. Running them against a single document would report an absence as a violation, which is worse than not running them |

## Reversibility

Undo cost today: the registry collapses into the schema by folding each rule
into a refinement and deleting the codes, and the generated JSON Schema goes
back to being hand-written: hours, and no document changes either way.
Becomes irreversible once: a chapter's class diagram, field table or
vocabulary table is generated rather than hand-kept
([issue #40](https://github.com/JorisJonkers-dev/deploy-kit/issues/40)), since
un-generating them means writing four artefacts by hand again with no record
of what they used to say.

## Consequences

- A closed vocabulary is an enum in one file and nowhere else, so the chapter's
  table is checked against it rather than kept in step with it. Paid by whoever
  adds a vocabulary, once, in one place.
- A rule carries a code, a context, a placement and a chapter anchor whether or
  not anything reads all four yet, which is one more field than today's code
  needs. Paid per rule, and it is what
  [issue #44](https://github.com/JorisJonkers-dev/deploy-kit/issues/44) hangs an
  Essential OCL statement off without re-reading all 61 codes.
- A refusal fixture asserts a code rather than a message, and a fixture that
  starts failing for two reasons at once fails the gate. Paid by whoever makes
  a fixture stop isolating its defect, at the moment they do it.
- The next two metamodels (Platform Intent, the Resolved Deployment) are the
  same shape, so their tickets copy a pattern rather than choosing one. Paid
  once, here.
- A document family's concrete syntax is now the wire layer's, so the wire layer
  imports a YAML reader. Paid in one line of `docs/architecture.md`'s layer
  table, and it is the honest place for it: YAML is what the language is
  written in, not an effect the domain needs a port for.
