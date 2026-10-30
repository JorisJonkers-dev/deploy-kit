---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-30
normative: spec/v1/14-platform-intent.md#the-operators-objects
rests-on: ["0004"]
---

# The Prometheus operator runs the monitoring stack's Prometheus and Alertmanager, from objects the render writes for their Processes

The monitoring stack's Prometheus and Alertmanager are declared Processes like
any other ([0046](0046-the-foundation-is-declared.md)), and the render writes
each as the Prometheus operator's own object, `Prometheus` or
`Alertmanager`, in place of a controller. The object carries the pod the render
would have run, and what it selects and notifies is the Platform document's.
The rules are in
[The operator's objects](../../../spec/v1/14-platform-intent.md#the-operators-objects).
Settled in
[Render the Prometheus and Alertmanager the Prometheus operator runs](https://github.com/JorisJonkers-dev/deploy-kit/issues/722).

## Rests on

What each Prometheus scrapes, which rules it evaluates and where it sends
alerts is contended, so it is the platform's to state
([0004](0004-contention-decides-authority.md)).

**False if:** the operator, given the object the render writes, runs a
Prometheus that does not scrape the monitors the Platform document's cadence
selects, or an Alertmanager that does not route the alerts of every namespace.
**Settled by:** the observability example's committed tree, validated against
the operator's own CRD schema by `npm run lint:manifests`, and the estate's
first alert reaching Discord from the estate path's Prometheus.

## Why

**Chapter 14 already said so, and the render did not.** The foundation's
Prometheus and Alertmanager "take their configuration from the Prometheus
operator", yet each rendered as a plain Deployment of its image with the
image's default configuration: a Prometheus that scraped itself and evaluated
nothing, and an Alertmanager that delivered nothing. Every monitor, rule and
routing the render writes was read by no one.

**The operator's object, not a configuration Asset.** The other way to make
Prometheus read the render is to derive its `prometheus.yml` as an Asset. That
would make the compiler a second writer of the configuration the operator
already writes from the monitors, rules and routing, and the reason those are
objects at all is that each Project renders its own into its own share
([0117](0117-an-external-check-is-rendered-by-its-own-project.md)). One file
would change with every Project's monitors.

**The pod is still the Process's.** The object is not a second declaration
surface: everything on it that is not the operator's comes from the pod
template the render would have written, so posture, placement, claims, Assets
and grants follow the same rules as every Process. The operator lets its own
container be patched by name, and the patch merges mounts by path, so a claim
mounted where the operator keeps its data is that data. No field of the object
is authored.

**The few flags that are fields become fields.** The operator refuses an
additional argument it sets itself, and holds retention, the remote-write
receiver and feature flags as fields. An author writes the binary's own flags,
as for any image; the render moves the ones the object holds as fields and
passes the rest. A flag the operator sets is refused at composition rather
than by the operator at reconcile, where nothing would surface it.

**Interrupted, one Process, one surface.** The operator runs one StatefulSet
per object and replaces its pod in place; no Canary can target it, so the
Process cannot be `continuous`. The object's port is one name, so the Process
provides one surface.

**Selection is the platform's.** The Prometheus selects monitors by the
cadence's `labels`, which every rendered monitor already carries, in every
namespace, so a legacy Project's monitors are scraped across a handover too.
It evaluates only the rules the render writes, so a rule left behind by the old
path is not evaluated twice. The Alertmanager reads the one routing in its own
namespace and applies it to every namespace's alerts.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Derive `prometheus.yml` and `alertmanager.yml` as Assets | a second writer of the operator's configuration, and one file that changes with every Project's monitors | contradicts each Project rendering its own monitors and rules |
| Authored `Prometheus` and `Alertmanager` fields on the Process | a second declaration surface for posture, placement and storage | the pod template already holds every one of them |
| `storage.volumeClaimTemplate` for the data | a claim the render does not write and whose durability it cannot derive | the declared claim, mounted over the operator's path, keeps one rule for every claim |
| Keep the old stack alerting beside the estate path (a bridge) | two operators reconciling the same objects, and every alert delivered twice | the maintainer chose to fix rather than bridge |
| `alertmanagerConfiguration` naming the routing as the global configuration | an experimental field that may change in any release | the selector and the `None` matcher strategy do the same with stable fields |

## Reversibility

Cheap. The objects are derived; nothing authored names them. Going back to
Deployments changes rendered objects and the two roles' refusals only.

## Consequences

- The `prometheus` and `alertmanager` roles' Applications each declare one
  `interrupted` Process with one surface, and their arguments are flags the
  operator does not set.
- The Prometheus's Process declares the API access its discovery needs, and
  its Application is an `apiAccess` holder.
- A rotated grant on either restarts the StatefulSet the operator runs it in.
- No Release Gate holds either: an Application that is one of them has no
  member.
