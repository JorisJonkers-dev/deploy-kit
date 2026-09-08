---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#assets
rests-on: ["0005"]
---

# An Asset change is content-hashed and restarts the Workload; there is no onChange field

## Rests on
No image in this estate reloads its own configuration file without being told,
and nothing in the model can tell it, so restart is the only propagation
mechanism that exists. False if: an image the estate runs watches its config
file and applies changes in place, making a restart avoidable by declaration
alone. Settled by: rendering every Asset with a content-hashed object name, no
`onChange` field anywhere in the schema, and the restart visible in the diff of
each affected pod template.

## Why
`onChange` had two values and one of them meant nothing. `restart` was already
specified to render a content-hashed object name — necessary, because 16 of the
estate's 18 ConfigMaps are plain today, so an edit applies successfully and never
reaches the pod. `reload` had no mechanism at all: Kubernetes has no primitive
that reloads a process, no image here watches its own config file, and reaching
into a running container to signal it would need Kubernetes API access that
[0075](0075-no-workload-rbac-in-v1.md) refuses.

Three ways to give `reload` a meaning were considered and all three cost more
than the value returns. A hash-named Job invoking the engine's reload command
over the datastore's own protocol would work — `SELECT pg_reload_conf()` needs no
Kubernetes RBAC — and it buys one avoided restart per config edit at the price of
a new derived object, a per-engine command catalog entry and a credential path.
A reloader operator adds an operator the substrate does not run and triggers
restarts anyway. Watching the file is the image's job and no image does it.

So `reload` is deleted, and with it the field: an enum with one legal value is a
label an author has to type, which is [0078](0078-engine-is-workload-vocabulary.md)'s
own rule turned on this vocabulary. Propagation becomes an unconditional property
of every Asset rather than a promise kept by the Assets that remembered to ask.

The cost is stated rather than mitigated, because hiding it would be worse.
Under [0089](0089-replicas-derived-no-minavailable.md) a stateful Workload runs
one replica with `Recreate`, so editing one line of `postgresql.conf` takes
`platform-postgres` down for a restart. That is what an Asset edit costs on this
substrate. An author who needs it cheaper needs a mechanism — an image that
reloads, or a datastore reachable over its own protocol — not a field that
claims a capability nothing implements.

One word survives elsewhere and deliberately: `rotation.tolerates: reload` on a
**secret**. There the actor exists — under `delivery: self` the client library
re-reads the value, which is why `delivery: env` with `tolerates: reload` is
already `E_ENV_CANNOT_RELOAD`. Same word, different actor, and the glossary says
which is which.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A hash-named Job running the engine's reload command | Avoids a restart per config edit, needs no Kubernetes RBAC | A new derived object, a catalog entry and a credential path, for a saving the estate can take as downtime it already takes |
| Adopt a reloader operator | Off-the-shelf and battle-tested | An operator the substrate does not run, and it triggers restarts rather than in-process reloads — solving propagation, not the outage |
| Keep `onChange` with one legal value | Self-documenting at the point of use | A one-value enum invites the reader to think there is a choice, and it is the first thing someone asks to extend |
| Keep the field reserved for a future `reload` | Cheapest forward compatibility | Reserving vocabulary for an undesigned mechanism is what `extensions.nomad` already is in the old tree: a slot annotated `design_only` that no renderer consumes |

## Reversibility
Undo cost today: re-adding a field and a second branch, while nothing depends on
its absence. Becomes irreversible once: never — adding an `onChange` back is a
schema addition with a default, which every consumer tolerates.

## Consequences
- R23 closes, and the propagation guarantee now holds for every Asset rather
  than for those that declared it — paid by nobody, and it fixes the 16 plain
  ConfigMaps by construction.
- Editing an Asset on a stateful Workload is an outage, stated in the chapter, so
  a one-line `postgresql.conf` change is planned rather than discovered — paid by
  whoever edits, knowingly.
- One authored field leaves layer 1, which is the second field this pass has
  deleted rather than specified — paid by nobody, and both were labels.
- `reload` now means exactly one thing in the vocabulary, on secrets, with an
  actor behind it — paid in one glossary line, and it removes the collision R23
  was circling.
- If an image that reloads its own config ever arrives, this decision reopens
  with a real mechanism to point at rather than a value with none — paid then,
  not now.
