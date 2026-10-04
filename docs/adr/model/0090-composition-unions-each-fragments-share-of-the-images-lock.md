---
tier: decision
status: accepted
claim: settled
date: 2026-10-04
normative: spec/v1/40-composition.md#fragments
rests-on: ["0006"]
---

# Composition unions each fragment's share of the images lock, and an alias locked two ways is refused at the fragment that changed

Each Intent Fragment carries the images lock entries for the aliases its own
project file names. Composition unions them into the one lock resolution
reads. Two shares may lock an alias to the same image; two that lock it
differently are refused, at the share of the fragment that changed.

## Rests on

Every assignment is a function of pinned inputs
([0006](0006-pinned-inputs.md)), and the image an alias resolves to is one of
them: it has to be one value across the estate, fixed before resolution runs.

**False if:** two fragments can lock one alias to different images and the
estate still renders one of them deterministically without a rule choosing
between them. **Settled by:** the compose-seam test in which a changed share
disagrees with the platform's lock, and composition isolates it instead of
rendering either digest.

## Why

**The repository that builds an image is the one that knows its digest.** A
release's build pushes the image and the fragment publishes after it
([0083](0083-a-fragment-publishes-on-a-release-tag.md)). One estate-wide lock
beside the Platform document would have to be edited on every release of every
application, by something that can write to the Estate repository, which is
the push path the delivery model removed
([0051](0051-a-project-is-delivered-as-a-signed-artifact.md)).

**A share holds what its project file names, and nothing else.** `publish`
takes it from the lock the build wrote and refuses an alias that lock does not
hold, so a fragment never names an image nothing can pull, and never carries an
entry for someone else's alias by accident.

**The same image twice is one entry.** Two Projects may both run one
third-party image under one alias. Requiring a single owner per alias would
force that image into the Platform document's lock, and make the platform a
party to every such release.

**A different image twice is refused, not arbitrated.** An order of
precedence, the platform's over a Project's or the newest over the oldest,
would let one fragment change the image another fragment runs. An image digest
is unique estate-wide and arbitrated by the platform
([chapter 20](../../../spec/v1/20-resolved-deployment.md#pinned-inputs)), so
the only safe answer to two is to render neither.

**Refused where it was introduced.** Composition isolates the fragment an
error names and keeps its Project at its last composed release
([0042](0042-declarations-compose-from-intent-fragments.md)). What the
unchanged fragments hold composed before, so the changed share that disagrees
with them is the one named. One Project's bad release then costs that Project
a release, and nobody else a deploy.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep one estate-wide lock in the Platform document's fragment | none to build | every application release needs a write to the Estate repository, and the lock changes for reasons no platform change caused |
| One owner per alias, a second lock of it refused even when identical | a simpler union | two Projects cannot share a third-party image without the platform owning it |
| A Project's share overrides the platform's | no refusal between the two | a Project silently changes an image the platform locked, and the render depends on precedence nothing declares |
| Refuse at every share that holds the alias | no notion of "changed" in the union | an unchanged fragment is named, and an error that names one fails the whole run: one bad release would stop every deploy |
| Union inside resolution instead of composition | one place reads lock files | resolution's contract is one lock, which both implementations hold to; composition is where fragments meet |

## Reversibility

Undo cost today: one module, one option and a table in chapter 40, a day.
Becomes costly once application repositories publish shares and the Platform
document's lock stops holding their images: going back means collecting every
share into one file again.

## Consequences

- `deploy-kit publish` takes `--images-lock`, and packs the share as
  `images.lock.yml` in the fragment. Without it a fragment carries no share,
  and the Platform document's fragment can keep locking that Project's images
  while it migrates.
- The union is named by the Platform document's `metadata.project`, which is
  the name the composed lock's digest is recorded under.
- `E_IMAGE_LOCK_CONFLICT` joins the codes a fragment can be isolated for.
- The Platform document's fragment still carries the lock for the images the
  Platform document names itself.
