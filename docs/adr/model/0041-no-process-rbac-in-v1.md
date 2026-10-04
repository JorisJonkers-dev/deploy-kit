---
tier: decision
status: accepted
claim: settled
date: 2026-09-07
normative: spec/v1/16-dependencies.md#no-role-grants-what-an-absence-already-denies
rests-on: ["0001"]
---

# v1 renders no RBAC for a Process that declares no API access, and refuses a declaration the platform did not admit

## Rests on
No Process in this estate needs the Kubernetes API to obtain the secrets or
configuration it declares, so the privilege a least-privilege Role would grant is
none. False if: a Process's declared vocabulary (a grant, an asset, a probe)
requires an API call the pod itself must make. Settled by: rendering the estate
with no RBAC object for any Process that declares no API access, and no such
Process losing a capability it declared. A Process whose own job is to call the
API is not a counter-example: it declares that access
([0092](0092-api-access-is-declared-on-the-process-and-admitted-by-the-platform.md)),
and the premise is about what a grant, an asset or a probe needs.

## Why
R3 records the shape of the problem exactly: three Applications share `data-system`,
and the only thing stopping `platform-valkey`'s ServiceAccount from reading
`platform-postgres`'s Secret is that no Role grants it, an absence, not a
boundary. The instinct is to render RBAC so that the boundary is stated. That
instinct is wrong here, and the reason is what the delivery modes actually do.

Under `delivery: env` and `delivery: file`
([0030](0030-secret-delivery-is-env-file-or-self.md)) the **kubelet** projects the Secret into
the pod. The pod makes no API call, so a Role granting `get` on that Secret
grants a capability nothing exercises. Under `delivery: self` the pod
authenticates to Vault, not to Kubernetes, and its privilege is the Vault policy
([0040](0040-vault-policy-is-a-deliverable.md)). Across all three modes, the
least-privilege Role for a Process of this estate is the empty Role.

Rendering roughly sixty objects that grant nothing has three costs and no
benefit. An empty Role reads as an oversight, so the next person adds a rule to
"fix" it. A RoleBinding that exists is a place a future broad grant can be added
without adding an object, which is harder to notice in review than a new file.
And attribution would cover objects whose only content is the absence of
content.

The absence is worth keeping: it is worth **checking**. So the rule is stated
as a refusal rather than as an emission: no Process holds Kubernetes API access
the Platform document did not admit, `E_PROCESS_RBAC_GRANT`, checked where the
project files are read beside the Platform document and held over the composed
union. Isolation then rests on a checked property rather than on nobody having
written a Role yet, which is the actual complaint R3 makes.

At one maintainer ([0001](0001-estate-scale-and-ownership.md)) the invariant that
earns its keep is the one that catches the maintainer's own future mistake. This
is that shape: the mistake is not that valkey can read postgres' Secret today,
it is that a broad Role added in a hurry next year would be invisible.

A Process whose job is to call the API is the case this rule refuses to guess
at, and the model does not guess: such a Process declares what it asks, and the
platform admits it by name
([0092](0092-api-access-is-declared-on-the-process-and-admitted-by-the-platform.md)).
That is the only RBAC the render emits. For every other Process the answer
stays the absence, and the refusal is what holds it: a declaration nobody with
authority over the cluster admitted is not rendered as a smaller grant, it is
refused.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Render an explicit least-privilege Role per Process | A positive statement, so a future broad grant is a diff rather than an addition | About sixty objects that grant nothing, because the kubelet does the projecting; an empty Role invites a rule, and a standing RoleBinding is where a broad grant would hide |
| Defer process RBAC beside deploy RBAC | One deferred boundary to remember | Deploy RBAC is about who applies; this is what an Application's own identity may do, which is model vocabulary, and deferring leaves the isolation claim resting on an unchecked absence |
| Let any Process declare the access it wants, and render it | One rule, no list of holders | A project would grant itself access to a cluster every project shares; who may hold any is the platform's to say, which is what admission is ([0092](0092-api-access-is-declared-on-the-process-and-admitted-by-the-platform.md)) |

## Reversibility
Undo cost today: rendering a Role for every Process later is adapter work of
the usual size, and the invariant is deleted in the same change. Becomes irreversible
once: never. Nothing depends on the objects not existing, and the invariant is
a check rather than a shape other repositories pin.

## Consequences
- Chapter 30's largest counted gap (16 RBAC objects) is not a gap: those
  objects will not be rendered, and the coverage ledger's RBAC entries close as
  decided rather than as done, paid in one edit to the arithmetic.
- A Process that needs the API cannot get it from an adapter default: it
  declares it, and its Application is admitted, paid by its owner and by the
  platform, visibly, in two diffs.
- The invariant must see rendered Deliverables, so it runs where the Deliverable
  set is assembled rather than over Intent alone, paid by the composition run,
  in one more check over output.
- Nothing states the boundary inside the cluster, so an operator inspecting
  `data-system` still sees no Role and has to know that the absence is
  deliberate; the invariant is visible in the model, not in the namespace,
  paid by whoever inspects, and the reason chapter 16 says it in prose.
