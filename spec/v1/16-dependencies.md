# Chapter 16: Dependencies, identity, and derivation

Chapter 10 defined what a project file declares: Applications, and the Processes
under them. This chapter defines what those declarations *produce*: the edge
set between Applications, the identity each Process authenticates as, the network
policy both derive, and the derivation map that gives this specification its one
machine-checkable property.

## Dependency edges

An edge is a triple. It names the provider, the surface, and whether the
consumer requires it
([0024](../../docs/adr/model/0024-dependency-edges-resolve-against-the-union.md)).

```yaml
dependsOn:
  - {application: platform-postgres, surface: postgres}
  - {application: auth, surface: http, required: false}
```

| field | required | meaning |
|---|---|---|
| `application` | yes | An Application Id, the only referencable identity ([0010](../../docs/adr/model/0010-flat-application-identity.md)). It must resolve in the composed union: `E_UNRESOLVED_APPLICATION`. |
| `surface` | yes | One surface declared by one of that Application's Processes. The port is written once, by the provider, and never restated by a consumer: `E_UNKNOWN_SURFACE` where the name matches nothing. |
| `required` | no | Defaults to `true`. |

**`provides` moved to the Process; the edge did not.** A port is a property of
a process, so surfaces are declared by the Process that listens
([chapter 10](10-project-intent.md#ports-and-surfaces)). `dependsOn` still
targets `{application, surface}` and nothing a consumer writes changes. Surface
names stay unique within an Application, so the pair resolves to exactly one
Process, one port and one address: `{application: auth, surface: http}` is carried
by Process `auth-api`, and the consumer neither names that Process nor learns
it exists. A provider may move a surface between its own Processes without a
single consumer edit. The Application Id remains the only referencable identity, and
a Process is not referencable from outside its Application
([0052](../../docs/adr/model/0052-an-application-is-the-release-unit.md)).

Edges are declared **per Process**, and an Application's edge set is the union of
its Processes' edges. Within `knowledge` the API reaches Postgres while the
ingest worker reaches RabbitMQ, and neither inherits the other's egress.

An id alone would not carry enough. The only NetworkPolicy code this estate
ever wrote derived policy from credential claims matched to provider exports
carrying an endpoint, `src/deployment/render/networkpolicy.ts:68` returns
nothing when `!provider.endpoint`, and line 70 filters the credential set by
claim name, so a dependency with no credential, `knowledge` calling `auth`'s
`http` surface, produced neither a policy nor a coordinate. Chapter 10 forbids
the consumer writing `AUTH_API_URL` as a literal, so an id-only edge would leave
that dependency with no legal home at all. Naming the surface gives it one, and
puts the port in exactly one place.

### What an edge derives, read outbound

![What a dependency edge derives](diagrams/16-edge-derives.drawio.svg)

<sub>[Diagram source](#what-a-dependency-edge-derives) · edit by opening the SVG in draw.io</sub>

`required: false` yields an allow rule but no reconcile ordering and no startup
gate, so an optional dependency cannot deadlock a rollout; the consumer's own
startup code must tolerate the provider being absent. `required: true` (the
default) buys both. The graph of required edges must be acyclic
(`E_DEPENDENCY_CYCLE`, [chapter 40](40-composition.md)).

An edge orders; it does not group. Things that must switch versions together are
Processes of **one Application**: an Application is the unit of atomic release, its
Processes switch together or none switches, and there is no mechanism to couple
two Applications ([0052](../../docs/adr/model/0052-an-application-is-the-release-unit.md)).
Atomicity is authored by drawing the Application boundary, because the graph cannot
see it: a frontend depends on its API, but a dependency edge does not mean the
two must cut over together, and deriving atomicity from every edge would make
the whole estate one unit. A lockstep pair that survives as two Applications is not
a missing feature: it is evidence the boundary is drawn wrong, and the fix is
redrawing it.

### What an edge derives, read inbound

The same edges read from the provider's side produce derivations no Application
could declare locally, because no Application knows its own consumers. They are
computable only over the composed union
([0042](../../docs/adr/model/0042-declarations-compose-from-intent-fragments.md)), which is this
chapter's hard dependency on [chapter 40](40-composition.md).

| inbound derivation | evidence it is needed |
|---|---|
| a database and owning user per consumer | `init-databases.sh` creates `auth_db`, `agents_db`, `knowledge_db` and `n8n_db`, one per Application claiming a Postgres credential. 98 lines the graph already knows. |
| the Gatus endpoint list | one check per route on every exposure in the union, for the declared `gatus` Application, 41 derived references in 288 hand-maintained lines today ([0047](../../docs/adr/model/0047-one-publication-path.md)) |
| the edge catalogs | every host and route the estate serves, for the declared Traefik Applications, 30 and 28 derived references in two hand-maintained ConfigMaps |
| NetworkPolicy **ingress** | a provider must admit its consumers, and only the inbound set says who they are |
| browser origin allow-lists | `auth-api` hand-maintains `AUTH_CORS_ALLOWED_ORIGINS` with nine hostnames |
| rotation blast radius | "who breaks if I rotate this?" is the reader set of a Secret Subtree **path**, computed over readers of the path and never over declared key sets |

Which test suites exercise a provider together with its consumers is the same
inbound question. Whether that membership gates anything is not settled in this
specification, see [Delivery and co-testing](#delivery-and-co-testing).

### The database catalog

The first row of that table has a producer
([0026](../../docs/adr/model/0026-migration-is-declared-on-the-application.md)). For a
provider Process whose [`engine`](10-project-intent.md#process) is a datastore
that owns databases, the inbound edge set derives a **catalog**: one entry per
consuming **project** naming its database and two Vault roles, the **owner**
role that changes the schema and the **data** role that reads and writes it
([0026](../../docs/adr/model/0026-migration-is-declared-on-the-application.md),
amending [0026](../../docs/adr/model/0026-migration-is-declared-on-the-application.md)'s one entry per consuming Application). Every consuming
Application of a project reads the project's one database; the owner role is
derived for the Application that moves the schema, and only for it
([chapter 10](10-project-intent.md#migration)).

**The names are fixed functions of the project.** A project's database is
`<project>_db`, the spelling the live estate already uses (`auth_db`,
`knowledge_db`), so adopting a project renames nothing in its datastore. Its
owner role is `<project>-owner`, and its data role `<project>-data`. No author
writes any of the three.

The catalog is **data, not a procedure**. It renders as a `ConfigMap` and the
platform's engine catalog supplies the image and command that applies it, the
same split [0018](../../docs/adr/model/0018-durability-class-derives-a-backup.md) makes
for backups, and for the same reason: [0014](../../docs/adr/model/0014-file-shaped-configuration-is-an-asset.md)
forbids an executable Asset, and a rendered shell script is a diff no reviewer
can validate except by running it. What exists today is 98 lines of
`init-databases.sh` creating `auth_db`, `agents_db`, `knowledge_db` and `n8n_db`, one per Application claiming a Postgres credential, which is exactly the inbound
edge set.

**No password is rendered.** The catalog names a Vault role; Vault's database
secrets engine issues the credential, and `vso` projects it with the
`VaultDynamicSecret` it already emits. The engine mount and its connection
configuration are platform fixtures like the auth method
([chapter 60](60-setup.md#secrets-at-rest)); what the render owns is the per-
consumer role name and the catalog entry.

The credential lives at `database/creds/<role>`, which a `database` grant names
by deriving it from the role
([0029](../../docs/adr/model/0029-a-grant-is-a-union-on-engine.md)). That was the
mismatch R20 recorded (a grant path is not the path a credential is read from)
and it is why the catalog could not render until the grant vocabulary became a
union on engine.

## Process identity

Every Process authenticates as its own principal. The ServiceAccount, the
Vault Kubernetes auth role and the Vault policy bound to it are derived **per
Process** ([0031](../../docs/adr/model/0031-identity-per-process.md)). The
ServiceAccount is named for the **Process alone**. The namespace is the
project's, `<project>-system`
([0009](../../docs/adr/model/0009-intent-is-authored-one-file-per-project.md)), so the principal a
Pod presents is `<project>-system.<process>`. No author writes an identity name
([0021](../../docs/adr/model/0021-runtime-mechanics-derive-from-cutover.md)).

The Vault role and its policy carry one name, **`<namespace>-<process>`**:
`auth-system-auth-api`. A ServiceAccount is unique in its namespace, and the
Secret Store has no namespaces: one `kubernetes` auth mount holds every
project's roles, and one list holds every policy. A role named for the Process
alone would be unique only as long as no two projects call a Process the same,
which nothing checks and nothing should.

The name is also the path the `vault-policy` adapter writes the two documents
at, `policies/<namespace>-<identity>`
([chapter 30](30-deliverables.md#vault-configuration-is-rendered-not-applied)),
and that is what keeps it unique. A hyphen does not separate two names that may
hold hyphens: project `a` with a Process `system-c`, and project `a-system`
with a Process `c`, both derive `a-system-system-c`. Written under the name,
the two claim one path, and a path has one owner: the render is refused with
`E_PATH_COLLISION` ([chapter 30](30-deliverables.md#path-allocation)) before
either document exists, so no project's role is ever written over another's.
A backup identity and a migration identity are named by the same rule.

| project | Application | Processes | ServiceAccount, in the project's namespace | Vault role and policy |
|---|---|---|---|---|
| `auth` | `auth` | `auth-api`, `auth-ui` | `auth-api`, `auth-ui` | `auth-system-auth-api`, `auth-system-auth-ui` |
| `knowledge` | `knowledge`, `knowledge-ingest` | `knowledge-api`; `knowledge-ingest-worker` | `knowledge-api`, `knowledge-ingest-worker` | `knowledge-system-knowledge-api`, `knowledge-system-knowledge-ingest-worker` |

The live cluster carries `auth-api` as that Process's role today. A role is
renamed when its Project is handed over to this path, by the Vault policy job
writing the new name; the old one is reported and a human removes it
([chapter 30](30-deliverables.md#vault-configuration-is-rendered-not-applied)).

A `<application>-<process>` prefix is what the project file makes absurd. Application
`auth` holds Process `auth-api`, so the prefixed rule would render
`auth-system.auth-auth-api` for no gain: `auth-api` is the process name. The uniqueness the prefix existed
to give moves to where a reader can check it: two Processes in one project may
not share a name, `E_DUPLICATE_PROCESS_NAME` at composition
([chapter 40](40-composition.md#identity)).

Vault's Kubernetes auth method binds a role to ServiceAccount names and
namespaces and to nothing finer, so two Pods presenting one ServiceAccount token
are one principal holding the union of the policies bound to it. Two things
follow. Deriving the account from the Application Id (which
`src/adapters/kubernetes.ts:665-669` does today, and which the previous version
of this chapter drew as `id --> ServiceAccount`) makes the grant levels of
[0012](../../docs/adr/model/0012-shared-intent-descends-and-is-lowered.md), now the three
of [0012](../../docs/adr/model/0012-shared-intent-descends-and-is-lowered.md),
documentation rather than a boundary. Under it, `knowledge-api`, which serves anonymous paths from
the public internet, authenticated as the principal holding `read` on
`secret/data/knowledge-system/vault-deploy-key`, the `0400` deploy key only the
ingest worker declares. And because the binding's other half is the namespace,
while a namespace now holds every Application of its project by construction, the
**namespace is not a trust boundary**: `auth-system` is shared, and no grant is
narrowed by living in it. What separates two Processes is the ServiceAccount
name alone, which is exactly why its uniqueness is checked across the whole
project rather than within one Application.

A Process's **effective grant set** is every level's `secrets` list merged with
its own, computed once by the lowering
([chapter 10](10-project-intent.md#the-effective-intent),
[0012](../../docs/adr/model/0012-shared-intent-descends-and-is-lowered.md)). Layer 2
reads the lowered Process, so a shared grant renders one policy statement per
Process that holds it, never one shared statement. Renaming a Process renames its identity: role,
policy and bindings churn, and the new identity must be granted before it
starts.

### What a grant confers

**The grant unit is the path.** A KV-v2 `read` returns the whole document stored
at that path ([0008](../../docs/adr/model/0008-vault-read-is-per-path.md)), so a
policy naming a key subset would promise a narrowing the store never enforces.
The previous version of this chapter promised exactly that, "`read` on the
granted path and keys only", and it was false. That claim is deleted.

That is the `kv` engine's rule. A grant is a union on `engine`
([0029](../../docs/adr/model/0029-a-grant-is-a-union-on-engine.md)): a `database`
grant names a role and confers a read on `database/creds/<role>`, and a `transit`
grant names a key and the operations it performs, each conferring exactly one
Vault path. The unit is still one path per grant; what differs is which path the
declaration derives.

`keys:` documents the keys a reader expects and feeds validation; it confers
nothing, and no author may read it as an access boundary. `keys: ['*']` is not
vocabulary. The boundary can therefore be drawn only at the path, which fixes
the Secret Subtree layout: **no path may hold keys for more than one reader
set** ([0028](../../docs/adr/model/0028-grant-unit-is-the-path.md)).
`secret/data/platform/postgres` splits per consumer, and until it does, every
one of its readers holds `read` on its neighbours' credentials.

### Worked trace: one secret grant

```yaml
# the knowledge project file: the grant sits on the Application, since both
# Processes hold it
project: knowledge
owner: joris
applications:
  - id: knowledge
    secrets:
      - path: secret/data/platform/postgres/kb    # one path, one reader set
        keys: [user, password]                    # documentation + validation
        access: read
        delivery: env
        rotation: {tolerates: restart}
```

```
# platform/env/knowledge-api/base.env
DB_USER=${secret:secret/data/platform/postgres/kb#user}
DB_PASSWORD=${secret:secret/data/platform/postgres/kb#password}
```

The placeholder's path half **byte-matches** the granted path, no mount table,
no `data/` strip, no engine taxonomy
([0030](../../docs/adr/model/0030-secret-delivery-is-env-file-or-self.md)). The `#<key>` half
selects which value fills the variable and confers nothing.

| derives | detail |
|---|---|
| `VaultStaticSecret` | in the project's namespace, `knowledge-system`, syncing the granted path |
| `Secret` | the synced document, every key at the path, because that is what a read returns; not a projection of `keys:` |
| `envFrom` secretRef | where the two placeholders resolve; they never become literal `env` entries |
| Vault policy + auth role | bound to `knowledge-api` in `knowledge-system`, carrying the tier's capabilities on the granted **path**. `read` covers the whole document |
| `rolloutRestartTargets` | from `tolerates: restart`, no longer hand-declared |
| engine choice | static, because `restart` does not require `delivery: self` |
| `NetworkPolicy` egress | to the Secret Store, from the Processes holding the grant and not from their siblings |
| Secret Subtree cross-check | the `data` project must declare this path and list this Application as a reader |
| reader set and roll impact | the readers of the path, over the composed union |
| **inbound**, on the provider | one database and one owning user in `init-databases.sh` |

The last two are computable only over the composed union, which is this
chapter's dependency on [chapter 40](40-composition.md).

Splitting access from binding buys a bidirectional check the single-document
form could not express:

| condition | error |
|---|---|
| a `delivery: env` grant with no matching placeholder | `E_UNBOUND_SECRET_GRANT`, a dead grant, property 3 |
| a `${secret:…}` placeholder whose path byte-matches no grant | `E_UNAUTHORISED_SECRET_REFERENCE` |
| `delivery: env` with `rotation.tolerates: reload` | impossible; a pod's environment is fixed for its lifetime |
| `delivery: env` or `file` on a non-KV engine (`transit/`, `database/`) | impossible; `self` is the only legal delivery for a key that is never materialised or a credential minted per lease |
| `access: self-roll` on a path other Applications read, unacknowledged | `E_ROLL_AFFECTS_OTHER_READERS`, computed over the readers of the path |
| `delivery: env` or `file` where the pinned Platform Intent does not advertise secrets at rest | `E_SECRETS_AT_REST_REQUIRED` ([chapter 60](60-setup.md#secrets-at-rest)) |

The roll-impact check is the one nothing in the estate has today:
`secret/platform/observability` holds the Prometheus token, the Discord webhook
and the Grafana client secret in one document, and one CronJob rolls one of
those keys.

## Network policy

Policy is **default-deny and derived**. A Process's legal flows are exactly its
declared edges, the surfaces it declares, the exposure routes that name it, its
effective grant set, and a platform baseline no Application authors
([0035](../../docs/adr/model/0035-network-policy-is-default-deny-and-render-only.md)).

It is evaluated **per pod**, and it has to be. A namespace holds every Application
of its project ([0009](../../docs/adr/model/0009-intent-is-authored-one-file-per-project.md)), so a
namespace wall separates nothing and no isolation claim may rest on one.
Isolation in this model is the derived edge set plus per-Process identity
([0031](../../docs/adr/model/0031-identity-per-process.md)), both per Process, both
readable in one file.

Opt-in was already measured here and it lost: three NetworkPolicy objects exist
for roughly thirty processes, so the cluster is effectively open east-west.
Three of thirty is what opt-in produces on this estate, and the number is the
argument. Default-deny is expressible only because the edge set is complete: every legal flow named by a declaration someone owns.

The producer is the `networking` adapter
([0035](../../docs/adr/model/0035-network-policy-is-default-deny-and-render-only.md)): every
`NetworkPolicy` in the estate, per Process from the allow set below plus the two
baseline rules, per backup identity from its backup plan
([The backup identity's policy](#the-backup-identitys-policy)), per migration
identity from its migration plan
([The migration identity's policy](#the-migration-identitys-policy)), and one
namespace-wide default-deny per project. Nothing else
emits one, which is what makes the DNS assertion checkable against a single
producer.

### The derived allow set

| rule | derived from | direction |
|---|---|---|
| to a provider's surface port | each `dependsOn` edge of the Process; for an edge to a Registered Unmanaged Surface, to the address and port the register carries ([0024](../../docs/adr/model/0024-dependency-edges-resolve-against-the-union.md)) | egress |
| from each consumer of a surface | the inbound edge set, over the composed union | ingress |
| to the Secret Store | any grant in the Process's effective set | egress |
| from the route tier carrying the audience | a route on the Application's `exposure` naming this Process | ingress |
| from the metrics stack, to the scrape port | the Process's `scrape` surface | ingress |
| from the Process's own backup identity, to the surface its backups dump | the surface the Platform document's `engines` names for the Process's `engine` | ingress |
| from the migration identity of each Application whose database the Process holds, to the surface that Application's edge names | every Application of the union that moves its schema with a changelog and reaches this Process's database ([The database catalog](#the-database-catalog)) | ingress |
| to where the Kubernetes API answers, by address | the Process's `api`, and the Platform document's `apiAccess.server` ([Kubernetes API access is declared and admitted](#kubernetes-api-access-is-declared-and-admitted)) | egress |

### The baseline

Two rules are in the rendered set for every Process and appear in no
declaration:

| baseline rule | why it cannot be optional |
|---|---|
| **egress UDP/53 to the cluster DNS service**, in every policy carrying `Egress` in `policyTypes`, admitted by the namespace the Platform document's `substrate.clusterDns` names ([chapter 14](14-platform-intent.md#substrate-facts)) | once any egress policy selects a pod, all unmatched egress is denied, DNS included. The dead renderer generation shows the failure: `providerPolicy` (`src/deployment/render/networkpolicy.ts:86-102`) emits an egress rule to the provider's pod and nothing else, so the consumer cannot resolve the `svc.cluster.local` name the coordinate derivation just handed it, and fails with a DNS timeout diagnosed as "Postgres is down". TCP/53 rides the same rule, for truncated responses. |
| **ingress from the metrics stack** to any declared scrape port | the same file omits it; a process that silently loses scrape stops alerting, which is the failure observability exists to prevent |

The DNS half is checkable statically: **every rendered NetworkPolicy carrying
`Egress` in `policyTypes` also matches UDP/53**. A `conftest` rule asserts it
over the rendered set, and that assertion is the property this baseline exists
to hold.

A baseline rule is not authorable and not exceptable from an Application document. An
exception to one is a change to the derivation, reviewed once, applied to every
Process at once.

### The backup identity's policy

A backup runs as its own identity, in its own pods
([chapter 10](10-project-intent.md#storage-and-durability)), and the namespace's default-deny
selects those pods like any other. So each backup identity has a policy of its
own, derived from its backup plan and from nothing an Application authors
([0091](../../docs/adr/model/0091-a-backup-identity-has-a-policy-of-its-own.md)):

| rule | derived from | direction |
|---|---|---|
| to the Process it backs up, on the surface the method dumps | the `surface` the Platform document's `engines` names for the Process's `engine` ([chapter 14](14-platform-intent.md#engines)); none where the method reads the volume alone | egress |
| to the cluster DNS service | the baseline, as for every policy carrying `Egress` | egress |
| to each address range of the off-cluster destination, on its port | the `egress` of the class's `offCluster` ([chapter 14](14-platform-intent.md#durability-policy)); none for a class that keeps its copies in the cluster | egress |

Nothing reaches a backup pod: it serves nothing, so its policy admits no ingress.

**The Secret Store is not a peer.** A backup holds its destination's credential
through a grant delivered `env`, so the operator reads the Secret Store and the
pod mounts no token and never calls it
([The token is mounted only where the pod authenticates](#the-token-is-mounted-only-where-the-pod-authenticates)).
A rule to a service the pod cannot authenticate to would admit nothing it uses.

The other half is on the Process: its own policy admits its backup identity on
the dumped surface, the last row of the allow set above. One without the other
is a backup the datastore's own default-deny turns away.

### The migration identity's policy

A migration runs as its own identity too, in the pods of its two Jobs
([chapter 55](55-delivery.md#failure-and-undo)), and the default-deny selects
them like any other. Its policy is derived from the migration plan
([chapter 20](20-resolved-deployment.md#the-migration)):

| rule | derived from | direction |
|---|---|---|
| to the datastore holding the project's database, on the surface the Application's edge names | the plan's `database` | egress |
| to the Secret Store | the plan's `credential`: the runner logs in and reads the owner credential itself | egress |
| to the cluster DNS service | the baseline, as for every policy carrying `Egress` | egress |

Nothing reaches a migration pod, so its policy admits no ingress. Here the
Secret Store **is** a peer, where for a backup it is not: the credential is
delivered `self`, so the pod mounts its token and calls the store.

The other half is on the datastore: its own policy admits the migration
identity on that surface, a row of the allow set above. The admission is
derived for an Application that declares a changelog and for no other, so an
Application that migrates itself is admitted as the consumer it already is,
and never as an identity it does not have.

### The token is mounted only where the pod authenticates

`automountServiceAccountToken` derives from what the Process presents its token
to, and from nothing else
([0031](../../docs/adr/model/0031-identity-per-process.md)):

| the Process | token |
|---|---|
| holds at least one grant with `delivery: self` | mounted |
| declares `api`, and is admitted to hold it | mounted |
| holds only `env` or `file` grants, or none at all, and declares no `api` | **not** mounted |

The obvious rule (no grant, no token) is wrong, and `platform-postgres` is the
counter-example. It holds a grant and needs no token: under `delivery: env` the
VSO operator performs the Vault read and projects the result, so the pod never
authenticates to anything. Under `delivery: file` the kubelet does the
projecting. `delivery: self` means *the pod itself* presents its ServiceAccount
token to Vault, and `api` means it presents it to the Kubernetes API. Those are
the two things a token is for.

This is [0041](../../docs/adr/model/0041-no-process-rbac-in-v1.md)'s reasoning
applied to the token instead of the Role, and it reaches the same place: the
privilege a Process of this estate actually needs is smaller than the default,
and the field that says so already exists.

### No Role grants what an absence already denies

Three Applications share `data-system`, and the only thing stopping `platform-valkey`'s
ServiceAccount from reading `platform-postgres`'s Secret is that no Role grants
it. That is an absence rather than a boundary, and the model turns it into a
checked property rather than rendering RBAC
([0041](../../docs/adr/model/0041-no-process-rbac-in-v1.md)).

**v1 renders no `Role`, `ClusterRole`, `RoleBinding` or `ClusterRoleBinding` for
a Process that declares no `api`**, and no Process holds Kubernetes API access
the Platform document did not admit: `E_PROCESS_RBAC_GRANT`, checked where the
project files are read beside the Platform document
([chapter 14](14-platform-intent.md#kubernetes-api-access)) and held as an
estate-wide invariant over the composed union
([chapter 40](40-composition.md#secrets)). Under `delivery: env` and
`delivery: file` the kubelet projects the Secret and the pod never calls the API,
so a least-privilege Role for these Processes grants nothing; rendering sixty
objects that grant nothing would make an empty Role read as an oversight and
give a future broad grant somewhere to hide.

### Kubernetes API access is declared and admitted

A Process that genuinely calls the Kubernetes API is the case the rule above
refuses to guess at. It declares what it asks, in `api`
([chapter 10](10-project-intent.md#kubernetes-api-access)), and the Platform
document admits its Application by name
([chapter 14](14-platform-intent.md#kubernetes-api-access),
[0092](../../docs/adr/model/0092-api-access-is-declared-on-the-process-and-admitted-by-the-platform.md)).
An admitted declaration derives four things, and nothing else derives any of
them:

| derived | from |
|---|---|
| a `ClusterRole` holding the declared rules, `core` spelled as the unnamed group | the Process's `api.rules` |
| a `ClusterRoleBinding` of that role to the Process's one ServiceAccount | the Process's identity ([Process identity](#process-identity)) |
| a mounted token | the declaration itself ([above](#the-token-is-mounted-only-where-the-pod-authenticates)) |
| egress to where the API answers, by address | the Platform document's `apiAccess.server` |

The role and its binding are cluster-scoped, so no namespace holds two apart:
both are named **`<namespace>-<identity>`**, the name the identity's Vault role
carries, for the same reason. The role is a `ClusterRole` and never a `Role`:
every holder the estate has reads across the Projects' namespaces, and one of
them reads a kind no namespace holds.

Admission is by id, so it holds only for an id one Application carries. A
second project that names an Application of its own after an admitted one is
not the Application the platform meant, and nothing in the set says which is:
both declarations are refused, rather than either rendered.

Nothing narrows a rule: the model renders the rules as declared. What keeps a
grant small is that it is written down, with a reason, in the repository whose
code needs it, and that the platform names who may write one at all. A rule on
`secrets` is legal for an admitted holder and is exactly as visible as any
other: Flagger reads the Secret a pod names to learn that it is excluded from
configuration tracking ([chapter 55](55-delivery.md#secret-rotation)), and it
declares that one verb.

The worked [`delivery`](examples/delivery/delivery.project.yml) project holds the
estate's three holders: Flagger, the Release Gate and the Collector.

### Audit before enforce

Default-deny does not ship on `networking.k8s.io/v1` alone. That API has no
audit, dry-run or log-only mode (a policy is enforced the moment it selects a
pod), and k3s's embedded kube-router controller has none either. The previous
setup checklist made "default-deny NetworkPolicy is in **audit** mode, not
enforce" a hard precondition of the first production apply, and that item could
never be ticked: a grep for `cilium|calico|kube-router|flannel` across `src/`,
`spec/`, `schemas/`, `fixtures/` and `docs/` returned zero hits, and no decision
had picked a CNI. It becomes satisfiable only through a CNI carrying a
non-enforcing policy stage ([chapter 60](60-setup.md#cni),
[0035](../../docs/adr/model/0035-network-policy-is-default-deny-and-render-only.md)).

**Render-only is the v1 stage**
([0035](../../docs/adr/model/0035-network-policy-is-default-deny-and-render-only.md)). The
`networking` adapter emits the complete policy set and the tree is diffed in
review; nothing loads it until [0035](../../docs/adr/model/0035-network-policy-is-default-deny-and-render-only.md)
picks a CNI with a non-enforcing stage. What v1 owes is the policies, and
promoting them is a rollout decision waiting on a premise nobody has settled,
so an unpicked CNI does not block the render.

| stage | what runs | exit criterion |
|---|---|---|
| render-only, **v1** | the policy set is rendered and diffed in review; nothing is loaded | the CNI decision lands |
| audit | the set is loaded into the non-enforcing stage; observed flows are diffed against the rendered allow set | **zero undeclared flows over 14 days** |
| enforce | the set is enforced estate-wide | - |

An edge whose target resolves to neither an Application in the union nor a Registered
Unmanaged Surface is `E_UNRESOLVED_APPLICATION`, and one resolving to a register
entry without coordinates for that surface is
`E_UNMANAGED_SURFACE_WITHOUT_COORDINATES`
([0024](../../docs/adr/model/0024-dependency-edges-resolve-against-the-union.md)). Both
existed as silence before: `{application: stalwart, surface: smtp}` derived no
coordinates and therefore no egress rule, producing a valid policy with a
missing rule, a timeout on-call rather than a build error.

One cost is accepted rather than mitigated: an undeclared east-west path (this
estate is known to hold some) stays invisible until promotion, and then breaks
a process.

The second cost this section used to accept is now refused. A typo in a
`surface` name is `E_UNKNOWN_SURFACE` on the consuming edge, and a target
outside both namespaces is `E_UNRESOLVED_APPLICATION`; a rendered policy can no
longer be silently short a rule while every gate stays green. What remains
genuinely silent is a flow nobody declared at all, which is what the audit stage
exists to find.

## The derivation map

The normative set of derivations, as two matrices. A **mark is one
derivation**: read a row to the right for everything that input decides, and a
column down for everything an output rests on. Ninety arrows between two tall
columns is a hairball no layout fixes (which line ends where stops being
answerable), so the relation is carried by position instead.

The first matrix has the fields of Project Intent and the pinned input set of
[chapter 20](20-resolved-deployment.md#pinned-inputs) as rows, and the layer-2
assignments as columns. The second has those assignments **and** the declared
fields as rows, and the Deliverables as columns. The `in` row under each grid is
the in-degree of that column and the `out` column is the out-degree of that row,
so both properties below are countable off the drawing.

![The derivation map, assignments, every declared field and pinned fact, and the assignment it decides](diagrams/16-derivation-map-assignments.drawio.svg)

*Assignments, every declared field and pinned fact, and the assignment it decides. No column
reads zero: that is provenance.*

![The derivation map, Deliverables, every declaration and assignment, and the object it reaches](diagrams/16-derivation-map-deliverables.drawio.svg)

*Deliverables, every declaration and assignment, and the object it reaches. No column reads
zero: that is in-degree at least one. A blue mark is a declared value that reaches the object with
no assignment in between.*

<sub>[Diagram source](#the-derivation-map) · edit by opening the SVG in draw.io</sub>

Two edges carry the amendment. `namespace` hangs off `project`, not off `id`, so
ten live namespaces come out unchanged and no Application can name its own
([0009](../../docs/adr/model/0009-intent-is-authored-one-file-per-project.md)). And `placement`
feeds both `nodeSelector` and `requests + limits`, so the numbers a Process
asks for and the nodes it may land on are one declaration compared against one
pinned input: the node contract's `allocatable`, never a live read
([0017](../../docs/adr/model/0017-placement-is-hard-dimensions.md)). No node
satisfying every declared dimension is `E_PLACEMENT_UNSATISFIABLE` at build,
before an object is rendered. Eligibility is not bin-packing: three Processes
asking `memory: 2Gi` each pass against a 4096Mi node, and the scheduler refuses
the third at apply.

A node left the map altogether, and with it four edges. There is no derived
`hostname (FQDN)` any more: `exposure` hangs off the **Application**, and the `host`
it carries is a full authored FQDN
([0023](../../docs/adr/model/0023-exposure-is-declared-by-audience.md)), so the
IngressRoute, the reachability entry, both edge catalogs, the Gatus endpoint and
the published `resolved.yml` all hang off the declaration itself rather than off
a value layer 2 assembled from a label, a tier policy and a cluster domain. The
Platform Intent no longer contributes to a hostname at all. What layer 2 still
decides on that path is `r_tier` (the tier carrying the audience and the
middleware chain that comes with it), which is why the exposure node keeps an
arrow into it. `provides` stays on the Process, so the two ends of a route are
declared in the same document without a port ever being restated: the Application
says which host and path, the Process says which port.

The map is dense on purpose and is not meant to be read by eye. Its value is
that the three properties below are **checkable by a script** over the
renderer's attribution table, which
[0037](../../docs/adr/model/0037-six-registered-adapters-satisfy-one-port.md) requires every Deliverable to
carry.

### Worked trace: one exposure declaration

![Worked trace, one exposure declaration](diagrams/16-exposure-trace.drawio.svg)

<sub>[Diagram source](#worked-trace-one-exposure-declaration) · edit by opening the SVG in draw.io</sub>

One declaration, six artefacts, plus the two conformance tests that existed only
to detect when those six disagreed (`route-auth-conformance.test.js`,
`gatus-route-coverage.test.js`). Under property 1 those tests have nothing left
to check, because the six cannot disagree: they share one upstream. That
upstream is an **Application** field: one host fronting two Processes,
`auth.jorisjonkers.dev/api` to `auth-api` and `/` to `auth-ui`, is a single
exposure with two routes, and it is unexpressible while `exposure` sits on a
Process.

The hostname is no longer assembled. `host` is the full FQDN as authored and is
carried through untouched; what layer 2 decides on this path is the tier that
carries the audience and the middleware chain that follows from it,
`contentPolicy` included
([chapter 20](20-resolved-deployment.md#authority)).

## The three properties

An earlier draft said the criterion was "any node with two inbound arrows is a
bled concern". That is wrong. A `Deployment` legitimately draws on image,
configuration, grants, probes, placement and hardening, many inbound arrows, no
bleed. Convergence on an *object* is normal; convergence on the same *field* of
an object is the defect.

### 1. Provenance: no Deliverable has in-degree zero

Every rendered object is reachable from at least one declaration or one pinned
input. An object with no inbound edge is hand-written, and must either become
derived or be entered in a Bidirectional Ledger with an owner and a reason
([0038](../../docs/adr/model/0038-bidirectional-ledgers.md)).

This is the property that was violated seven ways over: `reachability.yml`, both
edge catalogs, both IngressRoutes and the Gatus endpoint each declared
`kb.jorisjonkers.dev` independently, with no declaration upstream of any of
them.

### 2. Single authority: no field has two declaring sites

For each field of each Deliverable, exactly one declaration is its authority.
Checked against the attribution table rather than the diagram, because the
diagram is object-level and this property is field-level. That granularity gap
is deliberate: drawing it per-field would make the map unreadable without making
the check any stronger. Which side of the layer boundary each field's authority
sits on is settled once, in
[chapter 20](20-resolved-deployment.md#authority).

### 3. No dead declarations: no declaration has out-degree zero

A declared field that derives nothing is ceremony, and this property is the one
that would have caught the estate's clearest example.
`rollbackTargetRetention` was validated for `minimumDays >= 90` and
`acknowledged: true`, appeared in the readiness scorecard, was documented in
three `PLATFORM.md` files as failing *never*, and was read by no renderer or
adapter. Every application declared the identical value. Out-degree zero.

No surface is exempt from this check. The override mechanism that used to be
exempt is deleted
([0022](../../docs/adr/model/0022-a-derived-value-has-one-declaring-site.md)), so the
dead-declaration property now runs over every declaration in every project file.

## What the properties would have caught

| defect | property | how it presents |
|---|---|---|
| `kb.jorisjonkers.dev` in seven places | 1 | six Deliverables with in-degree zero |
| `rollbackTargetRetention` inert | 3 | a declaration with out-degree zero |
| `platform.layer` wrong in 7 of 7 applications | 3 | out-degree zero, it fed a registry, never the Reconcile Unit |
| a ServiceAccount per Application, two Processes sharing one principal | 2 | one identity field with two Processes' grant sets declaring it |
| 41 Gatus checks, no notifier | 1 | `notifier route` unreachable from any declaration |
| 60 duplicated `OTEL_*` lines | 2 | six declaring sites for one field |
| a secret granted but never referenced | 3 | a `delivery: env` grant with out-degree zero |
| a `gpu-model-gtx960m` term no node advertises | 3 | out-degree zero, the scheduler dropped the soft term without an event and it rendered nothing; every dimension is now hard, so it is `E_PLACEMENT_UNSATISFIABLE` at build |

## Delivery and co-testing

This chapter derives the edge set, the identities and the policy set; it does
not say who applies them or in what order a release runs, which is
[chapter 55](55-delivery.md)'s. Whether dependency on other units for testing
gates a deploy is co-testing, and stays parked in
[docs/adr/deferred/](../../docs/adr/deferred/README.md).

## Open in this chapter

1. **The CORS predicate.** `AUTH_CORS_ALLOWED_ORIGINS` lists nine hostnames, and
   the inbound derivation above claims they are the inbound edge set projected
   onto the hosts those Applications declare. The shape is right; the predicate is not
   established. A browser origin is needed only by a consumer making
   cross-origin requests *to* `auth-api`, whereas an OIDC redirect flow (what
   `GrafanaOidc`, `N8nOidc` and `RabbitMqOidc` exercise) needs no CORS entry.
   The derivation is probably "inbound edges declaring a browser surface", not
   "all inbound edges".
   **Owner:** joris.
   **Settled by:** diff `auth-api`'s live `AUTH_CORS_ALLOWED_ORIGINS` against
   the inbound edge set, classifying each of the nine as browser or redirect.
   **Blocks:** rendering the allow-list at all; it stays hand-maintained until
   the predicate is written here.
2. ~~**Nothing enforces the rendered policy set.**~~ Decided: render-only is
   v1's stage ([0035](../../docs/adr/model/0035-network-policy-is-default-deny-and-render-only.md)),
   so this is not a gap in the model but the first stage of a sequence whose
   exit criterion is [0035](../../docs/adr/model/0035-network-policy-is-default-deny-and-render-only.md)'s lab
   evaluation. That evaluation is 0035's own settling test and is recorded
   there, not here.

## Diagram sources

Each diagram above is drawn in draw.io and committed as an SVG with the editable
diagram embedded, so opening the `.svg` in draw.io recovers the drawing. The
mermaid below is the same structure in text, kept so a diagram change shows up in
a plain diff. **Where the two disagree the SVG is the diagram and the mermaid is
what gets fixed**, the same precedence this repository uses between a chapter and
an ADR.

### What a dependency edge derives

```mermaid
flowchart LR
    E["dependsOn<br/>{application, surface, required}"]

    E --> O1["Reconcile Unit ordering<br/>apps-knowledge after apps-data"]
    E --> O2["dependency coordinates<br/>${dependency:platform-postgres.host}"]
    E --> O3["NetworkPolicy egress<br/>allow postgres:5432"]

    E -.->|"required: false"| N1["allow rule only,<br/>no ordering, no startup gate"]

    O3 --> B["+ baseline<br/>UDP/53 to cluster DNS"]
    B -.->|"only when the edge set is complete"| D["default-deny posture"]
```

### The derivation map

```mermaid
flowchart LR
    subgraph DEC["Declared, Project Intent (layer 1)"]
        d_dom["project"]
        d_own["owner"]
        d_id["id"]
        d_obs["observability<br/>alertClass + scrape<br/>{process, surface, path}"]
        d_wl["process name"]
        d_prov["provides<br/>surface: port<br/>on the Process"]
        d_dep["dependsOn"]
        d_img["image"]
        d_run["runtime"]
        d_env["env files<br/>per Process"]
        d_sec["secrets<br/>path, access, delivery"]
        d_ast["assets"]
        d_exp["exposure, on the Application<br/>name, host (authored FQDN),<br/>audience, contentPolicy,<br/>routes: path, match,<br/>process, surface"]
        d_prb["probes<br/>readiness + liveness"]
        d_bud["startupBudget"]
        d_cut["cutover<br/>continuous | interrupted"]
        d_life["lifecycle"]
        d_sf["stateful"]
        d_vol["volumes + durability"]
        d_plc["placement<br/>hard dimensions:<br/>memory, cpu, arch,<br/>site, disk, gpu,<br/>capabilities"]
        d_rep["replicas<br/>count + reason"]
        d_api["api<br/>rules + reason"]
    end

    subgraph PIN["Pinned inputs, each carried by digest (chapter 20)"]
        p_ctx["Platform Intent, authored in layer 1<br/>+ node contract<br/>(allocatable)"]
        p_cs["ClusterState snapshot"]
        p_img["images lock"]
    end

    subgraph DER["Derived, assignments and Deliverables (layers 2 and 3)"]
        r_ns["namespace<br/>project-system"]
        r_tier["route tier + middleware"]
        r_ru["Reconcile Unit + DAG"]
        r_sw["switch gate<br/>per Application"]
        r_sa["identity name<br/>the process name"]
        r_vp["Secret Store path grant"]
        r_dig["image digest"]
        r_rep["replicas"]
        r_res["requests + limits"]
        r_sc["securityContext"]
        r_strat["rollout strategy + surge"]
        r_prb["container probe timings"]
        r_dl["progressDeadlineSeconds"]
        r_plc["nodeSelector + affinity"]
        r_bind["recorded PV binding"]

        k_dep["Deployment / StatefulSet / Job"]
        k_svc["Service"]
        k_sa["ServiceAccount"]
        k_cm["ConfigMap<br/>+ derived catalogs"]
        k_sec["VaultStaticSecret / Secret"]
        k_pol["Vault policy + auth role"]
        k_ir["IngressRoute"]
        k_np["NetworkPolicy"]
        k_gat["Gatus endpoint"]
        k_bkp["backup CronJob + backup claim"]
        k_res["resolved.yml"]

        k_sm["ServiceMonitor / PodMonitor"]
        k_can["Canary"]
        k_hpa["HorizontalPodAutoscaler"]
        k_rbac["ClusterRole + ClusterRoleBinding"]
    end

    d_dom --> r_ns
    d_dom --> r_ru
    d_dom --> r_vp
    d_id --> r_sw
    d_obs --> k_sm
    d_obs --> k_np
    d_wl --> r_sa
    d_wl --> k_svc

    d_prov --> k_svc
    d_prov --> k_np
    d_prov --> k_gat

    d_dep --> r_ru
    d_dep --> k_np
    d_dep --> k_cm

    d_img --> r_dig
    p_img --> r_dig
    d_run --> k_dep
    d_env --> k_dep
    d_env --> k_sec

    d_sec --> k_sec
    d_sec --> r_vp
    d_sec --> k_np
    d_sec --> k_dep

    d_ast --> k_cm
    d_ast --> k_dep

    d_exp --> r_tier
    d_exp --> k_ir
    d_exp --> k_cm
    d_exp --> k_gat
    d_exp --> k_np
    d_exp --> k_res

    d_prb --> r_prb
    d_prb --> k_gat
    d_prb --> r_sw
    d_bud --> r_prb
    d_bud --> r_dl
    d_cut --> r_strat

    d_rep --> r_rep

    d_life --> k_dep
    d_sf --> k_dep
    d_vol --> k_dep
    d_vol --> r_strat
    d_vol --> k_bkp
    d_vol --> r_bind

    d_plc --> r_plc
    d_plc --> r_res
    p_ctx --> r_sc


    p_ctx --> r_plc
    p_cs --> r_rep
    p_cs --> r_bind
    p_cs --> r_plc

    r_sa --> k_sa
    r_sa --> k_pol
    r_sa --> k_dep
    r_vp --> k_pol
    r_prb --> k_dep
    r_strat --> k_dep
    r_dl --> k_dep
    r_rep --> k_dep
    r_res --> k_dep
    r_sc --> k_dep
    r_ns --> k_dep
    r_dig --> k_dep
    r_plc --> k_dep
    r_bind --> k_dep
    r_tier --> k_ir

    r_ns --> k_res
    r_sa --> k_res
    r_vp --> k_res
    r_bind --> k_res

    d_wl --> k_can
    d_id --> k_can
    d_prov --> k_can
    r_sw --> k_can
    r_dl --> k_can
    r_rep --> k_can
    d_wl --> k_hpa
    r_rep --> k_hpa
    d_api --> k_rbac
    d_api --> k_np
    d_api --> k_dep
    r_sa --> k_rbac
```

### Worked trace: one exposure declaration

```mermaid
flowchart LR
    X["exposure, on the Application:<br/>name: kb<br/>host: kb.jorisjonkers.dev<br/>audience: authenticated<br/>routes: 5"]

    X --> H["host, carried through<br/>kb.jorisjonkers.dev"]
    X --> T["tier public-frankfurt<br/>+ forward-auth middleware<br/>derived from audience + tier"]

    H --> A1["IngressRoute (host)"]
    H --> A2["IngressRoute (mcp routes)"]
    H --> A3["reachability channel entry"]
    H --> A4["edge catalog, an Asset of the Traefik Application"]
    H --> A5["edge-route-catalog ConfigMap"]
    H --> A6["Gatus external endpoint"]
    T --> A1
    T --> A2
```
