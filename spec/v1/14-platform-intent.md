# Chapter 14 — Platform Intent

Layer 1 has **two** authored documents, and this chapter is the second. Service
Intent (chapter 10) says what a Service needs; Platform Intent says what the
estate offers. Both are held to the same rule — **requirements and facts, never
mechanisms** — and one test decides which document a value lives in: the
contention test ([0004](../../docs/adr/model/0004-contention-decides-authority.md)).
A value a Service could state for itself belongs in chapter 10; a value that
must be unique across the estate or draws on a shared finite resource belongs
here.

Until [0095](../../docs/adr/model/0095-platform-intent-is-the-second-authored-document.md)
this document was called the Cluster Context, had no chapter, and acquired its
fields one decision at a time. The name changes because the content is
authored intent, not observed context, and because it now enters composition
the way every other authored document does.

## The document

```yaml
apiVersion: intent.jorisjonkers.dev/v1
kind: Platform
schemaVersion: 1.0.0
owner: joris
```

One Platform document per estate. It is published as an **Intent Fragment**
([chapter 40](40-composition.md#fragments)) by the repository that owns the
platform, pushed by digest like any domain, and it is a **required participant**
whose staleness bound is the same seven days
([chapter 40](40-composition.md#participants)). There is no side channel: a
render that cannot find the platform fragment is `E_PARTICIPANT_MISSING`, and a
render against a stale one is `E_PARTICIPANT_STALE`.

## What it does not contain

Three things a reader might expect here live elsewhere, each for a reason.

| not here | where | why |
|---|---|---|
| the foundation components — Vault, VSO, Traefik, the metrics stack, Gatus | domain files the platform owns, as ordinary Services ([The foundation is declared](#the-foundation-is-declared)) | a Service is a Service; a second way to declare one is the duplicate vocabulary [0003](../../docs/adr/model/0003-three-layer-meta-model.md) exists to end |
| the node contract — site, arch, allocatable, gpus, disks per node | its own pinned input, authored once where nix reads it ([0056](../../docs/adr/model/0056-node-facts-single-source.md), [chapter 60](60-setup.md#node-facts)) | folding it in would make nix read a deployment-model document or duplicate the facts |
| anything executable | the images lock, as a purpose-built image per engine ([Engines](#engines)) | [0012](../../docs/adr/model/0012-assets-not-code.md) applies to the platform's own files |

The Platform document names the node contract it was composed against, by
digest, so the pinned input set stays closed
([0006](../../docs/adr/model/0006-pinned-inputs.md)).

## Substrate facts

Facts about the cluster that decide other decisions
([0057](../../docs/adr/model/0057-datastore-and-restore.md)). Each is named for
what it is, never for how k3s is told about it: a CLI flag is a derivation
nobody authors, or an observation recorded under 0057, and it appears in no
authored file.

```yaml
substrate:
  kubernetesVersion: v1.31.4+k3s1
  datastore: sqlite                  # sqlite | etcd
  serverCount: 1
  secretsEncryption: false           # gates delivery: env and file (0028)
  cni: flannel
  networkPolicyController: embedded  # none | embedded | cni
```

| fact | read by |
|---|---|
| `kubernetesVersion` | schema validation of every rendered object; [0036](../../docs/adr/model/0036-cni-selection.md)'s evaluation |
| `datastore`, `serverCount` | the restore rehearsal; every decision resting on [0002](../../docs/adr/model/0002-kubernetes-as-substrate.md) |
| `secretsEncryption` | `E_SECRETS_AT_REST_REQUIRED` ([0028](../../docs/adr/model/0028-secrets-at-rest-gate.md)) |
| `cni`, `networkPolicyController` | whether a non-enforcing policy stage exists ([0084](../../docs/adr/model/0084-render-only-is-the-v1-policy-stage.md)) |

## The bootstrap set

A render cannot apply itself. The things that must exist before the first
rendered object can land are **recorded, not declared**
([0096](../../docs/adr/model/0096-the-foundation-is-declared.md)), and the set is
enumerated here so that growing it is a decision:

```yaml
bootstrap:
  flux:
    sourceRef: flux-system/platform          # the source that pulls the tree
  vault:
    unsealed: true                           # unseal is out of band
  crds:                                      # cluster-scoped schema, pinned
    - traefik.io/v1alpha1
    - secrets.hashicorp.com/v1beta1
    - monitoring.coreos.com/v1
```

| in the set | why it cannot be declared |
|---|---|
| k3s itself | it is what applies |
| the Flux source | it pulls the tree that everything else is in |
| Vault's unseal | a secret the model must never hold |
| the CRDs the estate uses | cluster-scoped schema that must exist before any object of that kind can apply; the components that *use* them are declared Services |

Everything not in this table is a declared Service. The set is a
[Bidirectional Ledger](30-deliverables.md#ledgers) in shape: an entry nothing
needs fails the build, and a component that should be declared and is not is
`E_UNATTRIBUTED_OBJECT`.

## The foundation is declared

Vault, VSO, Traefik, Prometheus and Gatus are Services in domain files the
platform owns — `platform/edge.yml`, `platform/secrets.yml`,
`platform/observability.yml` — with an `image`, Workloads, `engine`, grants,
`exposure`, volumes and a Durability Class like any tenant Service
([0096](../../docs/adr/model/0096-the-foundation-is-declared.md)). Nothing
about them is hand-written, and every estate-wide invariant in
[chapter 40](40-composition.md#the-estate-wide-invariants) sees them.

Two consequences are normative:

- **No chart is rendered.** A component whose upstream ships a Helm chart is
  declared from its image; what the chart added — defaults and CRDs — is
  respectively what a declaration replaces and what the bootstrap set pins.
  `HelmRelease` and `HelmRepository` are not rendered kinds.
- **Two Traefik instances are two Services**, placed by capability: one on the
  `public-ingress` node, one on a LAN node. That placement, and the tier facts
  below, are what keep LAN traffic off the Frankfurt proxy — not which adapter
  emitted the route.

The estate-scoped Deliverables that used to have adapters of their own — the
Gatus endpoints, the edge catalogs — are **inbound derivations** of the platform
Service that consumes them ([chapter 16](16-dependencies.md#what-an-edge-derives-read-inbound)),
rendered as that Service's own Assets, exactly as the database catalog is for
`postgres` ([0080](../../docs/adr/model/0080-database-catalog-is-derived-data.md)).

## Tiers

A tier is where the edge terminates. It declares **four edge facts**, in the
model's words, and the `traefik` adapter maps them to Traefik's
([0097](../../docs/adr/model/0097-authored-values-name-model-concepts.md)):

```yaml
tiers:
  - name: public-frankfurt
    audiences: [anonymous, authenticated]
    listener: tls                      # tls | plain
    certificates: acme                 # acme | none
    forwardAuth: http://auth-api.auth-system.svc.cluster.local:8081/api/auth/forward
    traefik: traefik-public            # the declared Service that is this tier's proxy
  - name: lan
    audiences: [lan]
    listener: plain
    certificates: none
    traefik: traefik-lan
```

| fact | meaning |
|---|---|
| `audiences` | which audiences this tier carries; a route's audience selects its tier, and an audience no tier carries is `E_NO_TIER_FOR_AUDIENCE` |
| `listener` | whether the edge terminates TLS |
| `certificates` | how certificates are issued for what it terminates |
| `forwardAuth` | the endpoint that authenticates for it; required where `authenticated` is carried, `E_NO_FORWARD_AUTH_ENDPOINT` otherwise ([0076](../../docs/adr/model/0076-middleware-has-one-producer.md)) |
| `traefik` | the platform Service whose proxy this tier is |

`entryPoint`, `certResolver` and every other Traefik spelling appear only in the
adapter. A route's audience is the **only** way it reaches a tier, so a `lan`
exposure can reach the LAN proxy and no other — by construction, not by which
adapter ran.

## Durability policy

One policy per Durability Class
([0077](../../docs/adr/model/0077-durability-derives-a-backup.md)). The window
is one node's IO and the destination one remote target, so both are
platform-assigned:

```yaml
durability:
  reconstructible: {}
  recoverable:   {schedule: "15 3 * * *", retain: 14}
  irreplaceable: {schedule: "45 2 * * *", retain: 90,
                  offCluster: {destination: s3://backup-storage/jorisjonkers-dev,
                               credential: secret/data/platform/backup/off-cluster}}
```

## Engines

The method for an `engine` **is an image**: one purpose-built image per engine,
whose entrypoint performs the backup, resolved through the images lock like every
other image ([0097](../../docs/adr/model/0097-authored-values-name-model-concepts.md)).
The Platform document names the alias and nothing executable.

```yaml
engines:
  postgres: {backup: postgres-backup}
  rabbitmq: {backup: rabbitmq-backup}
  files:    {backup: file-backup}
```

A shell command in an authored file is what [0012](../../docs/adr/model/0012-assets-not-code.md)
refuses for a Service, and it is refused here for the same reason: what the
image does is versioned and digested; a string in YAML is neither.

## Observability is not configured here

The Platform document carries **no** observability policy: no scrape cadence, no
receiver map, no rule catalog. Intent declares two facts — `alertClass` on the
Service and `scrape {port, path}` on a Workload — and a versioned configuration
owned and run by the observability Service turns those into ServiceMonitors,
PodMonitors, cadence, external checks, PromQL, severity and receiver routing
([chapter 10](10-service-intent.md#the-observability-boundary)).

The one claim the model still makes is a composition-time guarantee: a Service
above `alertClass: none` must publish a signal, and the runner must fail if it
cannot map that signal and class to active monitoring and a receiver
(`E_ALERT_CLASS_WITHOUT_SIGNAL`). Everything past that boundary is stack
configuration of a monitoring system this document does not operate.

## Hardening policy

One posture for every container the estate renders
([0016](../../docs/adr/model/0016-pod-hardening.md)):

```yaml
hardening: restricted
```

The class is the platform's because it is uniform and contended: thirty
declarations of the only legal value are thirty copies of one decision
([0004](../../docs/adr/model/0004-contention-decides-authority.md)). A Workload
therefore authors no class — only the **exceptions** it needs, each naming one
control with a reason ([chapter 10](10-service-intent.md#pod-hardening)), and
that list is the estate's inventory of what it cannot harden.

A second class earns a value here when an image exists that cannot meet
`restricted` and cannot be excepted control by control. Until then this is one
value, and the vocabulary stays one value wide.

## Probe and ephemeral policy

One probe cadence for the estate
([0088](../../docs/adr/model/0088-startup-probe-targets-liveness.md)) and one
ephemeral size for a declared writable path
([0092](../../docs/adr/model/0092-writable-paths-are-declared.md)):

```yaml
probes:    {periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3}
ephemeral: {sizeLimit: 64Mi}
```

## Providers

Things the estate runs and this model does not deploy, that a Service may
depend on. A **provider is a fact, not a hole**
([0095](../../docs/adr/model/0095-platform-intent-is-the-second-authored-document.md)):
it has an address and surfaces, an edge resolves against it
([0090](../../docs/adr/model/0090-edges-resolve-against-the-register.md)), and
it carries no review date because it is not going away.

```yaml
providers:
  - name: stalwart
    address: 10.0.0.12
    surfaces: {smtp: 25, http: 8080}
```

A hostname nobody deploys and nobody depends on is still a hole, and stays a
Registered Unmanaged Surface in the ledger
([chapter 40](40-composition.md#unmanaged-surfaces)) with an owner, a reason and
a review date. The two were one list until 0095 split them; an edge resolves
against facts, never against exemptions.

## There is nothing to override here

**Layer 1 has no generic override mechanism and this document carries no
overridable-derivations table.** A derived value has one declaring site — the
derivation — and an assignment has one author — the platform. The sole local
exception is capacity ([chapter 10](10-service-intent.md#capacity)):

```yaml
replicas:
  count: 2
  reason: Capacity retained after the Frankfurt consolidation; the replicas are spread across two nodes.
```

There is no `E_UNKNOWN_OVERRIDE`, because there is no key set to be outside.
What used to sit in a ten-row table resolves three ways:

- **A workload-class difference is a derivation bug.** If one rule is wrong for a
  whole class of Workload, the rule is repaired and the estate re-rendered —
  which is what `startupDeadline` was, and why it is now one rule over
  `startupBudget` rather than a per-Workload exception.
- **A platform policy stays platform policy.** Cadence, retention, ephemeral
  size, probe timing and route precedence are contended and shared; they are
  stated once here or derived, and no Service restates them.
- **An irreducible Service fact earns a named field** with its own authority,
  validation and example — not a generic entry pointing at a rendered field.

That is deliberately more demanding than adding a row. An unbounded exception
system becomes the normal configuration interface, and a value reachable two ways
has no single declaring site — which is the property chapter 16's
single-authority check exists to protect.

## Open in this chapter

1. **Whether one Platform document may describe two clusters.** It is one per
   estate today because the estate has one cluster; the union-across-clusters
   question in [chapter 40](40-composition.md#open-in-this-chapter) decides
   this with it.
   - **Owner:** joris.
   - **Settled by:** the second production cluster appearing, or the horizon in
     [0001](../../docs/adr/model/0001-estate-scale-and-ownership.md) passing
     without one.
   - **Blocks:** nothing in v1.
