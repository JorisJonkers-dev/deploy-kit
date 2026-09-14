# Negative fixture: `E_DUPLICATE_PROCESS_NAME`

One project file whose two Applications declare the same Process name. Composition
must reject it, **with this error code**.

`intent/agents.yml` holds Applications `agents-api` and `lightrag`, and both call
their process `api`. Nothing about that is exotic (each Application id already
carries the product name, so `api` is what an author reaches for twice), and it
is precisely what the rule forbids: **Process names are unique within a
project**, because the ServiceAccount and the Vault role are the Process name
alone under the project's namespace
([0024](../../../../../docs/adr/model/0024-identity-per-process.md),
[0063](../../../../../docs/adr/model/0063-intent-authored-per-project.md)). Both
Processes here would derive `agents-system.api`, and the second Application's pods
would authenticate as the first Application's principal and receive its grants.

## Why one fragment is enough

`E_DUPLICATE_APPLICATION_ID` needs a union of two fragments to demonstrate, because
ids collide across repositories. This one does not: a project never spans
repositories and one file is the whole project
([0063](../../../../../docs/adr/model/0063-intent-authored-per-project.md)), so every
Process name that must be compared is in this single file. The check runs
where the other identity checks run (the union, [chapter
40](../../../40-composition.md)), and a union of one fragment is still a union.

The fixture is otherwise valid and schema-complete: complete `placement` blocks
with the required `memory` and `cpu`
([0061](../../../../../docs/adr/model/0061-placement-is-hard-dimensions.md)), probes
declared rather than omitted, no secret grants and therefore no env files to
bind. If it tripped a different check on the way in, it would prove that check
can fail and say nothing about Process identity.

## The assertion asserts the code, not the exit status

The compose workflow applies this fixture on every run
([`../../workflows/compose.yml`](../../workflows/compose.yml)) and greps
`E_DUPLICATE_PROCESS_NAME` out of the output. A non-zero exit is not the
assertion: this fixture is one schema slip away from failing for an unrelated
reason, and a step that accepted any failure would keep printing success while
proving nothing about the invariant named on the tin. *Verify the value, not
the command.*

Renaming one of the two Processes is the fix an author would make (`api` to
`lightrag-api`, say), and it is a one-line edit, because a Process is not
independently referencable: `dependsOn` names `{application, surface}`
([0062](../../../../../docs/adr/model/0062-application-is-the-release-unit.md)), so no
other document names either Process.
