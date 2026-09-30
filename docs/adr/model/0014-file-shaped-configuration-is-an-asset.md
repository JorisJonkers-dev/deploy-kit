---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/10-project-intent.md#assets
rests-on: ["0005"]
---

# File-shaped configuration is an Asset: static text with named placeholders, never code, content-hashed so a change restarts the Process

An Asset is a declarative settings file in the consuming application's own
format, optionally threaded with the same named placeholders env files use
([0013](0013-configuration-is-dotenv-at-three-scopes.md)), never a template
language. An executable Asset is a build error. A derived catalog is not an
Asset: it renders as a Deliverable. Every Asset renders under a content-hashed
object name, so a change restarts the Process that mounts it. There is no
`onChange` field.

## Rests on

[0005](0005-derivation-is-total.md), applied to files: every file-shaped
configuration in the estate is expressible as static text with named
placeholders whose sources are declared. And no image in this estate reloads
its own configuration file without being told, so restart is the only
propagation mechanism that exists.

**False if:** a configuration file needs more than placeholder substitution to
produce (a conditional, a loop, a computed value), or an image the estate runs
applies a changed file in place. **Settled by:** the ConfigMap census
(`kubectl get configmap -A -o yaml`), each data key classified as fixed, derived
catalog or mixed, and every rendered Asset carrying a content-hashed name with
the restart visible in the pod template's diff.

## Why

**Eighteen ConfigMaps were three unrelated things.** Six fixed files with no
derived value (`postgresql.conf`, `enabled_plugins`, `cors.ini`, `gatus`'s
config and others). Five derived catalogs, which are Deliverables:
`postgres-init-script` creates one database per consumer, which the dependency
graph already knows. Seven mixed files, a static body with a few derived lines:
`rabbitmq.conf` has one derived line in twenty-four, another application's
hostname. The Asset covers the first and third classes.

**Scripts are code.** `hermes-bootstrap` (221 lines of shell) and `n8n-hooks`
(499 lines of JavaScript) ran from ConfigMaps on `alpine:3.21`: first-party code
with no image, no tests and no version. That belongs in an image, and the
boundary is mechanical: an Asset may not be executable.

**Propagation is a property, not a promise.** 16 of the 18 ConfigMaps were
plain, so an edit applied and never reached the pod. A content-hashed name
fixes that for every Asset. A `reload` value had no mechanism: Kubernetes has no
primitive that reloads a process, no image here watches its file, and signalling
a container would need API access the model refuses
([0041](0041-no-process-rbac-in-v1.md)). A one-value field is a label, so the
field is gone.

**The cost is stated.** A stateful Process runs one replica with `Recreate`
([0021](0021-runtime-mechanics-derive-from-cutover.md)), so editing one line of
`postgresql.conf` restarts the database. An author who needs it cheaper needs a
mechanism, not a field.

`reload` survives only as `rotation.tolerates: reload` on a secret, where the
client library is the actor ([0030](0030-secret-delivery-is-env-file-or-self.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Bake fixed files into images | a derived image, pipeline and Renovate rule per application | all of these run third-party images; a derived hostname would make a route change an image rebuild |
| Admit executable Assets | unversioned, untested first-party code stays invisible to CI | code without an image is the defect |
| A template language for Assets | conditionals make an Asset a program nobody validates | substitution stays named placeholders, shared with env files |
| A Job running the engine's reload command | a derived object, a catalog entry and a credential path | buys one avoided restart per config edit |
| A reloader operator | off the shelf | an operator the substrate does not run, which restarts anyway |

## Reversibility

Undo cost today: `assets` is a short per-Process list; dropping the boundary is
one chapter section and the intent files that carry Assets: hours. Becomes
irreversible once: the code-shaped ConfigMaps are replaced by first-party
images, because reverting re-creates the unversioned state.

## Consequences

- Fixed and mixed files are authored as Assets, derived lines as placeholders,
  paid by each owning Project repository once.
- Derived catalogs render as Deliverables, paid by the adapters.
- `hermes-bootstrap` and `n8n-hooks` need first-party images before the render
  can reproduce the current cluster, paid by their owners.
- Assets are not validated by the platform: a malformed `postgresql.conf`
  renders and fails at runtime, paid by the application owner.
- An Asset edit on a stateful Process is a planned outage, paid by whoever
  edits, knowingly.
