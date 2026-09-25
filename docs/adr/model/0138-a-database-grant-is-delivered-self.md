---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-25
normative: spec/v1/10-project-intent.md#delivery
rests-on: ["0002", "0009"]
---

# A database grant is delivered by the application itself, as a transit grant is

A `database` grant takes `delivery: self` and nothing else, the same as a
`transit` grant. This amends one consequence of
[0085](0085-a-grant-is-a-union-on-engine.md), which narrowed the refusal to
`transit` and let a `database` grant be delivered by `env` or `file`. The rule
itself is [chapter 10](../../../spec/v1/10-project-intent.md#delivery)'s.

## Rests on

A pod's environment is fixed when its container starts, which is a property of
the substrate ([0002](0002-kubernetes-as-substrate.md)), and the policy a grant
derives covers the path it reads ([0009](0009-vault-read-is-per-path.md)).

**False if:** a `database` grant delivered by `env` or `file` is accepted by
either implementation. **Settled by:** a refusal fixture with a `database`
grant delivered by `env`, whose committed diagnostics both implementations
reproduce.

## Why

**The specification and both implementations already say this.** Chapter 10's
refusal table refuses every non-KV grant delivered by `env` or `file`, the
TypeScript rule refuses any grant carrying an `engine`, and the Complete OCL
invariant sits on the database grant as well as the transit grant.
[0130](0130-migration-is-declared-on-the-application.md) states it too: the
delivery of a minted credential is fixed, because a non-KV grant is always
`self`. 0085's consequence was the one statement that disagreed, and where an
ADR and the specification disagree, the ADR is what gets fixed.

**A database credential is issued per lease.** The engine mints it with an
expiry, and the application renews or re-reads it while it runs. An
environment variable cannot change under a running process, so `env` would
hold a credential that expires before the pod does. `file` persists a live
database credential as a Kubernetes Secret, which `self` never writes.

**One rule for every non-KV engine.** KV holds values that can be projected.
The transit and database engines use or issue credentials on the caller's
behalf, so neither has a stored value to project, and the delivery matrix stays
a KV matrix in the same way the access tiers do.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Allow `env` and `file` for a `database` grant, as 0085's consequence said | one more legal cell; the operator projects a dynamic secret like a static one | `env` holds an expiring credential for the pod's lifetime, `file` persists a live credential, and the specification's refusal table and both implementations change |
| Allow `file` only | a consumer that watches its file gets a new credential without a restart | persists the credential as a Kubernetes Secret, and every consumer must watch its file |
| Leave 0085 and the specification disagreeing | nothing to write | a reader cannot tell whether the cell is legal |

## Reversibility

Undo cost today: supersede this record, drop the database arm of the TypeScript
rule and of the OCL invariant, and add the two cells to chapter 10: hours.
Becomes irreversible once: never; allowing a delivery that was refused breaks no
valid document.

## Consequences

- 0085's consequence on `E_NON_KV_DELIVERY` no longer holds: the refusal covers
  `transit` and `database`, paid by nobody, since both implementations already
  refuse both.
- Chapter 10's field table and its paragraph on non-KV engines name the
  database engine as well as transit, so the chapter no longer contradicts its
  own refusal table.
- An application that reads a database credential fetches it through its own
  Secret Store client, paid in that application's client configuration.
- The settling fixture is still to be written, in both implementations and in
  the committed refusals, owned by joris.
