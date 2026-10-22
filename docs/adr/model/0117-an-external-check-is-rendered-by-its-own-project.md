---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-22
normative: spec/v1/14-platform-intent.md#the-foundation-is-declared
rests-on: ["0005", "0006"]
---

# An Application's external checks are rendered by its own Project and collected by the checker, and no edge catalog is rendered

Each Application with an exposure renders its own external checks: one
ConfigMap in its own namespace, carrying the label the checker collects by and
the checks its exposure derives. The checker, Gatus, is not handed a list. A
checks sidecar in its pod copies every ConfigMap carrying that label into
Gatus's configuration directory, and Gatus merges and reloads them in-process.
No edge catalog is rendered at all, because the edge proxy already reads each
Project's own routes
([chapter 14](../../../spec/v1/14-platform-intent.md#the-foundation-is-declared)).

## Rests on

What the edges and exposures say is derived and never authored again
([0005](0005-derivation-is-total.md)), and every assignment is a function of
pinned inputs ([0006](0006-pinned-inputs.md)). So a Project's checks are a
function of that Project's own exposures. If they land in that Project's
share, another Project's route change cannot reach them.

**False if:** a route or exposure change in one Project changes another
Project's share, or the checker's pod template; or Gatus misses a check whose
ConfigMap was applied, or keeps one whose ConfigMap was deleted, for more than
one sidecar sync and one reload interval. **Settled by:** a two-Project
composition test, where one Project gains a route and the other's artifact and
pin stay; then, on the cluster, apply one Project's checks and watch Gatus
list them within a minute with its pod's start time unchanged.

## Why

**A rendered list in the checker's share couples every Project to it.** As
specified, the Gatus endpoint list and the edge catalogs were Assets of the
platform Application that consumes them. An Asset is an immutable ConfigMap
under a content-hashed name, mounted into the pod, so any route change in any
Project changed that Application's pod template and restarted it. That is the
strongest coupling between Projects the model had, and it was not built yet
([0116](0116-a-project-owns-every-object-it-delivers.md)).

**Gatus cannot read the cluster, but it can read a directory.** Gatus has no
discovery of Kubernetes objects. It reads one file or one directory. Given a
directory, it merges every YAML file in it, appending each file's `endpoints`,
and it polls the files and reloads in-process when one changes. A directory
that holds one file per Project is therefore the unit Gatus already
understands. A pod mounts ConfigMaps from its own namespace only, so a sidecar
that watches labelled ConfigMaps across namespaces and writes each as a file
fills that directory. Grafana's dashboards use the same pattern.

**Admission is a label, not a list.** The checker gathers whatever carries its
label, in the namespaces deploy-kit manages. A Project joins by rendering one
object in its own namespace, and nothing in the platform's share names it.
Only Flux and the API Holders the platform admits write ConfigMaps in those
namespaces, so a check comes from a signed render or from a holder the
platform named. A forged check would make Gatus probe one more address, which
its own egress policy still bounds.

**The edge catalogs have no reader left.** They listed every host and route
for the Traefik Applications. Traefik's Kubernetes provider reads every
`IngressRoute` in the cluster itself, and those already live in each Project's
namespace. A rendered catalog would only repeat what the routes say.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The checks as an Asset of the checker Application, as first specified | one ConfigMap | every route change anywhere re-renders the checker's Project and restarts it |
| The checks as one ConfigMap in the checker's own share, not mounted as an Asset | no restart | the checker's Project still re-renders and re-pins on every other Project's route change |
| A blackbox-exporter `Probe` per Project, selected by the metrics stack | no list in any platform object | the status page loses its per-route entries, and blackbox-exporter becomes a platform dependency |
| Gatus checks only platform facts: each tier's proxy and the platform's own endpoints | no coupling, no new component | the external check per route, which caught what readiness probes cannot, is lost |
| Render the edge catalogs into each Project's share | one file per Project | nothing reads them: the proxy reads the routes themselves |

## Reversibility

Easy while unbuilt. Once built, reverting means one list in the checker's share
again, and dropping the sidecar and its API access.

## Consequences

- Each Application with an exposure carries one more ConfigMap, in its own
  namespace, holding only `endpoints`, since Gatus refuses a scalar setting
  that two files define.
- The checker's Application declares the checks sidecar, and its Process holds
  API access to `list` and `watch` ConfigMaps, which the Platform document
  admits like any API Holder's.
- The external-checks ConfigMap carries one label beyond the fixed five, the
  case for which is recorded in
  [0039](0039-the-label-set-is-fixed.md).
- Gatus applies a change within one sidecar sync and one 30-second reload,
  without a restart.
- No edge catalog is rendered or specified.
