# Research: related work, provider moves, infrastructure and tenancy

Researched 2026-10-09, ahead of a rescope of the model. Three things prompted
it:

- the course's Task 1 feedback, which asked for existing modelling languages
  for Kubernetes (KubeDiagrams, KubeOrch and kubert by name), for the
  one-cluster assumption to be discussed, and for the cost of cross-file OCL;
- the wish to change a provider that most Applications depend on (Postgres,
  RabbitMQ, the `auth` Application) with near-zero downtime, which leads to a
  derived **Move**, a **Stable Address** per provider surface, and a per-engine
  move catalog;
- the plan to promote the node contract
  ([0048](../adr/model/0048-node-facts-are-authored-once.md)) to an
  Infrastructure metamodel, and to evaluate multi-cluster and multi-tenant
  estates without building them.

This directory is evidence, not decision. Nothing here is normative: the
decisions it feeds are recorded as ADRs under [`docs/adr/`](../adr/README.md)
and specified in [`spec/v1`](../../spec/v1/00-overview.md), and where a finding
here and a record there disagree, the record wins.

| file | question it answers |
|---|---|
| [`modelling-languages.md`](modelling-languages.md) | What else models Kubernetes deployments (the three named tools, application-model DSLs, configuration languages, the MDE literature), and what deploy-kit does that none of them does |
| [`provider-moves.md`](provider-moves.md) | How a provider can be changed under its consumers: indirection mechanics, the closest industry analogue, and a move method per engine |
| [`infrastructure-and-tenancy.md`](infrastructure-and-tenancy.md) | How others model node capabilities and generate hosts, and what multi-cluster and multi-tenant estates would require |
| [`what-pays-its-way.md`](what-pays-its-way.md) | Which spec chapters and sections, `CONTEXT.md` terms, ADRs and `E_` codes are referenced, implemented and tested, and what the parity contract costs in pull requests, CI minutes and lines |

## Method

Each topic was researched against primary sources: vendor and project
documentation, specifications, source code, and the papers themselves.
Bibliographic data for papers whose publisher pages refused automated access
was confirmed through [OpenAlex](https://openalex.org) records; where only the
record, not the paper, was read, the entry says so.

Three markers recur:

- **Unverified** marks a claim no primary page confirmed. It is kept because
  it matters, not because it is trusted.
- **Settle by drill** marks a claim that only running the thing can decide
  (for example, whether a newer PostgreSQL publisher feeds an older
  subscriber). Each such claim names the drill.
- Versions and dates are as of the research date; most of these projects
  release monthly.

## What the research found

**No surveyed tool or language models what deploy-kit models.** The three
named tools are a renderer (KubeDiagrams), a visual deployer with automatic
wiring (KubeOrch) and a kubeconfig context switcher (kubert). The
application-model DSLs (Score, KubeVela/OAM, Radius, Humanitec, Dapr, TOSCA)
share one idea deploy-kit already has, a consumer that names what it needs and
reads coordinates through placeholders, but none checks invariants over a
whole estate at compile time, derives network policy from declared edges, or
holds a release at a barrier. The configuration languages (CUE, KCL, Pkl,
Jsonnet, Helm, Kustomize and others) check one object or one module; a
whole-estate check exists only if one program evaluates the whole estate, and
no language gives that program a model to navigate. See
[`modelling-languages.md`](modelling-languages.md#positioning).

**No surveyed tool moves a provider under its consumers without downtime.**
Every application-model DSL swaps a provider at deploy time by changing a
binding; none syncs data, fences writes or flips consumers together. The
closest analogue is outside Kubernetes entirely: AWS RDS Blue/Green
Deployments, whose switchover sequence (guardrails, block writes, drop
connections, wait for replication, swap endpoints, reopen) is almost exactly
the Move the redesign proposes. See
[`provider-moves.md`](provider-moves.md#the-closest-analogue-rds-bluegreen).

**Reverse replication is the weak point of every engine.** Forward sync
across a version change is documented for every engine surveyed; the reverse
direction, which a lossless rollback needs, is blocked by a one-way version
gate in most of them: MySQL, MariaDB and Valkey replicate only to the same or
a newer version, RabbitMQ feature flags cannot be disabled once enabled,
MongoDB needs its compatibility version lowered first, and Elasticsearch
snapshots do not restore into an older cluster. A per-engine statement of
*when reverse is possible* is therefore a required column of the move
catalog, not a detail. See
[`provider-moves.md`](provider-moves.md#reverse-replication-is-the-weak-point).

**A Stable Address as an ExternalName Service flips within seconds, but
closes nothing.** On k3s the CoreDNS `kubernetes` plugin answers with a
5-second TTL and the `cache` plugin never extends a record's own TTL; the JDK
caches a lookup for 30 seconds by default; Go, glibc and Node do not cache
answers. Established connections, however, survive any DNS change: HikariCP
keeps a connection for up to 30 minutes. The fence on the old Instance, not
the DNS flip, is what moves consumers. See
[`provider-moves.md`](provider-moves.md#what-bounds-the-flip).

**Node capability models converge on one shape.** Node Feature Discovery,
Dynamic Resource Allocation, NVIDIA's GPU labels and TOSCA's
capability/requirement pairing all separate what a node *has* (discovered or
declared, under an owned label namespace) from what a workload *requests* (a
predicate). The NixOS `services.k3s` module, by contrast, takes labels and
taints as untyped strings. See
[`infrastructure-and-tenancy.md`](infrastructure-and-tenancy.md#implications-for-an-infrastructure-metamodel).

**Tenancy is a stack, and every layer above the namespace costs a control
plane.** Namespace-per-tenant (Capsule, Flux's multi-tenancy lockdown) is
cheap; a virtual control plane per tenant (vcluster, Kamaji) costs one
control plane each; only a cluster per tenant isolates the data plane. HNC and
KubeFed are archived and should not be designed on. See
[`infrastructure-and-tenancy.md`](infrastructure-and-tenancy.md#design-questions-for-a-parked-decision).

## Open verification

Claims the redesign leans on that are still unverified, each with what would
settle it:

| claim | settle by |
|---|---|
| A newer-major PostgreSQL publisher can feed an older subscriber, so reverse replication after a major move works | drill: 17 publisher, 16 subscriber, insert, update, delete, truncate |
| The CNAME answered for an ExternalName Service carries the `kubernetes` plugin's 5-second TTL | drill: `dig` an ExternalName Service on the k3s cluster and read the TTL |
| Valkey `CLIENT PAUSE WRITE` lets the replication stream drain (the page states both that it stops replication traffic and that replica interactions continue) | drill: pause writes on a primary with a lagging replica and watch the offsets converge |
| `rabbitmqctl set_vhost_limits` with `max-connections: 0` leaves existing connections open (inferred from the source) | drill: set the limit with a client connected, then check `list_connections` |
| Kafka MirrorMaker 2's checkpointed offsets let a consumer group flip without reprocessing more than the last sync interval | drill, and KIP-382 for the intended failover procedure |
| A NATS JetStream mirror can be promoted to a writable stream | drill, or use `sources`, which accept writes already |
