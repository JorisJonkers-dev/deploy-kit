---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-29
normative: spec/v1/10-project-intent.md#writable-paths-are-declared-not-exempted
rests-on: ["0004"]
---

# A writable path may be held in memory, at its own size, counted toward the Process's memory

A writable path is declared as a path, on node disk at the platform's one
ephemeral size, or as `{path, memory}`, held in memory at that size. The memory
counts toward the Process: its request, its limit and its eligibility include
it. Settled in
[A writable path cannot be memory-backed or sized](https://github.com/JorisJonkers-dev/deploy-kit/issues/695).

## Rests on

Contention decides authority ([0004](0004-contention-decides-authority.md)).
Ephemeral disk is shared by every pod on a node, so its size is the platform's.
Memory a Process holds is already the Process's own, declared in its
`placement`. A path held in memory sizes itself for the same reason the Process
does.

**False if:** a path held in memory could take memory the Process does not
request. **Settled by:** a render test, where a path held in memory adds its
size to the container's request and limit and to the node a Process needs.

## Why

**A browser needs shared memory.** hermes mounts 1Gi at `/dev/shm` for the
browser its tools drive. The runtime's default is 64MB, and Chrome fails or
crashes tabs below what it needs. A disk path at the platform's 64Mi is the
same shortfall in a different place.

**Counted, not beside.** A tmpfs's pages are charged to the container that
writes them. A size left out of the limit is a kill waiting under load, and
left out of eligibility, a node that cannot hold the pod. So the size is added
where memory is already counted, as a sidecar's is
([0017](0017-placement-is-hard-dimensions.md)).

**A path, not a field for `/dev/shm`.** The maintainer chose the general form.
It is the same declaration as any writable path, keyed by its path when levels
merge, and serves any path a process writes into memory.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A `shm` field on the Process | narrower vocabulary | one field per path is the shape a general entry already holds |
| A per-path disk size | none | ephemeral disk is contended, which is why its size is the platform's |
| No field; Chrome's `--disable-dev-shm-usage` | none | it moves the load onto `/tmp`, still at the platform's 64Mi, and needs a flag in every browser an image starts |

## Reversibility

Cheap. The entry is optional, and a path written back as a plain path returns
to disk at the platform's size.

## Consequences

- A writable path is a path or `{path, memory}`, and either merges by its path.
- The kubernetes adapter renders a path held in memory as an `emptyDir` with
  `medium: Memory` at its size.
- The resolved Process's memory includes it, and so does eligibility.
- RENDER-GAPS.md's A5 closes: hermes holds `/dev/shm` at 1Gi.
