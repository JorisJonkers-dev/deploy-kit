---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-01
normative: spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied
rests-on: ["0006"]
---

# An in-cluster job applies the rendered Vault policies, and the Release Gate reads its inputs from a rendered ConfigMap

The Vault policies and auth roles the `vault-policy` adapter renders are written
into Vault by the **Vault policy job**, a Job in the `apps-vso-secrets` Reconcile
Unit that runs before any Application holding a grant, authenticating as a
dedicated policy-admin role. The Release Gate reads each Application's
`releaseGate` element from a ConfigMap the `kubernetes` adapter renders in that
Application's namespace. Both read only what the signed render put in the
cluster ([chapter 30](../../../spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied),
[chapter 55](../../../spec/v1/55-delivery.md#the-release-gate)).

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)). What Flux applies is the signed render, so a
consumer that reads from it reads an input that is already pinned, verified and
in the cluster, and needs no other source.

**False if:** a policy in Vault differs from the rendered document for its
identity once the job has run, or the Release Gate answers from anything but the
ConfigMap of the Application its webhook names. **Settled by:** render a changed
grant, let the job run, and diff `vault policy read` against the document; then
delete an Application's gate ConfigMap and observe the gate answer no.

## Why

**Writing a policy is delivery, and delivery is in the cluster.** Chapter 55 left
open who writes the policies. Writing from CI would need a Vault credential
outside the cluster, the push path pull delivery rules out
([0050](0050-delivery-is-part-of-the-model.md)). A Job applied by Flux from the
same artifact writes exactly what the render holds, and the existing Reconcile
Unit order already runs `apps-vso-secrets` before any Application that reads a
grant.

**The gate needs no lock reader.** The gate's inputs are derived in layer 2
([chapter 20](../../../spec/v1/20-resolved-deployment.md#the-release-gate)). Reading
them from the composition lock would make the gate fetch and verify artifacts
itself. A ConfigMap in the Application's namespace arrives with the Canaries it
describes, in the same signed render, so the gate never sees a Canary without
its inputs, and a missing ConfigMap is a gate that answers no.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The composition workflow writes the policies | no Job | a Vault credential in CI |
| A Vault operator reconciling policy objects | continuous reconcile | a CRD and an operator for a set of documents that change at deploy time only |
| The gate reads the composition lock | one document | the gate fetches and verifies artifacts, a second reader of the lock |
| The gate's inputs as Canary annotations | no extra object | spreads one Application's inputs over every member |

## Reversibility

Undo cost today: one Job, one ConfigMap per gated Application, and the gate's
reader, a day.

## Consequences

- A policy-admin Vault role exists, created as a platform fixture with the auth
  method, since the job cannot grant itself its own privilege, paid once.
- A changed grant reaches Vault on the next apply of `apps-vso-secrets`, before
  the Application that needs it starts, paid in one Job run per change.
- Every gated Application carries one more ConfigMap, paid in render size.
