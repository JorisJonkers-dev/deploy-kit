---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/14-platform-intent.md#there-is-nothing-to-override-here
rests-on: ["0005"]
---

# An authored value names a model concept, and the target's spelling is a derivation

Every value a human writes in either authored document names what it means in
the model. One table in the adapter that renders it maps that name to the
target's field. A tier declares `audiences`, `listener`, `certificates` and
`forwardAuth`, and the `traefik` adapter maps `listener: tls` to an entryPoint.
An engine names an image whose entrypoint performs the backup. Substrate facts
are named for what the model reads (`secretsEncryption`,
`networkPolicyController`, `datastore`), never as the k3s flag that sets them.
Probe cadence and ephemeral storage are `period`, `timeout`, `failures` and
`size`, carried as Durations and quantities. The Resolved Deployment's own keys
follow the same rule.

## Rests on

Every value a human writes can be named for what it means in the model, and
mapping that name to the substrate's field is a derivation with one declaring
site ([0005](0005-derivation-is-total.md)).

**False if:** an authored value exists whose only faithful name is the
target's, a knob with no model-level meaning that an Application still needs to
turn. **Settled by:** a grep of both authored kinds and of the Resolved
Deployment's keys for Kubernetes field paths, Traefik keys, Linux shell and k3s
flags returning nothing, with every rendered object byte-identical to before
([#42](https://github.com/JorisJonkers-dev/deploy-kit/issues/42)).

## Why

**The target's vocabulary leaked in five places, each correct in isolation.** A
tier was written in Traefik's words (`entryPoint: websecure`, `certResolver`),
so the substrate-swap argument chapter 00 makes for layer 1 stopped holding for
the platform half. An engine carried a shell command beside its image, which is
the `backup.sh` Asset [0014](0014-file-shaped-configuration-is-an-asset.md)
refuses, one document over. The substrate block carried k3s CLI flags, so a flag
rename was a schema break. The Platform document's probe and ephemeral blocks
used `periodSeconds`, `timeoutSeconds`, `failureThreshold` and `sizeLimit`. A
derived-value override addressed the Kubernetes field it set. Each was the same
defect: the interface a human writes to was the target's vocabulary.

**One table per adapter.** A second edge implementation reads the same four tier
facts, and a tier says what the edge does rather than how one product spells it.
The method is the image: versioned and digested, never a string in YAML.

**The kernel is not the substrate.** A Linux capability name is what a binary
asks the kernel for, the same kind of fact as a port or a writable path, and it
would be the same word on Nomad or bare metal. The layer-1 rule excludes the
substrate's mechanisms, not the kernel's.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Author the Kubernetes field path | unambiguous, no table | layer 1 stops being substrate-free, and an author can set a field no derivation produced |
| Accept a model name or a field path | flexible | two vocabularies for one act |
| Keep Traefik's tier fields, documented | clear to whoever runs Traefik | a product's grammar in an authored document |
| Image plus command in a methods lock | commands stay inspectable | a second lock for what the entrypoint already says |
| Friendly names for kernel capabilities | reads as intent | an invented taxonomy over a closed set that already has names |

## Reversibility

Undo cost today: the mapping tables are small and the authored files few.
Becomes irreversible once: repositories author against the model names, because
reverting to target spellings then breaks every one of them.

## Consequences

- The `traefik` adapter owns every Traefik spelling in the estate, which makes
  an edge swap a one-adapter change, paid in one table inside the adapter.
- Each engine needs a purpose-built image in the estate's registry before its
  backup renders, paid by the platform once per engine.
- `replicas` names local capacity, never `spec.replicas`
  ([0022](0022-a-derived-value-has-one-declaring-site.md)).
