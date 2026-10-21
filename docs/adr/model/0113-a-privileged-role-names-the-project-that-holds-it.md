---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-21
normative: spec/v1/14-platform-intent.md#privileged-roles
rests-on: ["0004"]
---

# A privileged role names the Project that holds it, as `<project>/<application>`, and an Application id alone binds no role

Every field of the Platform document that hands an Application a role no
project file can give itself names its holder as `<project>/<application>`.
The reference links only to the Application that Project declares, so another
project file that declares an Application of the same id gains nothing.

## Rests on

Who may hold a role is a value the platform arbitrates, because it draws on
something every Project shares: the cluster's API, every grant's Vault traffic,
every Canary's verdict, ingress to every routed or scraped Process
([0004](0004-contention-decides-authority.md)). A role a project file could
take by declaring a name would be arbitrated by whoever published first.

**False if:** a project file other than the named Project's declares an
Application under a role's id and that Application receives the role: its
Process admitted to the API, its surface asked by a Canary, or its address
handed out as the collector or the Secret Store.
**Settled by:** the negative fixture per role in `test/model/intent-set.test.ts`
and the matching linking test in `emf/`, each refusing the reference as
unlinked when the named Project does not declare the Application.

## Why

**An id is something any participant can declare.** Before this, a tier's
`traefik`, `delivery.machinery`, `delivery.gate`, `apiAccess.holders`,
`telemetry.collector`, `telemetry.metrics` and `secretStore` linked to
whichever Application carried the id
([#419](https://github.com/JorisJonkers-dev/deploy-kit/issues/419)). Two things
narrowed that and neither closed it. A second Application of a held id is
refused as a duplicate, but a role named before its Application exists, or one
whose Application is renamed or removed, is free for the first project file to
declare it. And composition reads only fragments the participants' own
repositories signed, which limits the claimant to the estate's participants,
not to the one the platform meant.

**The Reporter was already narrowed, one field at a time.** `delivery.reporter`
had to be declared in the project file that declares the Release Gate
([#418](https://github.com/JorisJonkers-dev/deploy-kit/issues/418)). That closed
it for one field and left the gate itself, and every other role, bound by id
alone. Naming the Project in the reference closes all eight the same way, and
the Reporter's rule becomes one comparison: its Project is the gate's.

**The reference states what the platform meant.** `delivery/release-gate` says
which Project the platform trusts with every Canary's verdict, in the one place
that grants it. Nothing about the trust lives in a second list a reader has to
join against.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The Platform document lists, once, the Projects that may declare any privileged Application | one list, but it grants every role to every listed Project | a listed Project could still take a role meant for another by declaring its id; the list narrows who may claim, not what each may claim |
| Keep bare ids and refuse a role whose Application is declared outside a fixed set of platform Projects | no change to authored documents | the fixed set is the list above, kept in code instead of the document |
| Keep bare ids and rely on duplicate-id refusal and signed fragments | nothing | leaves the gap: a role named ahead of its Application, or after a rename, is claimable |

## Reversibility

Moderate. Going back is a mechanical rewrite of the eight fields in every
Platform document, and the derived output does not change: every resolved and
rendered object still names the Application by its id alone.

## Consequences

- Every Platform document rewrites its eight fields as `<project>/<application>`,
  and the estate's moves with the toolkit release that introduces it.
- The unlinked codes keep their names; each now means "its Project declares no
  such Application", whatever another project file declares.
- The resolved and rendered trees are unchanged apart from the provenance
  digests of the Platform document.
