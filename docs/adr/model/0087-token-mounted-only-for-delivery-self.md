---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/16-dependencies.md#the-token-is-mounted-only-where-the-pod-authenticates
rests-on: ["0005"]
---

# A ServiceAccount token is mounted only where the pod itself authenticates

## Rests on
A pod needs its ServiceAccount token exactly when it authenticates to something
with it, and in this estate that is exactly `delivery: self`. False if: a
Workload needs the token for a reason no declaration implies and the case is
common enough that an override is the normal path rather than the exception.
Settled by: rendering the estate and finding `automountServiceAccountToken:
false` on every Workload except those holding a `delivery: self` grant, with
`agents-api` the only override.

## Why
The field is underivable today: no chapter says what it should be, and both
renderer generations leave it to the Kubernetes default, which mounts a token
into every pod in the estate.

The obvious rule is wrong, which is the interesting part. "No grant, no token"
sounds right and gets `platform-postgres` backwards: it holds a grant and needs
no token. Under [0026](0026-delivery-env-file-self.md)'s `delivery: env` the VSO
operator performs the Vault read and projects the result into a Secret; under
`delivery: file` the kubelet projects it. In neither case does the pod present
anything to anyone. Only `delivery: self` means the pod authenticates with its
own token (that is the whole content of the word `self`), so `delivery` is the
field the derivation must read, and a grant's existence says nothing on its own.

This is the same shape as [0075](0075-no-workload-rbac-in-v1.md): the privilege
a Workload of this estate needs is smaller than the default, and refusing to
render the default is what makes that visible. There the object was a Role; here
it is a token, and mounting one into a pod that never uses it is a credential
sitting in a container filesystem for no reason: the thing an attacker reads
first.

A default of `false` with an authored opt-in was the alternative, and it is a
second authored field for something derivable in every case the estate has. An
opt-in nobody remembers is a pod that cannot authenticate, discovered at
runtime; a derivation that reads `delivery` cannot be forgotten.

`agents-api` is the case the rule does not cover, because it calls the
**Kubernetes** API rather than Vault and may hold no `self` grant at all. It
restates the derived value with a reason, which
[0031](0031-derived-overrides-with-reason.md) already provides for exactly this:
a derived value is overridable with a reason, an assignment is not. Deriving from
the ledger instead (reading a review artifact as a render input) was refused: it
would make editing a document that exists to record accepted holes silently
change what is applied.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Default `false` with an authored opt-in | Safest default; covers the Kubernetes-API case without an override | A second authored field for something `delivery` already implies, and a forgotten opt-in is a runtime authentication failure |
| Derive from grant existence | One field to read, and it looks like least privilege | Wrong for `platform-postgres`, which holds a grant and authenticates to nothing: the exact case R13 records |
| Add an `apiAccess` declaration | Closes `agents-api` properly and gives 0075's ledger entry a home | Invents Kubernetes-API vocabulary shaped entirely by one consumer, which chapter 30 refuses on principle |
| Derive from the Bidirectional Ledger | Nothing authored twice; the ledger becomes load-bearing | Makes a review artifact an input to derivation, so a ledger edit silently changes the render |

## Reversibility
Undo cost today: one derivation, and the field is absent from every live object
anyway. Becomes irreversible once: never. The field is patchable in place on a
live pod template, and widening it back is one derivation change.

## Consequences
- R13 closes, and every pod in the estate that never authenticates stops
  carrying a credential it cannot use, paid by nobody.
- `agents-api` needs an override before it renders correctly, and if nobody
  writes one it fails at runtime with a 403 from the API server rather than at
  build time, paid by its owner, and it is the one case the derivation
  deliberately does not guess at.
- A Workload switching a grant from `self` to `env` loses its token, which is
  correct and is also a change nobody asked for when they changed the delivery
  mode, paid by whoever switches, visibly in the projection diff.
- The override count becomes a number worth watching: every pod holding a token
  it was not derived one for is one line in `resolved.yml`, paid in review
  attention, which is the point of recording it there.
