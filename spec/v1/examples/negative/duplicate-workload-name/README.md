# Negative fixture: `E_DUPLICATE_WORKLOAD_NAME`

One domain file whose two Services declare the same Workload name. Composition
must reject it, **with this error code**.

`intent/agents.yml` holds Services `agents-api` and `lightrag`, and both call
their process `api`. Nothing about that is exotic (each Service id already
carries the product name, so `api` is what an author reaches for twice), and it
is precisely what the rule forbids: **Workload names are unique within a
domain**, because the ServiceAccount and the Vault role are the Workload name
alone under the domain's namespace
([0024](../../../../../docs/adr/model/0024-identity-per-workload.md),
[0063](../../../../../docs/adr/model/0063-intent-authored-per-domain.md)). Both
Workloads here would derive `agents-system.api`, and the second Service's pods
would authenticate as the first Service's principal and receive its grants.

## Why one fragment is enough

`E_DUPLICATE_SERVICE_ID` needs a union of two fragments to demonstrate, because
ids collide across repositories. This one does not: a domain never spans
repositories and one file is the whole domain
([0063](../../../../../docs/adr/model/0063-intent-authored-per-domain.md)), so every
Workload name that must be compared is in this single file. The check runs
where the other identity checks run (the union, [chapter
40](../../../40-composition.md)), and a union of one fragment is still a union.

The fixture is otherwise valid and schema-complete: complete `placement` blocks
with the required `memory` and `cpu`
([0061](../../../../../docs/adr/model/0061-placement-is-hard-dimensions.md)), probes
declared rather than omitted, no secret grants and therefore no env files to
bind. If it tripped a different check on the way in, it would prove that check
can fail and say nothing about Workload identity.

## The assertion asserts the code, not the exit status

The compose workflow applies this fixture on every run
([`../../workflows/compose.yml`](../../workflows/compose.yml)) and greps
`E_DUPLICATE_WORKLOAD_NAME` out of the output. A non-zero exit is not the
assertion: this fixture is one schema slip away from failing for an unrelated
reason, and a step that accepted any failure would keep printing success while
proving nothing about the invariant named on the tin. *Verify the value, not
the command.*

Renaming one of the two Workloads is the fix an author would make (`api` to
`lightrag-api`, say), and it is a one-line edit, because a Workload is not
independently referencable: `dependsOn` names `{service, surface}`
([0062](../../../../../docs/adr/model/0062-service-is-the-release-unit.md)), so no
other document names either Workload.
