# Rendered output — the `auth` domain

What a renderer must produce from
[`../auth.domain.yml`](../auth.domain.yml) and
[`../env/auth-api.base.env`](../env/auth-api.base.env), rendered by hand against
the model as decided: chapter 10 (intent), chapter 16 (identity, edges, policy),
chapter 20 (the derivations), chapter 30 (adapters and attribution), and the
placement amendment in `review/PLACEMENT-DOMAIN-MANIFEST.md`.

It is the GOAL STATE, not today's output. Today's renderer emits no
`securityContext`, no `resources` and pins nothing; everything below is what the
decisions require. Where a value cannot be derived from the intent as declared,
it is marked in the file rather than invented, and the reason is a row in
[Gaps](#gaps).

One Service (`auth`), two Workloads (`auth-api`, `auth-ui`), namespace
`auth-system`. Both Workloads' objects sit in one Service directory, because a
Service is the unit of atomic release — and that grouping is the whole of what
the rendered tree says about atomicity. See [G-01](#g-01), which is the most
important entry here.

Attribution is a property of the producing adapter, declared in the registry
(0054) — not an annotation on the object, which was considered and rejected
because an edit can lose it. The `# adapter:` header on each file is a reading
aid; the table below is the attribution.

## The files

| file | adapter | derives from (layer 1) | cannot derive today |
|---|---|---|---|
| `namespace.yaml` | `kubernetes` | `domain: auth` → `auth-system` | Nothing. It is the one derivation with a single input. The adapter emits namespace.yaml *per Service directory*, so a second Service in this domain would emit a second identical object — [G-14](#g-14) |
| `kustomization.yaml` | `kubernetes` | the Service list | Nothing it needs. It groups; it does not gate — [G-01](#g-01) |
| `apps/auth/workload.yaml` | `kubernetes` | `lifecycle`, `image`, `provides`, `placement`, `hardening`, `probes`, `startupBudget`, `zeroDowntime`, `minAvailable`, env files, `runtime`, `dependsOn`, `exposure` | the hostname the AUTH_* URLs need ([G-03](#g-03)); the smtp coordinate ([G-04](#g-04)); `AUTH_CORS_ALLOWED_ORIGINS` ([G-05](#g-05)); the replica count ([G-06](#g-06)); the startup probe's endpoint and the unstated probe timings ([G-08](#g-08)); which paths need to be writable ([G-09](#g-09)); that this JVM is Spring ([G-10](#g-10)); 9 `OTEL_*`, 6 `PYROSCOPE_*`, `DEPLOYMENT_ENVIRONMENT`, `VAULT_ADDR` ([G-11](#g-11)); auth-ui's env entirely ([G-12](#g-12)); the label set ([G-13](#g-13)); a UID for `runAsNonRoot` ([G-26](#g-26)); the pod/container split of the hardening class ([G-28](#g-28)); which label carries `arch` ([G-29](#g-29)); the image digests ([G-32](#g-32)) |
| `apps/auth/serviceaccount.yaml` | `kubernetes` | workload `name` (the identity is the Workload name alone), `domain` | `automountServiceAccountToken` ([G-15](#g-15)); any Role/RoleBinding the identity model implies ([G-31](#g-31)) |
| `apps/auth/pdb.yaml` | `kubernetes` | `minAvailable: 1` on auth-api | auth-ui's default, which is ungraded; and nothing compares the budget against the derived replica count ([G-07](#g-07)) |
| `apps/auth/servicemonitor.yaml` | `kubernetes` | `scrape {port, path}`, `provides` (8081 → port name `http`) | `interval` / `scrapeTimeout` ([G-17](#g-17)); the operator's `release` selector label ([G-11](#g-11)) |
| `apps/auth/networkpolicy.yaml` | **none** — `networkpolicy` is not a registered adapter ([G-30](#g-30)) | `dependsOn` (egress), `exposure` (ingress), `scrape` (ingress), the effective grant set (egress to the Secret Store), plus the non-authorable baseline | the four platform-component selectors ([G-11](#g-11)); the stalwart rule ([G-04](#g-04)); an ingress rule for the forward-auth caller ([G-18](#g-18)) |
| `apps/auth/vault.yaml` | **none** — no adapter writes Vault policies or auth roles ([G-02](#g-02)) | metadata paths ([G-19](#g-19)); the database engine path the wiring actually reads ([G-20](#g-20)); a capability that can roll or sign the transit key ([G-21](#g-21)); token TTLs ([G-22](#g-22)) |
| `apps/auth/kustomization.yaml` | `kubernetes` | the file set of the Service | — |
| `edge/ingressroutes.yaml` | `traefik-public` | `exposure {port, audience}` → no middleware for `anonymous` | the hostname, and the split between two identically-matching routes ([G-03](#g-03)); entryPoint and TLS policy ([G-11](#g-11)); the forward-auth `Middleware` object every other domain references ([G-23](#g-23)) |
| `observability/gatus-endpoints.yaml` | `gatus` | `exposure` + `probes.readiness` per Workload | the hostname ([G-03](#g-03)); `interval`; the whole `alerts` block that `alertClass: page` demands ([G-16](#g-16)); it also lands in another domain's namespace ([G-24](#g-24)) |

### Not emitted, with the reason

| file | why |
|---|---|
| `configmap.yaml` | No Workload declares `assets`, and env-file entries render as inline `env:` on the container (chapter 10 partitions the file; only `${secret:…}` keys become `envFrom`). auth-ui's env file is not reproduced in this example set — [G-12](#g-12) |
| `pvc.yaml` | Neither Workload declares `volumes`. No storage, therefore no `storageClassName` — nothing here renders `local-path`, and nothing renders Longhorn |
| `podmonitor.yaml` | The only scrape surface is fronted by a Service |
| `vso.yaml` | All three grants are `delivery: self`. No `VaultStaticSecret`, no `Secret`, no `envFrom` — the pod fetches at runtime. The secrets-at-rest gate does not apply, and the dead-grant check correctly does not fire on three grants with zero `${secret:…}` placeholders |
| `HorizontalPodAutoscaler` | The registered `kubernetes` adapter can emit one; nothing in layer 1 declares autoscaling, so nothing derives one. Autoscaling is not in this model |
| `PrometheusRule` | `alertClass: page` is declared and no registered adapter renders a rule — [G-16](#g-16) |

## <a id="g-01"></a>G-01 — the all-or-nothing switch is not expressible in these objects

This is the single most important gap in the example set, and it is not a
missing field: it is a demand the model makes on the delivery definition that no
Kubernetes object satisfies.

**What the model requires** (0062, chapter 10): the Workloads of one Service
switch together or none switches. No Workload's new version receives traffic
until *every* Workload's new version is healthy by its own declared readiness.
If any member misses its `startupBudget`, none of them switch and the old
versions keep serving. Rollback is Service-scoped.

**What the rendered objects do.** `workload.yaml` holds two Deployments. Each
one's new ReplicaSet is admitted to its own Service's `Endpoints` the moment its
own readiness probe passes; the endpoints controller consults nothing else.
`maxUnavailable: 0` makes each roll individually safe and does nothing across
the pair. So on a two-image release:

- auth-ui's nginx pod is ready in about a second and starts serving the new
  bundle immediately;
- auth-api's JVM is allowed 600 s to start, and is still on the old ReplicaSet
  for all of it;
- for up to ten minutes the estate serves **a new UI against an old API** —
  precisely the broken product 0062 exists to prevent — and both Deployments
  report healthy throughout;
- if auth-api then exceeds its budget, its Deployment reports
  `ProgressDeadlineExceeded` and auth-ui does **not** roll back. Nothing links
  them.

**Nothing in the tree links them.** `app.kubernetes.io/instance: auth` is on
every object and no controller consumes it. The kustomize `Kustomization` groups
the file set and applies it; it has no notion of a gate. The Flux `Kustomization`
`apps-auth` (owned by `flux-root`, outside this tree) can carry health checks,
but they are evaluated *after* apply — after traffic has already moved — and its
health timeout class contradicts the budget anyway ([G-27](#g-27)). There is no
object in the rendered tree whose identity is "the Service".

**What would close it** — the delivery definition must pick one, and each costs
something the model does not currently carry:

1. **Hold traffic at the edge.** Both Workloads roll to new ReplicaSets while
   the IngressRoute still points at the old ones; the route flips once both are
   healthy. Needs a stable/preview Service pair per Workload and a controller
   that flips them (Argo Rollouts, Flagger, or a bespoke one). No registered
   adapter emits any of it, and the flip must be Service-scoped, not per route.
2. **Paused ReplicaSets plus a selector flip.** Create both new ReplicaSets
   paused, wait for both to report ready, then move a stable label selector.
   Requires the Service selector to be independent of the pod-template hash and
   a controller to perform the flip; a plain Deployment cannot express it.
3. **A gate outside Kubernetes.** An applier that renders both, applies both,
   watches both, and reverts both — which makes atomicity a property of the
   applier, not of the tree, and therefore invisible to anyone reading the tree.

Whichever is chosen, the model needs one thing from it that is not in these
objects today: **a Service-scoped health gate with a deadline**. Chapter 20 lists
"the health-gate deadline the Service's switchover waits on" among the derived
values and no chapter says what it is when a Service's Workloads declare
different budgets — auth is 600 s and 30 s. `max` is the obvious reading and it
is not written down.

Co-location is *not* the answer and must not be reached for: auth-api is pinned
to the one `public-ingress` node and auth-ui is eligible on all seven. They may
land apart and must still switch together.

## Gaps

Every row is a thing the renderer work must decide or a field the model must
grow. Ordered by how much they cost.

| id | gap |
|---|---|
| [G-01](#g-01) | **The atomic switch is not expressible in plain Kubernetes objects.** Two Deployments roll independently; nothing in the tree gates one on the other. Detailed above. The delivery definition must close it, and the model must derive a Service-scoped health-gate deadline it does not currently define |
| <a id="g-02"></a>G-02 | **`delivery: self` renders zero objects, and its policy and role have no producer.** Chapter 10 says `self` renders "a Vault policy, a Kubernetes auth role, and the application's own client wiring". The wiring is rendered (the `VAULT_*` env block); the policy and the role are in `apps/auth/vault.yaml`, which is not a Kubernetes object and which no registered adapter emits — `vso` emits `VaultConnection`, `VaultAuth`, `VaultStaticSecret`, `VaultDynamicSecret` and an operator ServiceAccount, none of which is a policy or a role. Every one of auth's three grants is `delivery: self`, so the entire secret surface of this domain has no producer |
| <a id="g-03"></a>G-03 | **No hostname label, and no name on an exposure entry.** `exposure` carries a port and an audience. Chapter 10 has no hostname field (its open item 3), chapter 20 places the label as Service-declared, chapter 40 checks `E_DUPLICATE_EXPOSURE_NAME` against a name none of them defines. Consequences here: the IngressRoute host, the Gatus URLs, and `AUTH_ISSUER` / `AUTH_LOGIN_URL` / `CONFIRMATION_URL` are all the live value rather than a derived one; and the Service's two anonymous exposures produce two IngressRoutes with an identical `match`, because neither declares `paths`. The live /api-vs-/ split is expressible and is not declared |
| <a id="g-04"></a>G-04 | **An edge into a domain outside the fragment set silently narrows the allow set.** `{service: stalwart, surface: smtp}` does not resolve here — the mail domain publishes no fragment in this example set — so `MAIL_HOST` / `MAIL_PORT` and the corresponding egress rule are absent rather than wrong. Over the composed union it resolves; the failure mode to design against is chapter 16's: a typo'd surface renders a valid policy with a missing rule, and the on-call sees a timeout, not an error code |
| <a id="g-05"></a>G-05 | **`AUTH_CORS_ALLOWED_ORIGINS` has no predicate.** Nine hostnames by hand today; chapter 16's open item 1 says the derivation is probably "inbound edges declaring a browser surface", which no field declares. Not rendered |
| <a id="g-06"></a>G-06 | **`replicas` is bounded by the eligible node set, and that bound is 1 here.** auth-api's eligible set is `[frankfurt-contabo-1]` — the only `public-ingress` node. Live runs two replicas on that node as a capacity decision; the rule as written cannot reproduce it, and there is no anti-affinity vocabulary that would make a second replica mean anything. `minAvailable` is also still ungraded, and auth-ui declares none at all |
| <a id="g-07"></a>G-07 | **The PDB and the replica count come from two derivations that never meet.** `minAvailable: 1` against `replicas: 1` permits zero voluntary evictions, so draining `frankfurt-contabo-1` — which is also the control-plane node — blocks until someone deletes the PDB |
| <a id="g-08"></a>G-08 | **The probe derivation is partial.** `startupBudget` → period 5 s × threshold 120 and `progressDeadlineSeconds` = budget × 3 are stated. Which endpoint the startup probe uses is not (readiness is used here, which is a choice made during serialisation — the thing chapter 30 forbids), and neither are `periodSeconds`, `failureThreshold` or `initialDelaySeconds` for readiness and liveness. Only `timeoutSeconds: 5` has evidence behind it |
| <a id="g-09"></a>G-09 | **Nothing declares which paths a read-only root filesystem needs writable.** The intent's prose says the render supplies `/tmp` as an emptyDir for the JVM; no field says so, no `sizeLimit` is derivable, and a Workload needing a second writable path has no way to say it short of a `writableRootFilesystem` exception that relaxes everything |
| <a id="g-10"></a>G-10 | **`runtime: jvm` is asked to imply Spring Boot.** The env file expects `SPRING_CONFIG_IMPORT`, `VAULT_AUTHENTICATION`, `VAULT_KUBERNETES_ROLE` and `VAULT_DB_ENABLED` to be derived from `delivery: self`, but their spelling is spring-cloud-vault's. A `jvm` Workload that is not Spring gets keys it cannot read, and no field distinguishes the two |
| <a id="g-11"></a>G-11 | **Every platform-component fact is a Cluster Context input this example set does not carry.** Marked `CONTEXT` in the files: cluster DNS, the edge, the metrics stack and the Secret Store selectors in `networkpolicy.yaml`; `release: metrics-stack` on the ServiceMonitor; `entryPoints` and `certResolver` on the IngressRoutes; `VAULT_ADDR`; `DEPLOYMENT_ENVIRONMENT`; and the nine remaining `OTEL_*` plus six `PYROSCOPE_*` values from the jvm Runtime Profile. The shapes are derived; the values must come from the pinned context. Note the coupling: if `VAULT_ADDR` resolves to the public hostname, the derived "egress to the Secret Store" rule selects pods the traffic never reaches |
| <a id="g-12"></a>G-12 | **auth-ui's env file is not in the example set**, so its container renders with no `env` at all. The model requires one env file per Workload; the example set reproduces one of two |
| <a id="g-13"></a>G-13 | **No chapter fixes the label set.** `app.kubernetes.io/{name,instance,part-of,managed-by}` here. `name` + `instance` are load-bearing (they are the selector, and a selector is immutable on a Deployment), so this is not cosmetic: changing the convention later is a delete-and-recreate on every workload in the estate |
| <a id="g-14"></a>G-14 | **Per-Service directories versus per-domain objects.** `namespace.yaml` and the namespace-wide `default-deny` NetworkPolicy are one object per *domain*, while the adapter emits per *Service directory*. auth has one Service so nothing collides; the data domain has three, and three identical Namespace objects at three paths is `E_PATH_COLLISION` waiting for a second writer. Which Service directory owns a per-namespace object is undecided |
| <a id="g-15"></a>G-15 | **`automountServiceAccountToken` is underivable.** auth-api needs its projected token for Vault Kubernetes auth; auth-ui holds no grant and needs none. "No grant → no token" is a derivation nobody has written down, so the hardened default is not rendered |
| <a id="g-16"></a>G-16 | **`alertClass` derives nothing.** `page` is declared on the Service every forward-auth protected route depends on. No registered adapter renders a `PrometheusRule` (zero occurrences under `src/` in either generation), and the Gatus `alerts` block has no derivation from an Alert Class — receiver type, failure threshold and send-on-resolved are all unstated, and the live ConfigMap has no `alerting` section at all. The loudest class in the vocabulary is currently inert |
| <a id="g-17"></a>G-17 | **No scrape `interval` or `scrapeTimeout`.** Omitted, which silently takes whatever the metrics stack's global default is — a value decided outside the model |
| <a id="g-18"></a>G-18 | **The forward-auth caller produces no ingress rule.** auth's estate-wide role is derived from every *other* route's audience, not from a `dependsOn` edge, so the inbound edge set for `{service: auth}` is empty and no ingress rule admits the middleware. As rendered it is admitted only because the middleware runs in the same edge pod the exposure rule already allows — by luck of a shared peer, not by derivation |
| <a id="g-19"></a>G-19 | **A byte-matched grant path cannot reach its KV-v2 metadata sibling.** 0027 forbids any transform on the path, so `secret/metadata/…` is outside every derived policy: version listing and soft-delete are denied to every reader in the estate |
| <a id="g-20"></a>G-20 | **The dynamic database credential is granted at a path it is not read from.** The grant declares `secret/data/platform/postgres/auth` (KV-v2) while the intent's prose and the derived `VAULT_DB_ENABLED=true` describe the database secrets engine, which lives at `database/creds/<role>`. No grant declares that path, so the derived policy does not permit the read the wiring performs |
| <a id="g-21"></a>G-21 | **`self-roll` derives a capability that cannot perform the roll.** The tier derives `patch` on the *granted path*, `transit/keys/auth-api-jwt`. Vault rotates a transit key at `transit/keys/<name>/rotate` and signs at `transit/sign/<name>`, both requiring `update`. The grant that exists so this Workload can roll its own JWT key derives a policy that permits neither rotation nor signing. The `access` × path derivation needs a non-KV branch |
| <a id="g-22"></a>G-22 | **No token TTLs.** `token_ttl`, `token_max_ttl` and `token_period` on the Kubernetes auth role have no field and no derivation; the mount default applies |
| <a id="g-23"></a>G-23 | **The forward-auth `Middleware` object has no producer.** The registry says `traefik-public` emits IngressRoutes "with middleware references" — references only. Every `audience: authenticated` route in every other domain resolves against a Middleware pointing at this Service, and nothing renders it |
| <a id="g-24"></a>G-24 | **A domain's Deliverables land in another domain's namespace.** The Gatus endpoints ConfigMap is one estate-wide object in `utility-system`, contributed to by every domain. `E_FOREIGN_NAMESPACE` is satisfied only because the adapter owns the path rather than the Service — worth stating explicitly before someone tightens the rule |
| <a id="g-25"></a>G-25 | **auth-ui cannot bind port 80 as rendered.** `provides: {http: 80}` with `runAsNonRoot: true` and `capabilities.drop: [ALL]`, and the only declared exception is `writableRootFilesystem`. Binding below 1024 needs `CAP_NET_BIND_SERVICE`, which the exception vocabulary can express (`capability:NET_BIND_SERVICE`) and this Workload does not declare. Nothing checks it: the model has every fact needed to refuse this at build time — an exposed or provided port < 1024, non-root, no capability exception — and no rule that does |
| <a id="g-26"></a>G-26 | **`runAsNonRoot: true` with no UID.** Chapter 10 renders the control "with the UID from the image", and no pinned input carries a UID — the images lock carries digests. If the image's `USER` is a name rather than a number, the kubelet cannot verify non-root and the pod fails with `CreateContainerConfigError`. Either the lock grows a UID or the model grows a field |
| <a id="g-27"></a>G-27 | **The Flux health timeout class contradicts the startup budget.** The class table gives `stateless: 5m`; auth-api's `startupBudget` is 600 s and its derived `progressDeadlineSeconds` is 1800. The Kustomization gives up at 5 minutes on a Workload the model says may legitimately take ten. Two derivations over the same declaration disagree |
| <a id="g-28"></a>G-28 | **The hardening class does not say where its controls land.** `runAsNonRoot` and `seccompProfile` are rendered at pod level, `readOnlyRootFilesystem` and `capabilities` at container level (the latter two have no pod-level form). The split is a serialisation choice, and it matters the moment `sidecars` is graded: a pod-level control covers a sidecar the Workload did not declare |
| <a id="g-29"></a>G-29 | **Two label sources for `arch`.** `kubernetes.io/arch` is the kubelet's own; the node contract emits 110 labels for 7 nodes, 55 of them under a prefix named after an archived repository. Which one a selector uses is not fixed, and picking the archived prefix is the trap 0056 exists to retire. Capabilities have only one source (`platform.jorisjonkers.dev/capability-*`), so the ambiguity is `arch`-specific — and it is a single-authority (property 2) question, not a style one |
| <a id="g-30"></a>G-30 | **`NetworkPolicy` has no registered producer.** Chapter 30's open item 2: the only implementation is in the generation being deleted, so coverage for the kind goes from unregistered to absent. Everything in `networkpolicy.yaml` is what the future `networking` adapter must emit. The same holds for the RBAC gap — see G-31 |
| <a id="g-31"></a>G-31 | **No `rbac` adapter.** Chapter 30's largest true gap (16 objects). auth's Workloads need no in-cluster RBAC of their own, so nothing is rendered here, but the identity model implies a Role/RoleBinding per Workload and nothing produces one |
| <a id="g-32"></a>G-32 | **The image digests here are illustrative.** The images lock is a pinned input that this example set does not reproduce, so the two `sha256:` values stand for lock entries rather than being read from one. The alias → repository path mapping (`auth-api` → `ghcr.io/jorisjonkers-dev/auth/auth-api`) is the lock's too: nothing in layer 1 names a registry |

## What this example is meant to prove

- Two Workloads, one Service, one file set, one kustomization — and, past that
  grouping, no atomicity ([G-01](#g-01)).
- `placement` splitting cleanly in two: `arch` and `capabilities` become a
  selector and an affinity term; `memory` and `cpu` become `resources` under the
  two shape rules (memory request == limit, cpu request with no limit) and
  produce no selector at all, because eligibility was checked at build time
  against node allocatable.
- A hardening exception relaxing exactly one control: auth-ui's
  `readOnlyRootFilesystem: false` against auth-api's `true`, with the other
  three controls byte-identical.
- `delivery: self` producing no `VaultStaticSecret`, no `Secret` and no
  `envFrom` — and, as a consequence, no Kubernetes object at all
  ([G-02](#g-02)).
- A transit grant that takes no placeholder, and whose derived capability cannot
  perform the operation it was granted for ([G-21](#g-21)).
- Default-deny with DNS in the baseline, including in the namespace-wide deny —
  because the static check is "every rendered policy carrying `Egress` in
  `policyTypes` also matches UDP/53".
