---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-30
normative: spec/v1/10-project-intent.md#a-low-port-earns-net_bind_service
rests-on: ["0002"]
---

# A container that listens below 1024 adds NET_BIND_SERVICE back, and a container's home is the writable /tmp it mounts

Two derivations close the gaps a real image found in the one posture
([0020](0020-hardening-is-one-platform-posture.md)), and neither is authored. A
container whose port is below 1024 adds back `NET_BIND_SERVICE` and nothing
else. A container that mounts a writable volume at `/tmp` gets `HOME=/tmp`,
unless the Process's own variables name `HOME`. The rules are in
[A low port earns `NET_BIND_SERVICE`](../../../spec/v1/10-project-intent.md#a-low-port-earns-net_bind_service)
and [`HOME` is the writable `/tmp`](../../../spec/v1/10-project-intent.md#home-is-the-writable-tmp).
Settled in
[Stalwart cannot exec or write HOME under the rendered security context](https://github.com/JorisJonkers-dev/deploy-kit/issues/740).

## Rests on

Kubernetes applies the posture per container
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)), so the render can
derive one capability and one variable per container from what that container
already declares: its ports and its mounts.

**False if:** an image the estate runs on a low port needs a capability other
than `NET_BIND_SERVICE` to start, or a tool in a rendered container writes
under its home somewhere other than `/tmp` on a pod that declares `/tmp`.
**Settled by:** the mail example's committed tree, whose Stalwart container
adds `NET_BIND_SERVICE` and whose two containers carry `HOME=/tmp`;
`npm run lint:manifests`, holding every rendered pod to Pod Security's
`restricted` profile; and Stalwart starting on the estate path from that
render with no field manager's patch on top.

## Why

**Binding is not executing.** k3s lets a pod off the host network bind any
port without a capability, and that still holds. The failure is earlier: an
image built to bind a low port as a non-root user ships its binary with the
file capability `cap_net_bind_service+ep`, and the kernel refuses to execute a
file whose capabilities fall outside the bounding set. With every capability
dropped, Stalwart failed at `exec` with `operation not permitted`. Nothing in
the image's config says so; the port does.

**Derived from the port, because the port is already declared.** A field per
Process would be the exception surface
[0020](0020-hardening-is-one-platform-posture.md) refuses. The port is already
the Process's statement that it binds low, and `NET_BIND_SERVICE` is the one
capability Pod Security's `restricted` profile lets a container add, so the
class holds. It is the container port, because that is what the process binds;
a host port in front of it is the node's.

**A home is a place to write.** An image whose user has no passwd entry runs
with `HOME=/`, read-only under the posture; Stalwart's provisioner failed with
`Read-only file system` writing under its home. `/tmp` is the one directory the
render already makes writable where a Process declares it, so the home points
there.

**Only where `/tmp` is mounted.** The maintainer's direction was `HOME=/tmp` on
every container. Not every container mounts `/tmp`: `/tmp` is supplied only
where declared, and the platform's own jobs (the policy, catalog and move
steps) mount none. Two ways out: mount an `emptyDir` at `/tmp` on every
container, or set `HOME` only where one is mounted. The second keeps
[0020](0020-hardening-is-one-platform-posture.md)'s rule that nothing writable
is implicit, adds no volume to an image that never writes, and loses nothing: a
`HOME` pointing at a read-only `/tmp` is no better than one at `/`. A Process
whose image writes under its home declares `/tmp`, as mail does.

**An authored `HOME` wins.** A variable is the author's to name. Adding a
second entry would leave the winner to the container runtime, so the render
adds none where the Process's variables already hold one.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep `drop: [ALL]` alone and refuse such an image | every image with a file capability rebuilt | the capability is the one `restricted` allows, and the port already says when it is needed |
| An authored `capabilities` field | none | an exception surface, which [0020](0020-hardening-is-one-platform-posture.md) refuses |
| `NET_BIND_SERVICE` on every container | none | a capability no high-port container uses, on every pod |
| Mount `/tmp` on every container so `HOME` is everywhere | one `emptyDir` per pod that never writes | contradicts "nothing is implicit", for no container that needs it |
| `HOME=/tmp` on every container, mounted or not | none | a read-only `/tmp` is no home, and the variable would claim one |
| The render's `HOME` over the author's | none | two sources for one variable, and the author's is the one a reader finds |

## Reversibility

Cheap. Both are derivations in the render with no field behind them; removing
either changes rendered objects and no authored file.

## Consequences

- The kubernetes adapter adds `NET_BIND_SERVICE` to a Process's container with
  a container port below 1024, and `HOME=/tmp` to every container that mounts a
  writable volume at `/tmp`: the Process's, each sidecar, the seeding step and
  the migration runner.
- A Process whose image writes under its home declares `writablePaths: [/tmp]`.
- The platform's own jobs, which mount no `/tmp`, get no `HOME`.
