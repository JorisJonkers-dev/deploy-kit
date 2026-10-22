---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-01
normative: spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied
rests-on: ["0006"]
---

# An in-cluster job applies each Project's rendered Vault policies, and the Release Gate reads its inputs from a rendered ConfigMap

The Vault policies and auth roles the `vault-policy` adapter renders are written
into Vault by the **Vault policy job**, one per Project that holds a Vault
document. Each is a Job in that Project's own Reconcile Unit and runs before any
of its Applications that hold a grant. It authenticates as the platform's
writer role, which Vault confines to that Project's own policy and role names. The job is derived from
what the Platform document states about it, runs in the Project's own
namespace, and is named by the digest of that Project's documents alone. The Release Gate reads each Application's
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
identity once its Project's job has run, a Project's job can write a policy
or role named for another Project, anything but that Project's job can
authenticate as its writer, or the Release Gate answers from anything
but the ConfigMap of the Application its webhook names. **Settled by:** render a
changed grant, let the job run, and diff `vault policy read` against the
document; have one Project's writer role try another Project's policy name and
observe Vault refuse it (a local Vault 2.1.1 refused another prefix for both
policies and roles on 2026-10-22, and wrote a role of the writer's own name
bound to another Project's policy, which is why the render is the boundary);
check that no other pod in the namespace runs as the job's ServiceAccount, and
that no Process there may create pods; then delete an Application's gate ConfigMap and observe
the gate answer no.

## Why

**Writing a policy is delivery, and delivery is in the cluster.** Chapter 55 left
open who writes the policies. Writing from CI would need a Vault credential
outside the cluster, the push path pull delivery rules out
([0050](0050-delivery-is-part-of-the-model.md)). A Job applied by Flux from the
same artifact writes exactly what the render holds. Inside the Project's own
unit, the job runs before the Applications that read the grants it writes, so
the ordering needs no unit of its own.

**The gate needs no lock reader.** The gate's inputs are derived in layer 2
([chapter 20](../../../spec/v1/20-resolved-deployment.md#the-release-gate)). Reading
them from the composition lock would make the gate fetch and verify artifacts
itself. A ConfigMap in the Application's namespace arrives with the Canaries it
describes, in the same signed render, so the gate never sees a Canary without
its inputs, and a missing ConfigMap is a gate that answers no.

**The job is derived, because its input is the render.** A Process declares
what it needs from the model: an image, a surface, a grant. This job needs its
Project's policy documents, which do not exist until the render does. So it is
derived, as a backup and a migration are, from facts the platform states: the
image alias, the Vault role, what it requests and how long it may take.
Declaring it as a Process would need a job lifecycle the render does not spell
and a way to hand it the render, in every Project that holds a grant.

**It is the Project's, because its documents are.** The documents are one per
identity and named by the Project's namespace, so the set partitions by
Project with nothing lost. A job per Project writes only what exists because
of that Project, so a change to one Project's grants moves only that Project's
artifact, and a failed job holds only that Project's unit. One job for every
Project held every Project with a grant whenever any one changed
([0116](0116-a-project-owns-every-object-it-delivers.md)).

**It runs in the Project's own namespace, with a writer confined to its own
names.** The Project's artifact then writes into no namespace another artifact
owns. Its ServiceAccount is bound to a writer role whose policy admits only
policy and role names under that Project's own prefix, through a path keyed on
the ServiceAccount's namespace. Vault confines a writer by the names it may
write, not by what a policy grants, so the writer can still grant its own
Project any path. The writer is therefore trusted exactly as far as the
render, as the one estate-wide writer was: only a render that composition
checked and signed reaches the cluster, only Flux creates pods in a Project's
namespace, and only the job's pod runs as its ServiceAccount. A Process that
could create pods in that namespace would hold the writer, which is why the
settling test checks it.

**A datastore the old path runs keeps one estate-scoped job, while it does.**
Its catalog's role is named for the datastore's namespace, and no Project the
estate path delivers owns that namespace, so no Project's job may write it.
One job in that namespace, in the estate-scoped artifact, writes that
catalog's documents alone, as the same writer role. No Project's unit waits on
it, and it goes when the datastore's Project leaves the old path
([0102](0102-the-database-catalog-is-applied-by-its-engines-method.md)).

**The name is a digest of what both implementations hold.** Both render the
same documents and must give the Job the same name, so the name is defined over
what both hold: the canonical JSON of one object, each of the Project's
documents under its file name, beside what the pod runs with
([chapter 30](../../../spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied)).
Neither hashes a file it wrote, and no other Project's document enters it.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The composition workflow writes the policies | no Job | a Vault credential in CI |
| One job for every Project, in the estate-scoped artifact | one Job, one privileged identity | every Project with a grant waits on it, and one Project's change or failure holds them all ([0116](0116-a-project-owns-every-object-it-delivers.md)) |
| A Vault configuration operator (vault-config-operator) reconciling a `Policy` and a `KubernetesAuthEngineRole` per Project | continuous reconcile, no Job | no narrower privilege than a confined writer, since nothing confines a policy's content, and an operator, its CRDs and its webhook certificate for documents that change at deploy time only |
| Declare the job as a `lifecycle: job` Process of each Project | no Platform block | a job lifecycle and a hand-over of the render, authored in every Project for what the platform can derive |
| Run each Project's job in the Secret Store's namespace | one namespace for every writer | each Project's artifact writes into a namespace another artifact owns, and its policy crosses namespaces |
| The gate reads the composition lock | one document | the gate fetches and verifies artifacts, a second reader of the lock |
| The gate's inputs as Canary annotations | no extra object | spreads one Application's inputs over every member |

## Reversibility

Undo cost today: one Job, one ConfigMap per gated Application, and the gate's
reader, a day.

## Consequences

- The Platform document's `policyJob.role` is that writer: a fixture created
  with the auth method, bound to the ServiceAccount `vault-policy` in every
  namespace, its policy templated on the ServiceAccount's namespace for policy
  and role names and for the KV prefix generated keys are written under, since
  a job cannot grant itself its own privilege. Rebinding the live role from
  the one estate-wide writer to this one is the maintainer's delivery, paid
  once for every Project.
- A changed grant reaches Vault on the next apply of its Project's own unit,
  before the Application that needs it starts, through a new Job named by
  that Project's documents' digest, paid in one Job run per change to that
  Project.
- Each Project that holds a Vault document carries one more Job and ConfigMap,
  paid in render size.
- Every gated Application carries one more ConfigMap, paid in render size.
