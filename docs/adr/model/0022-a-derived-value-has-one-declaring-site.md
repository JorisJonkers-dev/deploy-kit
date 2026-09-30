---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/20-resolved-deployment.md#no-overrides
rests-on: ["0002", "0005"]
---

# A derived value has one declaring site, and `replicas: {count, reason}` is the sole local exception

No derived value may be restated by an author, and there is no override
mechanism. The one named exception is capacity: a Process may declare
`replicas: {count, reason}`. Otherwise `replicas` derives as one.
`minAvailable` does not exist. A PodDisruptionBudget is emitted only where
`replicas` exceeds one, as `maxUnavailable: 1`. The chapter's
[replicas section](../../../spec/v1/10-project-intent.md#replicas-and-the-disruption-budget)
states the rules.

## Rests on

A derived value is a function of declared inputs
([0005](0005-derivation-is-total.md)), so a value reachable two ways has no
single declaring site and cannot be checked. No Process in this estate obtains
availability from a replica count: storage is `local-path`, every PVC is
`ReadWriteOnce`, and rescheduling does not exist
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)).

**False if:** rendering the estate needs more than one locally restated value
per Application, or a stateless Process's second replica measurably survives an
event that takes the first down. **Settled by:** every Application rendered with
the single `replicas` exception, no derived value restated, and `kubectl drain`
on the control-plane node completing rather than blocking.

## Why

**A generic hatch becomes the configuration interface.** The old override table
had ten rows. One was irreducible local knowledge (`replicas`); four were
platform policy over shared resources; three were derivations that were never
decisions; one existed to prevent the hand-tuning the hatch reintroduced. The
case that justified it (`app-ui`'s 600-second deadline beside the JVMs' 1800)
was a process class the rule failed to distinguish, which a rule reading
`runtime` fixes. A required reason does not fix an unbounded exception system.

**Replica count is a fact, not a rule outcome.** `auth-api` runs two replicas
for a capacity reason recorded in chapter 00, on one eligible node. That is a
`replicas` declaration with a reason: the truthful encoding of what it always
was.

**`minAvailable` could not be honoured and deadlocked drains.** `minAvailable:
1` against one replica permits zero voluntary evictions, so draining the
control-plane node blocked forever. A budget only above one replica, as
`maxUnavailable: 1`, lets a drain always progress without recomputing when a
count changes.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A generic override hatch with a reason | every derived field grows an overridable flag | ten rows, one real; an exception outlives the bug that justified it |
| No exception at all | the simplest rule | capacity is irreducible: only the owner knows why a second replica exists |
| Assignments restatable as well | local control of hostnames and paths | reintroduces the collisions contention exists to prevent ([0004](0004-contention-decides-authority.md)) |
| Keep `minAvailable` as an availability requirement | the six live PDBs stay derivable | grades a field the substrate cannot honour, and deadlocks drains |
| Emit no PDB at all | the simplest render | a two-replica Process spread over nodes benefits from not losing both |

## Reversibility

Undo cost today: an `overrides` array and a resolver branch: hours. Becomes
irreversible once: Processes depend on locally restated values.

## Consequences

- A derived value cannot be wrong in two places at once; a wrong derivation
  shows as a wrong render for a whole process class, which is what makes it
  fixable, paid by the rule's author.
- A second exception must earn a named field with its own authority, validation
  and example, deliberately more work than a row.
- `app-ui`'s deadline is a derivation-rule problem: the corrected rule must be
  tested against the estate's rollout evidence
  ([chapter 20](../../../spec/v1/20-resolved-deployment.md#why-the-hatch-closed)),
  paid by joris.
- No `E_UNKNOWN_OVERRIDE`, because there is no key set to fall outside of.
