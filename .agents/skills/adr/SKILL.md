---
name: adr
description: Write a decision record for deploy-kit, to this repository's own ADR contract. Use when a change decides something (a model rule, a compiler structure choice, a gate) rather than merely implements one, when the user asks to "write an ADR" or "record a decision", or when a change under docs/adr/ or spec/v1/ needs a citation that does not yet exist.
---

# ADR

Write one decision record, checked by `npm run lint:adrs` before it is ever
reviewed by a person. Read [`docs/adr/README.md`](../../../docs/adr/README.md)
first: the register, the citation rule and the domain table live there, not
here, and this skill fails the moment it drifts from that document instead of
pointing at it.

## Steps

1. **Pick the domain directory.** `docs/adr/model/` for a decision about the
   v1 model (its `normative:` pointer names a `spec/v1` heading);
   `docs/adr/architecture/` for a decision about the compiler's own structure
   (its `normative:` pointer names a `docs/architecture.md` or
   `docs/architecture-rules.md` heading); `docs/adr/deferred/` only for
   delivery or co-testing direction work, never for a v1 decision. While
   `emf/` exists, a Java-side decision goes to `emf/docs/adr/` instead, using
   the same numbering sequence.
2. **Take the next number.** Check `docs/adr/README.md`'s register **and**
   `emf/docs/adr/README.md`'s, even when writing to the root register: the
   sequence is estate-wide and a number already used in either register is
   the fastest way to fail the register-integrity check.
3. **Write the frontmatter.** `tier: premise` (a falsifiable claim, no
   `rests-on`) or `tier: decision` (names only premises in `rests-on`, never
   another decision: a decision-to-decision dependency is prose, in `## Why`,
   not frontmatter). `claim: settled` needs no `owner:`; any other `claim:`
   value does. `normative:` is a real heading in the file the domain table
   names, checked against the tree, not typed from memory.
4. **Write the body**, in the section order the register's own decisions use:
   `## Rests on` (decisions only), `## Why`, `## Alternatives` (a table:
   `option`, `cost if taken`, `why rejected`), `## Reversibility`, `##
   Consequences`. Never restate a field list, an error code or a worked YAML
   here: that belongs in the chapter the `normative:` pointer names, and this
   record links to it instead.
5. **Add the register row**, in the numeric position its section of
   `docs/adr/README.md` (or `emf/docs/adr/README.md`) already sorts by, with
   the title and claim matching the file exactly.
6. **Cite it correctly everywhere else you touch.** Never a bare `ADR-NNNN`
   or bare number: always a Markdown link. A decision that supersedes another
   updates the superseded one's own claim line and citation.
7. **Run `npm run lint:adrs`.** It is the same check CI runs, so a failure
   here is the failure a pull request would get.

## Claiming a ticket

If this ADR is the ticket's deliverable and it is not yet claimed, claim it
first ([`AGENTS.md`](../../../AGENTS.md#claiming-a-ticket)), before the first
edit.
