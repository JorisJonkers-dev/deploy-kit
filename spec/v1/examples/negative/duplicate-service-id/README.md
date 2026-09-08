# Negative fixture — `E_DUPLICATE_SERVICE_ID`

Two Intent Fragments declaring the same Service Id. Composition must reject
this union, **with this error code**.

Each fragment is one domain file — `intent-a/knowledge.yml` and
`intent-b/agents.yml` — because Intent is authored one file per domain and one
file is one Intent Fragment
([0063](../../../../../docs/adr/model/0063-intent-authored-per-domain.md)). The two
declare different domains and the same `id`, which is the case the invariant
exists for: the namespace derives from `domain`, so nothing would collide at
apply, while every `dependsOn: {service: knowledge, …}` edge in the estate
becomes ambiguous. Identity is flat and estate-unique
([0010](../../../../../docs/adr/model/0010-flat-service-identity.md)); the domain
header does not namespace it.

Each fragment is otherwise valid and schema-complete, so the union reaches the
identity check rather than failing earlier for an unrelated reason. That is
load-bearing: a fixture rejected by `E_SCHEMA_VERSION_MISMATCH` on the way in
proves the version check can fail and says nothing about identity. It is why
both Workloads carry a complete `placement` block — `memory` and `cpu` are
required on every Workload
([0061](../../../../../docs/adr/model/0061-placement-is-hard-dimensions.md)), so a
fixture missing them would trip schema validation first.

## The assertion asserts the code, not the exit status

The compose workflow applies this fixture on every run
([`../../workflows/compose.yml`](../../workflows/compose.yml)) and greps the
error code out of the output. A step that accepted any non-zero exit was the
same defect the fixture exists to catch, one level up: the estate's proof that
its identity invariant can fail would quietly have become a proof that
something else can fail, and nobody would be told the difference.

The estate agent contract puts it as *"verify the value, not the command"* — an
exit code is not evidence that a consumer saw what you intended. An assertion
that silently stopped running looks identical to one that passes, which is how
`E_ROUTE_AUTH_MODE_NOT_IN_TIER` came to be implemented, error-coded, and
vacuous for three of four routed services.

One negative fixture per invariant is the target. This is the first; the second
is [`../duplicate-workload-name/`](../duplicate-workload-name/), which asserts
`E_DUPLICATE_WORKLOAD_NAME` over a single domain file.
