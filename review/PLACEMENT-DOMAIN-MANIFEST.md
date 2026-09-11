# Amendment: placement dimensions and domain files (2026-09-07)

Binding. Overrides anything in docs/adr or spec/v1 that conflicts. Every
authoring agent reads this file whole before writing.

## What changed, in one paragraph

`size` is replaced by `placement`: a set of **hard** dimensions, all of which
must match, matched against node **allocatable** from the pinned node contract.
Intent is authored **one file per domain**, holding many Services. A Service is
the unit of atomic release, so `releaseUnit` is deleted. `aliases` is deleted:
namespace derives from `domain`, and every other divergence it covered is a
field the author already writes explicitly.

## Vocabulary (exact; do not vary)

```yaml
domain: auth                 # file header; one domain per file
owner: joris                 # ONLY field raised to the domain
services:
  - id: auth                 # release unit; namespace <domain>-system
    alertClass: page         # stays PER SERVICE, never raised
    secrets: [...]           # stays PER SERVICE
    workloads:
      - name: auth-api
        image: auth-api
        provides: {http: 8081}       # MOVED here from the Service
        placement:
          memory: 768Mi              # required
          cpu: 250m                  # required
          arch: [amd64]              # optional; a SET, no ordering
          site: enschede             # optional
          disk: {media: [nvme, ssd], size: 100Gi}   # optional
          gpu: {class: transcode, memory: 4Gi}      # optional
          capabilities: [public-ingress]            # optional; flat strings
        hardening: {exceptions: [{allow: ..., reason: ...}]}
```

## Rules

1. **All dimensions are hard.** Every declared dimension must match. No
   `requires`/`prefers` split, no weights, no ordering: a list is a SET of
   equally acceptable values. No eligible node is `E_PLACEMENT_UNSATISFIABLE`,
   a build error.
2. **`memory` and `cpu` are required on every Workload.** The rest default to
   "any node". Required because BestEffort was the estate's standing QoS class
   and this field exists to end that.
3. **Raw quantities**, not named classes. The `xs`..`xl` table is deleted; the
   Cluster Context no longer carries it.
4. **Matched against `allocatable`**, published by the node contract as total
   minus a declared reserve authored in the node file. Never a live read.
   This is **eligibility, not bin-packing**: three `memory: 2Gi` Workloads all
   pass against a 4096Mi node; the scheduler refuses the third at apply. Say so.
5. **Shape rules survive, still derived**: memory request == memory limit
   (incompressible; OOM beats eviction roulette); cpu request only, **no cpu
   limit** (throttling gets misdiagnosed as slow application code). The author
   writes one number per dimension. Escape is 0031's override with a reason.
6. **`gpu` is structured**: `class` and `memory` matched against the node
   contract's `gpus[].class` and `gpus[].memory_mib`. Flat `gpu-nvidia` is not
   vocabulary. This closes a live trap: `enschede-gtx-960m-1` advertises
   `nvidia` (re-enabled 2026-09-02) with a 2048MiB Maxwell card, and today
   `jellyfin` / `immich-machine-learning` avoid it only because they also select
   `capability-samba`.
7. **`disk` filters first placement; the PV binding wins thereafter.** A `disk`
   value conflicting with an existing binding in the pinned ClusterState is
   `E_DISK_BINDING_CONFLICT`.
8. **`tailscale` leaves the capability vocabulary.** On 7/7 nodes it excludes
   nothing, and a filter that never excludes teaches authors filters do nothing.
9. **Namespace derives from `domain`: `<domain>-system`.** Matches all ten live
   Service namespaces (auth-system, data-system, knowledge-system, app-system,
   agents-system, mail-system, media-system, notes-system, automation-system,
   utility-system). Zero renames. A namespace holds several Services and is
   therefore **not** a trust boundary. State that plainly, it is now normal.
10. **ServiceAccount and Vault role = the Workload name**, not
    `<service>-<workload>`. `auth-system.auth-api`, not
    `auth-system.auth-auth-api`. Workload names are unique within a domain:
    `E_DUPLICATE_WORKLOAD_NAME`.
11. **`provides` lives on the Workload.** A port is a property of a process.
    `dependsOn` still targets `{service, surface}`; surface names are unique
    within a Service.
12. **A Service is the unit of atomic release.** Its Workloads switch together
    or none switches. There is no mechanism to couple two Services. A pair that
    must release together is one Service, and a surviving pair is evidence the
    Service boundary is drawn wrong.
13. **`aliases` is deleted.** Namespace comes from domain; Workload name and
    image are already authored explicitly. Nothing remains for it to express.
14. **Service id is the repository/product name; Workload names are whatever the
    processes are actually called.** Service `home-portal` may hold Workload
    `app-ui` with image `app-ui`: that is not a divergence, it is the name.
15. **`owner` is the only field raised to the domain.** `alertClass` stays per
    Service (raising it makes a domain as loud as its loudest member).
    `secrets` stays per Service (a domain-level grant hands every Service in the
    file a reader slot it may not need).
16. **One repository may hold several domain files. One file is one Intent
    Fragment. A domain never spans repositories.**

## The 0004 conflict: resolve it, do not hide it

Memory and CPU are contended, and 0004 says a contended value is
platform-assigned. Raw `memory: 768Mi` in Service Intent puts a contended number
on the Service side. **Restate the rule**: contention decides **who arbitrates**,
not **who authors**. The Service states its requirement; the platform decides
whether it fits and where. Record the accepted cost in Consequences: nothing
stops every author writing `memory: 8Gi`, and no arbitration exists yet beyond
the scheduler refusing to place.

## Error codes

New: `E_PLACEMENT_UNSATISFIABLE` (replaces `E_CAPABILITY_UNSATISFIABLE`: retire
that token estate-wide), `E_DISK_BINDING_CONFLICT`, `E_DUPLICATE_WORKLOAD_NAME`.
Unchanged: `E_DUPLICATE_SERVICE_ID`.

## Node facts (evidence; quote from these, they are real)

7 nodes, from `nix-config/inventory/nodes/*.yml`:

| node | site | arch | cpu | mem | gpu | disks | roles |
|---|---|---|---|---|---|---|---|
| enschede-t1000-1 | enschede | amd64 | 54000m | 32000Mi | t1000, transcode | nvme 120+500G, hdd 4096G | worker, utility |
| enschede-rx7900xtx-1 | enschede | amd64 | 72800m | 32000Mi | rx7900xtx, render-compute | nvme 160+1000G, hdd 8192G | worker, utility |
| enschede-gtx-960m-1 | enschede | amd64 | 28800m | 16384Mi | gtx960m, transcode, 2048MiB | ssd 100+500G, hdd 2048G | worker, utility |
| enschede-pi-1 | enschede | arm64 | 6000m | 8192Mi | - | sdcard 64G | worker |
| enschede-pi-2 | enschede | arm64 | 6000m | 4096Mi | - | sdcard 64G | worker |
| enschede-pi-3 | enschede | arm64 | 6000m | 4096Mi | - | sdcard 64G | worker |
| frankfurt-contabo-1 | frankfurt | amd64 | 16000m | 32768Mi | - | ssd 80+120G | control-plane, worker |

Capabilities advertised, with node counts: `tailscale`(7, dropped) `adguard`(5)
`lan-ingress`(3) `nvidia`(2) `samba`(1) `public-ingress`(1) `llm-host`(1)
`backup-store`(1) `amd-gpu`(1). No taints on any node. Longhorn is declared
eligible on four nodes but **no PVC in fleet-infra sets a storageClassName**:
everything takes k3s's default `local-path`. Do not claim Longhorn is in use.

## Numbering

New: 0061 placement-is-hard-dimensions · 0062 service-is-the-release-unit ·
0063 intent-authored-per-domain.
Superseded (keep files, set `superseded-by`): 0017 → 0061, 0060 → 0062.
Amended in place: 0004, 0010, 0016 (keeps hardening, loses the resource class),
0024, 0037, 0056.

## Chapter anchors: changes

- `10-service-intent.md`: `## Pod hardening and resource class` becomes
  `## Pod hardening`. `## Release units` is DELETED. `## Placement` stays and is
  rewritten. All other anchors unchanged; ADR `normative:` pointers must keep
  resolving.
- `20-resolved-deployment.md`, `16-dependencies.md`, `40-composition.md`,
  `60-setup.md`: anchors unchanged, content amended.
