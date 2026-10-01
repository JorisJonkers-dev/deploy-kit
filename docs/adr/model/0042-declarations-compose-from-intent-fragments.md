---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/40-composition.md#why-composition-exists
rests-on: ["0001", "0006"]
---

# Declarations compose from Intent Fragments published by digest, because eight properties of the estate need every project at once

Each project file is published as an Intent Fragment, an OCI artifact named by
digest, after its repository's images are built, when a release is tagged
([0083](0083-a-fragment-publishes-on-a-release-tag.md)). Composition
resolves the participants' fragments, unions them, checks the estate-wide
invariants and records every digest it resolved in the composition lock, which
is an output. The eight properties that need the whole estate are
[chapter 40](../../../spec/v1/40-composition.md#why-composition-exists)'s table.

## Rests on

The estate is one maintainer and many repositories, each with its own cadence
([0001](0001-estate-scale-and-ownership.md)), so no repository holds another's
declarations and none can check a property of the whole. Every assignment is a
function of pinned, digested inputs ([0006](0006-pinned-inputs.md)), so what
composition reads is named by digest and recorded.

**False if:** one Intent Fragment, composed alone, decides every one of the
eight properties. **Settled by:** a test that runs the estate-wide checks over
one fragment alone and over the worked estate and shows each of the eight
undecidable in the first and decided in the second, to be written, owned by
joris; `test/model/intent-set.test.ts` already proves the rules that run across
documents.

## Why

**No Application knows its own consumers**, and no project file holds the
fleet's node contract, so none of the eight is locally computable.

**A fragment publishes after its images.** It names only digests its
repository's build has pushed, so a render never names an image nothing can pull
([0051](0051-a-project-is-delivered-as-a-signed-artifact.md)).

**The lock is an output.** An artifact cannot contain its own digest, so the
consumer records what it resolved. A render is reproduced from recorded digests,
and no repository must merge here before its change takes effect.

**The estate tried the other shapes.** Submodule pointers needed a central merge
for every change and a sync bot to move them. Discovery by repository topic was
not reproducible, and a repository without the topic dropped out silently. OCI
publication by digest is the pattern the estate already ran for its deploy
contexts.

**Co-testing is not an input.** It stays parked
([0069](../deferred/0069-co-testing-is-parked.md)), so its inbound edges and test
discovery are not properties composition decides.

**An omitted project costs less than it used to.** A project missing from a
composition publishes no artifact and moves no pin; its own objects stay
applied. It can still lose its share of the estate-scoped paths, so the
participants list and its staleness bound still guard composition
([0043](0043-participants-list-staleness.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Git submodules, pointers bumped centrally | a pointer-bump pull request per change | the central merge becomes mandatory |
| Live discovery by repository topic | no pinning | not reproducible; a missing topic drops a repository silently |
| One declarations directory in this repository | every project merges here first | contradicts independent repositories; the fallback if that premise fails |

## Reversibility

Undo cost today: swapping OCI resolution for a checked-in directory touches the
publish workflow, the resolver, the participants list and chapter 40: a day.
Becomes irreversible once: a repository outside this owner's control publishes
on its own cadence.

## Consequences

- Chapter 40's table is the one list of what composition decides; a new
  estate-wide property is a row there.
- An intent-only change publishes with its repository's next release, one
  build later.
- Composition needs registry read access for every participant, and a missing
  or stale participant is isolated at its last composed fragment
  ([0085](0085-composition-isolates-a-refused-project.md)).
