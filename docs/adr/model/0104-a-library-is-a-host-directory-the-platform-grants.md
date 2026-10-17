---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-17
normative: spec/v1/14-platform-intent.md#libraries
rests-on: ["0004", "0005", "0006"]
---

# A library is a directory on one node that the Platform document declares and grants to projects, and a Process mounts it by name

The Platform document declares each library: the node it lives on, its path there,
the group that owns it, and which projects may mount it, read-only or read-write.
A Process mounts a library it has been granted, at a path of its own and
optionally below a subdirectory. The render derives the rest: the Process is
placed on the library's node, each mounting project gets one local
PersistentVolume and the claim bound to it, and the Process runs with the
library's group as a supplemental group and with no `fsGroup`.

## Rests on

Storage several projects share is contended, so the platform declares it and
decides who may use it ([0004](0004-contention-decides-authority.md)). The
placement, the volume objects and the group follow from that declaration and the
mount, and nothing about them is authored a second time
([0005](0005-derivation-is-total.md)). The library's node is checked against the
pinned node contract like every other placement term, never against the live
cluster ([0006](0006-pinned-inputs.md)).

**False if:** a project needs a shared directory whose node or ownership the
platform cannot know in advance, or the media stack can share its files through
object storage after all. **Settled by:** immich, jellyfin and the arr apps
running as separate projects on one media directory with no host path in any
pod.

## Why

**The media stack shares one filesystem across projects.** The downloader writes
completed files, the arr apps import them into the series and film folders, the
player reads those folders, and immich keeps its photos beside them. All of it is
one btrfs filesystem on one node, also shared over Samba. A claim belongs to one
namespace, so with claims alone these would have to be one project.
Jellyfin cannot stream from object storage, and mounting a bucket as a
filesystem needs FUSE and a privilege the posture refuses
([0020](0020-hardening-is-one-platform-posture.md)).

**The platform owns the directory; a project only asks for it.** Which node holds
the disk, where it is mounted and which group owns it are facts about the
estate's hardware. Which projects may write there is a decision that touches
every project at once. Neither is a project's to state, the same split
[0018](0018-durability-class-derives-a-backup.md) makes between a volume's worth
and the backup policy.

**A local volume, not a host path.** A `hostPath` volume puts a node path in
every pod, and the Pod Security `restricted` profile refuses it. A local
PersistentVolume names the path once, outside the pod, and carries the node
affinity that places every pod mounting it. Kubernetes binds each volume to one
claim, so each mounting project gets its own volume onto the same directory,
pre-bound to its claim so nothing else can take it.

**No `fsGroup`, ever, on a Process that mounts a library.** The kubelet applies a
pod's `fsGroup` to every volume it mounts, a local one included. With
`OnRootMismatch` it re-owns the whole tree the moment the root's group differs,
and a library is terabytes another project and Samba also read. So the library
names its group, the Process gets it as a supplemental group, and a claim the
same Process holds goes without `fsGroup`. A claim that needs its own ownership
belongs to a Process that does not mount a library.

**Nothing a render removes.** The volume is retained and pruning is disabled, as
for backup claims, because the directory holds data no render owns.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One project per shared filesystem | nothing new in the model | the player, the importers and the downloader share one namespace and one policy, and move onto the estate path together or not at all |
| `hostPath` volumes in the pod | no PersistentVolume objects | refused by Pod Security `restricted`, and every pod spec carries a node path |
| Declare the library on the node's disk entry, with grants in the Platform document | the path stays a node fact | one concept split over two documents, and a grant names a disk the reader must look up elsewhere |
| A volume variant with `library:` instead of `claim:` | one list of mounts | size, durability and claim naming each need an exception for an entry that has none of them |
| `fsGroup` set to the library's group | a claim beside a library is writable without asking | one mistyped group re-owns the whole library on the first mount |
| Object storage for the media library | stateless Processes | jellyfin cannot read media from a bucket, and a FUSE mount needs privileges |

## Reversibility

Undo cost today: one Platform field, one Process field, two object kinds in one
adapter, and no project using them: a day. Becomes costly once: media projects
mount a library, and undoing it means merging them back into one project.

## Consequences

- The Platform document carries `libraries`, and a Process carries `libraries`
  ([chapter 10](../../../spec/v1/10-project-intent.md#libraries)).
- The `kubernetes` adapter emits a cluster-scoped `PersistentVolume` per
  mounting project and library, and the claim bound to it
  ([chapter 30](../../../spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection)).
- A library's group is a fixed number on the node, so the node's configuration
  pins it rather than letting the system assign one.
- Backing the library up is the platform's, outside the render: a library has no
  Durability Class.
