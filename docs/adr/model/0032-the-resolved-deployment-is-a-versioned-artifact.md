---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/20-resolved-deployment.md#the-resolved-deployment
rests-on: ["0003", "0004", "0006"]
---

# The Resolved Deployment is a versioned, reviewable artifact, published back to each owning repository, and an Application's revision is the digest of its own element

The Resolved Deployment is emitted per render with a versioned `apiVersion` and
validated against its own schema. It is byte-stable for identical pinned inputs.
Composition writes each Application's element into that Application's own
repository as a generated `ResolvedApplication` projection, opens a pull request
when it changes, and a drift check fails a hand edit
([chapter 20](../../../spec/v1/20-resolved-deployment.md#publish-back)). An
Application's **revision** is the digest of its element with the revision itself
left out, and it names one release everywhere delivery needs a name
([chapter 20](../../../spec/v1/20-resolved-deployment.md#the-application-revision)).

## Rests on

The middle layer is the contract ([0003](0003-three-model-pipeline.md)).
Contended values are platform-assigned
([0004](0004-contention-decides-authority.md)), so an owner cannot read their
own hostname, namespace or placement out of their own repository, and an
assignment can change because of an edit in a different repository. Every
assignment is a function of pinned inputs ([0006](0006-pinned-inputs.md)), so a
digest of an element is as reproducible as the render.

**False if:** two renders of the same inputs differ, every assignment change is
caused by a change in its owning repository, or re-resolving an unchanged
Application yields a different revision. **Settled by:** `npm test`, which
validates every committed `expected/resolved.json` against the Resolved
Deployment metamodel and recomputes each revision; once a renderer exists, a
double render diffed byte for byte; and raising `auth-api`'s route tier on a
branch and observing a pull request in `knowledge` with no commit there.

## Why

**The middle layer needs a version and a reader.** The replaced generation's
deployment schema pinned a bare `apiVersion` with no version, and three
incompatible documents shared that one name, so the validator rejected the
right one. A reviewer reading a Resolved Deployment diff sees what the platform
decided on their behalf; that is a claim about a document somebody holds.

**Publish-back reaches the owner when nobody else will.** The preview comment on
the owner's own pull request covers the owner's own change. When `auth-api`'s
tier changes, `knowledge`'s forward-auth chain changes with no event in
`knowledge`. A generated file arriving as a pull request lands the change where
the owner looks.

**The revision is per Application.** The lock and `renderHash` both move when
anything in the estate moves. A database tagged with the `renderHash` would be
retagged by every unrelated release. The revision moves exactly when the
Application does, and it covers the element, not the published projection,
whose provenance changes with every render.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| An unversioned middle layer | no schema to maintain | three documents shared one name, and the validator picked the wrong one |
| Only the preview comment | nothing generated in repositories | a change caused elsewhere reaches nobody |
| Name a release by `renderHash` | one digest | moves with every unrelated release |
| Digest the published projection | one form | its provenance moves the revision on every render |

## Reversibility

Undo cost today: the projection writer and the drift check: a day. Becomes
irreversible once: databases carry revision tags and the Release Gate names
releases by revision, because a different naming then retags live state.

## Consequences

- Every Application repository gains a generated file and receives pull
  requests it did not open, paid by the owner in review.
- The model-driven implementation computes the revision over its own model's
  shape, so the two digests of one Application differ until it emits the same
  projection ([#90](https://github.com/JorisJonkers-dev/deploy-kit/issues/90)).
- A render whose projection disagrees with the committed one fails, so a hand
  edit to a generated file never lands.
