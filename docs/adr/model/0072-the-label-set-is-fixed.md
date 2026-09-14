---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-project-intent.md#the-label-set
rests-on: ["0005"]
---

# The object label set is fixed, and two of its labels are immutable

> **Amended 2026-09-14.** Vocabulary renamed by
> [0116](0116-project-application-process.md): Domain is now Project,
> Service is Application, Workload is Process, and Service Intent is Project
> Intent. The decision is unchanged.

## Rests on
Five labels are enough for everything the estate selects on, and no authored
field needs to reach the label set. False if: something must select objects by a
dimension no label carries (a tier, an audience, a release channel), and cannot
read it from the Resolved Deployment instead. Settled by: rendering the estate
with this set and finding no selector, no ServiceMonitor and no NetworkPolicy
that needs a label it does not have.

## Why
The label set was never written down. It is emitted by a renderer, so it exists
only as behaviour, and two of the labels it emits are a Deployment's
`selector.matchLabels`. A selector is **immutable on a live object**: changing
the convention later is not a re-render but delete-and-recreate on every
process in the estate, with the downtime that implies for a stateful Process
on a `local-path` volume. A convention with that property has to be a decision.

`part-of` carrying the Application Id is the part with a consumer. An Application is the
Release Unit ([0062](0062-application-is-the-release-unit.md)) and whatever performs
a switchover has to select its members; `part-of` is what makes them selectable.
It is deliberately **not** a selector, because an Application gaining or losing a
Process must not require recreating the ones that stayed.

`name` and `instance` both carry the Process name, which reads oddly and is
correct. The selector must match exactly one controller's pods, and a `name`
naming the Application would make every Process of a multi-Process Application
ambiguous the moment anything selected on `name` alone: `auth` has two, so this
is not hypothetical.

There is no `version`. It could only come from the images lock, so it would
change on every bump, for a value no selector may use and that the image digest
already states on the object.

An estate-scoped Deliverable carries `managed-by` only. It belongs to no
Process and no Application, and `part-of` on the Gatus endpoints ConfigMap would
name an Application that does not own it.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Leave the set to the renderer | Nothing to specify; behaviour unchanged | Two of the labels are immutable selectors, so the convention is a one-way door being held open by nobody's decision |
| Let a Process add labels | Authors can tag for their own tooling | A label is a selector surface; an authored label can collide with a derived one, and anything worth selecting on is a model concept that should be named |
| `name` = Application, `instance` = Process | Reads the way the upstream convention intends | Makes every Process of a two-Process Application ambiguous under a `name`-only selector, and `auth` is exactly that case |
| Include `version` from the images lock | Fills in the conventional set | Churns on every image bump for a value no selector may use and the digest already carries |

## Reversibility
Undo cost today: none of the five is live-critical *except* the two selectors,
and those are already emitted with these values, so adopting the set costs
nothing now. Becomes irreversible immediately for `name` and `instance`: every
object applied under them carries an immutable selector, so a later change is
delete-and-recreate per process, which is why the set is fixed before the
first render rather than after.

## Consequences
- R24 closes: the set is named, and the immutable half is named as immutable,
  paid once, in one table.
- Anything that wants to select on a model concept the labels do not carry has
  to read the Resolved Deployment instead, or make the case for a sixth label,
  paid by whoever wants it, deliberately.
- An Application rename changes `part-of` on every one of its objects; that is a
  mutable label, so it is a patch rather than a recreate, paid at rename time,
  cheaply, which is the reason it is not a selector.
- `component` carries `runtime`, so a Process changing runtime rewrites a
  label; harmless, and it means the label tracks a declaration rather than a
  guess, paid by nobody.
