---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-21
normative: spec/v1/20-resolved-deployment.md#the-reconcile-unit
rests-on: ["0006"]
---

# A Project owns every object it delivers, depends on another only by name, and only the Stable Addresses stay estate-scoped

Every object that exists because of one Project is rendered into that
Project's share, published in its artifact and applied by its own unit: its
Vault policies and auth roles, its generated keys, its routes, its rollout
events, the catalog of a datastore it runs, and a provider's network policy,
which admits its consumers by selector rather than by name.

A **Platform Project** holds an Application that the Platform document names
for a platform role: a tier's proxy, the Secret Store, the telemetry collector
and the metrics stack, the delivery machinery, the Release Gate and the
Reporter ([chapter 14](../../../spec/v1/14-platform-intent.md#privileged-roles)).
Holding Kubernetes API access alone does not make a Platform Project, because
an Application Project may be admitted to it too. It is
authored, published and resolved like any Project. What sets it apart is that
other Projects reach it through that role, not through an edge they write.
Every other Project is an **Application Project**. Application Projects may
depend on each other, a UI on an API or one API on another, always by name.

A Project depends on another only by name: an Application Id and a Surface,
reached through the Stable Address. So a Project released on its own neither
breaks nor re-renders another. A provider that drops a Surface a consumer still
names is refused at composition with `E_UNKNOWN_SURFACE`, not delivered broken.

The Stable Addresses alone stay estate-scoped, because each must outlive its
provider's move between Projects
([chapter 20](../../../spec/v1/20-resolved-deployment.md#the-reconcile-unit),
[chapter 55](../../../spec/v1/55-delivery.md#rendered-artifacts-and-pins)).

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)). A Project's share is then a function of the
inputs it reads. If those are its own fragment, the platform's facts and the
names it asked for, a change elsewhere that keeps those names cannot reach it.

**False if:** a composition that changes one Project's fragment, and no
platform fact or value another Project pulls from it, moves another Project's
pin, records a Rollout for it, or leaves its unit unable to reconcile while a
unit it does not own is not Ready. **Settled by:** a two-Project composition
test in each implementation. Change one Project's grant, route, edge and
Surfaces in turn, keeping the names the other reads, and assert the other
Project's artifact, pin and units do not move. Each slice below adds its case.

## Why

**The property was already the intent, and the estate-wide share breaks it.**
One artifact per Project exists so that "an unrelated publish deploys nothing"
([0051](0051-a-project-is-delivered-as-a-signed-artifact.md)), and chapter 55
says another Project's fragment never redeploys this one. That holds only where
a Project's share depends on its own fragment. The estate-wide share puts
objects that exist because of one Project into a unit every Project waits on.
One policy Job holds every Project that has a grant. Its name alone needed four
fixes
([#454](https://github.com/JorisJonkers-dev/deploy-kit/issues/454),
[#461](https://github.com/JorisJonkers-dev/deploy-kit/issues/461),
[#472](https://github.com/JorisJonkers-dev/deploy-kit/issues/472),
[#529](https://github.com/JorisJonkers-dev/deploy-kit/issues/529)), and
#472 left seven Projects not ready at once. A datastore's catalog in the same
unit deadlocked the estate on one Project's namespace
([#482](https://github.com/JorisJonkers-dev/deploy-kit/issues/482)). Each
edge tier's unit follows every Project with a route on it, so one Project that
is not Ready holds every other Project's route change on that tier. The
coupling inventory behind this record is in
[the research note](https://github.com/JorisJonkers-dev/deploy-kit/pull/554).

**The reasons for the share were assumptions, not constraints.** The policy
Job took the whole render because it was taken to need every Project's policy
documents at once, a premise this change rewrites in
[0087](0087-in-cluster-consumers-read-the-render.md). The documents are
already one per identity and named by namespace, so they partition by Project
with nothing lost. A tier had one unit so that a refused route holds one tier
([0033](0033-reconcile-unit-derived.md)). A unit per Project isolates more
finely, so the same reason favours the move. The rollout events depend on no
Project, but one cluster-wide `Alert` still makes every Project's reporting one
object's concern.

**A Platform Project owns what is shared, and a Project references it.** The
surveyed multi-tenant tools agree on one split. The platform owns what is
shared and changes rarely: controllers, the proxy and its tiers, the auth
mount. A tenant owns the namespaced objects that exist because of it, and
names the shared ones by reference. Admitting a tenant is a selector, not a
list that grows. Ordering is a dependency on the platform's unit, never a
platform unit that waits on every tenant. The privileged roles already say
which Applications are the platform's
([0113](0113-a-privileged-role-names-the-project-that-holds-it.md)), so the
term is derived from the Platform document and nothing new is authored.

**A name is the only contract between two Projects.** A consumer's edge names
an Application Id and a Surface, never an address. The route, the alias, the
Stable Address and the network policy are derived from those names on each
side. A provider that keeps its names can change anything else, and no
consumer's share moves. The one exception is deliberate. A value a consumer
pulls from its provider, a `${dependency:<app>.port}` or an exposure's host, is
the consumer's own input, so changing it re-renders that consumer, as it
should. A provider that drops a name a consumer still uses cannot be delivered
without breaking it, so composition refuses it, with the code a dangling edge
already carries. The refusal blames the provider that changed, so the provider
alone is held at its previous fragment and every other Project still composes
([#559](https://github.com/JorisJonkers-dev/deploy-kit/issues/559)).

**One provider-side list stays, owned by the provider.** A shared datastore's
catalog names every Project that reaches it. That is authorisation on the
provider's side, the one case where the list is the point. It moves into the
datastore's own Project's unit. A new consumer then re-renders that one
provider, and a failed catalog holds only that datastore's consumers.

**A Stable Address cannot be any Project's.** It must outlive its provider's
move between Projects, which is the change it exists for
([0093](0093-a-provider-is-reached-through-its-stable-address.md)). It stays
estate-scoped. The rollback backups were the other estate-scoped object. They
go because a Rollback relies on the scheduled backups instead
([#557](https://github.com/JorisJonkers-dev/deploy-kit/issues/557)).

**The models do not change.** Project Intent, Platform Intent and the
Resolved Deployment stay as they are. What changes is where layer 2 plans a
path and which unit applies it. Nothing is authored that can be derived.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the estate-wide share: one policy Job, edge units per tier, one rollout `Alert`, catalogs in the secrets unit | none; it is built | one Project's grant, route or datastore holds or re-renders Projects that did not change, the coupling this record removes |
| A Vault configuration operator (vault-config-operator) writing each Project's `Policy` and `KubernetesAuthEngineRole` from its own artifact | an operator, its CRDs and its webhook certificate as a platform dependency | no narrower privilege than a per-Project Job, since nothing confines a policy's content, and one more dependency for documents written once per change |
| Move only the objects that fail today (the policy Job and the catalog), and keep routes and rollout events estate-wide | smaller change | the model-driven implementation still needs an estate pass to place the rest, and a tier's unit still waits on every routed Project |
| Put every estate-scoped object into one Platform Project's share instead of `_estate` | no estate-scoped artifact | that Project's content then depends on every other Project's fragment, so it re-renders on each of their changes |
| Mark Platform Projects with an authored field | an explicit list | a second source for what the privileged roles already state, which can disagree with them |
| Let a consumer name its provider's address, as a fallback for a dropped Surface | a consumer keeps working against a stale address | the provider no longer owns what it serves, and a broken consumer is delivered instead of refused |
| Flux multi-tenancy first: Kustomizations in Project namespaces, impersonating a per-Project account | the boundary enforced rather than conventional | moves every pin source and every Namespace object; a separate, later change that this one does not need |

## Reversibility

Moderate. Each object moves in its own slice, and each slice can be reverted
alone: a path in the path plan, a unit's `dependsOn`, and the oracle files.
Reverting all of them restores the estate-wide share and the third pass of the
model-driven implementation. The two terms cost nothing to drop.

## Consequences

- The policy Job becomes one per Project, in that Project's unit, named by the
  digest of that Project's documents
  ([#548](https://github.com/JorisJonkers-dev/deploy-kit/issues/548)), and it
  writes the Project's generated keys
  ([#556](https://github.com/JorisJonkers-dev/deploy-kit/issues/556)). No
  Project's unit depends on `estate-vso-secrets`; a Project's unit follows the
  unit of the Platform Project that declares the Secret Store instead, and
  [0101](0101-a-generated-key-is-written-by-the-vault-policy-job.md)'s keys
  are each Project's own job's to write.
- A datastore's catalog is applied by its own Project's unit, with the
  datastore, and stays estate-scoped only while that Project is on the old path
  ([0102](0102-the-database-catalog-is-applied-by-its-engines-method.md),
  [#482](https://github.com/JorisJonkers-dev/deploy-kit/issues/482)).
- A Project's routes are planned under `apps/<project>/` and applied from its
  own unit, which follows the edge Project's unit
  ([#546](https://github.com/JorisJonkers-dev/deploy-kit/issues/546)).
- Each Project carries its own rollout `Alert` and the `Provider` it sends
  through ([#545](https://github.com/JorisJonkers-dev/deploy-kit/issues/545)).
- A provider's network policy admits its consumers by a label they carry, so a
  new consumer re-renders only itself
  ([#552](https://github.com/JorisJonkers-dev/deploy-kit/issues/552)).
- No platform Application's Assets list another Project's routes or health
  checks ([#553](https://github.com/JorisJonkers-dev/deploy-kit/issues/553)).
- A provider that drops a Surface an unchanged consumer still names is the
  Project isolated, rather than the whole composition run failing
  ([#559](https://github.com/JorisJonkers-dev/deploy-kit/issues/559)).
- A Rollback takes no backup of its own, so `estate-rollback-backups` goes
  ([#557](https://github.com/JorisJonkers-dev/deploy-kit/issues/557)).
- The model-driven implementation loses its third transformation: what the
  estate pass produced, the resolution produces in the owning Project's
  Resolved Deployment
  ([#547](https://github.com/JorisJonkers-dev/deploy-kit/issues/547)).
- Each moved object costs one change in both implementations and in the
  oracle files, paid once per slice.
