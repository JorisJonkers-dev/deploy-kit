---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/40-composition.md#fragments
rests-on: ["0001"]
---

# Intent is authored one file per project

> **Amended 2026-09-14.** Vocabulary renamed by
> [0116](0116-project-application-process.md): Domain is now Project,
> Service is Application, Workload is Process, and Service Intent is Project
> Intent. The decision is unchanged.

> **Amended 2026-09-21.** `owner` is no longer the only field the project header
> carries: [0124](0124-shared-intent-descends-to-the-process.md) raises the eight
> Shared Intent families to it, on terms it records, and the `alertClass` half of
> the Alternatives row below still holds. Intent is still authored one file per
> project, which is what this record decides.

One file per project, holding many Applications, and one file is one Intent
Fragment. A repository may hold several project files; a project never spans
repositories. `owner` is the field this record raises to the project header, and
namespace derives from `project` as `<project>-system`.

## Rests on

The project is the right authoring unit because it already is the deployment
unit: every live Application runs in the namespace named after its project. False
if: a live Application namespace does not match its project, one Application running
anywhere but `<project>-system` breaks the derivation and forces the alias field
back. Settled by: `kubectl get ns -o name | grep -- '-system$'` compared
against the project header of every Application document. Ten namespaces come back (
auth-system, data-system, knowledge-system, app-system, agents-system,
mail-system, media-system, notes-system, automation-system, utility-system),
and every one equals `<project>-system` today.

## Why

Chapter 20's authority table derives `namespace` "from `id`, or from a declared
`aliases.namespace` with a reason". That rule is wrong about this estate.
Namespaces here have never been per Application; they have always been per project.
`home-portal` needed an alias only because the rule pointed at the wrong field:
the repository and the product are `home-portal`, so the id rule derives
`home-portal-system`, a namespace that does not exist and never has. The
Application runs in `app-system`, and its project is `app`. Deriving from `project`
yields `app-system` directly. Ten of ten live namespaces come out unchanged and
not one live object moves.

`aliases` is deleted here. It covered three divergences and now expresses none:
namespace comes from `project`, and the Process name and the image are fields
the author already writes explicitly ([0010](0010-flat-application-identity.md)).
Nothing remains for it to say. The prohibition on aliasing an Application into
another deployer's namespace
([0047](../deferred/0047-namespace-per-deployer.md)) loses its subject matter with
it: no field can move an Application out of its project's namespace.

A namespace now holds several Applications **by construction**. It is therefore not
a trust boundary. Chapter 20 already said so ("two Applications may share one, so
a namespace is not a trust boundary") as a footnote to an exception. It is now
the normal case for every namespace in the estate, and it must be said loudly:
no isolation claim may rest on a namespace wall. Isolation is the derived
default-deny edge set ([0035](0035-network-policy-default-deny.md)), evaluated
per pod, plus per-Process identity ([0024](0024-identity-per-process.md)).

Chapter 40 makes the unit of publication a repository declaring which projects
it contributes to ([0037](0037-composition-oci-fragments.md)). That list
collapses to one: a project file is a fragment, so a fragment contributes to
exactly one project, and `homelab-collections` publishes one fragment per project
file rather than one fragment naming several. Because a project never spans
repositories, composition unions fragments and never has to union a project.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One repository = one project = one file | Splits `homelab-collections`, which holds three Applications, into three repositories with three publish workflows and three sets of credentials | Buys nothing: chapter 40 already records that composition behaves identically split or not, so the split is a convenience, not a prerequisite |
| A project spanning repositories, unioned by name | A project's membership is knowable only after composition; no single file states who is in it | The cross-repository coupling problem wearing a hat, the same "members agreeing on a name is the mechanism" that deleted `releaseUnit` ([0062](0062-application-is-the-release-unit.md)) |
| Raise `alertClass` and `secrets` to the project header alongside `owner` | A project pages as loudly as its loudest member, and one grant hands every Application in the file a reader slot on the whole path ([0009](0009-vault-read-is-per-path.md)) | Both are per-Application facts; raising them widens blast radius to buy three saved lines |

## Reversibility

Undo cost today: splitting ten project files back into per-Application documents and
restoring `aliases` to the schema and to chapter 20's authority table, hours,
against ten files and no composed artifact yet published against a project
header. Becomes irreversible once: fragments publish project-scoped and
consumers pin them by digest, and Vault roles and ServiceAccounts are named for
the Process under the project namespace, reverting then renames every identity
in the estate.

## Consequences

- The Application id is the repository/product name and Process names are whatever
  the processes are actually called: Application `home-portal` holding Process
  `app-ui` with image `app-ui` is the name, not a divergence, paid by authors,
  who lose the alias field that used to record the difference as data.
- ServiceAccount and Vault role become the Process name alone, unique within
  the project (`auth-system.auth-api`, not `auth-system.auth-auth-api`), paid
  by the estate owner, who re-creates the roles once when chapter 20's
  `<application>-<process>` rule is retired.
- A process name is used once per project, not once per Application: two Applications in
  one file cannot both call a Process `api`, paid by the project's authors.
- Every namespace holds several Applications, so no isolation review may cite a
  namespace wall, paid by whoever reviews isolation, who reads the edge set
  instead.
- A project file grows with its project: one review surface, one merge point, and
  one `owner` for every Application in it; an Application needing a different owner needs
  its own project, paid by the project's authors.
