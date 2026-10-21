---
tier: decision
status: accepted
claim: settled
date: 2026-10-21
normative: spec/v1/20-resolved-deployment.md#the-images-lock
rests-on: ["0006"]
---

# Every images lock entry records its version, and a missing one is refused apart from an engine's version of the wrong shape

Every entry of the images lock records the version of the software inside its
image. An entry without one is refused at its alias. That refusal is a
different one from the refusal of an engine's image whose version cannot key
a Move.

## Rests on

Every assignment is a function of pinned inputs
([0006](0006-pinned-inputs.md)), and an image's version is one of them: the
render writes it on every pod, so it has to be fixed in the lock before
resolution runs, never looked up afterwards.

**False if:** a pod can say which software it runs without the lock recording
it, from something the render already reads. **Settled by:** the estate's
images lock and every participant's share recording a version for every
entry, which they did on 2026-10-21, and composition refusing a share that
drops one.

## Why

**A version that is optional is a version that is sometimes missing.** The
lock gained `version` as an optional field so that every image publisher could
start recording it without one release breaking another
([0039](0039-the-label-set-is-fixed.md) says why it is written on each pod).
While it stayed optional, a pod whose image had none simply carried no
annotation, and nothing told its owner. Once every publisher records it, the
optional field only hides the one that stops.

**Refused at the lock, not at the pod.** The lock is where the version is
recorded, and where a missing one can be named by its alias. A refusal there
reaches every path that reads a lock: `publish --images-lock` refuses the
share before a fragment carries it, and composition refuses a share, or the
platform's lock, before resolution runs.

**A missing version and an engine's unreadable version stay two refusals.**
An engine whose Platform entry names a `move` reads one component off its
image's version to decide whether a change is a Move
([0095](0095-each-engine-states-how-its-data-moves.md)), so that version has a
required shape. That is a rule about one kind of image and about the shape of
a value that is present. A version absent from any entry is a different
defect, with a different owner and a different fix. Folding both into one
code would make the code mean "absent, or present and the wrong shape for a
Move", and a reader of the refusal could not tell which.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep `version` optional | nothing to change | a publisher that stops recording it goes unnoticed, and its pods silently lose the annotation |
| Refuse a missing version only where a pod would be annotated | a narrower rule | every image a Process runs is annotated, so the narrower rule is the same rule with a harder test |
| Report the missing field as a schema refusal | no new code | a schema refusal names the field, not the alias, and gives no hint about where the version comes from |
| Fold the engine-version refusal into this one | one code fewer | one code would name two defects with different fixes, and the Move rule's scope would blur into every image's |

## Reversibility

Undo cost today: one field made optional again and one code retired, an hour.
It stays cheap, because nothing derives from a version's presence other than
the annotation it renders.

## Consequences

- Every image publisher writes `version` into the lock it hands `publish`,
  read from the image's `org.opencontainers.image.version` label.
- The platform's own lock records a version for every image it names.
- An images lock written before every publisher recorded versions is no
  longer accepted. The estate moves to the release that enforces this only
  after every participant's newest fragment carries a version for every entry.
- The engine-version refusal keeps its own code and its own chapter rule, and
  stays pending until an engine names a `move`.
