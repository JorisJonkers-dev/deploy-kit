---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/16-dependencies.md#no-role-grants-what-an-absence-already-denies
rests-on: ["0001"]
---

# v1 renders no workload RBAC, and refuses any Deliverable that grants it

## Rests on
No Workload in this estate needs the Kubernetes API to obtain the secrets or
configuration it declares, so the privilege a least-privilege Role would grant is
none. False if: a Workload's declared vocabulary — a grant, an asset, a probe —
requires an API call the pod itself must make. Settled by: rendering the estate
with no RBAC object and no Workload losing a capability it declared; the one
known API consumer, `agents-api`, appears as a ledger entry rather than as a
counter-example.

## Why
R3 records the shape of the problem exactly: three Services share `data-system`,
and the only thing stopping `platform-valkey`'s ServiceAccount from reading
`platform-postgres`'s Secret is that no Role grants it — an absence, not a
boundary. The instinct is to render RBAC so that the boundary is stated. That
instinct is wrong here, and the reason is what the delivery modes actually do.

Under `delivery: env` and `delivery: file`
([0026](0026-delivery-env-file-self.md)) the **kubelet** projects the Secret into
the pod. The pod makes no API call, so a Role granting `get` on that Secret
grants a capability nothing exercises. Under `delivery: self` the pod
authenticates to Vault, not to Kubernetes, and its privilege is the Vault policy
([0073](0073-vault-policy-is-a-deliverable.md)). Across all three modes, the
least-privilege Role for a Workload of this estate is the empty Role.

Rendering roughly sixty objects that grant nothing has three costs and no
benefit. An empty Role reads as an oversight, so the next person adds a rule to
"fix" it. A RoleBinding that exists is a place a future broad grant can be added
without adding an object, which is harder to notice in review than a new file.
And attribution would cover objects whose only content is the absence of
content.

The absence is worth keeping — it is worth **checking**. So the rule is stated
as a refusal rather than as an emission: no rendered Deliverable may grant a
Workload access to `secrets`, `E_WORKLOAD_RBAC_GRANT`, evaluated over the
composed union at composition time. Isolation then rests on a checked property
rather than on nobody having written a Role yet, which is the actual complaint
R3 makes.

At one maintainer ([0001](0001-estate-scale-and-ownership.md)) the invariant that
earns its keep is the one that catches the maintainer's own future mistake. This
is that shape: the mistake is not that valkey can read postgres' Secret today,
it is that a broad Role added in a hurry next year would be invisible.

`agents-api` is the honest exception. It creates and deletes Services at
runtime, so it genuinely calls the API, and the model has no vocabulary for
"this Workload needs the API for this verb on this resource". Inventing that
vocabulary as an adapter default would be guessing; it belongs in a Bidirectional
Ledger with an owner ([0055](0055-bidirectional-ledgers.md)) until a decision
gives it a declaring site.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Render an explicit least-privilege Role per Workload | A positive statement, so a future broad grant is a diff rather than an addition | About sixty objects that grant nothing, because the kubelet does the projecting; an empty Role invites a rule, and a standing RoleBinding is where a broad grant would hide |
| Defer workload RBAC beside deploy RBAC | One deferred boundary to remember | Deploy RBAC is about who applies; this is what a Service's own identity may do, which is model vocabulary — and deferring leaves the isolation claim resting on an unchecked absence |
| Give Workloads an `api:` declaration now, and render from it | Closes the `agents-api` case properly | Designing a Kubernetes-API vocabulary for one known consumer would be shaped entirely by that consumer, which is the mistake chapter 30 refuses for a neutral IR |

## Reversibility
Undo cost today: adding an `rbac` adapter later is adapter work of the usual
size, and the invariant is deleted in the same change. Becomes irreversible
once: never — nothing depends on the objects not existing, and the invariant is
a check rather than a shape other repositories pin.

## Consequences
- Chapter 30's largest counted gap — 16 RBAC objects — is not a gap: those
  objects will not be rendered, and the coverage ledger's RBAC entries close as
  decided rather than as done — paid in one edit to the arithmetic.
- A Workload that later needs the API cannot get it from an adapter default; it
  needs a ledger entry now and a declaring site eventually — paid by
  `agents-api`'s owner, visibly.
- The invariant must see rendered Deliverables, so it runs where the Fragment
  set is assembled rather than over Intent alone — paid by the composition run,
  in one more check over output.
- Nothing states the boundary inside the cluster, so an operator inspecting
  `data-system` still sees no Role and has to know that the absence is
  deliberate; the invariant is visible in the model, not in the namespace —
  paid by whoever inspects, and the reason chapter 16 says it in prose.
