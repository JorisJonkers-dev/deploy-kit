---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-07
normative: spec/v1/10-service-intent.md#placement
rests-on: ["0005"]
---

# Placement is a set of hard dimensions matched against allocatable

## Rests on
The estate's placement needs are expressible as hard filters with no weighted
preference. False if: a real workload needs to prefer a node without requiring
it, and cannot restate that as a set of acceptable values. Settled by:
enumerate every soft term the live estate carries —
`kubectl get deploy,sts,ds -A -o json | jq '..|.preferredDuringSchedulingIgnoredDuringExecution? // empty'`
— then rewrite each term it prints as a value set on one dimension.

## Why
This replaces [0017](0017-placement-by-capability.md) and takes the resource
half of [0016](0016-pod-hardening.md), which keeps hardening. `size` and
`placement` were independent fields and nothing compared them. Node memory
spans 4096Mi on `enschede-pi-2` and `enschede-pi-3` to 32768Mi on
`frankfurt-contabo-1`, while the class table put `l` at 2Gi and `xl` at 4Gi with
memory request equal to limit. A `size: l` Workload could sit beside a placement
admitting only the Pis — 2Gi of a 4096Mi node before its reserve, `xl` not
fitting at all — and the build passed, failing as `Pending` at apply.

The `requires`/`prefers` split goes with it. The estate already paid for the
soft half: no node advertised `gpu-model-gtx960m`, the preference naming it was
discarded by the scheduler without an event, a warning or a condition, and it
read as GPU-aware placement while doing nothing. That bought the rule that an
unsatisfiable term is a build error, which makes the second shape unnecessary.
Every dimension is hard; a list is a set of equally acceptable values, no
ordering and no weight, so `arch: [arm64, amd64]` recovers the fallback without
a term that can be dropped in silence, and no eligible node is
`E_PLACEMENT_UNSATISFIABLE`.

Flat capability strings cannot describe a GPU. `nvidia` is advertised on 2 of 7
nodes, one of them `enschede-gtx-960m-1` — a 2048MiB Maxwell re-enabled
2026-09-02 — while `enschede-rx7900xtx-1` is not `nvidia` at all. Today
`jellyfin` and `immich-machine-learning` avoid the Maxwell only because they
also select `capability-samba`, which exactly one node carries: placement
working by accident of an unrelated filter. `gpu` is therefore structured —
`class` and `memory`, matched against `gpus[].class` and `gpus[].memory_mib`.

Matching is against **allocatable** — node total minus a declared reserve,
published by the node contract ([0056](0056-node-facts-single-source.md)) —
never a live read of free capacity, which would put an assignment outside the
pinned input set ([0006](0006-pinned-inputs.md)). This is **eligibility, not
bin-packing**: three Workloads declaring `memory: 2Gi` all pass against a
4096Mi node, each compared against allocatable alone, and the scheduler refuses
the third at apply. Memory and cpu are contended, so contention decides **who
arbitrates**, not **who authors** — [0004](0004-contention-decides-authority.md)
is restated, not waived. The Service states its requirement; the platform
decides whether it fits and where.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep `size` beside `placement` | two fields answering one question, the class resolved through the Platform Intent and the node facts through the node contract — no build-time comparison without joining them | this is the gap being closed: a `size: l` Workload pinned to a 4096Mi Pi passes the build and goes `Pending` |
| Scored best-match: rank eligible nodes, place on the highest | a term matching nothing scores zero and the pod still places, so the failure mode is a worse node rather than a refusal | hands back the silence the `gtx960m` evidence bought — an unmet term producing a Running pod is precisely what nobody could see |
| Named amounts instead of raw quantities | keeps [0004](0004-contention-decides-authority.md) intact as written, and a retune is one Platform Intent edit rather than an edit in every repository — the cost this decision accepts | a class name cannot be compared to a node's allocatable without the table, so the consistency check stays a join; raw was chosen because the comparison is then arithmetic |

## Reversibility
Undo cost today: the intent schema block, the matcher against the node contract,
and the derivation of requests and limits — an afternoon, blast radius nil.
Nothing live depends on either shape: `size` is still `<<proposed>>` and
ungraded, no renderer emits `resources` from it, and no repository has authored
`placement` in this form. The shape rules survive and stay derived — memory
request equals limit (incompressible; OOM beats eviction roulette), cpu request
and no cpu limit (throttling gets misdiagnosed as slow application code) — with
an override and a reason as the escape
([0031](0031-derived-overrides-with-reason.md)). Becomes irreversible once about
thirty repositories carry raw numbers chosen per Workload: returning to classes
means someone other than the author bucketing each.

## Consequences
- `memory` and `cpu` become required on every Workload — one edit per Service,
  ~30 of them, and BestEffort stops being the standing QoS class — paid by the
  one maintainer.
- Raising every JVM service from 768Mi to 1Gi is now an edit in every repository
  holding one, not one row in the Platform Intent — paid by the one maintainer,
  on every retune.
- A Workload that could fall back to Frankfurt when the Pis are full must list
  both arches or sit `Pending` — paid by service authors, who write the fallback
  down instead of weighting it.
- `tailscale` leaves the capability vocabulary: on 7 of 7 nodes it excludes
  nothing, and a filter that never excludes teaches authors that filters do
  nothing — paid by the platform owner, in one node-contract change.
- `E_CAPABILITY_UNSATISFIABLE` retires for `E_PLACEMENT_UNSATISFIABLE`, which
  covers every dimension — paid by adapter maintainers, estate-wide.
- The two `nvidia` nodes stop being interchangeable, since `class` and `memory`
  are declared — paid by `jellyfin` and `immich-machine-learning`.
- Nothing stops an author writing `memory: 8Gi`, and no arbitration exists
  beyond the scheduler refusing to place it — the conceded cost of restating
  [0004](0004-contention-decides-authority.md) as who-arbitrates — paid by the
  platform owner, until an arbitration step exists.
