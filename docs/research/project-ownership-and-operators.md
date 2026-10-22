# Project ownership of delivered objects, and the operators that could take each job

Where deploy-kit renders an object outside the Project it serves, or lets one
Project's change alter another Project's render, why each case was decided that
way, and which pre-built operator or CRD could carry the job per Project
instead. The question it serves: the three models (Project Intent, Platform
Intent, Resolved Deployment) stay, but the delivery layer should not move an
unrelated Project's render, pin or unit because secrets or routes changed in
some other Project. Researched 2026-10-21; see [the index](README.md#method) for
the markers used.

This is evidence, not decision. Nothing here changes a recorded decision. Where
a finding bears on one, the record is named and left as it is; changing it is an
ADR's job, in the pull request that changes what it decides.

Versions as of the research date:

| component | version | source |
|---|---|---|
| Flux | v2.9.6 latest; behaviour below checked against kustomize-controller and notification-controller v1.8.3 | `gh release list --repo fluxcd/flux2` |
| Traefik | v3.7.16 latest | `gh release list --repo traefik/traefik` |
| Vault | the estate runs a 2.x release | |
| Vault Secrets Operator | v1.6.2 | `gh release list --repo hashicorp/vault-secrets-operator` |
| Red Hat COP vault-config-operator | v1.0.4, 2026-10-18 | `gh api repos/redhat-cop/vault-config-operator/releases` |
| CloudNativePG | v1.30.1 | `gh api repos/cloudnative-pg/cloudnative-pg/releases/latest` |
| Crossplane provider-sql | v0.16.2 | `gh api repos/crossplane-contrib/provider-sql/releases/latest` |
| K8up | 4.10.0 | `gh api repos/k8up-io/k8up/releases/latest` |

## The estate, as read

Read-only, on 2026-10-21, and stated here only as far as the rendered output
already implies it:

- **Every Flux unit lives in Flux's own namespace**, the estate-path units
  (`apps-<project>`, `estate-vso-secrets`, `estate-rollout-events`) beside the
  old path's, and applies as the controller's own account rather than as a
  per-Project identity.
- **Flux's multi-tenancy model is not in use.** Units are not separated by
  namespace or by identity.
- **Every estate-path Project that holds a grant waits on the shared secrets
  unit**, through a `dependsOn` on `estate-vso-secrets`.
- **Routes reference shared Middlewares across namespaces**, so the edge proxy
  must admit cross-namespace references.

## 1. Inventory of cross-project and estate-wide coupling

Two different effects are kept apart below, because they need different fixes:

- **Re-render**: Project B's artifact content changes, so B's pin moves and a
  Rollout is recorded for B, although B's own fragment did not change.
- **Shared gate**: B's artifact does not change, but B's unit cannot reconcile
  while a shared unit is not Ready, or B's object is applied by a unit B does
  not own.

The mechanism that decides a re-render is the content hash. Composition hashes
each artifact's files and moves a pin when the hash differs from the pinned one
(`src/application/compose-estate.ts:646`, `:655`), and every pin that moves on a
Project's artifact carries a Rollout at that Project's current fragment version
(`compose-estate.ts:671-683`). Chapter 55 states the intended consequence: "A
composition that renders a Project whose content hash equals the pinned
artifact's publishes no artifact and moves no pin, so another Project's
fragment never redeploys this one"
([chapter 55](../../spec/v1/55-delivery.md#rendered-artifacts-and-pins),
`spec/v1/55-delivery.md:114-117`). That holds only where a Project's share is a
function of its own fragment and the platform. The rows marked *re-render*
below are where it does not.

| # | coupling | where | if Project A changes X | effect on other Projects |
|---|---|---|---|---|
| C1 | **One Vault policy Job for the estate.** The documents of every rendered Project go into one `ConfigMap` and one `Job`, both named `vault-policy-<12 hex>` over all documents and the pod's inputs | `src/application/render-intent-set.ts:128-171`; `spec/v1/30-deliverables.md:187-207` | A adds or changes a grant, a Process that holds one, or a generated key | **Shared gate.** Only `_estate` changes and only the estate pin moves. But every Project whose Application holds a grant follows `estate-vso-secrets` (`src/resolve/application.ts:92-105`), so while the new Job runs, or if it fails, no such Project's unit reconciles. Incidents: [#454](https://github.com/JorisJonkers-dev/deploy-kit/issues/454), [#461](https://github.com/JorisJonkers-dev/deploy-kit/issues/461), [#472](https://github.com/JorisJonkers-dev/deploy-kit/issues/472) ("seven Projects ... went Not ready at once"), [#529](https://github.com/JorisJonkers-dev/deploy-kit/issues/529). A deploy-kit release that changes the pod template renames the Job for every Project at once |
| C2 | **The database catalog of a shared datastore.** One catalog per datastore names every consuming estate-path Project; its `Job`, `ConfigMap`, identity and Vault documents are in `estate/vso-secrets/` | `render-intent-set.ts:178-194`; [chapter 16](../../spec/v1/16-dependencies.md#applying-the-catalog), `spec/v1/16-dependencies.md:248-255` | A adds or removes an edge to Postgres | **Shared gate**, as C1: a new catalog Job and a new policy Job in the same unit. For a datastore A runs itself, the unit deadlocks on A's namespace and A's datastore, and "**every** estate Project's unit is held, not only immich's" ([#482](https://github.com/JorisJonkers-dev/deploy-kit/issues/482)) |
| C3 | **Edge routes per tier.** A's `IngressRoute`s live in A's namespace but are planned at `estate/edge/<tier>/` and applied by `estate-edge-<tier>` | `src/adapters/traefik/render.ts:133`; `src/application/pin-sources.ts:107-128`; [chapter 20](../../spec/v1/20-resolved-deployment.md#the-reconcile-unit), `spec/v1/20-resolved-deployment.md:1138` | A adds, changes or removes a route | **Shared gate.** Only `_estate` changes. The tier's unit follows the proxy's Project **and every Project with an exposure on the tier** (`pin-sources.ts:115-126`), so one routed Project that is not Ready holds every other Project's route change on that tier, and one refused route holds the whole tier. A's first route on a tier also rewrites the estate pin source's `dependsOn` |
| C4 | **Shared Middlewares in the proxy's namespace.** Every route names `forward-auth` and `security-headers` in the proxy's namespace | `traefik/render.ts:104-111` | the edge Project changes a shared Middleware | Intended platform coupling: every route on the tier uses it. It needs cross-namespace references admitted on the proxy |
| C5 | **Rollout events.** One `Provider` and one `Alert` in Flux's namespace, the Alert matching every Kustomization labelled `managed-by: deploy-kit` | `src/adapters/kubernetes/events.ts:25-54`; `render-intent-set.ts:218-223` | nothing a Project changes alters them | **None at runtime.** The objects depend on platform facts only (Flux's namespace, the Reporter's address). The cost is structural: the model-driven implementation adds them, with the policy Job, to "the first document's Deliverables" (`emf/bundles/resolve/model/estate.qvto:1-6`, `:116-128`) |
| C6 | **Rollback backups.** One-shot backup Jobs for A, in `estate/rollback-backups/<project>.yaml` | [chapter 55](../../spec/v1/55-delivery.md#pause-and-rollback); chapter 30 no longer has the section, since [#557](https://github.com/JorisJonkers-dev/deploy-kit/issues/557) removed the Rollback's own backup | A's pin asks for a Rollback's backup | Only `_estate` changes. The estate pin moves and its other units re-apply unchanged content; no other Project's artifact or pin moves |
| C7 | **A provider's NetworkPolicy lists its consumers.** The provider Process's ingress names each consumer Process by namespace and instance, and each migration identity that reaches its database | `src/resolve/policy.ts:110-126`, `:146-171`; [chapter 16](../../spec/v1/16-dependencies.md#the-derived-allow-set), `spec/v1/16-dependencies.md:489`, `:494` | B adds or removes an edge to a surface of A, or renames a consuming Process | **Re-render of the provider.** A's `networkpolicy.yaml` changes, so A's content hash changes, A's artifact is published, A's pin moves and a Rollout is recorded at A's unchanged version. No index lists a `networkpolicy.yaml` while policy is render-only (`src/adapters/kubernetes/render.ts:1120`), so nothing applied changes and no pod restarts; once enforced, the applied policy changes too. Inferred from the code, not drilled |
| C8 | **Inbound catalogs as a platform Application's Assets** (specified, not rendered). The Gatus endpoint list, the Traefik edge catalogs and browser origin allow-lists are "inbound derivations of the platform Application that consumes them ... rendered as that Application's own Assets" | `spec/v1/14-platform-intent.md:244-248`; `spec/v1/16-dependencies.md:84-90`; no producer in `src/` (`grep -rn gatus src` finds nothing) | A adds or changes a route | **Re-render of the platform Project, with a restart.** An Asset is an immutable `ConfigMap` "under the content-hashed name an edit changes" (`src/adapters/kubernetes/render.ts:592`), mounted into the pod, so a changed catalog changes the consumer's pod template. This is the strongest case of "an unrelated Project receives a new render because routes changed elsewhere", and it is not yet built |
| C9 | **Stable Addresses in `estate-system`** (specified, not rendered) | [chapter 16](../../spec/v1/16-dependencies.md#the-stable-address), `spec/v1/16-dependencies.md:108`; no producer in `src/` | A's surface gains its first consumer, or A moves | Only `_estate` changes. Until it renders, an alias points at the provider's own address, so "A consumer's render then still moves when its provider moves, but only its alias does" (`spec/v1/16-dependencies.md:182-186`) |
| C10 | **Declared pulls.** `${dependency:<app>.port}`, `${dependency:<app>.host}` and `${exposure:<app>.<name>#<field>}` resolve against the union | `src/resolve/process.ts:189-201`, `:404` | A changes a surface's port or an exposure's host that B references | **Re-render of B.** B asked for the value, so this is the consumer reading its own input, and every tool surveyed below behaves the same way |
| C11 | **Pin source rewrites that move no digest.** A source is rewritten when "a unit this one follows joined the estate path" or the Platform document's repository, signer or pull Secret changed | `spec/v1/55-delivery.md:150-160` | A's unit joins the estate path | B's source file changes with the same `ref.digest`, committed `[ci skip]`. Flux reconciles the changed Kustomization; nothing new is deployed |
| C12 | **Platform facts.** "a node added to the contract re-renders every Project" | `spec/v1/30-deliverables.md:405` | the platform changes | Re-render of every Project. Platform-owned, and outside the question |

Per-Project already, and not a coupling: the Namespace and its default-deny
(`apps/<project>/namespace.yaml`, `networkpolicy.yaml`), the `VaultConnection`
per namespace, a `VaultAuth` per identity and a `VaultStaticSecret` or
`VaultDynamicSecret` per grant beside its Application
([chapter 30](../../spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied),
`spec/v1/30-deliverables.md:147-158`), the Release Gate's ConfigMap per
Application, the migration Jobs, the scheduled backups, and the aliases in
the consumer's own namespace.

## 2. The recorded reason for each

| # | reason as recorded |
|---|---|
| C1 | "Writing a policy into Vault is an act against a live system performed by a privileged identity. This decision produces attributed documents and stops there" ([0040](../adr/model/0040-vault-policy-is-a-deliverable.md), line 51). The operator alternative was rejected because it "Adds an operator and CRDs the substrate does not run, making them a v1 dependency for a document that only needs to be written once per identity" (0040, line 71). The job spans every Project because "This job needs the policy documents of every project a render holds, which no project file can name" ([0087](../adr/model/0087-in-cluster-consumers-read-the-render.md), line 54), and the operator alternative there was "a CRD and an operator for a set of documents that change at deploy time only" (0087, line 81). Generated keys joined it because "A seed Job per Project would need its own ordering before the release, its own policy and its own role, per Project" ([0101](../adr/model/0101-a-generated-key-is-written-by-the-vault-policy-job.md), line 39) |
| C2 | "A datastore and the Secret Store are contended by every project, so their configuration is the platform's" ([0102](../adr/model/0102-the-database-catalog-is-applied-by-its-engines-method.md), Rests on); it is in `estate-vso-secrets` "so no Application that reads a database starts before its catalog is applied" (`spec/v1/16-dependencies.md:252-254`) |
| C3 | "each tier's routes are one unit, which follows the tier's proxy and every project it serves. One unit per tier, so a refused route holds its own tier and no other" ([0033](../adr/model/0033-reconcile-unit-derived.md), lines 78-81). During handover, edge units "would be a second source for the routes the old path still serves, so they wait until no Project is `legacy`" ([0054](../adr/model/0054-projects-are-handed-over-one-at-a-time.md), line 67) |
| C5 | "The Alert selects units by the label every pin source's unit carries, so no Project is named in it and none has to be added to it" ([0099](../adr/model/0099-a-rollout-is-a-github-deployment-driven-by-the-clusters-events.md), line 107) |
| C6 | "The backup Jobs in the Project's own render" was rejected because "re-rendering with today's Platform document can roll the Project during its own backup" ([0084](../adr/model/0084-pause-and-rollback.md), line 87) |
| C7 | "a provider must admit its consumers, and only the inbound set says who they are" (`spec/v1/16-dependencies.md:89`); "No Application knows its own consumers" ([0042](../adr/model/0042-declarations-compose-from-intent-fragments.md), line 38) |
| C8 | Three estate-scoped catalog adapters were folded into the Applications that consume them, "three adapters for three inbound derivations" being the rejected alternative ([0047](../adr/model/0047-one-publication-path.md), line 69) |
| C9 | "An alias in the provider's own namespace dies with a move between Projects, the change it exists for. `estate-system` belongs to the estate-scoped artifact, which no Project's move touches" ([0093](../adr/model/0093-a-provider-is-reached-through-its-stable-address.md), line 58) |
| all | One artifact per Project so that "a render whose content did not change publishes nothing, and an unrelated publish deploys nothing" ([0051](../adr/model/0051-a-project-is-delivered-as-a-signed-artifact.md), line 47): the property the maintainer asks for is already the recorded intent |

## 3. Pre-built tooling, per job

### Vault policies and auth roles

**Vault Secrets Operator does not manage policies.** Its API reference lists
`CSISecrets`, `SecretTransformation`, `VaultAuth`, `VaultAuthGlobal`,
`VaultConnection`, `VaultDynamicSecret`, `VaultPKISecret` and
`VaultStaticSecret`, and no kind for a policy or an auth role
([VSO API reference](https://developer.hashicorp.com/vault/docs/deploy/kubernetes/vso/api-reference));
its overview describes only syncing: "The Vault Secrets Operator (VSO) allows
Pods to consume Vault secrets natively from Kubernetes Secrets"
([VSO](https://developer.hashicorp.com/vault/docs/deploy/kubernetes/vso)).
External Secrets Operator is the same shape on the read side (a namespaced
`SecretStore`: "This resource is namespaced"), and leaves the provider's access
policy to the operator of the store
([ESO overview](https://external-secrets.io/latest/introduction/overview/)).
Neither replaces C1.

**Red Hat COP vault-config-operator** maps Vault's write APIs to CRDs: among
them `Policy`, `PasswordPolicy`, `KubernetesAuthEngineRole`, `AuthEngineMount`,
`SecretEngineMount`, `DatabaseSecretEngineConfig`, `DatabaseSecretEngineRole`,
`DatabaseSecretEngineStaticRole`, `RabbitMQSecretEngineRole`, `RandomSecret`
and `VaultSecret`
([README](https://github.com/redhat-cop/vault-config-operator)). Maturity:
v1.0.4 on 2026-10-18, a release roughly monthly, 169 stars, an arm64 image,
Helm install, a validating webhook whose certificate comes from cert-manager or
is supplied.

- **Privilege model.** "we give no permissions to the operator itself against
  Vault. All APIs exposed by this operator contains enough information to
  authenticate to Vault using a local service account (local to the namespace
  where the API exist)" (`readme.md:61`). Each CR carries an
  `authentication` block (`path`, `role`, `serviceAccount.name`), "roughly"
  `vault write auth/kubernetes/login role=<role> jwt=<sa token>`
  ([auth section](https://github.com/redhat-cop/vault-config-operator/blob/main/docs/auth-section.md)).
  So a Project's CRs act with exactly the Vault role bound to a ServiceAccount
  in that Project's namespace.
- **Names.** A `Policy` is written at `sys/policies/acl/<spec.name or
  metadata.name>` (`api/v1alpha1/policy_types.go:42-53`); a
  `KubernetesAuthEngineRole` at `auth/<path>/role/<spec.name or
  metadata.name>`, binding `policies` to `targetNamespaces` or a
  `targetNamespaceSelector` (`kubernetesauthenginerole_types.go:55-62`,
  `:76-79`, `:170-174`). Vault's policy namespace is flat, so the rendered
  `<namespace>-<identity>` names carry over unchanged.
- **Can a Project's CR touch only its own paths?** Partly. Vault templated
  policies inject identity into path keys only: "currently the `path` keys in
  policies allow injection"
  ([policies](https://developer.hashicorp.com/vault/docs/concepts/policies)).
  A per-namespace writer role can therefore be confined to policy and role
  *names* under its prefix, for example
  `sys/policies/acl/{{identity.entity.aliases.<accessor>.metadata.service_account_namespace}}-*`,
  and `allowed_parameters` can restrict a role's parameters to listed values
  with prefix or suffix globs (same page). Nothing confines a policy's
  *content*: a role that may write `<ns>-x` may write `path "*"` into it and
  bind it to its own ServiceAccount. Vault Enterprise namespaces would bound
  that, but "Vault Community Edition ignores the namespace"
  ([auth section](https://github.com/redhat-cop/vault-config-operator/blob/main/docs/auth-section.md)).
  The real boundary stays where it is today: only a render composition checked
  and signed reaches the cluster. Today's policy-admin Job can already write any
  policy, so per-Project CRs are no wider; they are not narrower either.
- **What it would remove.** The shared Job, its digest name and the four fixes
  it needed; the generated-key hand-off of
  [0101](../adr/model/0101-a-generated-key-is-written-by-the-vault-policy-job.md),
  since `RandomSecret` writes a random value into KV and, without a
  `refreshPeriod`, does not overwrite an existing one
  ([secret management](https://github.com/redhat-cop/vault-config-operator/blob/main/docs/secret-management.md));
  and the Vault half of the catalog (C2) through `DatabaseSecretEngineRole`.
- **Differences to weigh.** It reconciles on every change and, with
  `ENABLE_DRIFT_DETECTION`, on a sync period (default 10 h, `readme.md:208`),
  where the job runs per render and hourly. Deleting a `RandomSecret` deletes
  the KV secret unless `kvSecretRetainPolicy: Retain`; chapter 30 says the job
  "never deletes" (`spec/v1/30-deliverables.md:251`). Whether deleting a
  `Policy` CR deletes the Vault policy is **unverified**. Whether it runs
  against the estate's Vault release is **unverified** (settle by drill: install, apply one
  `Policy` and one `KubernetesAuthEngineRole`, `vault policy read`).

**Vault's own per-namespace pattern needs no operator for own-prefix reads.** A
Kubernetes auth role accepts `bound_service_account_namespace_selector`, "A
label selector for Kubernetes namespaces allowed to access this role"
([Kubernetes auth API](https://developer.hashicorp.com/vault/api-docs/auth/kubernetes)),
and one templated policy can grant
`secret/data/{{identity.entity.aliases.<accessor>.metadata.service_account_namespace}}/*`
(the example on the policies page). A Project reading only under its own
prefix then needs no Vault write at all when it is added. The estate's grants
are not all own-prefix: the worked examples read `secret/data/platform/postgres/auth`
and `secret/data/platform/rabbitmq` (`spec/v1/examples/auth/auth.project.yml:309`,
`spec/v1/examples/knowledge/knowledge.project.yml:75`), so per-identity policies remain for
shared paths. It also gives up the per-principal diff
[0040](../adr/model/0040-vault-policy-is-a-deliverable.md) and
[0031](../adr/model/0031-identity-per-process.md) value.

**A per-Project policy Job** is the option with no new dependency: the same
image and documents, one Job per Project named by a digest of that Project's
documents, in a unit of the Project's own, ordered before its workloads. A
failure then holds only that Project. Its costs: the platform's policy-admin
role must be bound to a ServiceAccount in each Project's namespace (or the Job
written into the Secret Store's namespace from a Project's artifact, the
cross-namespace write [0087](../adr/model/0087-in-cluster-consumers-read-the-render.md)
rejects), and one Job, ConfigMap and CronJob per Project. Terraform or OpenTofu
through an in-cluster controller (for example `flux-iac/tofu-controller`) is a
third route and would add a state backend; not evaluated further.

### Edge routes

**Traefik CRDs per namespace.** `IngressRoute`s already sit in the
Application's namespace (`traefik/render.ts:83`). Traefik watches all
namespaces by default ("If left empty, watch all namespaces") and a reference
to another namespace needs `allowCrossNamespace`, "Allows the `IngressRoutes`
to reference resources in namespaces other than theirs", default `false`
([Kubernetes CRD provider](https://doc.traefik.io/traefik/reference/install-configuration/providers/kubernetes/kubernetes-crd/)).
Moving the route files under `apps/<project>/` changes nothing Traefik sees;
only which unit applies them. Rendering the shared Middlewares in each
Project's namespace would let `allowCrossNamespace` go back to `false`, at the
cost of a copy per namespace that changes with the edge Project's settings.

**Gateway API** is the standard multi-tenant shape. Its roles separate the
cluster operator, "concerned with policies, network access, application
permissions", from the application developer, who manages "configuration
(e.g. timeouts, request matching/filter) and Service composition"
([roles and personas](https://github.com/kubernetes-sigs/gateway-api/blob/main/site/content/en/docs/concepts/roles-and-personas.md)).
The platform owns a shared `Gateway`; "Only Namespaces which are labelled
`shared-gateway-access: "true"`" attach routes when a listener sets
`allowedRoutes.namespaces.from: Selector`
([multiple namespaces](https://gateway-api.sigs.k8s.io/guides/multiple-ns/)).
Route-to-Gateway attachment is governed by `allowedRoutes`; `ReferenceGrant`
is for a Route reaching a backend, or a Gateway reaching a Secret, in another
namespace, created by "the object's owner"
([ReferenceGrant](https://github.com/kubernetes-sigs/gateway-api/blob/main/site/content/en/reference/api-types/referencegrant.md)).
deploy-kit routes only to its own Application's Services, so it would need no
`ReferenceGrant`. Two limits: an `HTTPRoute` filter's `extensionRef` is a
`LocalObjectReference` (`apis/v1/httproute_types.go:965`), so a Traefik
Middleware attached through it must sit in the route's own namespace (Traefik's
docs show both in one namespace and name no cross-namespace form,
[Gateway API routing](https://doc.traefik.io/traefik/reference/routing-configuration/kubernetes/gateway-api/));
and Traefik supports Gateway API v1.6 with `TCPRoute` only from the
experimental channel (same page). The estate already has the Gateway API CRDs
at v1.5.1, standard channel
([service-mesh research](service-mesh.md#the-estate-as-read)).

**Ordering.** A Flux `dependsOn` entry may name a Kustomization in any
namespace (`depRef.Namespace` is honoured, kustomize-controller v1.8.3,
`internal/controller/kustomization_controller.go:575-579`), and "the
Kustomization is only applied after the referred Kustomizations are ready"
([Kustomization](https://fluxcd.io/flux/components/kustomize/kustomizations/)).
A route unit per Project that follows `apps-<project>` and the proxy's
Project's unit gives the ordering 0033 wants, isolated per Project.

### Rollout events

Flux's `Alert` selects `eventSources` by `kind`, `name` (or `*`), `namespace`
and `matchLabels`; the namespace defaults to the Alert's, `providerRef` names a
Provider "in the same namespace as the Alert", and under
`--no-cross-namespace-refs` an Alert "can only refer to event sources in the
same namespace as the alert object"
([Alerts](https://fluxcd.io/flux/components/notification/alerts/)). So a
per-Project Alert, as [#545](https://github.com/JorisJonkers-dev/deploy-kit/issues/545)
proposes, lives where the Project's Kustomization lives. Today that is
`flux-system` for every Project, so a per-Project Alert would be one more
object per Project in a namespace no Project owns. Once Kustomizations move
into Project namespaces (below), a per-Project `Alert` and `Provider` in the
Project's namespace is the natural form.

### Network policy between Projects

A provider must admit a consumer at the destination: "both the egress policy on
the source pod and the ingress policy on the destination pod need to allow the
connection"
([network policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)).
What can vary is whether the provider's policy *names* its consumers:

- **Name each consumer (today).** `namespaceSelector` on the immutable
  `kubernetes.io/metadata.name` label ANDed with a `podSelector` in one `from`
  entry (same page). Precise and diffable; every new consumer edits the
  provider's object (C7).
- **Admit by a label the consumer carries.** The provider admits pods labelled,
  for example, `access.deploy-kit/<application>-<surface>: "true"` in any
  namespace carrying `managed-by: deploy-kit`, and each consumer's own pod
  template carries the label its edge derives. The provider's render is then
  invariant to its consumer set. A label is self-asserted: NetworkPolicy does
  nothing "TLS related (use a service mesh or ingress controller for this)"
  (same page), and anyone who can write a pod template can set the label. In
  this estate only composition writes pod templates and it checks the edge, so
  the trust point is unchanged; the provider's file stops saying who may reach
  it, and the Kubernetes multi-tenancy guide recommends against the broadest
  form: "not to use empty label selector '{}' for namespaceSelector field"
  ([multi-tenancy](https://kubernetes.io/docs/concepts/security/multi-tenancy/)).
- **Cluster-scoped admin policy.** `ClusterNetworkPolicy` is the one API the
  policy working group still develops; AdminNetworkPolicy and
  BaselineAdminNetworkPolicy are `v1alpha1` and "no longer actively developed"
  ([network-policy-api](https://network-policy-api.sigs.k8s.io/)). Support by
  k3s's embedded policy controller is **unverified** and unlikely.
- **A mesh does not remove the list.** An Istio `AuthorizationPolicy` matches
  `principals` and `namespaces` from the peer certificate, with exact, prefix,
  suffix and presence matches, and a policy in the root namespace "applies to
  all namespaces in a mesh"
  ([AuthorizationPolicy](https://istio.io/latest/docs/reference/config/security/authorization-policy/)).
  There is no label selector on the source, so an identity policy still lists
  consumer principals, or a principal pattern. The derivation sketched in
  [`service-mesh.md`](service-mesh.md#deriving-authorizationpolicy-from-the-edge-set)
  puts "`from.principals` the inbound edge set's consumer principals" on the
  provider: C7 again, in a second kind.

### Rollback backups and the database catalog

- **Backups.** Velero's `Backup` "Must be the namespace of the Velero server"
  (`site/content/docs/main/api-types/backup.md:30`, vmware-tanzu/velero), so it
  is a platform object by construction. K8up is namespaced: "Just create a
  `schedule` and a `credentials` object in the namespace you'd like to backup"
  ([README](https://github.com/k8up-io/k8up)). Either would still need an
  applier, and the reason in
  [0084](../adr/model/0084-pause-and-rollback.md) (the Project's render must not
  move while its backup runs) is about the pin, not the tool. It holds.
- **Database catalog.** CloudNativePG's declarative `Database` names its
  cluster as a `LocalObjectReference` (`api/v1/database_types.go:62-64`), so it
  lives in the datastore's namespace, and its `databaseReclaimPolicy` defaults
  to `retain`. That is the standard pattern: a per-consumer object, owned on the
  provider's side. Crossplane provider-sql ships namespaced `Database`, `Role`
  and `Grant` kinds (`postgresql.sql.m.crossplane.io`) beside a
  `ClusterProviderConfig`, which would let the consumer's namespace hold its own
  database objects, at the price of Crossplane itself. The estate's Postgres is
  a plain StatefulSet, not a CloudNativePG cluster, so either is a migration.
  For a datastore a Project runs itself, the catalog belongs in that Project's
  own unit after the datastore, which is what
  [#482](https://github.com/JorisJonkers-dev/deploy-kit/issues/482) asks.

### Flux multi-tenancy

The reference repository states the model in one line: "The trust boundary of a
tenant is the Kubernetes namespace assigned to it by the platform admin." The
platform admin "Manages cluster wide resources (CRDs, controllers, cluster
roles, etc) and policies to enforce tenant restrictions" and "Manages tenants by
assigning namespaces, service accounts and RBAC"; a tenant "Can only deploy
workloads in the namespaces assigned by the platform admin"
([flux2-multi-tenancy](https://github.com/fluxcd/flux2-multi-tenancy)). The
lockdown flags "Deny cross-namespace access to Flux custom resources", and
`--default-service-account` makes a Kustomization without
`spec.serviceAccountName` impersonate the tenant namespace's `default` account,
which has no permissions
([multi-tenancy lockdown](https://fluxcd.io/flux/installation/configuration/multitenancy/)).
In kustomize-controller v1.8.3 the flag blocks a cross-namespace `sourceRef`
(`kustomization_controller.go:684`) and does not block a cross-namespace
`dependsOn`, so ordering on a platform unit still works under lockdown. The
estate runs none of this today (see [the estate, as read](#the-estate-as-read)).

## 4. Best practice

The surveyed projects converge on one split:

- **The platform owns what is shared and changes rarely**: controllers and
  CRDs, the Gateway and its listeners, the auth mount and the secret engines,
  namespaces and the RBAC a tenant applies with, cluster-wide policy floors,
  and any name that must outlive a tenant (the Stable Address namespace).
- **A tenant owns namespaced objects in its own namespace**, which name the
  shared infrastructure by reference: its routes (attached by `parentRefs` or
  an `IngressRoute`), its secret sync (`VaultAuth`, `VaultStaticSecret`), its
  Vault policy and role where a configuration operator is used, its Alert, its
  backups.
- **Admission of a tenant is a platform decision expressed as a selector**, not
  a list that grows: `allowedRoutes.namespaces.from: Selector`, a Vault role's
  `bound_service_account_namespace_selector`, a templated policy keyed on the
  ServiceAccount's namespace.
- **Ordering between tenant and platform is a dependency on the platform's
  unit**, never a platform unit that waits on every tenant.

The principle, stated for deploy-kit: **a Project's artifact holds every object
that exists because of that Project, and nothing whose content depends on
another Project's fragment; what several Projects share is a platform object
whose content depends only on platform facts.** A tenant's change then moves
only its own artifact. The one exception the surveyed tools accept is
authorization on the provider's side (who may reach a datastore, which
databases exist on it): a shared provider either lists its consumers, or admits
by a selector that only a trusted writer can satisfy.

## 5. Gap table

| # | current mechanism | why chosen | pre-built alternative | what moves into the Project | cost | unrelated Projects still updated? |
|---|---|---|---|---|---|---|
| C1 | One estate Job writing every policy, role and generated key | no Vault configuration operator in the substrate; the job's input taken to be the whole render | (a) per-Project policy Job, no new dependency; (b) vault-config-operator `Policy`, `KubernetesAuthEngineRole`, `RandomSecret` | each Project's policies, roles and generated keys, in a unit of its own before its workloads | (a) rewrite [0087](../adr/model/0087-in-cluster-consumers-read-the-render.md), [0101](../adr/model/0101-a-generated-key-is-written-by-the-vault-policy-job.md), chapter 14's Vault policy job and chapter 30; (b) also [0040](../adr/model/0040-vault-policy-is-a-deliverable.md), an operator, its webhook certificate and CRDs as a platform dependency, the `vault-policy` adapter re-spelled as CRs; both implementations and every `_estate` oracle | No. A Project's grant change moves only its own artifact and holds only its own unit |
| C2 | Catalog Jobs per datastore, in the shared secrets unit | the datastore is contended, so the platform owns its configuration | a unit per datastore; for a Project-owned datastore, the Project's own unit ([#482](https://github.com/JorisJonkers-dev/deploy-kit/issues/482)); CloudNativePG `Database` or provider-sql later | the catalog of a datastore the Project runs | rewrite [0102](../adr/model/0102-the-database-catalog-is-applied-by-its-engines-method.md), chapter 16's "Applying the catalog"; both implementations, oracles | A shared datastore's catalog still changes when a consumer joins, but its failure holds only that datastore's consumers, not the estate |
| C3 | `estate/edge/<tier>/` applied by `estate-edge-<tier>`, after every routed Project | ordering after proxy and namespace; per-tier isolation; handover staging | routes under `apps/<project>/`, a route unit per Project after `apps-<project>` and the proxy's unit ([#546](https://github.com/JorisJonkers-dev/deploy-kit/issues/546)); Gateway API later | the Project's routes and its rate-limit Middlewares | rewrite [0033](../adr/model/0033-reconcile-unit-derived.md)'s estate-unit consequence, [0054](../adr/model/0054-projects-are-handed-over-one-at-a-time.md)'s edge staging, chapter 20's unit table and path plan, chapter 30's path allocation, chapter 55's "A Project's artifact holds its one unit"; both implementations' templates (the `listed()` union goes); oracles | No |
| C4 | Shared Middlewares in the proxy's namespace | one definition per tier | a copy per Project namespace, or Gateway-level policy | the Middlewares a route names | `allowCrossNamespace` can be turned off; a change to the edge's shared settings then re-renders every routed Project | Yes, by design, when the platform's edge settings change; never for another Project's change |
| C5 | Wildcard Alert and Provider in `_estate` | one object set, no Project named | keep as a platform object, or per-Project Alert once Kustomizations live in Project namespaces ([#545](https://github.com/JorisJonkers-dev/deploy-kit/issues/545)) | nothing, until tenancy | small; the gain is removing the "first model" rule in `emf/` ([#547](https://github.com/JorisJonkers-dev/deploy-kit/issues/547)) | Not today either |
| C6 | Estate-scoped backup Jobs | the Project's pin must not move during its backup | none better; K8up or Velero would still need the same applier | nothing | none | No |
| C7 | Provider policy names every consumer | only the inbound set knows the consumers | label-based admission; or the hash and the Rollout exclude unapplied files while policy is render-only | nothing moves; the provider's file stops depending on consumers | rewrite [0035](../adr/model/0035-network-policy-is-default-deny-and-render-only.md) and chapter 16's derived allow set; mesh design in [0112](../adr/model/0112-east-west-traffic-is-mutually-authenticated-by-an-ambient-mesh.md) inherits the choice | Under label admission, no. Under today's rule, yes: the provider's pin moves and a Rollout is recorded |
| C8 | Inbound catalogs as Assets of a platform Application (not built) | three adapters folded into one rule ([0047](../adr/model/0047-one-publication-path.md)) | Gatus and Traefik read routes from the cluster themselves; Gatus's Kubernetes discovery is **unverified** | nothing; the catalog stops being rendered | rewrite chapter 14's sentence and chapter 16's inbound table before anything is built | Yes, with a restart, if built as specified |
| C9 | Stable Addresses in `estate-system` (not built) | the name must outlive a provider's move | none needed: it is platform-owned shared infrastructure | nothing | none | Only `_estate` |
| C10 | Declared pulls | the consumer asked for the value | none; every surveyed tool resolves references the same way | nothing | none | Yes, and correctly: the consumer's input changed |

## 6. Why it was not done so far

- **"An operator the substrate does not run."** The reason in
  [0040](../adr/model/0040-vault-policy-is-a-deliverable.md) and
  [0087](../adr/model/0087-in-cluster-consumers-read-the-render.md) is narrower
  than "no operators": the estate already runs VSO, Flagger and Flux, all
  operators with CRDs. What it does not run is a Vault *configuration*
  operator. The cost [0002](../adr/model/0002-kubernetes-is-the-substrate-for-one-applier.md)
  counts, that "the foundation carries the CVEs and the CRD upgrades", is real
  and still holds; the incidents [#454](https://github.com/JorisJonkers-dev/deploy-kit/issues/454)
  to [#529](https://github.com/JorisJonkers-dev/deploy-kit/issues/529) are the
  price paid for the alternative.
- **"The job needs the documents of every project."** This is a design
  assumption, not a constraint: the documents are already one per identity and
  named by namespace, so the set partitions by Project without loss.
- **Determinism and parity.** Both implementations must compute the same Job
  name (0087, last paragraph). A per-Project digest is exactly as deterministic,
  and a CR has no derived name at all. The parity cost is in the work, not the
  property: every move touches `src/`, `emf/`, the oracles and the
  `_estate` comparison ([#547](https://github.com/JorisJonkers-dev/deploy-kit/issues/547)).
- **One applier.** Flux stays the only Kubernetes applier under every option
  here ([0002](../adr/model/0002-kubernetes-is-the-substrate-for-one-applier.md),
  [0050](../adr/model/0050-delivery-is-part-of-the-model.md)). A Vault
  configuration operator would write Vault, as the policy Job does now; it adds
  no applier to Kubernetes.
- **Rendered, not applied.** Holds unchanged: a CR is a rendered Deliverable like
  any other, and it is the operator, not the compiler, that writes Vault.
- **Handover from fleet-infra.** The edge units wait until no Project is
  `legacy` because they would be a second source for routes the old path
  serves ([0054](../adr/model/0054-projects-are-handed-over-one-at-a-time.md)).
  That holds while the handover runs, and applies equally to per-Project route
  units.
- **Per-tier isolation.** [0033](../adr/model/0033-reconcile-unit-derived.md)
  chose a unit per tier so that a refused route holds one tier. A unit per
  Project isolates strictly more finely, so the reason supports the move.
- **No Application knows its consumers.** True of the model, and the reason
  C2, C7 and C8 exist. It decides *that* an inbound derivation is needed, not
  that its output must land in the provider's share.
- **Stable Addresses outside any Project.** [0093](../adr/model/0093-a-provider-is-reached-through-its-stable-address.md)
  is the platform-owned shared name best practice describes; it should stay.

## 7. Recommendation candidates

Evidence, not decision. Ordered by how much unrelated-Project coupling each
removes per unit of cost; each names the records it would rewrite and its place
under [#544](https://github.com/JorisJonkers-dev/deploy-kit/issues/544).

1. **Give each shared datastore's catalog its own unit, and a Project-owned
   datastore's catalog its Project's unit.** Removes the "every Project held"
   failure of C2 and the [#482](https://github.com/JorisJonkers-dev/deploy-kit/issues/482)
   deadlock without a new dependency. Rewrites
   [0102](../adr/model/0102-the-database-catalog-is-applied-by-its-engines-method.md)
   and chapter 16; belongs under #544 as the epic text already says.
2. **Split the Vault policy Job per Project** (C1), named by a digest of that
   Project's documents and applied by a unit of the Project's, before its
   workloads. No new dependency; a failure holds one Project. Rewrites
   [0087](../adr/model/0087-in-cluster-consumers-read-the-render.md) and
   [0101](../adr/model/0101-a-generated-key-is-written-by-the-vault-policy-job.md),
   chapter 14's Vault policy job block, chapter 30, and the secrets row of
   chapter 20. This is the fallback outcome of the spike
   [#548](https://github.com/JorisJonkers-dev/deploy-kit/issues/548).
3. **Spike vault-config-operator** ([#548](https://github.com/JorisJonkers-dev/deploy-kit/issues/548))
   against the estate's Vault release: one `Policy`, one `KubernetesAuthEngineRole`, one
   `RandomSecret`, deletion behaviour, and a writer role confined by name prefix.
   If adopted, it replaces candidate 2's Job with CRs in the Project's own
   artifact and also takes the generated keys. Rewrites
   [0040](../adr/model/0040-vault-policy-is-a-deliverable.md) (its operator
   alternative), 0087 and 0101, and adds the operator to the platform's
   foundation.
4. **Route units per Project** ([#546](https://github.com/JorisJonkers-dev/deploy-kit/issues/546)):
   routes under `apps/<project>/`, applied by a second Kustomization of the
   Project's artifact that follows `apps-<project>` and the proxy's Project, so
   a failing proxy holds the routes and not the workloads, and one Project's
   refused route holds only that Project. Rewrites
   [0033](../adr/model/0033-reconcile-unit-derived.md)'s estate-unit
   consequence, [0036](../adr/model/0036-path-authority-is-layer-2.md)'s
   estate-scoped directory list and
   [0054](../adr/model/0054-projects-are-handed-over-one-at-a-time.md)'s edge
   staging, plus chapters 20, 30 and 55. Gateway API with a platform-owned
   `Gateway` is a later, separate step.
5. **Decide C7 before policy enforcement and the mesh land.** Either admit by
   consumer-carried labels (the provider's share becomes independent of its
   consumers), or keep the list and stop an unapplied file from moving a pin and
   recording a Rollout. Rewrites
   [0035](../adr/model/0035-network-policy-is-default-deny-and-render-only.md)
   and chapter 16's derived allow set, and fixes the premise
   [0112](../adr/model/0112-east-west-traffic-is-mutually-authenticated-by-an-ambient-mesh.md)'s
   AuthorizationPolicy derivation inherits. Not yet under #544; it would be a new
   child.
6. **Rewrite C8 before it is built.** Chapter 14's sentence that the Gatus
   endpoints and edge catalogs are rendered as a platform Application's Assets
   specifies the worst coupling in this inventory: a route change anywhere would
   restart a platform Application. Not yet under #544.
7. **Rollout events** ([#545](https://github.com/JorisJonkers-dev/deploy-kit/issues/545)):
   the objects are already invariant to every Project, so a per-Project Alert
   in `flux-system` adds objects without removing a coupling. It is worth doing
   together with candidate 8, or by moving the two objects into the platform's
   own share; either retires the "first model" rule that
   [#547](https://github.com/JorisJonkers-dev/deploy-kit/issues/547) targets.
8. **Flux multi-tenancy, last.** Kustomizations in Project namespaces with
   `serviceAccountName`, the lockdown flags on, and namespaces and RBAC owned
   by the platform. It makes the per-Project boundary enforced rather than
   conventional and discharges part of
   [0002](../adr/model/0002-kubernetes-is-the-substrate-for-one-applier.md)'s
   open `kubectl auth can-i` check, but it moves every pin source and every
   Namespace object. A separate epic.
9. **Keep estate-scoped:** the rollback backups ([0084](../adr/model/0084-pause-and-rollback.md)'s
   reason holds), the Stable Addresses
   ([0093](../adr/model/0093-a-provider-is-reached-through-its-stable-address.md)),
   and the platform fixtures (auth mount, KV and database mounts). Whatever
   remains gets the estate-scoped model of
   [#547](https://github.com/JorisJonkers-dev/deploy-kit/issues/547).

## Open verification

| claim | settle by |
|---|---|
| A provider's pin moves and a Rollout is recorded when a consumer adds an edge (C7) | test: compose two fragments, add a consumer edge in one, assert the provider artifact's `moves` and `rollout` |
| vault-config-operator v1.0.4 writes `Policy` and `KubernetesAuthEngineRole` against the estate's Vault release | drill: install, apply one of each, `vault policy read`, `vault read auth/kubernetes/role/<name>` |
| Deleting a vault-config-operator `Policy` CR deletes the Vault policy | drill, or read its finalizer in the controller source |
| A writer role confined to `sys/policies/acl/<ns>-*` by a templated path refuses another prefix | drill against the estate's Vault |
| Traefik resolves an `extensionRef` Middleware only in the HTTPRoute's namespace | drill, or Traefik's Gateway provider source |
| k3s's embedded network policy controller implements no admin or cluster network policy | read the k3s release notes for the pinned version |
| Gatus can discover endpoints from the cluster rather than from a rendered list | Gatus documentation |
| The kustomize-controller's own account is cluster-admin on this estate | `kubectl get clusterrolebinding -o wide` for its ServiceAccount |
