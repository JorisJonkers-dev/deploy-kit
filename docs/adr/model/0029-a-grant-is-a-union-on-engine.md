---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/10-project-intent.md#secrets
rests-on: ["0002", "0008"]
---

# A grant is a discriminated union on engine that derives a read path and a policy, and only a kv grant is projected

A grant names its Secret Store engine. A `kv` grant names a path, keys and an
access tier; a `database` grant names a role; a `transit` grant names a key and
a closed set of operations. Every grant derives a read path: for `kv` the path
the author wrote (whose read also covers its `secret/metadata/<path>` sibling),
for `database` `database/creds/<role>`, for `transit` one path per operation.
The derived Vault policy names exactly those paths. A `kv` grant's access tier
(`read`, `self-renew`, `self-roll`, `custody`) derives its least-privilege
capability set. Only a `kv` grant is projected into an environment or a file; a
`database` or `transit` grant takes `delivery: self`, and anything else is
`E_NON_KV_DELIVERY` ([chapter 10](../../../spec/v1/10-project-intent.md#delivery)).

## Rests on

A pod's environment is fixed when its container starts
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)), so a projected
value cannot change while the process runs. A KV-v2 read covers the whole
document at its path ([0008](0008-vault-read-is-per-path.md)), so the path is
what a policy grants and what a placeholder names.

**False if:** either implementation accepts a `database` or `transit` grant
delivered by `env` or `file`, a Process needs a capability set no tier derives,
or a reader must hold a document's values while being denied its version
history. **Settled by:** the refusal fixture
`spec/v1/examples/refusals/non-kv-delivery.project.yml` (a `transit` grant), a
`refusals/non-kv-delivery-database.project.yml` fixture (to be written, owned by
joris), and every hand-written Vault policy under
`cluster/flux/apps/data/vault/` classified into a tier and diffed against the
derived one.

## Why

**Three engines authorise different operations.** Each maps to Vault paths by
lookup, so the policy derivation is a table, not a translation, and the declared
thing and the readable thing cannot differ.

**The tiers are read off production.** The metrics token job already separated
renewal (no privilege needed: a token may renew itself) from minting (the only
reason it has an identity). A single read/write axis cannot say that.
`self-roll` derives `patch`, never `update`, because `patch` rotates one key
without reading the rest of the document. `custody` is a prefix grant, because
`agents-api` creates secrets at runtime under paths nobody can enumerate at
render time; so `custody` with `env` or `file`, and `self-renew` with `env`, are
refused ([0030](0030-secret-delivery-is-env-file-or-self.md)).

**A read covers its metadata sibling.** KV-v2 splits one document across a data
path and a metadata path. Denying a reader its own document's version list
protects nothing and makes a rotation unauditable. One declaration derives both
stanzas; soft-delete stays out, because deleting a version is a write.

**Only a stored value can be projected.** The database engine mints a credential
per lease with an expiry; the transit engine never releases its key. An
environment variable would hold a credential that expires before the pod does,
and a file would persist a live credential as a Kubernetes Secret. So a non-KV
grant is delivered by the application itself, and the delivery matrix stays a KV
matrix.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One grant shape for every engine | a single schema | the policy derivation becomes a translation per engine |
| A read/write axis instead of tiers | fewer values | grants privilege a self-renewer does not need |
| Declare metadata access explicitly | nothing granted unasked | two declarations per document, the second's absence a runtime denial |
| Allow `env` and `file` for a `database` grant | one more legal cell | an expiring credential held for the pod's lifetime, or a live one persisted |
| A placeholder syntax per engine | the engine visible in the env file | three joins for cases no legal grant produces |

## Reversibility

Undo cost today: the union, the tier table and the refusal are one schema block
and one derivation table in each implementation: a day. Becomes irreversible
once: a derived policy grants a live Process access through a non-KV arm,
because collapsing the union then revokes privilege something depends on.

## Consequences

- An application reading a database or transit credential fetches it through
  its own Secret Store client, paid in that application's client configuration
  ([0013](0013-configuration-is-dotenv-at-three-scopes.md)).
- A `custody` holder's policy is a prefix, the widest grant in the estate,
  visible in the derived policy rather than in memory.
- The `database` refusal fixture is to be written, in both implementations and
  the committed refusals, owned by joris.
