---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-01
normative: spec/v1/40-composition.md#fragments
rests-on: ["0001", "0006"]
---

# A fragment publishes on a release tag and carries that release's version

An application repository publishes its Intent Fragment when release-please tags
a release, after that release's images are built, and the fragment carries the
release's version. A merge that is not released publishes nothing and deploys
nothing. A deploy, a Rollback target and the estate's deploy log name a Project's
state by that version, with the commit as provenance beside it
([chapter 40](../../../spec/v1/40-composition.md#fragments)).

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)); a version is a name for one of those digests
that a human can say aloud. The estate is one maintainer
([0001](0001-estate-scale-and-ownership.md)), who reads a deploy log and asks for
a Rollback, and who already cuts a release in every application repository with
release-please.

**False if:** a change the maintainer wanted live routinely waits for a release
nobody cut, so releases are cut only to deploy and the version stops meaning a
release. **Settled by:** over the first month on the estate path, count the
release pull requests merged only to get a change deployed; the claim fails if
that is most of them.

## Why

**A version is what a human asks for.** "Roll back to 2.1.2" names a release
the changelog describes; "roll back to `22b9d33`" names a commit the maintainer
must look up first. A Rollback that names a version
([0084](0084-pause-and-rollback.md)) needs every fragment to carry one, and only
a release has one.

**Publishing on every merge deployed work in progress.** Under the previous
rule ([0051](0051-a-project-is-delivered-as-a-signed-artifact.md) as first
written, which changed [0042](0042-declarations-compose-from-intent-fragments.md))
every merge to the default branch published, so a merge was a deploy. A release
tag separates the two: merging is integration, releasing is deploying, and
release-please's pull request is the one place the two meet.

**The images still come first.** The tag's own build pushes the images, and the
fragment publishes once they exist, with every alias resolved to a digest, as
[0051](0051-a-project-is-delivered-as-a-signed-artifact.md) requires.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Publish on every merge, as before | an intent-only change deploys a build later | a merge is a deploy, and nothing names a deploy except a commit |
| Publish on every merge and carry a computed version | versions with no release | a version no changelog describes names nothing a human recognises |
| Publish on a manual dispatch | full control | a step every deploy needs and no review sees |

## Reversibility

Undo cost today: the publish trigger in one reusable workflow and the version
field in the lock, an afternoon. Becomes expensive once Rollbacks and the
dashboard read versions, because both would have to fall back to commits.

## Consequences

- An intent-only change deploys only when it is released, paid by every
  application repository in one release pull request merged.
- The composition lock records each fragment's version, and the estate's
  deploy log and its notifications name releases, paid once in the lock's
  schema.
- A Project whose repository releases less often than weekly needs a `maxAge`
  override with a reason ([0043](0043-participants-list-staleness.md)), paid by
  that project's owner.
