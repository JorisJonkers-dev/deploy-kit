---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-29
normative: spec/v1/10-project-intent.md#command-and-arguments
rests-on: ["0004"]
---

# A Process may name its command and its arguments, as literal words

A Process, and a sidecar, may declare `command`, which replaces the image's
entrypoint, and `args`, which replaces its arguments. Each is a list of literal
words. A word holds no placeholder, so nothing a grant holds or an edge
derives reaches a process's arguments. Settled in
[A Process cannot be given arguments](https://github.com/JorisJonkers-dev/deploy-kit/issues/691).

## Rests on

Contention decides authority ([0004](0004-contention-decides-authority.md)).
How an image is started concerns its Process alone, so the Process says it.

**False if:** a Process's arguments could change what another Process or the
platform receives. **Settled by:** a render test, where an authored list reaches
only the container that declares it, ahead of anything the render derives for
it.

## Why

**Live images need it.** hermes starts its gateway with `gateway run`.
kubernetes-mcp-server serves HTTP and refuses writes only when told
`--port=8080 --read-only`. Without those, the first image runs nothing, and the
second speaks MCP over stdio with its write tools offered.

**The entrypoint too, not only the arguments.** The maintainer chose both, so
an image whose entrypoint wraps what an Application needs can be started
directly. That puts the image's own setup in the author's hands, which is the
author's call about their own Process.

**Literal words, no placeholder.** Every reader of the node's process list
sees a process's arguments. A secret placeholder would put a grant's value
there. An address placeholder has a place already: the environment, which the
env file fills. So a value derived from the model reaches the image through its
variables, never its arguments.

**A tier's proxy keeps its derived arguments.** The edge proxy's configuration
is derived as arguments. The authored ones come first, and the derived ones
follow, so a Process cannot unsay what its tier requires.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| `args` alone, the entrypoint never authored | none | the maintainer chose the entrypoint as well, for images that wrap their start |
| Placeholders in a word, secrets refused | one more placeholder site | the environment already carries derived values, and two paths for one value is a second declaring site |
| Images that need arguments are rebuilt with them baked in | none in the model | a third-party image is not ours to rebuild, and a rebuild per argument pins the estate to forks |

## Reversibility

Cheap. Both fields are optional; dropping one restores the image's own start.

## Consequences

- A Process and a sidecar gain optional `command` and `args`.
- The kubernetes adapter writes them on the container, the authored arguments
  ahead of a tier proxy's derived ones.
- RENDER-GAPS.md's A1 closes: hermes runs `gateway run`, and
  kubernetes-mcp-server `--port=8080 --read-only`.
