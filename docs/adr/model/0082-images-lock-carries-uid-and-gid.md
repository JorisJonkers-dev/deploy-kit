---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#the-uid-is-a-pinned-input-and-the-volume-needs-a-group
rests-on: ["0006"]
---

# The images lock resolves each image's uid and gid, and fsGroup derives from the gid

## Rests on
Every image this estate runs declares a numeric user, or can be replaced by one
that does, and that number plus its group is all a hardened pod and a writable
volume need. False if: an image the estate depends on declares a named user with
no numeric equivalent and cannot be rebuilt or replaced. Settled by: building
the lock over every alias in the estate and finding a numeric `uid` for each,
then rendering `platform-postgres` and watching `initdb` succeed on a freshly
provisioned `local-path` volume.

## Why
Chapter 10 said the non-root control renders `runAsNonRoot: true` "with the UID
from the image". That was not a derivation. The images lock resolves an alias to
a digest and records nothing about the user
([0006](0006-pinned-inputs.md) forbids reading a registry at render time), so
the rendered pod carried `runAsNonRoot: true` and no UID.

Three failures follow from the same missing field.

A pod with `runAsNonRoot: true` and no `runAsUser` depends on the image's own
`USER`, and if that `USER` is a **name** the kubelet cannot verify it is not
root: the pod fails `CreateContainerConfigError`. That is a runtime failure with
no diagnostic pointing at the cause.

A freshly provisioned `local-path` directory is **root-owned**. A non-root pod
with no `fsGroup` cannot write it, so `platform-postgres` cannot `initdb` into
its own PV: the estate's most important stateful Workload, blocked by the
hardening class it is supposed to satisfy.

And nothing in the model could state the UID, because a UID is a mechanism and
layer 1 excludes mechanisms, while layer 2 had no pinned input to derive one
from.

The lock is the right place because the lock is an **output**, built by a step
that legitimately talks to a registry, the same step that turns an alias into a
digest can read the image config's user. Once it does, `runAsUser`,
`runAsGroup` and `fsGroup` are functions of a pinned input like every other
assignment, and `E_IMAGE_USER_NOT_NUMERIC` moves the named-user failure from the
kubelet to lock time, where it has a name.

`fsGroupChangePolicy: OnRootMismatch` comes with it. The default policy re-chowns
the whole volume on every start, which on a large PV is minutes of startup the
`startupBudget` did not account for.

The alternative worth naming is the one most charts use: an init container that
chowns the volume. It works, and it needs a root-capable container on every
stateful Workload, a `runAsRoot` exception in the inventory chapter 10 keeps
precisely so that its length stays visible. Solving with an exception what
`fsGroup` solves without one would make that inventory lie about the estate.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| The Workload authors `runAsUser` | Explicit and visible, no lock change | A UID is a mechanism, and it duplicates a fact the image carries: the two can disagree, and the image wins at runtime |
| The platform assigns a UID per Workload | Uniform, independent of what images declare | Requires every image to tolerate an arbitrary UID, and files already written to a PV by the image's own user stop being readable |
| Author `fsGroup` per Workload | Handles an image whose data group differs from its run group | A second mechanism in layer 1 restating what the image config already says |
| An init container that chowns the volume | Works regardless of the image, and is the common pattern | Needs a root-capable init container on every stateful Workload, which cannot meet `restricted` at all, for a problem `fsGroup` solves without one |

## Reversibility
Undo cost today: two lock fields and one derivation, hours, and the lock is
rebuilt on every image bump anyway. Becomes irreversible once: volumes hold data
owned by these uid/gid pairs, because changing the derivation then means chowning
live data rather than re-rendering.

## Consequences
- R9 closes, and `platform-postgres` becomes renderable and startable under the
  hardening class rather than in spite of it, paid by nobody.
- The lock-building step now reads image configs, so it needs registry read
  access for every alias and fails when an image is unpullable, paid at lock
  time, which is where a bad image reference should fail.
- An image with a named `USER` cannot enter the estate until it is replaced or
  rebuilt, so `E_IMAGE_USER_NOT_NUMERIC` can block an image bump, paid by
  whoever bumps, with a diagnostic instead of a pod that will not start.
- `fsGroup` applies to every volume of a Workload, so a Workload holding two
  volumes with different expected groups cannot be expressed; that is not a case
  the estate has, and it becomes an override with a reason if it appears, paid
  when it appears.
- The lock grows two fields per alias, so its schema version moves and every
  consumer pinning the old shape must be re-published, paid once, per
  repository.
