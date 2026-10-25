---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-23
normative: spec/v1/14-platform-intent.md#human-grants
rests-on: ["0004"]
---

# A human grant is declared in the Platform document: a group, a built-in cluster role and a reason, rendered estate-scoped

Access for people is declared once, by the platform, as a **Human Grant**: a
group, one of Kubernetes' four built-in cluster roles (`cluster-admin`,
`admin`, `edit`, `view`), and a reason. Each renders one cluster-wide
`ClusterRoleBinding` of that role to that group, in the estate-scoped
artifact. The subject is a group and never a user, and nothing scoped or
authored is offered. Settled in
[Decide how the model meets human access grants and Grafana content](https://github.com/JorisJonkers-dev/deploy-kit/issues/357)
(decision 1).

## Rests on

Contention decides authority ([0004](0004-contention-decides-authority.md)).
Who may administer the cluster is contended by every Project at once, so it is
the platform's to declare, and no Project's.

**False if:** a Project could state who administers the cluster without every
other Project being affected by it. **Settled by:** a render test, where the
Platform document gains a grant and every Project's render carries the same
estate-scoped ClusterRoleBinding, and no Project document can declare one.

## Why

**The grant is to people, not to an Application.** The one live grant binds
`cluster-admin` to the group `oidc:k8s-admin`, and it sits beside headlamp.
kubectl over OIDC uses the same binding, so removing headlamp would drop the
platform owner's kubectl access. Declared on the platform, the grant outlives
every Application.

**A group, as the API server sees it.** The identity provider decides who is
in the group, and the control plane's OIDC prefix is a bootstrap fact. The
model writes the group exactly as the API server sees it, so it neither
restates the prefix nor binds a user whose membership nobody reviews.

**Four built-in roles, cluster-wide.** Nothing live needs a scoped grant or
authored rules. API access for a Process stays declared on the Process and
admitted by the platform
([0092](0092-api-access-is-declared-on-the-process-and-admitted-by-the-platform.md)).
A closed vocabulary keeps the grant reviewable at a glance.

**Estate-scoped, because no Project owns it.** A Project owns every object
that exists because of it
([0116](0116-a-project-owns-every-object-it-delivers.md)). A grant exists
because of the Platform document alone, so it belongs to no Project's share.
It is rendered into the estate-scoped artifact, applied by a unit of its own
that follows nothing, since a built-in role is already there.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the binding on headlamp's Application | none; it is live | removing headlamp drops kubectl access, and a grant to people hangs off a tool |
| Bind users, or users and groups | one more subject kind | membership moves out of the identity provider into the model, unreviewed |
| Authored rules or namespaced grants | a role vocabulary of our own | nothing live needs either, and a grant is no longer readable at a glance |
| Render the bindings into a Platform Project's share | no estate-scoped unit | no Project declares the grant, so the choice of Project would be arbitrary and a move of it would drop access |

## Reversibility

Cheap. The field is optional, and removing it removes the bindings at the next
render, through the unit's pruning.

## Consequences

- The Platform document gains `humanGrants`, and a group granted one role
  twice is refused.
- The estate-scoped artifact holds the bindings in every composition, applied
  by the `estate-human-grants` unit.
- `ClusterRoleBinding` is rendered for a Human Grant as well as for a held
  `api`.
- headlamp's own binding can be deleted once the estate path applies this one.
