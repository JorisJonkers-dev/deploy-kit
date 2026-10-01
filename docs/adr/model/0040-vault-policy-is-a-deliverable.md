---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied
rests-on: ["0005"]
---

# The derived Vault policy and auth role are Deliverables of their own adapter

## Rests on
Every privilege a Process holds in the Secret Store is derivable from its
grants and their access tiers, and the resulting policy and auth role are
serialisable documents like any other Deliverable. False if: a policy the
estate needs cannot be expressed without a fact no pinned input carries: a
capability that depends on the store's live state. Settled by: rendering the
three worked projects and diffing the emitted policies against the policies live
in Vault today, with the differences explained by a gap row rather than by a
missing input.

## Why
[0029](0029-a-grant-is-a-union-on-engine.md) says four authored intents derive the
Vault policy, and nothing emits one. `vso` produces the operator's Kubernetes
objects (`VaultConnection`, `VaultAuth`, the operator `ServiceAccount` per
target namespace, `VaultStaticSecret`), and none of them
is a policy or a Kubernetes auth role. Under
[0005](0005-derivation-is-total.md) that is not a missing feature but a
falsified premise: a derivation whose output nothing carries is not total, and
the estate has been holding the derived half in its head.

It is reached from both delivery modes, so it is not an edge case:
`delivery: self` in `auth` needs the pod's own token to hold `read` on its
paths, and `delivery: env` in `data` needs the operator's identity to hold it
instead. Either way something must exist in Vault that the derivation describes.

The unit is the **Process identity**, not the Application.
[0031](0031-identity-per-process.md) makes the ServiceAccount and the Vault
role the Process name alone, and the estate has already paid for getting this
wrong: `serviceAccountName()` returned the Application name, so two Processes of one
Application authenticated as the same principal and received the union of both
policies whatever level a grant was written at. One document per identity is
what makes that impossible to reintroduce, and it makes a diff say which
principal's privilege changed.

The documents are JSON because Vault accepts JSON policy documents, HCL being a
superset, and because JSON lets the single serializer own key order, which is
what byte-determinism needs and what an adapter writing its own HCL could not
give.

**Rendered, not applied.** Writing a policy into Vault is an act against a live
system performed by a privileged identity. This decision produces attributed
documents and stops there; writing them into Vault is delivery's, done by an
in-cluster job ([0087](0087-in-cluster-consumers-read-the-render.md)). The
alternative (CRs for a Vault-configuration operator) would make the policy a
Kubernetes object at the price of an operator the substrate does not run, and
would put a v1 dependency on CRDs nobody has installed.

**The auth method is not in scope of the render.** Mounting `kubernetes` auth,
its JWT issuer and CA, and the KV mounts are estate-unique and draw on a shared
resource, so [0004](0004-contention-decides-authority.md) makes them
platform-assigned; since [0046](0046-the-foundation-is-declared.md) they are
Assets of the declared `vault` Application in the platform's secrets project, and
before it they arrived through a blueprint pack. Rendering them per Application
would also need a bootstrap answer for the mount that authenticates the renderer
itself.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Emit CRs for a Vault-configuration operator | Everything becomes a Kubernetes object and one applier covers it | Adds an operator and CRDs the substrate does not run, making them a v1 dependency for a document that only needs to be written once per identity |
| Register Vault policy as an unmanaged surface | Cheapest, and honest about who writes Vault config today | Leaves 0029 deriving a value nothing emits, so either it or 0005 has to be reopened; and an unmanaged surface is for what the model cannot see, not for output it declines to produce |
| Extend `vso` to emit policies | no registry change | One adapter would own two artifact kinds with different appliers, and a path collision inside one adapter is invisible to the per-adapter rule |
| Aggregate one document per Application | Fewer files; an Application's whole posture in one place | Buries the identity boundary 0031 draws, and a two-Process Application's diff stops saying which principal changed |
| HCL rather than JSON | The format every Vault example and the estate's live policies use | Key order and formatting become the adapter's problem, which is the thing one serializer exists to prevent |

## Reversibility
Undo cost today: one adapter, its registry entry and its documents: a deletion,
hours, before anything applies them. Becomes irreversible once: a policy this
adapter emits is the policy live in Vault, because the hand-written original is
then gone and reverting means reconstructing privilege from the store's own
state.

## Consequences
- The `vault-policy` adapter is one of the six registered adapters
  ([0037](0037-six-registered-adapters-satisfy-one-port.md)).
- The rendered tree now contains documents no Kubernetes applier can consume, so
  a reader must know that `…/policies` is Vault input, paid in one directory
  name, and the ledger entry that names its owner.
- A live policy and a rendered policy can disagree until delivery writes them,
  which is a drift class that exists only once something renders them, paid in a diff somebody has to look at, once per identity.
