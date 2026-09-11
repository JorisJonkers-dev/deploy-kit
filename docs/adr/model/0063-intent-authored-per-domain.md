---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/40-composition.md#fragments
rests-on: ["0001"]
---

# Intent is authored one file per domain

One file per domain, holding many Services, and one file is one Intent
Fragment. A repository may hold several domain files; a domain never spans
repositories. `owner` is the only field raised to the domain header, and
namespace derives from `domain` as `<domain>-system`.

## Rests on

The domain is the right authoring unit because it already is the deployment
unit: every live Service runs in the namespace named after its domain. False
if: a live Service namespace does not match its domain, one Service running
anywhere but `<domain>-system` breaks the derivation and forces the alias field
back. Settled by: `kubectl get ns -o name | grep -- '-system$'` compared
against the domain header of every Service document. Ten namespaces come back (
auth-system, data-system, knowledge-system, app-system, agents-system,
mail-system, media-system, notes-system, automation-system, utility-system),
and every one equals `<domain>-system` today.

## Why

Chapter 20's authority table derives `namespace` "from `id`, or from a declared
`aliases.namespace` with a reason". That rule is wrong about this estate.
Namespaces here have never been per Service; they have always been per domain.
`home-portal` needed an alias only because the rule pointed at the wrong field:
the repository and the product are `home-portal`, so the id rule derives
`home-portal-system`, a namespace that does not exist and never has. The
Service runs in `app-system`, and its domain is `app`. Deriving from `domain`
yields `app-system` directly. Ten of ten live namespaces come out unchanged and
not one live object moves.

`aliases` is deleted here. It covered three divergences and now expresses none:
namespace comes from `domain`, and the Workload name and the image are fields
the author already writes explicitly ([0010](0010-flat-service-identity.md)).
Nothing remains for it to say. The prohibition on aliasing a Service into
another deployer's namespace
([0047](../deferred/0047-namespace-per-deployer.md)) loses its subject matter with
it: no field can move a Service out of its domain's namespace.

A namespace now holds several Services **by construction**. It is therefore not
a trust boundary. Chapter 20 already said so ("two Services may share one, so
a namespace is not a trust boundary") as a footnote to an exception. It is now
the normal case for every namespace in the estate, and it must be said loudly:
no isolation claim may rest on a namespace wall. Isolation is the derived
default-deny edge set ([0035](0035-network-policy-default-deny.md)), evaluated
per pod, plus per-Workload identity ([0024](0024-identity-per-workload.md)).

Chapter 40 makes the unit of publication a repository declaring which domains
it contributes to ([0037](0037-composition-oci-fragments.md)). That list
collapses to one: a domain file is a fragment, so a fragment contributes to
exactly one domain, and `homelab-collections` publishes one fragment per domain
file rather than one fragment naming several. Because a domain never spans
repositories, composition unions fragments and never has to union a domain.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One repository = one domain = one file | Splits `homelab-collections`, which holds three Services, into three repositories with three publish workflows and three sets of credentials | Buys nothing: chapter 40 already records that composition behaves identically split or not, so the split is a convenience, not a prerequisite |
| A domain spanning repositories, unioned by name | A domain's membership is knowable only after composition; no single file states who is in it | The cross-repository coupling problem wearing a hat, the same "members agreeing on a name is the mechanism" that deleted `releaseUnit` ([0062](0062-service-is-the-release-unit.md)) |
| Raise `alertClass` and `secrets` to the domain header alongside `owner` | A domain pages as loudly as its loudest member, and one grant hands every Service in the file a reader slot on the whole path ([0009](0009-vault-read-is-per-path.md)) | Both are per-Service facts; raising them widens blast radius to buy three saved lines |

## Reversibility

Undo cost today: splitting ten domain files back into per-Service documents and
restoring `aliases` to the schema and to chapter 20's authority table, hours,
against ten files and no composed artifact yet published against a domain
header. Becomes irreversible once: fragments publish domain-scoped and
consumers pin them by digest, and Vault roles and ServiceAccounts are named for
the Workload under the domain namespace, reverting then renames every identity
in the estate.

## Consequences

- The Service id is the repository/product name and Workload names are whatever
  the processes are actually called: Service `home-portal` holding Workload
  `app-ui` with image `app-ui` is the name, not a divergence, paid by authors,
  who lose the alias field that used to record the difference as data.
- ServiceAccount and Vault role become the Workload name alone, unique within
  the domain (`auth-system.auth-api`, not `auth-system.auth-auth-api`), paid
  by the estate owner, who re-creates the roles once when chapter 20's
  `<service>-<workload>` rule is retired.
- A process name is used once per domain, not once per Service: two Services in
  one file cannot both call a Workload `api`, paid by the domain's authors.
- Every namespace holds several Services, so no isolation review may cite a
  namespace wall, paid by whoever reviews isolation, who reads the edge set
  instead.
- A domain file grows with its domain: one review surface, one merge point, and
  one `owner` for every Service in it; a Service needing a different owner needs
  its own domain, paid by the domain's authors.
