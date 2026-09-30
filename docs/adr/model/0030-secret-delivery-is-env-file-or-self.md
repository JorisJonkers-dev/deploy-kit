---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/10-project-intent.md#delivery
rests-on: ["0002", "0006", "0008"]
---

# Secret delivery is env, file or self, an env placeholder byte-matches a kv grant's path, and env and file need secrets at rest

A secret reaches a Process by one of three deliveries, a property of the
consumer, not of the secret. `env` renders a VSO sync and a Secret, bound to the
variables the Process's env file names by `${secret:<path>#<key>}`
placeholders. `file` renders a projected file at `mountAt` with `fileMode`.
`self` renders a Vault policy and a Kubernetes auth role, and the application's
own client reads the value; nothing is injected. In all three the policy derives
from the granted path ([0028](0028-grant-unit-is-the-path.md)).

A placeholder's path byte-matches a `kv` grant's path, as the author wrote it:
no mount rewrite, no engine taxonomy. The `#<key>` half selects a value and
confers nothing. `env` and `file` persist a Kubernetes Secret, so both are
refused with `E_SECRETS_AT_REST_REQUIRED` unless the Platform document records
`secretsEncryption: true`
([chapter 60](../../../spec/v1/60-setup.md#secrets-at-rest)).

## Rests on

Every secret this estate consumes arrives by one of the three mechanisms, and a
pod's environment is fixed for its lifetime
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)). A read covers its
whole path ([0008](0008-vault-read-is-per-path.md)), so the path is the join
key. The composer compares strings from pinned inputs and never reads live Vault
([0006](0006-pinned-inputs.md)). With `--secrets-encryption` enabled on the
pinned k3s version, a Secret written afterwards is ciphertext in the datastore.

**False if:** a live consumer's credential arrives by none of the three, a
grantable path contains `#`, or a Secret created after enabling encryption is
recoverable from the datastore file. **Settled by:** every `agent-inject`,
`secretKeyRef` and `VAULT_` hit under `cluster/` classified as env, file or
self; the refusal fixtures `secrets-at-rest-required` and
`secrets-at-rest-required-at-header`; and, owned by joris, `kubectl create
secret generic canary --from-literal=k=<sentinel>` with `sudo strings <datastore
file> | grep <sentinel>` returning nothing while the Secret still reads.

## Why

**`self` and `file` are not edge cases.** `auth-api` already reads its
credentials through spring-cloud-vault, the only delivery that rotates without a
restart. An SSH deploy key cannot be an environment variable and is projected at
`0400` today. That same fixed-environment fact makes `delivery: env` with
`rotation.tolerates: reload` `E_ENV_CANNOT_RELOAD`. Delivery also feeds the
rollout: restart targets derive from `rotation.tolerates`, never hand-declared.

**Byte equality removes a transform nobody specified.** Grants were written
`secret/data/platform/postgres` and placeholders `platform/postgres`, with an
unwritten rewrite stripping the mount and `data/`. It did not generalise: a
`transit/keys/...` path has no `data/` segment, and a rule dropping two segments
could be satisfied by a grant the author never intended.
`E_UNAUTHORISED_SECRET_REFERENCE` is the only build-time grant boundary, so it
must compare exactly. Only a `kv` grant can be `env`
([0029](0029-a-grant-is-a-union-on-engine.md)), so only a `kv` path is ever
named.

**Shipping `env` before encryption is a regression.** The Vault Agent Injector
path being replaced never touched etcd; a Kubernetes Secret is plaintext base64
there and in every backup. The item was written three times as a checklist line
with no owner, so it is a mechanical gate on a pinned fact instead.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| `env` only | `auth-api` loses restart-free rotation; the deploy key needs a shim | falsified by two live consumers |
| The Vault Agent Injector as a fourth delivery | a templating sidecar per pod | it renders a file, so it is `file` by another means |
| Specify the mount-strip rule | a rewrite table per engine in the composer | re-encodes Vault's layout to save twelve characters, and was satisfiable by the wrong grant |
| A per-Application alias as the join key | a second name-space | a join key that drifts when renamed on one side |
| Ship `env` now with a checklist line | plaintext Secrets and backups until the flag lands | three checklist lines produced no owner and no date |
| `self` only until encryption lands | every consumer must speak Vault | the estate's most common delivery becomes inexpressible |

## Reversibility

Undo cost today: three render branches, one string comparison and one gate:
hours. Becomes irreversible once: Secrets exist in the datastore under
encryption and rotations have replaced the plaintext copies, because relaxing
the gate then invites a plaintext Secret back.

## Consequences

- Every author of an env placeholder writes the full grant path, paid in a few
  characters per line.
- A cluster without `secretsEncryption: true` renders no `env` or `file`
  delivery at all, paid by joris in the one pre-apply step that enables it.
- Rotating a value already written as plaintext needs a re-encrypt pass and a
  rotation, paid once, when the flag lands.
