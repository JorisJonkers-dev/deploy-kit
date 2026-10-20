---
tier: decision
status: accepted
claim: settled
date: 2026-09-07
normative: spec/v1/10-project-intent.md#the-label-set
rests-on: ["0005"]
---

# The object label set is fixed, and two of its labels are immutable

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
Release Unit ([0052](0052-an-application-is-the-release-unit.md)) and whatever performs
a switchover has to select its members; `part-of` is what makes them selectable.
It is deliberately **not** a selector, because an Application gaining or losing a
Process must not require recreating the ones that stayed.

`name` and `instance` both carry the Process name, which reads oddly and is
correct. The selector must match exactly one controller's pods, and a `name`
naming the Application would make every Process of a multi-Process Application
ambiguous the moment anything selected on `name` alone: `auth` has two, so this
is not hypothetical.

There is no `version` in the set, and the render writes none. A pod does need
to say which release it ran, so that it and its logs can be tied to a release,
so composition puts `app.kubernetes.io/version` on every pod template and
`Job` a Project's unit applies, from the release the pin moves to
([0099](0099-a-rollout-is-a-github-deployment-driven-by-the-clusters-events.md)).
It stays out of the render for the reason the Rollout does: the release is the
fragment's claim about itself, and in the render it would make every release a
new artifact, so one whose objects are otherwise the ones already pinned would
move its pin and restart every pod for nothing. So the label is added to the
unit's index in the artifact composition publishes, after the content hash that
decides a move is taken, and only when the pin moves anyway. It does not ride
on the pin source's Kustomization: Flux reconciles that object and the source
it names independently, so a Kustomization holding the new release could be
applied to the artifact it replaces before that one was fetched. Every release
rolled every pod twice that way on 2026-10-18, once with the old image and the
new label, then with the new image
([#487](https://github.com/JorisJonkers-dev/deploy-kit/issues/487)). In the
artifact, the label lands in the one fetch that brings the new image. It is
never a selector, since it moves with every release. A pin whose artifact
labels no release, because an older toolkit published it, moves once to one
that does, though its render is unchanged: otherwise a Project that released
nothing new since kept pods that said no release at all, which arr and
home-portal did on 2026-10-19.

An estate-scoped Deliverable carries `managed-by` only. It belongs to no
Process and no Application, and `part-of` on the Gatus endpoints ConfigMap would
name an Application that does not own it.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Leave the set to the renderer | Nothing to specify; behaviour unchanged | Two of the labels are immutable selectors, so the convention is a one-way door being held open by nobody's decision |
| Let a Process add labels | Authors can tag for their own tooling | A label is a selector surface; an authored label can collide with a derived one, and anything worth selecting on is a model concept that should be named |
| `name` = Application, `instance` = Process | Reads the way the upstream convention intends | Makes every Process of a two-Process Application ambiguous under a `name`-only selector, and `auth` is exactly that case |
| Include `version` from the images lock | Fills in the conventional set | Churns on every image bump, and names an image's version where a reader needs the release's |
| Render `version` from the fragment's release | One place writes every label | The render stops being a function of what it derives: a release with nothing new would publish an artifact, move its pin and restart its pods |
| Patch `version` onto the pin source's Kustomization | The artifact stays the render share alone | Flux reconciles the Kustomization and its source apart, so the new label can be applied to the old artifact first and every pod rolls twice ([#487](https://github.com/JorisJonkers-dev/deploy-kit/issues/487)) |

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
- `app.kubernetes.io/version` moves on every pin move, so a release that
  changes only an object without pods, a policy or a route, still rolls its
  pods. Paid on each such release, in restarts, for pods that always say
  which release they ran.
