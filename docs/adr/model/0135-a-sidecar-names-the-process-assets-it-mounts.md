---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-29
normative: spec/v1/10-project-intent.md#sidecars
rests-on: ["0004"]
---

# A sidecar names the Process's Assets it mounts, by the file each is read from, at a path of its own

A sidecar mounts an Asset of its Process only where it names it, in `assets`,
by the `from` the Asset is read from and at a `mountAt` of its own. The Asset
stays the Process's: declared once, at whichever level shares it, and rendered
as its one content-hashed ConfigMap. A `from` no Asset of the Process arrives
from is refused. Asked in
[A sidecar cannot mount its Process's Assets](https://github.com/JorisJonkers-dev/deploy-kit/issues/707).

## Rests on

Contention decides authority ([0004](0004-contention-decides-authority.md)).
Nothing outside the pod contends for which of its containers reads a file, so
the Process's own project file says it, beside the container that reads it.

**False if:** a sidecar needs a file its Process holds no Asset of, or every
container of a pod reads every Asset of it often enough that naming each is
noise. **Settled by:** the worked `mail` project, whose provisioner beside
Stalwart mounts the manifest it applies, and renders the same ConfigMap the
server's Asset renders, mounted into both containers.

## Why

**Mail's provisioner could not read its manifest.** Stalwart's provisioner runs
beside the server and applies a manifest of domains and accounts against the
server's admin API on localhost. The manifest is an Asset of the stalwart
Process, and only the server's container received it, so the mail handover
could not be rendered.

**Named, as a volume is.** A sidecar already names the Process's volumes it
mounts ([chapter 10](../../../spec/v1/10-project-intent.md#sidecars)), each by
its claim at a path of its own, because a volume is the Process's data and a
sidecar reaches one only where it says so. An Asset is one program's
configuration, at a path in that program's image, which is the same reason
stated for a file instead of a disk. The same shape, `{from, mountAt}` beside
`{claim, mountAt}`, keeps one rule for both.

**By `from`, because that is what the file is.** An Asset's identity when
levels merge is the path it arrives at. A sidecar arrives somewhere else, so it
names the file the Asset is read from, and a path of its own. Where a lower
level replaces an Asset at its path, the file it replaced arrives nowhere, so a
sidecar naming that file is refused.

**The Process's Asset, not the sidecar's.** One declaration renders one
ConfigMap and one pod volume, and every container that names it mounts that
volume. An edit restarts the pod, as any Asset edit does, and nothing about
change propagation has a second case.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Every container of the pod mounts every Asset, as writable paths are | no field at all | a file mounted into a different image at that program's path can shadow that image's own file, and the exporter beside postgres would read `postgresql.conf` for nothing |
| A sidecar declares Assets of its own | the server need not mount the manifest | a second declaring site for one file, a second ConfigMap per file two containers read, and Shared Intent that no longer reaches every container that reads it |
| Name the Asset by its `mountAt` | no `from` repeated | it names where the Process reads the file, not the file, and a sidecar still needs a path of its own |

## Reversibility

Cheap. The field is optional, and removing it unmounts the file from the
sidecar alone.

## Consequences

- A sidecar declares `assets`, a list of `{from, mountAt}`, and the
  kubernetes adapter mounts each read-only from the Process's ConfigMap of that
  Asset, by the file's name as `subPath`.
- `E_UNKNOWN_SIDECAR_ASSET` refuses a `from` no Asset of the Process arrives
  from.
- The Process's own container mounts the Asset too, where the Process declares
  a `mountAt` for it; a file only a sidecar reads is still mounted into the
  Process, at the path the Process declares.
