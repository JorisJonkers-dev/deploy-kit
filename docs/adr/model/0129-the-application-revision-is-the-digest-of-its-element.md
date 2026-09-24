---
tier: decision
status: proposed
claim: settled
date: 2026-09-24
normative: spec/v1/20-resolved-deployment.md#the-application-revision
rests-on: ["0006"]
---

# An Application's revision is the digest of its own element of the Resolved Deployment, and nothing else

Delivery needs to name one release of one Application: the migration Job that
belongs to it, the tag a database carries after its migration, the Canary
annotation the Release Gate reads, and the pair a held release is reported as.
The name is the **Application revision**, derived as the digest of the
Application's element of the Resolved Deployment with the revision itself left
out, as
[chapter 20](../../../spec/v1/20-resolved-deployment.md#the-application-revision)
specifies.

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)), so an Application's element is too, and a
digest of it is as reproducible as the render: identical inputs give an
identical revision, on any machine.

**False if:** re-resolving an unchanged Application yields a different revision,
or a change to any decision about it leaves the revision where it was.
**Settled by:** both implementations compute the revision of a committed
projection and match the value it records, and a test in each shows that
changing any field moves it while changing only the provenance does not.

## Why

**Per Application, not per estate.** The estate already has two digests, the
lock and the `renderHash`, and both move when any input of the estate moves. A
database tagged with the `renderHash` would be retagged by every unrelated
release, and an undo to "the serving tag" could not be computed from what an
Application serves. The revision moves exactly when the Application does.

**The element, not the published projection.** The projection published back to
a repository is the element plus a provenance and a document header
([0033](0033-assignments-published-back.md)). Covering those would make the
revision move with every render of anything, which is the property being
avoided, and would make the estate-wide and published forms disagree about the
same release.

**A digest, not a counter.** A counter needs a record of the last value, which
is state outside the pinned inputs. A digest needs nothing but the element.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Use the `renderHash` | no new term | moves with every input of the estate, so a database tag churns on unrelated releases |
| Use the Process image digests | already recorded | a configuration-only change (a grant, a route, a deadline) has no identity, and several Processes have several digests |
| A per-Application counter | short, readable names | needs remembered state, which no render may read |

## Reversibility

Undo cost today: drop one field from both schemas and the oracles, minutes.
Becomes expensive once a database carries revision tags: a migration's undo
target is a revision, and renaming the scheme then means re-tagging every live
database.

## Consequences

- Every Resolved Deployment element and projection carries `revision`, and each
  implementation computes it, paid now in both.
- A revision is 71 characters; anything that must fit a Kubernetes name (a Job)
  takes a prefix of the hex, paid by the adapter that names it
  ([#158](https://github.com/JorisJonkers-dev/deploy-kit/issues/158)).
- Nothing about an Application's revision says which is newer; the pin commit
  and the Release Gate's report carry the order, paid by delivery.
