---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#no-overrides
rests-on: ["0005"]
---

# A derived value has one declaring site; capacity is the sole named exception

> **Amended 2026-09-08.** An override named a derivation by the **derivation's
> own name** (`startupDeadline`, `replicas`, `automountToken`) from a closed
> set in [chapter 14](../../../spec/v1/14-platform-intent.md), never by the
> Kubernetes field ([0097](0097-authored-values-name-model-concepts.md)).
>
> **Superseded in substance 2026-09-10.** The generic mechanism is **deleted**.
> There is no `overrides` field, no overridable-derivations table and no
> `E_UNKNOWN_OVERRIDE`. The rule that survives is the one this ADR was always
always reaching for (a derived value has exactly one declaring site) and the sole
> local exception is the named `replicas: {count, reason}` field
> ([chapter 10](../../../spec/v1/10-service-intent.md#capacity)). The argument
> below is kept because it is the evidence for why the hatch was wrong to
> generalise, not because the hatch still exists.

## Rests on
A derived value is a function of declared inputs, so a value reachable two ways
has no single declaring site and cannot be checked. False if: rendering the
estate needs more than one locally restated value per Service, which would mean
the derivation rules are wrong rather than the workloads unusual. Settled by:
render every Service with the single `replicas` exception, and find no derived
value that a Workload must restate to be correctly rendered.

## Why
[0030](0030-runtime-mechanics-derived.md) forbids authoring derived runtime
mechanics and [0011](0011-configuration-env-files-per-workload.md) forbids
authoring derived configuration. The escape was justified by one case: `app-ui`
runs `progressDeadlineSeconds: 600` while the three JVM services run `1800`, and
its comment explains why: *"nginx pods, ~10–20Mi RAM each"*.

That case did not justify a general mechanism, and re-reading it shows why. A
JVM cold start and a static-bundle start differ by **two orders of magnitude**;
that is not a value only `app-ui`'s owner could know, it is a **workload class**
the central rule failed to distinguish. The correct response is a rule that
reads `runtime` (an input every Workload already declares), not a per-Workload
exception carrying a number the rule should have produced.

The falsified-input argument was sound as far as it went: the deadline derives
from `startupBudget`, and so do the startup probe's period and threshold, so an
owner who needs 600 and cannot say so might declare a 200-second budget to coax
the number out. But that argument licensed every later addition to the table,
and the table's contents show it: of the ten rows, one was irreducible local
knowledge (`replicas`), four were platform policy over shared resources
(cadence, retention, ephemeral size, probe timing), three were derivations that
were never decisions, and one (`routePriority`) existed to prevent the very
hand-tuning the hatch reintroduced
([0093](0093-route-precedence-is-derived.md)).

An unbounded exception system becomes the normal configuration interface. That
is the defect, and it is not fixed by requiring a reason.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep the generic hatch (status quo) | Every new derived field needs an overridable flag, and an exception can outlive the bug that justified it | Ten rows, of which one was real; the table becomes the interface |
| No escape at all, and no `replicas` field | Simplest possible rule | Capacity is genuinely irreducible: only the owner knows why a second replica exists, and a reason for it is the whole point |
| A narrowly named field per real exception | One field per exception, each with authority and validation | **Taken.** This is the decision: `replicas` is that field, and the bar for a second is deliberately high |
| Repair every derivation rule instead | Nothing to except, ever | Not achievable in general: `replicas` is a fact, not a rule outcome |
| Assignments restatable as well | Two Services can claim one hostname, one node label, one Secret path | Reintroduces the collisions [0004](0004-contention-decides-authority.md) exists to prevent |

## Reversibility
Undo cost today: add an `overrides` array to the layer-1 schema and a resolver
branch (hours, since no Workload carries one and the estate has no
override-shaped data to migrate. Becomes irreversible once: Workloads come to
depend on locally restated values, at which point withdrawing the hatch means
tracing each one back to a derivation-rule change.

## Consequences
- One less concept, and one less thing to get wrong: a derived value cannot be
  wrong in two places at once, paid by nobody.
- A wrong derivation is now visible as a wrong render for a whole workload class
  rather than hidden behind a per-Workload reason, which is what makes it
  fixable, paid by the rule's author.
- Chapter 16's single-authority property runs over **every** surface; the
  dead-declaration check no longer has an exemption for hand-tuning, paid by
  nobody.
- A genuine exception now has to earn a named field with its own authority,
  validation and example, which is deliberately more work than adding a row,
  paid by whoever proposes the next one, and that is the intent.
- `app-ui`'s deadline is now a derivation-rule problem, not a declared
  exception, so the corrected rule must be selected and tested against the
  estate's actual rollout evidence before the single `startupBudget × 3` rule is
  replaced: see [chapter
  20](../../../spec/v1/20-resolved-deployment.md#why-the-hatch-closed); paid by
  joris, and it is the one open proof this decision carries.
- No `E_UNKNOWN_OVERRIDE`, because there is no key set to fall outside of.
