---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#writable-paths-are-declared-not-exempted
rests-on: ["0005"]
---

# A Workload declares the paths it writes, and that is not a hardening exception

## Rests on
A process under a read-only root filesystem writes to a small, knowable set of
paths, and one ephemeral size covers every such path in this estate. False if: a
Workload's writable set cannot be enumerated ahead of time, or one default size
is wrong often enough that the override is the normal case. Settled by:
rendering the estate with every non-static Workload declaring its writable paths,
`auth-ui`'s `writableRootFilesystem` exception deleted, and no override on the
size.

## Why
`readOnlyRootFilesystem: true` is one of the four `restricted` controls, and it
does not mean nothing writes. A JVM needs `/tmp`. nginx needs
`/var/cache/nginx` and `/var/run` before it can serve a request. The model had
no way to say so, which produced two defects at once.

The first is undeclared behaviour. `auth.domain.yml` states that "the JVM writes
only to `/tmp`, which the render supplies as an `emptyDir`" — a mount no chapter
specifies, from a derivation that exists nowhere. Either every pod gets a `/tmp`
nobody asked for, or `auth-api` does not start, and which one happens is a
property of an adapter rather than of the model.

The second is worse, because it corrupts a control the estate depends on.
`auth-ui` relaxes the **whole** `readOnlyRootFilesystem` control to get two
writable directories, and its own recorded reason predicts the fix: *"the
exception retires when a rebuilt image relocates both paths onto a mounted
emptyDir."* Under this decision no rebuild is needed — the paths are mounted by
declaration — and the exception retires now. That matters beyond one Workload:
chapter 10 keeps the exception list as the estate's inventory of what it cannot
harden, precisely so its length is meaningful. An entry for something that is not
an exception makes the inventory lie.

So a writable path keeps the control **intact**. `readOnlyRootFilesystem` stays
`true` and the declared paths are mounted, which is what the control has always
meant: the image's filesystem is immutable, and what a process writes is
mounted. Putting a mounted tmpfs in the same list as a pod running as root would
be a category error.

`sizeLimit` is platform-assigned. Ephemeral storage is finite node disk, so by
[0004](0004-contention-decides-authority.md) the size is contended and the
Platform Intent carries one default — the same shape as probe cadence and scrape
timing. Authoring a size per path was the alternative and it is 0081's shape,
which is right for a persistent volume whose size is a property of the data and
wrong here: a temp directory's size is a property of the node's tolerance, not of
the Service.

Nothing is implicit. `/tmp` is not supplied unless declared, because a mount
nobody asked for appears in every static image that never writes, and an implicit
mechanism is what this row exists to remove.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Author a size per writable path | Consistent with 0081, no context field | A temp directory's size is the node's tolerance rather than the data's property, and one number covers every case the estate has |
| Derive `/tmp` implicitly and nothing else | No new authored field; matches what the example assumes | A mount appears in every pod that never writes, and `auth-ui` still relaxes the whole control for its two paths |
| Treat a writable path as an exception entry | One inventory for every relaxation | Conflates mounting a tmpfs with disabling the control, so `auth-api` writing to `/tmp` sits beside a pod running as root and the inventory's length stops meaning anything |
| Require a reason for a second path | Cheap pressure toward better images | nginx legitimately needs two, so the first honest case pays a tax for being honest |

## Reversibility
Undo cost today: one authored list and one derivation; both are pod-template
fields, patchable in place. Becomes irreversible once: `auth-ui`'s exception is
deleted in favour of declared paths, because restoring the old shape would mean
re-adding a blanket relaxation the inventory has stopped carrying.

## Consequences
- R15 closes, and one entry leaves the exception inventory — the first time that
  list has shrunk for a reason other than a rebuilt image — paid by nobody.
- Every non-static Workload now declares its writable set, so an image whose
  write behaviour nobody knows has to be examined before it renders — paid by
  its owner, once, and it is information the estate did not have.
- A wrong or missing path is a runtime failure, not a build error: the model
  cannot know what a process writes, so a forgotten `/var/run` surfaces as a
  crash — paid at first render, which is the earliest anything could know.
- One ephemeral default governs the estate, so a Workload that needs a large
  temp area carries an override with a reason and shows up in review — paid in
  one line, deliberately visible.
- `emptyDir` is node-local and lost on restart, which is correct for every path
  this vocabulary is for; a path that must survive a restart is a volume with a
  Durability Class, and the two are now clearly different declarations — paid in
  one distinction authors have to learn.
