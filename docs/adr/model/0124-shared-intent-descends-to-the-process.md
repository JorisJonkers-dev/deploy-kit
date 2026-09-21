---
tier: decision
status: proposed
claim: settled
date: 2026-09-21
normative: spec/v1/10-project-intent.md#shared-intent
rests-on: ["0001", "0009"]
---

# Everything a Process holds may be declared at Project, Application or Process, and a declaration descends to every Process below it

Eight things a Process holds are **Shared Intent**: `secrets`, `env`,
`dependsOn`, `assets`, `writablePaths`, `placement`, `cutover` and
`startupBudget`. Each may be written at the Project header, on an Application, or
on a Process, and a declaration at one level belongs to every Process below it.
The Project and the Application otherwise hold only what defines them: `owner`
and the Application list; `id`, `observability`, `exposure` and the Process list.

Sharing **merges**. Lists extend each other, so an Application holding six grants
beside a sibling holding two is normal and the two they share are written once
above both. Where two levels declare the same thing, the **lowest** declaration
holds, because the lower level is the more specific statement of it. Restating
the same thing **identically** at two levels is duplication and is refused. There
is no removal syntax: a Process that must not hold a shared declaration at all is
evidence it was never shared, and it moves down a level. What each of the eight
means is decided where it already was
([0011](0011-configuration-env-files-per-process.md),
[0012](0012-assets-not-code.md),
[0020](0020-dependency-edges-carry-surface.md),
[0023](0023-grant-unit-is-the-path.md),
[0061](0061-placement-is-hard-dimensions.md),
[0092](0092-writable-paths-are-declared.md)); this fixes only which levels may
declare it and what a level means.

This supersedes [0022](0022-grants-live-on-the-application.md), which fixed the
same rule for `secrets` alone and at two levels rather than three.

## Rests on

A Process's effective declaration of every family is computable from the project
file alone: each of the three levels that may declare one is in that file, and
each family's identity is a function of what the author wrote, a grant's being
its derived read path ([0009](0009-vault-read-is-per-path.md)), which widens by
whole documents rather than by keys. One maintainer authors every file
([0001](0001-estate-scale-and-ownership.md)), so the cost this pays for is
duplication across files nobody else reviews, and the cost it refuses to pay is
an effective set a reader cannot compute by reading.

**False if:** any Process's effective set in the worked estate needs a value the
project file does not hold, a live Secret Store read included. **Settled by:**
lower every worked example, and beside each write the same Processes out by hand
with the shared declarations copied down; the decision falls if one lowered
Process differs from its hand-written twin, or if computing one identity needs a
lookup outside the file.

## Why

The rule already existed for one field and the argument never was about
secrets. `secrets` sat at two levels because sharing was the common case and
duplication was what drifted; every other field on a Process has the same
property and was denied the same relief. The estate shows it. Ten `OTEL_*`
variables are byte-identical across `auth-api`, `agents-api` and
`knowledge-api`; `arch` and `site` are a property of where a *product* runs,
restated per Process; `cutover` is the Application's own release question
([0062](0062-application-is-the-release-unit.md)) answered once per Process by
hand; and a CA bundle mounted into every Process of a project is one Asset
written as many.

**Three levels rather than two, and the project level is the one 0022 refused.**
That refusal was specific and it was about grants: a project-level grant hands
every Application in the file a reader slot on a path it may not need, and a read
grant covers the whole document. That argument survives, and it is now an
argument about the *content* of a shared grant rather than about whether a level
exists: the widening is real, the author who writes it sees the list of
Applications in the same file, and `E_ROLL_AFFECTS_OTHER_READERS` (chapter 40)
computes over the readers of a path whatever level granted it. A level whose
only cost is that an author can be careless with it is a level the model can
have; a level nothing checks is not. Nothing about the other seven families
carries the Vault argument at all.

**Merge, with the lower level winning, and the duplicate refused.** Two rules
are doing different work here and only one of them is about precedence.

Merging is what makes sharing worth having. The estate's Applications do not hold the
same sets: `knowledge`'s two Processes hold six grants between them, of which two
are common. A rule that refused any shared declaration a Process also states
would force every set to be identical or nothing to be shared at all, and the
lists that motivated the whole change would stay duplicated. So lists extend,
and the lower level wins the entries both levels name.

Refusing the **identical** restatement is what keeps the effective set readable
by reading, which is the property the absence of a removal operator was
protecting in [0022](0022-grants-live-on-the-application.md). A lower declaration
that changes nothing is either a copy that will drift from the one above it or an
author who misread the level, and it is the single case where a reader cannot
tell by looking whether a value holds or is shadowed: the two spellings are the
same. Refuse it, and every lower declaration means something, because it always
differs, visibly, from what it replaces.

**This is not the `overrides` field** [0031](0031-derived-overrides-with-reason.md)
deleted. That field was a second declaring site for a value the model *derives*,
and `replicas: {count, reason}` stays its sole exception. Nothing here overrides
a derived value: a lower level of Shared Intent is the same authored field,
written at the level it belongs to, in the vocabulary it already has. There is no
`overrides` key, no exception map, no reason string and no second spelling of
anything.

**`placement` is shared, and a quantity is not.** `arch`, `site`, `disk`, `gpu`
and `capabilities` describe the node a pod needs and are naturally a product's
property. `memory` and `cpu` are per container: eligibility sums them across the
Process and its sidecars ([0061](0061-placement-is-hard-dimensions.md)), so a
shared quantity would be a number added once per Process and meaning something
different each time. They are refused above the Process, and required on it.

**The levels are an access boundary only for `secrets`, and only because
identity is per Process** ([0024](0024-identity-per-process.md)). That was
already the load-bearing sentence of
[0022](0022-grants-live-on-the-application.md) and nothing here changes it: a
project-level grant reaches three principals because three Processes hold it,
not because a project is a principal. There is no project ServiceAccount and no
project Vault role.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep two levels, and keep them for `secrets` only | every other family stays duplicated per Process: ten `OTEL_*` lines three times, `arch` and `site` per Process, `cutover` answered by hand for each member of a release unit | the argument for sharing was never about secrets, and refusing it elsewhere is refusing it for no reason anyone wrote down |
| Refuse every declaration a level above already made, identical or not | either every Application in a project holds an identical set of each family or nothing may be shared: `knowledge`'s two Processes, six grants with two in common, cannot express themselves at all | it refuses the merge that the whole change exists for, to buy a readability property that only the identical case actually threatens |
| Merge, and accept the identical restatement silently | a Process block that restates the value above it reads exactly like one that replaces it, so whether a declaration does anything takes comparing it with two other levels | this is the one case where a reader cannot tell by looking, which is the case worth a diagnostic |
| Three levels with a removal or subtract syntax | exceptions accumulate as subtractions, and the effective set can only be computed, never read | the same reason [0022](0022-grants-live-on-the-application.md) refused it for grants: an exception is evidence the thing was never shared |
| Share every Process field, `image` and `probes` included | an image shared across Processes is one Process; a probe path shared across Processes asserts two programs answer the same URL | the eight are the fields whose value is a property of the product or the project; the rest identify the Process itself |
| A separate document per shared level | a third and fourth file per project, keyed by a name that drifts, and a reviewer reading four files to answer what one pod holds | the same join-key objection [0022](0022-grants-live-on-the-application.md) raised against `SecretAccess`, now four times over |

## Reversibility

Undo cost today: each family is one optional declaration at two extra levels
and one union in the lowering, so collapsing back to Process-only is a schema
edit, a lowering edit, and a mechanical rewrite that pushes every shared
declaration down into the Processes that hold it. That rewrite is exactly what
the lowering already computes
([0125](0125-the-effective-intent-is-a-lowering.md)), so the mechanical part is
a render away: hours. Becomes irreversible once: Vault policies are cut per
Process from project-level grants and live credentials exist under paths only
some Processes hold, at which point flattening either widens a live grant or
forces re-issue.

## Consequences

- A shared declaration is held by every Process below it, including ones added later, so adding a Process silently widens what that Process holds unless the author moves the declaration down, paid by the project author and, for `secrets`, by every other reader of the path.
- A lower declaration replaces the one above it, so moving a declaration up and forgetting to delete the copy below is a diagnostic naming both rather than a silent no-op, paid by the author, who has to make the two edits together.
- A lower declaration that differs is accepted with no reason string and no record of what it replaced, so the only trace that a Process departs from its Application is the two declarations themselves, paid by a reviewer, who reads both.
- A reviewer reading one Process block under-counts what it holds at three levels instead of two, so the effective set has to be printable for review to be honest, paid by the compiler ([0125](0125-the-effective-intent-is-a-lowering.md) is what prints it).
- `memory` and `cpu` stay per Process while the rest of `placement` may be shared, so `placement` is the one family whose refusal rule is about which keys were written rather than about a collision, paid by the schema, which carries one block whose legal keys depend on its level.
- The project header stops being a one-field header, so the claim that `owner` is the only field raised to the project is retired, paid by [0063](0063-intent-authored-per-project.md), which is amended rather than superseded: intent is still authored one file per project.
