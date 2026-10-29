---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-29
normative: spec/v1/10-project-intent.md#seeded-assets
rests-on: ["0004"]
---

# A seeded Asset is copied onto a Process's volume before each start, and its secrets reach the application through the environment

An Asset is mounted read-only at `mountAt`, or **seeded** at `seedAt`, a file
below one of the Process's own volumes or writable paths. A derived step copies a seeded Asset
there before every start, keeps the copy it replaces beside it, and writes the
new one at mode 0600. A seeded Asset is static text: the render fills nothing
into it. A secret reaches the application through its env file, and the
application expands the variable in the file itself. The step runs on the
seeder image the Platform document names. Settled in
[A config seeded onto a Process's volume by an init step has no declaration](https://github.com/JorisJonkers-dev/deploy-kit/issues/693).

## Rests on

Contention decides authority ([0004](0004-contention-decides-authority.md)).
The file is the Process's own, so it is declared on the Process. The image that
copies it serves every Project, so the platform names and pins it.

**False if:** a seeded file could land outside its Process's own storage, or a
secret value could appear in the render. **Settled by:** a render test, in
which a seeded Asset outside every volume is refused, and the seeded file is
the committed text with no value filled in.

## Why

**Some applications own the file they are configured by.** hermes reads its
config from its data volume and rewrites it there: it migrates the config and
edits it from its dashboard. A read-only mount stops both. On the cluster
today, a script copies the file in at every start and keeps the previous copy.
The model declares that behaviour without the script. The copy is derived, so
it runs the same way everywhere, and there is no code to review.

**A volume or a writable path, whichever the file must outlive.** A copy on a
volume outlives the pod, so an application keeps its own edits until the next
start seeds the Asset again. AdGuard Home rewrites its config on every start
and stops if it cannot, and the config it should run is the Asset, not its own
edits. Its conf directory is a writable path, which starts empty with every
pod, so the copy there needs no claim. Both are the Process's own storage, so
neither reaches another Process.

**Secrets through the environment, never the file.** The file mixes static
text with a few secret values. hermes expands `${VAR}` in its own config from
its environment, and the environment already carries every grant through the
env file. So the file is committed with the variable's name in it, and the
value travels the path every other grant takes, rotating the same way. A
`${...}` that names no placeholder source is the file's own text, left for the
application to read.

**A platform image, because the copy is the platform's.** A Process's own image
may hold no shell. The step needs a pinned image that can copy a file. That is
a fact about the platform, so the Platform document names it beside the other
images the render runs for Processes.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Mount the config read-only and stop the migration | no new field | hermes and its dashboard can no longer rewrite the config they own |
| An executable Asset and an authored init step | none: the cluster runs this way today | an Asset is never code, and the script would be untested first-party code in a ConfigMap |
| Copy with the Process's own image | no platform field | an image without a shell cannot run the copy, and each image would copy differently |
| Fill the secrets with the Secret Store's sync, as a template of its own | an application that cannot expand its environment is served | a second object per Asset, a template language in the render, and a file only one grant path can fill; no Application needs it yet |
| Render the secret values into the file | none | a value in the render is a value in Git and in every artifact |

## Reversibility

Moderate. The field is optional, and so is the Platform's `seeder`. Moving a
seeded Asset back to `mountAt` leaves the last seeded copy on the volume, and
nothing removes it.

## Consequences

- An Asset is `mountAt` or `seedAt`. A seeded one names a file below a volume
  or a writable path of its Process, or is `E_SEED_OUTSIDE_VOLUME`. It holds
  no placeholder.
- The Platform document gains an optional `seeder`: its image and what the step
  requests ([chapter 14](../../../spec/v1/14-platform-intent.md#the-seeder)). A
  seeded Asset under a platform that names none is `E_NO_SEEDER`.
- A node is eligible for a Process that seeds only where it fits the step's
  request too.
- The kubernetes adapter renders the step as the first init container. Only
  the step mounts the seeded Asset. The Process reads the copy on its volume.
- An application that cannot expand its environment needs another mechanism,
  which is a later decision.
- The utility example's AdGuard seeds its config onto its conf directory.
- RENDER-GAPS.md's A3 closes for hermes's config. Its skills sync stays a gap,
  because it fetches content, and no Asset describes fetched content.
