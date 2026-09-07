# Chapter 40 — Composition

Composition is the step that turns many independently-published declarations into
the single global view layer 2 needs. It runs before resolution, and nothing
downstream works without it.

## Why composition exists

Eight properties in this specification cannot be evaluated against one repository
in isolation:

| property | needs | decided in |
|---|---|---|
| Service Id uniqueness | every Service in the estate | [0010](../../docs/adr/model/0010-flat-service-identity.md) |
| domain uniqueness, and exactly one publisher per domain | every fragment in the estate | [0063](../../docs/adr/model/0063-intent-authored-per-domain.md) |
| hostname uniqueness | every exposure in the estate, plus the register of surfaces the model does not deploy | [0018](../../docs/adr/model/0018-exposure-by-audience.md) |
| reachability completeness — derived ∪ registered | every exposure plus the unmanaged register | [0019](../../docs/adr/model/0019-registered-unmanaged-surfaces.md) |
| the Reconcile Unit DAG | every required dependency edge | [0032](../../docs/adr/model/0032-reconcile-unit-derived.md) |
| inbound derivations — CORS origins, one database per consumer | edges pointing *at* a Service | [0020](../../docs/adr/model/0020-dependency-edges-carry-surface.md) |
| the reader set of a secret path | every grant in the estate | [0023](../../docs/adr/model/0023-grant-unit-is-the-path.md) |
| placement eligibility — at least one node per Workload | every declared dimension against the fleet's node contract | [0061](../../docs/adr/model/0061-placement-is-hard-dimensions.md) |

No Service knows its own consumers, and no domain file holds the fleet's node
contract, so none of these are locally computable. That is the whole argument for
composition ([0037](../../docs/adr/model/0037-composition-oci-fragments.md)), and it is
why this chapter is a hard dependency of chapters 16, 20 and 30.

Two properties left this list on 2026-09-07. **Co-test membership** moved out
with the delivery and co-testing split; see
[docs/adr/deferred/README.md](../../docs/adr/deferred/README.md). **Release Unit
membership** moved out because a Service is now itself the unit of atomic release
([0062](../../docs/adr/model/0062-service-is-the-release-unit.md), superseding
[0060](../../docs/adr/model/0060-release-unit.md)): its members are the Workloads in
its own document, so membership is readable in one file and needs no union at
all.

## Fragments

The unit of publication is a **domain file**. One domain file is one Intent
Fragment, holding the many Services of that domain, and a fragment therefore
declares exactly one domain
([0063](../../docs/adr/model/0063-intent-authored-per-domain.md)):

```yaml
apiVersion: intent.jorisjonkers.dev/v1
kind: IntentFragment
metadata:
  repository: JorisJonkers-dev/knowledge
  sourceSha: 22b9d332a9e059eaeebaffbe49ab25f762985029
spec:
  schemaVersion: 1.0.0
  domain: knowledge                 # exactly one; the domain file's header
  owner: joris                      # the only field raised to the domain
  contains:
    services: [knowledge]
    secretSubtrees: [knowledge-system/]
```

This narrows the wording of
[0037](../../docs/adr/model/0037-composition-oci-fragments.md), which says "each domain
repository publishes". **One repository may hold several domain files**, and it
then publishes one fragment per domain file rather than one fragment per
repository: `homelab-collections` stays one repository and publishes one fragment
for each domain it holds. Splitting it into separate repositories remains a
convenience rather than a prerequisite, because composition behaves identically
either way — it unions fragments, and every fragment is already a whole domain.

**A domain never spans repositories, and composition rejects one that does.** A
domain name may be declared by exactly one fragment across the union; a second
fragment declaring `domain: knowledge` — in the same repository or in another —
is `E_DUPLICATE_DOMAIN`. That check is what makes the union total: composition
unions fragments and never has to union a domain, so a domain's membership is
never a fact that becomes knowable only after composition has run. Without it,
two repositories could each hold half of `knowledge` and no single file would
state who is in it.

A fragment carries:

- the domain file — its Services, their Workloads, and the per-Workload env files
  those Workloads name
- the Secret Subtree the domain owns — paths, keys, engines, readers
- the node contract, for the fragment that owns the fleet: the `allocatable`
  table every `placement` is matched against
  ([0056](../../docs/adr/model/0056-node-facts-single-source.md))
- Registered Unmanaged Surfaces the domain is responsible for

A fragment publishes **on merge to the default branch, independently of any image
release**. An intent-only change — a changed exposure, a secret grant, a
dependency edge, a raised `placement.memory` — produces no image, and tying
publication to a version tag would leave such a change unpublished behind a
staleness window. The worked workflow is
[`examples/workflows/service-publish-fragment.yml`](examples/workflows/service-publish-fragment.yml).

### Publication, and why the lock is an output

A fragment is published as an OCI artifact, the pattern `homelab-inventory`
already runs for `cluster-deploy-context-{public,internal}`:

```
oras push  "$REF" --annotation ...
oras resolve "$REF"          # learn the digest AFTER pushing
```

That second line is the whole reason the lock is an output rather than an input.
**An artefact cannot contain its own digest.** The evidence is in the tree:
`context/public/context-manifest.yml` ships with `packageDigest: ""`, because the
digest does not exist until the push completes. A design where each repository
pinned its peers would require every fragment to know digests that cannot be
known at authoring time, so the digests are recorded by the **consumer** — the
composition lock — after resolution. This is what satisfies the property that
**no repository needs a merge before a change takes effect**.

`oras resolve` following `oras push` is also the estate's habit applied
correctly: the push's exit code is not the digest, and the digest is what
downstream pins.

Two source hashes are kept distinct, following the same repository's design:

| hash | over | why |
|---|---|---|
| `sourceSha` | the git commit | provenance: which commit produced this |
| `inputsSha` | the authored inputs only, never generated outputs | change detection that does not chase its own tail |

`homelab-inventory` derives `inventorySourceSha` from
`inventory/ + catalog/ + vault/ + providers/` and **never** from the generated
`context/` tree, and the value is identical in the public and internal manifests.
That is the property to copy: a hash that included generated output would change
on every publish and detect nothing.

## The composition run

Composition runs on each fragment publish, with no pull request in the path. The
worked workflow is
[`examples/workflows/compose.yml`](examples/workflows/compose.yml): a publish
dispatches it, a nightly schedule is a safety net for a missed dispatch, and
concurrency is serialised because two runs would race on `previousLockDigest`.

```mermaid
flowchart TB
    P["participants.yml<br/>expected publishers<br/>maxAge 7d unless overridden"]

    subgraph PULL["1. resolve and verify"]
        p1["pull each fragment by tag"]
        p2["oras resolve → digest"]
        p3["verify MANIFEST.sha256 per file"]
        p4["admit schemaVersion:<br/>same major, minor ≤ toolkit"]
    end

    subgraph UNION["2. union"]
        u1["merge domain files — Services, Workloads,<br/>Secret Subtrees, unmanaged surfaces"]
        u2["materialise the required-edge DAG<br/>and the node allocatable table"]
    end

    subgraph ASSERT["3. assert estate-wide invariants"]
        a1["identity"]
        a2["references"]
        a3["placement"]
        a4["secrets"]
        a5["completeness"]
    end

    subgraph OUT["4. record"]
        o1["composition lock —<br/>every resolved digest,<br/>exact fragment and toolkit versions"]
        o2["ComposedIntent<br/>input to layer 2"]
    end

    P --> PULL
    PULL --> UNION
    UNION --> ASSERT
    ASSERT --> OUT
    ASSERT -.->|"any failure"| X["no ComposedIntent.<br/>Nothing renders."]
```

Composition is **order-independent**: the same fragment set yields the same
`ComposedIntent` regardless of pull order. That is not a nicety, it is what makes
the composed digest meaningful — and it forces a design consequence. Every merge
must be commutative, so **every collision is an error rather than a
last-write-wins merge.** There is no precedence between fragments, and no fragment
can override another.

## The estate-wide invariants

Normative. Composition fails on any of these, and produces no `ComposedIntent`.

### Identity

| invariant | error |
|---|---|
| Service Ids are unique across the union | `E_DUPLICATE_SERVICE_ID` |
| a domain name is declared by exactly one fragment, so a domain sits in exactly one repository | `E_DUPLICATE_DOMAIN` |
| Workload names are unique within their domain | `E_DUPLICATE_WORKLOAD_NAME` |
| a `host` is unique across the composed union | `E_DUPLICATE_HOST` |
| exposure names are unique within their Service | `E_DUPLICATE_EXPOSURE_NAME` |
| two routes on one exposure do not share a `path` + `match` pair | `E_DUPLICATE_ROUTE_MATCH` |
| at most one Service claims the apex host | `E_DUPLICATE_APEX` |
| Secret Store path prefixes do not overlap between Subtrees | `E_SUBTREE_PREFIX_COLLISION` |

**Service ids stay estate-unique even though they no longer determine the
namespace.** The namespace derives from `domain`, as `<domain>-system`
([0063](../../docs/adr/model/0063-intent-authored-per-domain.md)), which is why a
namespace now holds several Services and is not a trust boundary. The id's
uniqueness follows from what *references* it, not from what it names: it is the
join key every `dependsOn.service` resolves against
([0010](../../docs/adr/model/0010-flat-service-identity.md),
[0020](../../docs/adr/model/0020-dependency-edges-carry-surface.md)), and two Services
answering to one id would make an edge ambiguous wherever they live.

`E_DUPLICATE_WORKLOAD_NAME` is scoped to the **domain**, not to the Service,
because the Workload name alone is the ServiceAccount and the Vault role name
under the domain's namespace — `auth-system.auth-api`, not
`auth-system.auth-auth-api` ([0024](../../docs/adr/model/0024-identity-per-workload.md)).
Two Services in one domain file therefore cannot both call a Workload `api`,
while the same name may repeat freely across domains. Since a domain is exactly
one fragment, the check reads one fragment at a time; it is asserted here because
composition is the one step every fragment passes through.

**`host` uniqueness is a composition check, not a structural guarantee.**
Nothing in the model makes a hostname unique by construction: `host` is a full
FQDN authored on a Service's `exposure` entry
([0018](../../docs/adr/model/0018-exposure-by-audience.md)), and two domain files in
two repositories can write the same string with neither able to read the other.
`E_DUPLICATE_HOST` over the union is the only place the property holds at all —
and it is evaluated over **derived hosts and Registered Unmanaged Surfaces
together** ([Unmanaged surfaces](#unmanaged-surfaces)), because a hostname the
model does not deploy occupies the name exactly as completely as one it does. An
exposure claiming `samba.lan.jorisjonkers.dev` collides with the register entry
that excuses it, which is the collision worth catching.

Because the whole FQDN is authored, the apex is a host value rather than a
marker. `home-portal` writes `host: jorisjonkers.dev`, and two Services writing
it are the same collision as any other duplicated host; `E_DUPLICATE_APEX` names
that pair specifically so the message can say which name was contested.

**`E_DUPLICATE_EXPOSURE_NAME` has a definition at last: unique within the
Service.** It checked a field nothing defined until `name` became required, and
it is deliberately not estate-wide. The name is a local handle — the second half
of `${exposure:<service>.<name>#url}`, already qualified by the Service id — so
`public` may repeat in every domain in the estate, while a Service fronting
several hosts, `jellyfin` public and lan, needs exactly this to tell its own
apart. Being Service-scoped it is computable inside one fragment, and it is
asserted here for the reason `E_DUPLICATE_WORKLOAD_NAME` is: composition is the
one step every fragment passes through.

`E_DUPLICATE_ROUTE_MATCH` covers the other half of that pair. Two routes on one
exposure sharing a `path` and a `match` render two rules with identical
matchers, and which of them serves a request is the router's tie-break rather
than anything the author wrote. The live shape is already in the tree: `auth`'s
two anonymous exposures render two IngressRoutes with an identical `match`,
because the vocabulary they were written in had no path to declare — the
`/api`-versus-`/` split that is now two routes was simply unexpressible.

### References

| invariant | error |
|---|---|
| every `dependsOn.service` resolves to a Service in the union | `E_UNRESOLVED_SERVICE` |
| every `dependsOn.surface` is provided by a Workload of that Service | `E_UNKNOWN_SURFACE` |
| every route's `surface` is provided by the Workload that route names | `E_UNKNOWN_SURFACE` |
| the graph of **required** edges is acyclic | `E_DEPENDENCY_CYCLE` |
| every exposure's audience is carryable by some tier | `E_NO_TIER_FOR_AUDIENCE` |

An edge still targets `{service, surface}`, and surface names are still unique
within a Service. What moved is where the surface is declared: `provides` sits on
the **Workload** that listens, because a port is a property of a process. So
resolving `E_UNKNOWN_SURFACE` is a lookup for the Service in the union and then
for the Workload of that Service carrying the name — the edge itself never names
a Workload, and a surface moving between Workloads of one Service breaks no
reference.

`E_UNKNOWN_SURFACE` carries two cases, and they resolve differently. A route
inside an `exposure` names `{path, match, workload, surface}`, so it names the
Workload outright: the check is that *that* Workload declares *that* surface in
its own `provides`, with no search across the Service. A route is the one place
a Workload is named from outside itself, and it is named from inside the same
Service document — which is why `exposure` sits on the Service while `provides`
stays on the Workload ([0018](../../docs/adr/model/0018-exposure-by-audience.md)).
Moving a surface between two Workloads of one Service therefore breaks no
`dependsOn` edge and does break a route still naming the old Workload, and that
asymmetry is correct: the edge asked for a capability, the route asked for a
process.

Optional edges are excluded from the cycle check deliberately. `required: false`
means a Workload starts without its peer, so a cycle through optional edges
cannot deadlock a rollout.

Two release-unit invariants left this table on 2026-09-07.
`E_RELEASE_UNIT_SINGLETON` existed only because `releaseUnit` was a free string
joined at composition and nowhere else: a Service held at most one, no Service
could see its co-members, and a misspelt name yielded two units of one rather
than an error — atomicity silently gone with every gate green. A Service is now
itself the unit of atomic release
([0062](../../docs/adr/model/0062-service-is-the-release-unit.md)), so there is no join
key to misspell, no membership for composition to materialise, and nothing left
for that error to catch: the members are the Workloads listed in the Service's
own document. The readiness requirement the second error carried is unchanged in
substance — no member's new version takes traffic until every member is healthy,
health meaning that member's own declared readiness
([0014](../../docs/adr/model/0014-probes-are-siblings.md)) — but it is now a property
of one Service in one file rather than of a set assembled across repositories,
and checking it needs no estate-wide view.

### Placement

| invariant | error |
|---|---|
| every Workload's `placement` has at least one eligible node in the pinned node contract | `E_PLACEMENT_UNSATISFIABLE` |
| no `disk` dimension conflicts with that Workload's existing PV binding | `E_DISK_BINDING_CONFLICT` |

Every declared dimension is **hard**: all of them must match, a list is a set of
equally acceptable values with no ordering and no weight, and matching is against
`allocatable` from the pinned node contract — each node's total minus a reserve
declared in the node file, never a live read of free capacity
([0061](../../docs/adr/model/0061-placement-is-hard-dimensions.md),
[0056](../../docs/adr/model/0056-node-facts-single-source.md),
[0006](../../docs/adr/model/0006-pinned-inputs.md)). `E_PLACEMENT_UNSATISFIABLE` is
the one error for all of it, replacing the retired capability-only error that
could speak about flat strings and nothing else: it now covers every dimension —
`memory`, `cpu`, `arch`, `site`, `disk`, `gpu` and `capabilities` alike.

This is the check no single fragment can run. The node contract belongs to the
fragment that owns the fleet, so a domain file declaring `placement` cannot know
whether any node satisfies it; composition is the first place both halves exist.

**It is eligibility, not bin-packing, and the difference must not be papered
over.** Each Workload is compared against one node's allocatable on its own.
Three Workloads declaring `memory: 2Gi` all pass against a 4096Mi node —
`enschede-pi-2` and `enschede-pi-3` are exactly that — and the scheduler refuses
the third at apply. Composition asserts that some node *could* hold each
Workload; it never asserts that the fleet can hold all of them at once. That
residue is open item 5 below.

`gpu` is structured, matched against the node contract's `gpus[].class` and
`gpus[].memory_mib` rather than a flat string, and the union is where the trap it
closes is visible. `nvidia` is advertised on 2 of 7 nodes, one of them
`enschede-gtx-960m-1` — a 2048MiB Maxwell card, re-enabled 2026-09-02 — while
`enschede-rx7900xtx-1` is not `nvidia` at all. Today `jellyfin` and
`immich-machine-learning` avoid that Maxwell only because they also select
`capability-samba`, which exactly one node carries: placement working by accident
of an unrelated filter. `gpu: {class: transcode, memory: 4Gi}` excludes it by the
fact that actually matters.

`disk` filters first placement; **the PV binding wins thereafter.** A `local-path`
volume binds to the node holding its PersistentVolume, and that binding is read
from the pinned `ClusterState` snapshot (chapter 20), so once a volume is bound
the binding decides the node. A `disk` dimension the bound node cannot satisfy is
therefore `E_DISK_BINDING_CONFLICT` — a build error naming the conflict — rather
than a silent re-placement or a `Pending` pod. The live shape to hold in mind:
`knowledge-vault-clone` is bound to `enschede-t1000-1`, whose disks are nvme and
hdd, so a later `disk: {media: [ssd]}` on that Workload is the error, not a move.
Note also what `disk` is not: it is a media and capacity filter over node facts,
not a storage class. Longhorn is declared eligible on four nodes, but no PVC in
`fleet-infra` sets a `storageClassName` — everything takes k3s's default
`local-path` — so nothing in this estate is served by Longhorn today.

The capability vocabulary shrank by one, and composition is where the loss is
felt as a gain. `tailscale` is gone from it: advertised on 7 of 7 nodes it
excluded nothing, and a filter that never excludes teaches authors that filters
do nothing. What remains, with node counts: `adguard`(5) `lan-ingress`(3)
`nvidia`(2) `samba`(1) `public-ingress`(1) `llm-host`(1) `backup-store`(1)
`amd-gpu`(1). Because composition holds the whole fleet, a capability no node
advertises fails the build here instead of surviving as a preference the
scheduler drops without an event, a warning or a condition.

### Secrets

| invariant | error |
|---|---|
| every grant's `path` is declared by exactly one Subtree | `E_UNDECLARED_SECRET_PATH` |
| the Subtree lists the granting Service as a reader of that path | `E_READER_NOT_DECLARED` |
| every grant with `delivery: env` is named by at least one placeholder | `E_UNBOUND_SECRET_GRANT` |
| every `${secret:<path>#<key>}` placeholder byte-matches a granted path | `E_UNAUTHORISED_SECRET_REFERENCE` |
| `access: self-roll` on a path with other readers carries an acknowledgement | `E_ROLL_AFFECTS_OTHER_READERS` |
| no literal secret value appears in an env file or an Asset | `E_RAW_SECRET` |

Three points of precision, all following from the grant unit being the path
([0009](../../docs/adr/model/0009-vault-read-is-per-path.md),
[0023](../../docs/adr/model/0023-grant-unit-is-the-path.md),
[0027](../../docs/adr/model/0027-secret-reference-join-key.md)):

- The placeholder join is **byte equality against the granted path**, with no
  mount rewrite and no engine taxonomy. The `#<key>` half selects which value
  fills the variable and confers nothing; `keys:` documents and validates and
  confers nothing either.
- `delivery: file` and `delivery: self` grants carry no placeholder at all —
  a file grant renders a projected file, nothing in the environment — and both
  are excluded from `E_UNBOUND_SECRET_GRANT`. A non-KV engine — `transit/keys/auth-api-jwt` — is
  never materialised into a variable or a file, so a placeholder naming one is
  `E_UNAUTHORISED_SECRET_REFERENCE`.
- `E_ROLL_AFFECTS_OTHER_READERS` computes over the **readers of the path**, never
  over declared key sets; over key sets it under-reports by the difference
  between the subset and the document. The case is live:
  `secret/platform/observability` holds the Prometheus token, the Discord webhook
  and the Grafana client secret, and one CronJob rolls one of those keys.

### Completeness

| invariant | error |
|---|---|
| every expected participant resolves | `E_PARTICIPANT_MISSING` |
| every participant's publish is within its `maxAge` | `E_PARTICIPANT_STALE` |
| reachability equals derived ∪ registered exactly | `E_UNREGISTERED_SURFACE` |
| every live object is attributable or ledgered (chapter 30) | `E_UNATTRIBUTED_OBJECT` |
| every ledger entry still matches something | `E_LEDGER_ENTRY_STALE` |
| no derived value is removed while a consumer still depends on it (chapter 50) | `E_CONTRACT_TOO_EARLY` |

The last two here, and `E_DISK_BINDING_CONFLICT` above, are evaluated against the
pinned `ClusterState` snapshot
([0034](../../docs/adr/model/0034-cluster-state-pinned-input.md)), so their verdict is
exactly as fresh as that snapshot — composition reads no live cluster.

## Participants

The expected set is **enumerated**, not derived. Deriving it from inbound
references was considered and rejected: a **leaf** Service that nothing depends
on can vanish without breaking any reference, and leaves are the majority —
`immich`, `jellyfin`, `sonarr`, `radarr`, `bazarr`, `prowlarr`, `qbittorrent`.
Seven media services, zero inbound edges, invisible to any edge-derived guard.

`participants.yml` is the one central artefact that survives composition by
fragments. It changes when a domain is added or retired, never when a
declaration changes — and since one fragment is exactly one domain
([0063](../../docs/adr/model/0063-intent-authored-per-domain.md)), that sentence is now
literal rather than approximate. The list enumerates domains, and because a
domain has exactly one publisher it is also the domain-to-repository map that
`E_DUPLICATE_DOMAIN` is checked against. A repository holding several domain
files appears once per domain rather than once per repository, so dropping one
domain file out of a repository that still publishes its others is
`E_PARTICIPANT_MISSING` rather than an unremarked absence.

```yaml
participants:
  intent-nodes:      {}          # maxAge defaults to 7d
  intent-data:       {}
  intent-knowledge:  {}
  intent-agents:     {}
  intent-media:
    maxAge: 21d
    reason: releases batch with the upstream chart, roughly fortnightly
  intent-observability:
    dormant: true
    owner: joris
    reason: stable since 2026-03; no declaration change expected before v1
    reviewBy: 2026-11-30
```

**`maxAge` defaults to 7 days.** The number is measured, not chosen for
roundness: `CHANGELOG.md` records 26 releases between 2026-06-09 and 2026-08-20 —
one every 2.8 days — so seven days is about 2.5 observed intervals. Long enough
to absorb two consecutive missed releases, short enough that a broken publish job
is caught in the week it breaks
([0038](../../docs/adr/model/0038-participants-list-staleness.md)). A participant that
genuinely publishes less often overrides the default **with a written reason**;
an override without one is a build error.

`dormant: true` is the separate exemption and is a Bidirectional Ledger entry
like any other (chapter 30): owner, reason, review date, and a date in the past
fails the build. It exempts a participant from `maxAge` **and from nothing
else** — a dormant fragment still unions, still satisfies every invariant above,
and still has to sit inside the accepted version range below. A domain nobody is
otherwise touching must therefore still be republished when the model moves.

### A missed publish is a deletion

`E_PARTICIPANT_MISSING` is not pedantry, and this is the reason the participants
list is load-bearing rather than hygiene. **A render that omits an entire domain
is a valid render.** Nothing inside it is wrong; it simply does not contain that
domain, so every one of the invariants above passes and the composed digest is
perfectly reproducible. The absence is indistinguishable from a retirement.

At the model level that means: an unpublished domain reaches whatever consumes
the `ComposedIntent` as an *intentional* absence. Composition is the only place
that can tell the difference, because it is the only place holding the
enumeration of what was expected. What a delivery mechanism then does with an
absent domain — including whether it removes objects — is defined separately
([docs/adr/deferred/README.md](../../docs/adr/deferred/README.md)); the model's
obligation is to refuse to emit the render in the first place.

## Versioning

`schemaVersion` is **the data model's own semver**. It starts at `1.0.0` and
moves only when the model moves:

| bump | when |
|---|---|
| major | a field is removed, or the meaning of an existing field changes |
| minor | vocabulary is added |
| patch | wording is clarified with no field change |

It is **not** the toolkit package's version. Today the two are one number by
construction: `src/cluster-context/schema.ts:75-79` throws
`E_SCHEMA_VERSION_MISMATCH` when `ctx.spec.schemaVersion !== getPackageVersion()`,
and `getPackageVersion()` reads `package.json`, which sits at `0.22.0` and moves
at release cadence — 26 releases in ten weeks, most of which changed code and not
the model. Under this rule the literal `schemaVersion: 1.0.0` written by every
document in this specification, including the lock below, is correct and stays
correct across those releases: the model is at `1.0.0`, the toolkit is at
`0.22.0`, and they are allowed to differ
([0007](../../docs/adr/model/0007-schema-version-separable.md),
[0039](../../docs/adr/model/0039-artifact-schema-versioning.md)).

Composition admits a fragment on a **range**, not on equality:

| fragment version vs the composing toolkit | verdict |
|---|---|
| major differs, either direction | `E_SCHEMA_VERSION_MISMATCH` |
| same major, minor > toolkit's minor | `E_SCHEMA_VERSION_MISMATCH` |
| same major, minor ≤ toolkit's minor | admitted |
| patch differs | admitted; patch never gates |

Those two conditions are the **only** ones that fire the error. The message must
name which of the two rules fired, which fragment, and at which digest; a gate
whose message says the wrong thing is the one people learn to ignore.

Minor > toolkit stays a hard stop because the union is silent about what it
drops. A fragment using vocabulary an older toolkit cannot read would compose
with the unknown fields discarded and exit zero — a declared volume, grant or
dependency edge leaving the tree with no digest, exit code or ledger noticing. A
loud stop is recoverable; a missing PVC is not.

Equality is rejected for the opposite reason: it fails closed over the **union**.
One stale participant blocks every composition, including the composition
carrying the fix, and dormancy does not exempt a fragment from a version check.
The estate already demonstrates that skew is survivable — `0.16.0` in four
service repos, `0.20.0` in `stalwart-provisioner`, `0.22.0` in the published
contexts, and it functions.

**Admission and reproduction are different jobs.** The range governs what
composition accepts; the **lock records the exact resolved versions** — each
fragment's `schemaVersion` and the toolkit version that produced the
`ComposedIntent` — so a replay runs the versions that actually ran, not the range
that admitted them. A lock recording ranges instead of exact versions would break
byte-identical replay at the only moment it matters.

The range's determinism rests on an untested claim: that a fragment written
against minor *m* renders identically under every toolkit minor ≥ *m* within the
same major. It is falsified by one render-hash inequality across the minors a
range admits (`computeRenderHash`, `src/artifact/contract.ts:41`); see the open
item below.

## Version rollout

A model bump is never one pull request, and this chapter says so rather than
claiming there is nothing to build. The sequence:

| step | who | verified by |
|---|---|---|
| 1. publish the toolkit at the new model version | release operator | pull by digest, read `schemaVersion` back out |
| 2. republish each fragment or context carrying documents at that version | that domain's owner | pull by digest, read `schemaVersion` back out |
| 3. open the pin bump in each consumer | Renovate | the ordering gate |
| 4. merge | a human | the gate, green |

Steps 1 and 2 are manual and outside CI, and they are verified **by pulling the
artefact by digest and reading `schemaVersion` back out of it — never by the
publish step's exit code**. That is the estate's own rule applied to its own
publish path.

Step 3 rides **Renovate**, because `renovate.json` is already present in every
pinning repository; no new bump automation is built. The only machinery this
specification adds is the **ordering gate**, and it exists because Renovate
cannot be sequenced: a consumer's pin PR may appear before the republish in step
2 has landed and will sit red until it does.

Three normative properties of the gate:

- **Its failure message says the context has not been republished yet** — the
  literal wording is *"context not yet republished"* — never that the version is
  wrong. A routinely-red Renovate PR whose message misdescribes the cause is the
  thing people learn to ignore.
- **It computes compatibility, not string equality**, against the range in
  [Versioning](#versioning). It therefore needs the toolkit's current model
  version readable at gate time, which this repository must publish somewhere the
  gate can fetch.
- **A model bump is never grouped and never auto-merged.** The gate must run and
  a human must read it; auto-merging on green removes the only reader of the
  message, and green before step 2 is meaningless.

The wiring is the part that has already gone wrong: the Renovate manager pattern,
the gate workflow's `paths:` filter and the path the gate actually reads must all
name **the same file**. When they diverge, a bump touches a file no workflow
reads, triggers no gate, and every run reports success. The check is mechanical —
for each consumer, compare `renovate.json`'s `managerFilePatterns` against both
the workflow's `paths:` filter and its read path, and require every pair to name
one file.

Under the range, most releases open no consumer PR at all: only a model change
moves the pin, so a bump becomes rare — and correspondingly less rehearsed.
Rollout of anything other than a version pin, including how a composed lock
reaches a cluster, is defined separately
([docs/adr/deferred/README.md](../../docs/adr/deferred/README.md)).

## Unmanaged surfaces

Service Intent covers Kubernetes workloads only. The estate has three deployment
targets, not one: `samba` exists only as a NixOS module yet owns
`samba.lan.jorisjonkers.dev`; `wolf` exists in neither target and owns
`wolf.jorisjonkers.dev`; `adguard` and `ollama` exist in both; and host-level
services — `tailscale`, `media-storage`, `backup-storage`,
`btrfs-backup-snapshots` — have no cluster presence at all. `tailscale` here is
the host daemon; it is not a placement capability, that use having retired with
the flat capability vocabulary
([0061](../../docs/adr/model/0061-placement-is-hard-dimensions.md)). Modelling NixOS was
rejected: rendering it is not writing a file but producing a build and an
activation, an order of magnitude more v1 scope for roughly eight hosts.

That leaves a remainder, and an unbounded remainder is how the seven-way split of
`kb.jorisjonkers.dev` began: a scope boundary silent about what falls outside it
bounds nothing, it just moves the drift where no check looks.

Every hostname the model does not deploy is therefore a **Registered Unmanaged
Surface** — a Bidirectional Ledger entry (chapter 30) carrying an owner, a reason
and a review date:

```yaml
unmanagedSurfaces:
  - host: samba.lan.jorisjonkers.dev
    owner: joris
    reason: NixOS module; no Kubernetes workload exists
    reviewBy: 2026-11-30
  - host: wolf.jorisjonkers.dev
    owner: joris
    reason: deployed in neither target; public and unowned until this entry
    reviewBy: 2026-11-30
```

Composition asserts **set equality**: estate reachability equals the derived set
plus the registered set, exactly.

| condition | error |
|---|---|
| a reachable hostname is in neither set | `E_UNREGISTERED_SURFACE` |
| a registered entry matches no reachable hostname | `E_LEDGER_ENTRY_STALE` |
| a registered host is also authored as an exposure `host` | `E_DUPLICATE_HOST` |
| an entry's `reviewBy` is in the past, or `owner`/`reason` is empty | `E_LEDGER_REVIEW_OVERDUE` |

The third row is [Identity](#identity)'s `E_DUPLICATE_HOST` reaching across this
boundary. The two sets do not merely cover the hostname space between them, they
**partition** it, so the check is asserted over their union rather than over the
derived half alone: `wolf.jorisjonkers.dev` is spoken for by a ledger
entry, and a Service later authoring `host: wolf.jorisjonkers.dev` has to
collide with it rather than quietly take the name back.

Derived entries come from Audience declarations
([0018](../../docs/adr/model/0018-exposure-by-audience.md)); registered entries come
from the ledger; anything in neither is a build error
([0019](../../docs/adr/model/0019-registered-unmanaged-surfaces.md)). Because the check
is symmetric, the register cannot quietly outlive what it excuses.

A registration is an **unverified assertion**: nothing proves `samba` is actually
listening where the entry claims. What it buys is that every hostname in the
estate has exactly one owner of record — derived or registered — and that
`wolf`'s status becomes explicit data with a name against it rather than an
accident nobody had noticed.

## The composition lock

The output, generalising `cluster-composition-lock` from two pinned contexts to
N pinned fragments:

```yaml
apiVersion: resolved.jorisjonkers.dev/v1
kind: CompositionLock
metadata:
  cluster: production
  generatedAt: 2026-09-07T14:22:07Z
spec:
  schemaVersion: 1.0.0                # the model version of this document
  toolkitVersion: 0.22.0              # exact version that composed it
  composedDigest: sha256:…            # of the ComposedIntent
  previousLockDigest: sha256:…
  lockChain:
    - {digest: sha256:…, commit: 22b9d33, timestamp: …}
  fragments:
    intent-knowledge:
      ref: ghcr.io/jorisjonkers-dev/intent-knowledge@sha256:…
      domain: knowledge               # exactly one per fragment
      repository: JorisJonkers-dev/knowledge
      schemaVersion: 1.0.0            # exact resolved model version
      sourceSha: 22b9d33…
      inputsSha: 84021c5…
    intent-data: {…}
  context:
    ref: ghcr.io/jorisjonkers-dev/cluster-deploy-context-public@sha256:…
    inventorySourceSha: 84021c5…
  clusterStateDigest: sha256:…        # the pinned snapshot, chapter 20
```

`domain` and `repository` are recorded per fragment because the union is over
domains and a domain has exactly one publisher
([0037](../../docs/adr/model/0037-composition-oci-fragments.md),
[0063](../../docs/adr/model/0063-intent-authored-per-domain.md)). A replay can then
show which repository published a domain at that digest, and a domain that moved
repositories between two locks appears as a diff rather than as a quietly
different render.

The two version fields are what makes the range in
[Versioning](#versioning) safe: `schemaVersion: 1.0.0` and
`toolkitVersion: 0.22.0` differ legitimately, and both are exact — no range is
ever recorded here.

`lockChain` is inherited deliberately: it answers "when did this fragment's digest
change, and which render did that produce" without diffing published artefacts.

Re-composing from a recorded lock pins every fragment by digest, runs the recorded
toolkit version, and must yield the identical `composedDigest`. Combined with
chapter 20's pinned-input rule and chapter 30's `renderHash`, that gives one
unbroken chain from a published fragment to a rendered file.

## Cross-service references

A reference is a Service Id and, where it names a connection, a surface name.
Resolution is a lookup in the union — no URL, no repository coordinate, no
network call at authoring time. The surface is found on the Workload of that
Service which provides it, so a reference names a Service and a surface and never
a Workload or a namespace.

Renaming a Service is therefore a breaking change to every inbound reference,
which is what `E_UNRESOLVED_SERVICE` reports, and there is no escape hatch left:
the `aliases` block is deleted
([0063](../../docs/adr/model/0063-intent-authored-per-domain.md)). It existed so a
*coordinate* could diverge from the identity, and it now has nothing to express —
the namespace comes from `domain`, and the Workload name and the image are fields
the author already writes explicitly
([0010](../../docs/adr/model/0010-flat-service-identity.md)). A Service id that reads
nothing like its processes is not a divergence to be recorded: Service
`home-portal` holding Workload `app-ui` with image `app-ui` is simply what those
things are called. A rename lands in every referring domain file, or composition
fails.

## Delivery and co-testing are defined separately

Composition ends at two published artefacts: the `ComposedIntent` and its lock.
What consumes that lock, how objects reach a cluster, which identity applies
them, what is removed and when, and how a dependency on another unit for testing
gates a deploy are **not specified here and not specified anywhere in this
version of the model**. They are defined separately; the parked direction work
is [docs/adr/deferred/README.md](../../docs/adr/deferred/README.md).

The model makes exactly three demands on whatever that definition turns out to
be: all-or-nothing switchover of a Service's Workloads
([0062](../../docs/adr/model/0062-service-is-the-release-unit.md)), destructive
operations gated by Durability Class
([0015](../../docs/adr/model/0015-durability-class-per-volume.md)), and rendering from
pinned inputs only
([0006](../../docs/adr/model/0006-pinned-inputs.md),
[0034](../../docs/adr/model/0034-cluster-state-pinned-input.md)).

## Open in this chapter

1. **The range's determinism claim is untested.** Same-major, minor-≤ admission
   assumes a minor bump only adds vocabulary, so renders are identical across
   the minors a major admits.
   - **Owner:** joris.
   - **Settled by:** render the pinned estate inputs once per published toolkit
     minor within a major and assert `computeRenderHash`
     (`src/artifact/contract.ts:41`) is equal across the set; one inequality
     falsifies the range and forces a major bump.
   - **Blocks:** trusting the range. Until it runs, admission across minors is a
     decision in direction, not a proven property.
2. **The 7-day bound is calibrated against today's cadence.** It is 2.5 observed
   release intervals, not a general constant.
   - **Owner:** joris.
   - **Settled by:** `oras repo tags` against the GHCR namespace over 90 days;
     take the maximum inter-publish gap per participant. The default fails if any
     non-dormant participant routinely exceeds 7 days while healthy.
   - **Blocks:** nothing. A failure re-numbers the default; it does not remove
     the list.
3. **Whether the union may span clusters.** The lock is keyed by cluster, but the
   invariants — Service Id uniqueness in particular — are estate-wide rather than
   per-cluster.
   - **Owner:** joris.
   - **Settled by:** a second cluster existing. With one cluster the distinction
     is unobservable.
   - **Blocks:** nothing in v1.
4. **Fragment signing.** Composition verifies `MANIFEST.sha256` per file but not
   provenance, while the estate's publish already produces attestations
   (`id-token: write`, `attestations: write` in `deploy-artifact.yml`).
   - **Owner:** joris.
   - **Settled by:** deciding whether composition requires a verified signature,
     then asserting a tampered fragment with a valid `MANIFEST.sha256` is
     rejected.
   - **Blocks:** nothing today; it bounds what a compromised publish credential
     can do.
5. **Composition asserts eligibility, never fleet capacity.** Every Workload
   having an eligible node does not mean the fleet can run them all, and nothing
   in this chapter compares total declared demand with what the nodes publish.
   - **Owner:** joris.
   - **Settled by:** summing `placement.memory` and `placement.cpu` across the
     composed union and comparing them with the node contract's `allocatable`
     totals — the fleet's seven nodes total 129536Mi and 189600m before each
     node's declared reserve. A demand above that total is unschedulable no
     matter how it is spread, and would be worth failing at composition.
   - **Blocks:** nothing today. Until it runs, over-subscription surfaces as the
     scheduler refusing to place a pod, which is the conceded cost of
     eligibility ([0061](../../docs/adr/model/0061-placement-is-hard-dimensions.md)).
