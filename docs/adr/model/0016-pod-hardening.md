---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-07
normative: spec/v1/10-service-intent.md#pod-hardening
rests-on: ["0005"]
---

# Pod hardening is layer-1 vocabulary

> **Note, 2026-09-08.** `allow: capability:<NAME>` keeps the Linux capability
> name deliberately. A capability is what the binary asks the kernel for — the
> same kind of fact as a port or a writable path, and the same word on any
> substrate — so it is not the mechanism leak the layer-1 rule excludes
> ([0097](0097-authored-values-name-model-concepts.md) records why, so the next
> review does not re-raise it).

## Rests on
Every image the estate runs can start under `restricted` — `runAsNonRoot`,
`readOnlyRootFilesystem`, all capabilities dropped, seccomp `RuntimeDefault` —
with a small, nameable set of exceptions. False if: a load-bearing image cannot
run non-root and has no rebuildable equivalent, so the default must be relaxed
rather than excepted. Settled by: rendering with the default class into a
vcluster ([0051](../deferred/0051-vcluster-substrate.md)), then `kubectl get pods -A
--field-selector=status.phase!=Running` — each pod it names is a declared
exception with a reason, or a rebuild.

## Why
The vocabulary does not exist and neither renderer emits the fields.
`grep -rniE 'securityContext|runAsNonRoot|readOnlyRootFilesystem|seccompProfile'
src/ schemas/` returns **0 hits** (verified 2026-08-31; the grep spans *both*
renderer generations, so choosing one under
[0052](0052-registered-adapters-are-v1.md) does not rescue it).
`src/deployment/render/workloads.ts:130` builds a container from name, image,
pullPolicy, ports, command, args, env, envFrom, volumeMounts, probes and
resources — and stops. Rendered pods run as their image's UID, with a writable
root filesystem and the default capability set.

The security half is the half that is worse to fix late, which is why the
review graded it a Blocker. Hardening is a layer-1 field, and layer 1 is
hand-authored across about ten repositories
([0001](0001-estate-scale-and-ownership.md)), so the retrofit is a pull request
per Service — about thirty — plus a coordinated image rebuild: the only finding
in the review that gets strictly more expensive every week
(`review/CONSOLIDATED.md` B6). Done later it is the same thirty pull requests
against running services, each taking a restart.

Hardening becomes vocabulary now, before the first production apply. The class
defaults to `restricted`; a Workload that cannot meet it declares the specific
exception with a reason, in the shape used for derived-value overrides
([0031](0031-derived-overrides-with-reason.md)). Capacity is a separate question
with a separate answer — raw per-Workload quantities matched against node
allocatable ([0061](0061-placement-is-hard-dimensions.md)) — and this record no
longer carries it. The claim stays open because the estate's images have not
been run against the default; the vocabulary's point is that exceptions become
declared and counted, not silent.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Accept root-by-default as an owned risk (the review's own stated alternative) | Nothing today; the same ~30 pull requests and image rebuild later, but against running services, each taking a restart, and after the incident that prompts it | The cost does not stay flat — it is the one finding that rises weekly, and on a single kernel shared by the k3s server, the datastore and the in-cluster deploy runner, root-by-default is the whole isolation story |
| Enforce from the platform only, via Pod Security Admission or an admission mutation | An admission controller on a single-node cluster; PSA can reject but never fill in, so a non-conforming pod fails at apply with no exception path a Service can author | A mutating default is a value the render cannot see, contradicting [0005](0005-derivation-is-total.md); rejection with no declared exception is an outage found at apply time |
| One estate-wide hardening posture with no per-Workload exceptions | The first image that cannot run non-root relaxes the default for all ~30 Services at once | The exception list is the deliverable: an estate that cannot name what it fails to harden cannot shrink that list |

## Reversibility
Undo cost today: one enum field and an exceptions list in the layer-1 schema, the
hardening section of chapter 10, and the container renderer in the surviving
adapter — one afternoon, blast radius nil while no repository has authored them.
After adoption the undo is thirty pull requests, the size of the retrofit it
avoided. Becomes irreversible once: images have been rebuilt around a non-root
UID and volumes chowned to match — ownership on the PersistentVolumes then
encodes it, and reverting is a data migration.

## Consequences
- Every Workload across the estate's ~30 Services gains a required hardening
  field before the first production apply, about thirty pull requests — paid by
  the one maintainer.
- Images that cannot run non-root are rebuilt or excepted in writing, and that
  list is the estate's inventory of what it cannot harden — paid by whoever
  adopts each image.
- A `readOnlyRootFilesystem` default turns every scratch directory into a
  declared volume, found one CrashLoopBackOff at a time — paid by the author
  adopting each image.
- Capacity leaves this record entirely: requests, limits and the QoS class are
  settled by [0061](0061-placement-is-hard-dimensions.md), so a reader chasing
  BestEffort here finds nothing — paid by whoever holds the old citation.
- The claim settles only through a vcluster render, inheriting
  [0051](../deferred/0051-vcluster-substrate.md)'s risk — paid by joris.
