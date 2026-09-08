---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#secrets
rests-on: ["0009"]
---

# A grant is a discriminated union on engine, and every grant derives a read path

## Rests on
The estate uses three Secret Store engines, they authorise different operations,
and each declaration derives exactly one set of read paths. False if: an engine
the estate needs cannot be expressed as a closed set of operations over a named
object — a store whose privilege is not path-shaped. Settled by: rendering the
estate's grants and finding every one of them, KV and non-KV, covered by a
derived policy stanza that names the path the credential is actually read from.

## Why
Three gap rows are one defect. `self-roll` derives `patch`, and `patch` on a
transit key permits neither `transit/keys/<name>/rotate` nor
`transit/sign/<name>` — which is what `auth-api`'s live JWT key needs (R19). A
dynamic database credential is granted at a KV path while the engine issues it at
`database/creds/<role>`, which no grant declares and no policy covers (R20). And
a KV-v2 reader cannot reach its own document's `metadata` sibling (R21).

The common cause is that the grant has one shape and the four access tiers are
**KV intents** wearing the name of a general privilege vocabulary. `read`,
`self-renew`, `self-roll` and `custody` were derived from what KV-v2 does; over
`transit` each cell of that table is a guess, and over the database engine there
is no capability to choose at all because the engine mints the credential.

So `engine` becomes the discriminator, defaulting to `kv` so that every grant
already written stays valid. A `kv` grant keeps its path, keys and access tier
untouched. A `database` grant names a **role** and takes no tier. A `transit`
grant names a **key** and a closed set of `operations` — `sign`, `verify`,
`encrypt`, `decrypt`, `rotate` — each mapping to exactly one Vault path, so the
policy derivation is a lookup rather than a translation. Declaring raw Vault
capabilities was the alternative and it is a mechanism in layer 1; the whole
point of [0025](0025-access-tiers-derive-policy.md) is that the author states
intent and the platform makes the least-privilege choice once.

The second half is what actually closes R20. **Every grant derives a read
path**, and [0027](0027-secret-reference-join-key.md)'s join key becomes that
derived path rather than the declared one. For `kv` the two strings are
identical, so nothing about today's placeholders or today's byte-equality check
changes. For `database` it is `database/creds/<role>`. One rule covers every
engine, the property 0027 rests on — byte equality, no mount rewrite, no engine
taxonomy inside the comparison — survives intact, and the declared-versus-readable
mismatch disappears because both sides name the same derived value.

A per-engine placeholder syntax would have worked and cost three joins to
implement and three rules to validate. Byte equality over one derived string is
the version that stays checkable.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| One shape plus a `mount` field | Smallest schema change; the byte-match rule survives untouched | Does not fix R19: transit still needs `rotate` or `sign` and no access tier derives either, so the tier table stays wrong for the engine it is already wrong for |
| Keep the access tiers and map them per engine | One vocabulary to learn; privilege decided in one table | The mapping is a guess per cell — does `read` mean `decrypt` or `verify` — and the estate has already been bitten by one self-contradicting tier table |
| Declare Vault capabilities directly | Nothing to derive | Capabilities are a mechanism, which layer 1 excludes, and it discards the least-privilege choice 0025 exists to make |
| KV only; non-KV access becomes an unmanaged surface | No new vocabulary, honest about scope | Both engines the estate actually uses beyond KV would sit outside the model — a live transit key and, after 0080, every database credential |
| A per-engine placeholder syntax | The engine is visible in the env file | Three joins and three validation rules where one derived string does |

## Reversibility
Undo cost today: the union collapses back to its `kv` arm by deleting two arms
and the derived-path table — hours, and `engine` defaults to `kv` so no existing
document changes either way. Becomes irreversible once: a derived policy grants
a live workload access through a non-KV arm, because collapsing the union would
then revoke privilege something depends on.

## Consequences
- R19, R20 and R21 close together, and 0080's database catalog becomes
  renderable — paid by nobody; it is the unblocking this decision exists for.
- The access-tier table is now explicitly KV-only, so a future engine needs its
  own operations vocabulary rather than a mapping — paid by whoever adds one,
  and it is the honest price of not guessing.
- `E_NON_KV_DELIVERY` narrows to `transit`: a `database` grant may be delivered
  by `env` or `file`, because `vso` projects a dynamic secret exactly as it
  projects a static one — paid in one more legal cell in the delivery matrix.
- The grant schema gains two arms, so the JSON Schema grows a discriminated
  union and an editor narrows completions once `engine` is set — paid in schema
  surface, and it is what makes the union worth having for an author.
- A reader of an env file now has to know that a `database/creds/...` placeholder
  is a dynamic credential, since the syntax does not say so — paid in one
  convention, and the alternative was three syntaxes.
