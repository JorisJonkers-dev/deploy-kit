---
tier: decision
status: proposed
claim: settled
date: 2026-09-08
normative: spec/v1/14-platform-intent.md#there-is-nothing-to-override-here
rests-on: ["0005"]
---

# An authored value names a model concept; the target's spelling is a derivation

## Rests on
Every value a human writes in either authored document can be named for what it
means in the model, and mapping that name to the substrate's field is a
derivation with one declaring site. False if: an authored value exists whose only
faithful name is the target's, a knob with no model-level meaning that a
Service nevertheless needs to turn. Settled by: a grep of both authored kinds
for Kubernetes field paths, Traefik keys, Linux shell and k3s flags returning
nothing, with every rendered object still byte-identical to before.

## Why
The layer-1 rule says no mechanisms, and five places broke it quietly, each
correct in isolation. An override addressed the **Kubernetes field**
(`field: progressDeadlineSeconds`), so a target rename breaks an authored
document and an author can address a field no derivation produced. A tier was
written in **Traefik's words** (`entryPoint: websecure`, `certResolver`), so the
substrate-swap argument chapter 00 makes for layer 1 stopped holding for the
platform half. An engine carried a **shell command** and an image, which is the
`backup.sh` Asset [0012](0012-assets-not-code.md) refuses, moved one document
over. The substrate block carried **k3s CLI flags**, so a flag rename was a
schema break. Each is the same defect: the interface a human writes to was the
target's vocabulary.

The repair is the same everywhere: the authored value names the **model
concept**, and one table maps it to the target.

**Overrides** addressed derived values by the derivation's own name, `startupDeadline`, `replicas`, `automountToken`, `ephemeralSize`, enumerated in
chapter 14 with the field each renders to. An author overrode a decision, not a
field, and a key no derivation produced was `E_UNKNOWN_OVERRIDE` rather than a
field silently set.

> **Amended 2026-09-10.** The override mechanism is **deleted**
> ([0031](0031-derived-overrides-with-reason.md)); chapter 14's table is gone
> and `E_UNKNOWN_OVERRIDE` with it. The naming rule this paragraph records is
> **unchanged and now applies to the sole survivor**: `replicas` names a model
> concept (local capacity) and never `spec.replicas`, and its `reason` is
> required by the field rather than by a convention
> ([chapter 10](../../../spec/v1/10-service-intent.md#capacity)). The general
> argument is also unchanged: an authored value names what it means, and the
> target's spelling is a derivation.

**Tiers** declare four edge facts: `audiences`, `listener`, `certificates`,
`forwardAuth`. The `traefik` adapter maps `listener: tls` to an entryPoint and
`certificates: acme` to a resolver. A second edge implementation reads the same
four facts, and a tier says what the edge does rather than how one product spells
it.

**Engines** name an image. The method *is* the image: one purpose-built image
per engine whose entrypoint performs the backup, resolved through the images lock
and digested like every other image. The Platform document contains nothing
executable, and what the image does is versioned rather than a string in YAML.

**Substrate facts** are named for what they are, `secretsEncryption`,
`networkPolicyController`, `datastore`, because those are what the model reads
([0028](0028-secrets-at-rest-gate.md), [0084](0084-render-only-is-the-v1-policy-stage.md),
[0057](0057-datastore-and-restore.md)). How k3s is told is a derivation nobody
authors, or an observation 0057 already lets the platform record.

One thing that looks like a leak is not, and is kept on purpose:
a Linux capability name, back when a hardening exception could still carry one.
A capability is what the binary asks the kernel for, the same kind of fact as a
port or a writable path, and it would be the same word on Nomad or bare metal.
The layer-1 rule excludes the substrate's mechanisms, and the kernel is not the
substrate. The example is now historical ([0016](0016-pod-hardening.md) deleted
the field that named it) but the test it illustrates still decides the next
case.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Overrides address the Kubernetes field path | Unambiguous, no table | Every override is target-shaped, layer 1 stops being substrate-free, and an author can set a field no derivation produced |
| Accept either a model name or a field path | Flexible | Two vocabularies for one act, and the field-path arm carries every problem of the first row |
| Keep Traefik's tier fields, documented | Unambiguous to whoever operates Traefik | A product's configuration grammar in an authored document; the swap argument fails for the platform half |
| Image plus command in a methods lock | Commands stay inspectable and out of the DSL | A second lock for a distinction the image's entrypoint already makes, and the shell string still exists somewhere the render reads |
| Friendly names for capabilities | Reads as intent | A taxonomy over a closed set that already has stable names, with an invented word at the first gap |

## Reversibility
Undo cost today: the mapping tables are small and the authored files few; every
one of these fields is a week old. Becomes irreversible once: repositories
author overrides by model name, because reverting to field paths would break
every one of them.

## Consequences
- 0031 is amended: an override restates a *derivation*, addressed by its name in
  chapter 14's table, paid in one amendment and one table to keep current.
- 0076 and 0077 are amended for the tier and engine shapes, paid in two
  amendments; neither had a consumer yet.
- The `traefik` adapter owns every Traefik spelling in the estate, which is
  what makes an edge swap a one-adapter change, paid in one more table inside
  the adapter, where mechanisms belong.
- Each engine needs a purpose-built image in the estate's registry before its
  backup renders, paid by the platform, once per engine, and the images become
  versioned artefacts instead of strings.
- The exception vocabulary is recorded as deliberately kept, so the next
  architecture review does not re-raise it, paid in one paragraph.
