---
tier: decision
status: accepted
claim: settled
date: 2026-10-04
normative: spec/v1/16-dependencies.md#kubernetes-api-access-is-declared-and-admitted
rests-on: ["0001", "0004"]
---

# A Process declares the Kubernetes API access it needs, and the Platform document admits who may hold any

A Process that calls the Kubernetes API declares what it asks of it, as rules
with a reason, in its own project file. The Platform document names the
Applications whose Processes may declare any, and where the API answers. An
admitted declaration derives a ClusterRole of the declared rules, its binding to
the Process's one ServiceAccount, a mounted token, and egress to the API by
address. A declaration in an Application the platform does not name is refused.

## Rests on

One maintainer owns the estate and reads every diff
([0001](0001-estate-scale-and-ownership.md)), so a grant written down with a
reason is a grant that is reviewed. And a value is declared by whoever contends
for the resource it names
([0004](0004-contention-decides-authority.md)): what a ServiceAccount may do to
the cluster is contended for by every project on it, so who may hold any is the
platform's to say, while what a given controller asks is known only to the
repository that builds it.

**False if:** a holder needs a rule its declaration cannot express, or an
admitted holder's rules change so often that reviewing them in a fragment is
noise. **Settled by:** the worked `delivery` project, whose three holders
(Flagger, the Release Gate, the Collector) each render the grant their code
runs under, with no rule added by hand.

## Why

**The delivery machinery cannot do its work without it.** Flagger scales
Deployments and generates Services, the Release Gate reads Canaries, Jobs and
pods to answer Flagger, and the Collector lists PersistentVolumes. The model
rendered no RBAC and mounted no token
([0041](0041-no-process-rbac-in-v1.md),
[0031](0031-identity-per-process.md)), so the estate's own delivery path could
not be rendered by the model that describes it. A grant applied by hand beside
a rendered estate is the unrendered state the model exists to end.

**The rules live where the code that needs them lives.** A fixed table in this
repository, one row per machinery role, would be the smallest vocabulary. It
would also mean that a new verb in the `delivery` repository, a Job the gate
must unsuspend or a kind a Flagger upgrade starts reading, needs a change to
`spec/v1` and a toolkit release in two implementations before the code that
uses it can ship. The declaration puts the grant in the fragment of the
repository whose code runs under it, where a new rule is a diff beside the
change that needs it.

**Admission is the platform's, by name.** [0041](0041-no-process-rbac-in-v1.md)
refused an `api` vocabulary because any Process could then write itself a
grant. Admission answers that: the platform lists the Applications that may
hold access, and every other declaration is `E_PROCESS_RBAC_GRANT`. The list is
not the delivery machinery's. Machinery is what performs a switch and is
therefore never gated; the Collector switches nothing and still reads the
cluster, and an edge proxy is machinery that holds no access.

**The rules are rendered as declared.** The model does not narrow a rule or
refuse a resource. A rule on `secrets` is legal for an admitted holder: Flagger
reads the Secret a pod names to learn that it is excluded from configuration
tracking. What bounds a grant is that it is written, with a reason, and that
the platform named its holder.

**The fields are the model's words.** A rule is a `group`, its `objects` and
`verbs`. `objects` is what Kubernetes RBAC spells `resources`, a name the model
keeps out of both layers ([0011](0011-authored-values-name-model-concepts.md)),
and `core` names the group Kubernetes leaves unnamed, so no document writes an
empty string.

**The policy admits an address.** The API server is no pod a selector reaches,
so a holder's egress policy needs ranges, as an off-cluster backup copy does
([0091](0091-a-backup-identity-has-a-policy-of-its-own.md)). The Platform
document states them beside the list of holders, so admitting a holder and
saying where the API is are one block.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A fixed table in the specification, derived per machinery role | no authored vocabulary at all | every new verb is a specification change and a release in both implementations, and the Collector is no machinery role |
| Keep the grants applied by hand, recorded in a ledger | no model change | the delivery path is the one part of the estate the render would not cover, and Flagger's grant would have no home |
| Any Process may declare `api`, with no admission | one block fewer in the Platform document | a project grants itself access to a cluster it shares, which is what [0041](0041-no-process-rbac-in-v1.md) exists to refuse |
| Admit by `delivery.machinery` | no new list | the Collector would have to be called machinery, and an edge proxy would be admitted for nothing |
| A `Role` per Project namespace instead of a `ClusterRole` | no cluster-wide grant | every holder reads across namespaces, PersistentVolumes have none, and a Role per namespace per holder is the object count 0041 refused |
| Refuse rules on `secrets` | keeps one resource out of reach | Flagger's configuration tracking reads the Secrets a pod names, so the machinery would not run |

## Reversibility

Undo cost today: one block in each document, one derivation and one object
file per holder: a day, in both implementations. Becomes expensive once: a
tenant Application is admitted, because its fragment then carries rules the
platform would have to take back.

## Consequences

- The `delivery` project file carries its three holders' rules, and the grant
  files the `delivery` repository applied by hand are deleted when it is
  delivered by the estate path.
- `ClusterRole` and `ClusterRoleBinding` leave the forbidden list for exactly
  the objects a held `api` derives; `Role` and `RoleBinding` stay unrendered.
- Admission is by id, and an id is unique only by check. Where two
  Applications carry an admitted id, neither is admitted: the grant is refused
  rather than given to whichever project chose the name second.
- A cluster-scoped name is `<namespace>-<identity>`, the name the identity's
  Vault role carries. Nothing but the Project's name keeps two of them apart,
  so the rule that constrains a Project's name constrains these too.
- `agents-api` has a declaring site: its Application is admitted and its
  Process declares its rules, when its Project is handed over.
- The egress rule is rendered and, like every policy, applied by nothing until
  the policy stage is enforced
  ([0035](0035-network-policy-is-default-deny-and-render-only.md)).
