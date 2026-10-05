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
into Vault by the **Vault policy job**, a Job in the `estate-vso-secrets` Reconcile
Unit that runs before any Application holding a grant, authenticating as a
dedicated policy-admin role. The job is derived from what the Platform document
states about it, runs in the Secret Store's namespace, and is named by the
digest of the documents it is handed. The Release Gate reads each Application's
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
Unit order already runs `estate-vso-secrets` before any Application that reads a
grant.

**The gate needs no lock reader.** The gate's inputs are derived in layer 2
([chapter 20](../../../spec/v1/20-resolved-deployment.md#the-release-gate)). Reading
them from the composition lock would make the gate fetch and verify artifacts
itself. A ConfigMap in the Application's namespace arrives with the Canaries it
describes, in the same signed render, so the gate never sees a Canary without
its inputs, and a missing ConfigMap is a gate that answers no.

**The job is derived, because its input is the render.** A Process declares
what it needs from the model: an image, a surface, a grant. This job needs the
policy documents of every project a render holds, which no project file can
name and which do not exist until the render does. So it is derived, as a
backup and a migration are, from facts the platform states: the image alias,
the Vault role, what it requests and how long it may take. Declaring it as a
Process would need a job lifecycle the render does not spell, a way to move one
project's Process into the estate-scoped artifact, and a way to hand it the
render, all for one consumer.

**It runs beside the store it writes into.** The job's ServiceAccount is the
one pair the platform's Vault role is bound to, by a fixture. The Secret
Store's namespace is one the platform already owns for exactly that component,
and the job's policy then admits egress within one namespace. In the `delivery`
project's namespace the estate-scoped artifact would write an object into a
namespace another artifact owns.

**The name is the documents' digest, computed from the documents alone.** Both
implementations render the same documents and must give the Job the same name,
so the name is defined over what both hold: the canonical JSON of one object,
each document under its file name. Neither hashes a file it wrote.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The composition workflow writes the policies | no Job | a Vault credential in CI |
| A Vault operator reconciling policy objects | continuous reconcile | a CRD and an operator for a set of documents that change at deploy time only |
| Declare the job as a `lifecycle: job` Process of the `delivery` project | the ticket's own wording; no Platform block | a job lifecycle, a move across artifacts and a hand-over of the render, for one consumer whose input no project can name |
| Run the job in the `delivery` project's namespace | beside the other binaries of its repository | the estate-scoped artifact writes into a namespace another artifact owns, and the policy crosses namespaces |
| The gate reads the composition lock | one document | the gate fetches and verifies artifacts, a second reader of the lock |
| The gate's inputs as Canary annotations | no extra object | spreads one Application's inputs over every member |

## Reversibility

Undo cost today: one Job, one ConfigMap per gated Application, and the gate's
reader, a day.

## Consequences

- A policy-admin Vault role exists, created as a platform fixture with the auth
  method, since the job cannot grant itself its own privilege, paid once.
- A changed grant reaches Vault on the next apply of `estate-vso-secrets`, before
  the Application that needs it starts, through a new Job named by the
  documents' digest, paid in one Job run per change.
- Every gated Application carries one more ConfigMap, paid in render size.
