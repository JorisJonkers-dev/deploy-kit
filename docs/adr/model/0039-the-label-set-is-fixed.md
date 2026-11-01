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
Five labels on every object are enough for everything the estate selects on,
and no authored field reaches the label set as written. False if: something must
select objects by a dimension no label carries (a tier, an audience, a release
channel), and cannot read it from the Resolved Deployment instead. Settled by:
rendering the estate with this set and finding no selector, no ServiceMonitor
and no NetworkPolicy that needs a label it does not have, beyond the two derived
selection labels below, each on the one kind of object its selector reads.

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
`Job` a Project's unit applies, from the release that last changed its
Application: the release the pin moves to for an Application it changed, and
the one the lock recorded for one it left alone
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

The software a container runs is a different fact from the release, and it
moves on its own schedule: a wrapper of n8n releases when its configuration
changes, n8n when upstream ships. So it is not `app.kubernetes.io/version`,
which keeps naming the release. The render writes it as one annotation per
container, `image.jorisjonkers.dev/<container>`, from the `version` the images
lock records beside the digest. It is an annotation because nothing selects on
it and a label value cannot hold every version string upstream projects use. It
can live in the render, unlike the release, because it is derived from a pinned
input and changes only with the digest beside it, so it never moves a pin or
restarts a pod that the image change would not.

An estate-scoped Deliverable carries `managed-by` only. It belongs to no
Process and no Application, and `part-of` on such an object would name an
Application that does not own it.

**One selection label is the case for a sixth.** An Application's
external-checks ConfigMap also carries `estate.jorisjonkers.dev/external-checks`.
Gatus's checks sidecar gathers those objects from every namespace, and a
Kubernetes watch selects by label, not by reading the Resolved Deployment
([0117](0117-an-external-check-is-rendered-by-its-own-project.md)). It is on
that one object kind only, and never in a selector the render writes, so it
moves nothing the five labels decide.

**A consumer label is the case for a seventh.** Every pod that reaches a
Surface carries `consumes.deploy-kit.jorisjonkers.dev/<application>.<surface>`,
which the provider's NetworkPolicy admits
([0035](0035-network-policy-is-default-deny-and-render-only.md)). A
NetworkPolicy selects pods by label and reads no Resolved Deployment, and
naming each consumer instead would put every consumer's edge into the
provider's render. It is on pod templates only, derived from an edge and
never authored, and never a workload's selector, so an edge added or removed
changes a template and nothing immutable.

**The member label is the same case, in the other direction.** Every gate
member's pods carry `gated.deploy-kit.jorisjonkers.dev/release-gate`, which the
Release Gate's NetworkPolicy reaches
([0035](0035-network-policy-is-default-deny-and-render-only.md)). Naming each
member in the gate's policy would put every gated Application into the delivery
Project's render. It is on pod templates only, derived from the release-gate
inputs, and never a selector.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Leave the set to the renderer | Nothing to specify; behaviour unchanged | Two of the labels are immutable selectors, so the convention is a one-way door being held open by nobody's decision |
| Let a Process add labels | Authors can tag for their own tooling | A label is a selector surface; an authored label can collide with a derived one, and anything worth selecting on is a model concept that should be named |
| `name` = Application, `instance` = Process | Reads the way the upstream convention intends | Makes every Process of a two-Process Application ambiguous under a `name`-only selector, and `auth` is exactly that case |
| Include `version` from the images lock | Fills in the conventional set | Churns on every image bump, and names an image's version where a reader needs the release's; the image's version is written as a per-container annotation instead |
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
- `app.kubernetes.io/version` moves only for an Application whose revision
  moved, so a release that changes one Application restarts no other. A
  label that moved on every pod restarted the Secret Store for a change
  elsewhere in its Project, and it came back sealed
  ([#791](https://github.com/JorisJonkers-dev/deploy-kit/issues/791)). A pod
  then says which release last changed it, not the newest release of its
  Project, and the lock carries one more map to say it; paid by a reader who
  wants the Project's newest release, who reads the lock.
