---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/16-dependencies.md#process-identity
rests-on: ["0005", "0008"]
---

# Each Process holds its own identity, and its ServiceAccount token is mounted only where the pod itself authenticates

The ServiceAccount and the Vault Kubernetes auth role are derived per Process
and named for the Process alone: `auth-system.auth-api`, never
`auth-system.auth-auth-api`. The policy bound to a Process's role is exactly its
effective grant set ([0012](0012-shared-intent-descends-and-is-lowered.md)),
never a sibling's, and no author writes an identity name.
`automountServiceAccountToken` derives from `delivery`: true only for a Process
holding a `delivery: self` grant, false everywhere else
([chapter 16](../../../spec/v1/16-dependencies.md#the-token-is-mounted-only-where-the-pod-authenticates)).

## Rests on

Vault's Kubernetes auth method binds a role to ServiceAccount names and
namespaces and nothing finer, so two pods presenting one ServiceAccount are one
principal holding the union of its policies, and a read cannot be narrowed below
its path ([0008](0008-vault-read-is-per-path.md)). A pod needs its token exactly
when it authenticates with it, which the declared delivery says
([0005](0005-derivation-is-total.md)).

**False if:** a role can bind below the ServiceAccount and give two pods of one
ServiceAccount different policies, or a Process needs its token for a reason no
declaration implies often enough to be the normal case. **Settled by:** `vault
read auth/kubernetes/role/<role>` and the create path's parameters on the pinned
Vault version; the two-Process `knowledge` rendering two ServiceAccounts and two
roles; and the rendered estate carrying `automountServiceAccountToken: false` on
every Process except those holding a `self` grant.

## Why

**One identity per Application unioned every grant.** The replaced generation
derived one ServiceAccount per Application. `knowledge-api` serves anonymous
paths from the public internet; `knowledge-ingest-worker` holds the knowledge
vault's SSH deploy key. Under one identity the internet-facing Process
authenticated as the principal holding that key. The identity is the only place
that boundary can exist.

**Delivery is the field the token reads.** "No grant, no token" gets
`platform-postgres` backwards: under `env` the VSO operator reads Vault and under
`file` the kubelet projects, so the pod presents nothing. Only `self` means the
pod authenticates with its own token. A token mounted into a pod that never uses
it is a credential in a container filesystem for no reason, the first thing an
attacker reads.

**A Kubernetes-API consumer is a ledger entry, not a declaration.** `agents-api`
calls the Kubernetes API rather than Vault. The render gives it no token and no
Role ([0041](0041-no-process-rbac-in-v1.md)); the gap is recorded in a
Bidirectional Ledger ([0038](0038-bidirectional-ledgers.md)), because no
override exists ([0022](0022-a-derived-value-has-one-declaring-site.md)) and a
render input read from a review artifact would let a ledger edit silently change
what is applied.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One identity per Application | fewer ServiceAccounts and roles | a public Process authenticates as the holder of a sibling's private key |
| Identity per Application with per-grant policy tricks | no rename | Vault binds no finer than the ServiceAccount |
| Mount the token wherever a grant exists | one simple rule | wrong for `env` and `file`, where the pod presents nothing |
| Default false with an authored opt-in | explicit | a second field for something derivable; a forgotten opt-in fails at runtime |
| Derive the token from the ledger | covers `agents-api` | a review document silently changes what is applied |

## Reversibility

Undo cost today: two derivations: hours. Becomes irreversible once: live Vault
roles and ServiceAccounts are cut per Process and credentials are issued under
them, because merging identities then widens a live grant.

## Consequences

- Twice the ServiceAccounts and roles for a two-Process Application, paid in
  render size and in one re-creation of the roles.
- Every pod without a `self` grant runs with no token, so a Process that
  silently relied on the default mount fails at start and says so.
- `agents-api` cannot reach the Kubernetes API from a render until the model
  decides API access for Processes; its ledger entry is the record.
