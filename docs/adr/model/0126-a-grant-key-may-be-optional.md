---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-29
normative: spec/v1/10-project-intent.md#optional-keys
rests-on: ["0005", "0008"]
---

# A grant's key may be optional, and every reference the render makes to it is then optional

A key of a `kv` grant is required unless it is written
`{name, optional: true}`. The render then makes every reference to it
optional: an optional `secretKeyRef`, and an optional projection for a file
grant. A generated key is
never optional. Settled in
[Every key a grant names is required, so one missing key keeps the Process from starting](https://github.com/JorisJonkers-dev/deploy-kit/issues/696).

## Rests on

Derivation is total ([0005](0005-derivation-is-total.md)). hermes's references
are optional live, so the declaration has to be able to say so. If it cannot,
the render has a value no field reaches.

A read grant covers the whole path ([0008](0008-vault-read-is-per-path.md)).
`keys` grants no access, so marking a key optional cannot widen or narrow what
a Process reads. It only says what happens when the key is missing.

**False if:** a Process holding an optional key were kept from starting because
that key is missing. **Settled by:** a render test, where every reference to an
optional key, in the environment or as a file, renders `optional: true` and a
required key's reference renders nothing extra.

## Why

**One missing key should not stop a Process.** hermes reads seven keys of one
document: model provider keys, MCP tokens and a session cookie. A missing one
only disables the tool it feeds. Each is `optional: true` in fleet-infra. A
required reference to it leaves the pod in `CreateContainerConfigError`
because of a token for a tool nobody is using.

**On the key, not the grant or the reference.** Whether a Process can run
without a value depends on that value, and the key is where the grant already
describes it, as `generate` does. A flag on the whole grant would also make
optional the keys the Process cannot run without. A flag on the secret
reference would split the description across the env file and the project
file, and a file grant has no secret reference to carry it.

**`true` or unsaid.** Required is the default, written as the bare name. So
`optional: false` is not vocabulary, and a required key has only one spelling.

**Never with `generate`.** The Vault policy job writes a generated key before
any Process holding its grant starts
([0101](0101-a-generated-key-is-written-by-the-vault-policy-job.md)), so it is
always there. Saying it might be missing describes nothing that can happen, so
the grammar does not accept the two together. A grant that only reads a key
another grant generates may still list it as optional. That changes nothing,
and refusing it would need a composition check that protects nothing.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A flag on the whole grant | one field per grant | it marks every key of the document as one the Process can miss, including those it needs |
| A flag on the secret reference in the env file | a placeholder grammar change | it splits one key's description across two files, and a file grant has no reference to carry it |
| The flag accepted beside `generate`, and ignored | none | a field that means nothing where it is accepted is a reader's trap |
| Every reference tolerating a missing key by default | none | a Process missing a key it needs would start and fail later, further from the cause |

## Reversibility

Cheap. The key form is additive. Writing a key back as its bare name makes it
required again, and only the `optional` line of its references changes.

## Consequences

- A key is its name, `{name, generate}` or `{name, optional: true}`.
- The resolved grant lists its optional keys, and the kubernetes adapter makes
  each reference to one optional, in the environment and as a file.
- A Process whose every reference is optional starts before its Secret syncs.
  The operator's restart brings the values in once they arrive.
- `E_UNAUTHORISED_SECRET_REFERENCE` and `E_UNBOUND_SECRET_GRANT` treat an
  optional key exactly as a required one.
- Row A6 of RENDER-GAPS.md closes: hermes's seven keys are optional.
