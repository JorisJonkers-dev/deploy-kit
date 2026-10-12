# Modelling languages for Kubernetes deployments

What else models a Kubernetes estate, and what deploy-kit does that none of it
does. Researched 2026-10-09; see [the index](README.md#method) for the markers
used.

The question comes from the Task 1 feedback: *could KubeDiagrams, KubeOrch or
kubert, or their integration, solve or help solve the problem, and what does
existing research on modelling languages for Kubernetes offer, perhaps with a
graphical notation?* The three named tools are answered first, then the wider
field in three groups: application-model DSLs, configuration languages, and
the academic literature.

## The three named tools

### KubeDiagrams

A renderer from Kubernetes objects to architecture diagrams, by Philippe Merle
and Fabio Petrillo, Apache-2.0, release 0.8.0 the latest at the time of
writing ([repository](https://github.com/philippemerle/KubeDiagrams),
[releases](https://github.com/philippemerle/KubeDiagrams/releases)), with a
tool paper ([arXiv:2505.22879](https://arxiv.org/abs/2505.22879)).

- **Input:** manifest files, kustomizations, Helm charts and helmfile
  descriptors, or live cluster state through a `kubectl` plugin. **Output:**
  D2, DOT, draw.io, Mermaid, SVG, PNG, PDF and others; draw.io output is
  editable since 0.8.0
  ([README](https://raw.githubusercontent.com/philippemerle/KubeDiagrams/main/README.md)).
- **Model:** implicit. Kubernetes kinds are nodes; edges are inferred from
  object structure in four fixed kinds: `REFERENCE`, `SELECTOR` (a Service
  selecting Pods), `OWNER`, and `COMMUNICATION` (NetworkPolicy ingress and
  egress) (README). Clustering by label or annotation and extra edges can be
  declared in a `--config` file or a `.kd` diagram file; that syntax is
  **unverified**.
- **Validation:** none. **Round trip:** none; a diagram cannot be turned back
  into objects.

**For deploy-kit:** usable as a *view* of the rendered tree. Running it over a
rendered example produces a figure of the Resolved Deployment's objects,
including the derived NetworkPolicy edges, which is useful evidence in a
code-generation report. It cannot carry a model concept (a Project, a surface,
a cutover, a grant), because its edge kinds are Kubernetes-object relations.
It belongs in a report step, never in the compiler; adding it as a tool
dependency is an *ask first* under the repository's boundaries.

### KubeOrch

A young (2026) visual workflow orchestrator: a drag-and-drop canvas whose
backend turns a visual workflow into manifests and deploys them directly,
Apache-2.0, eight repositories, no release yet
([organisation](https://github.com/KubeOrch), [core](https://github.com/KubeOrch/core),
[ui](https://github.com/KubeOrch/ui), [docs](https://docs.kubeorch.dev)).
Services "find their dependencies automatically", through an auto-wiring
endpoint (`POST /v1/connections/auto`) ([core](https://github.com/KubeOrch/core)).
Its data model and serialisation are not published (**unverified**).

**For deploy-kit:** a poor fit. It deploys directly, where deploy-kit's
delivery is Flux pulling a pinned render
([chapter 55](../../spec/v1/55-delivery.md)); it infers dependencies, where
deploy-kit declares them with a surface
([0024](../adr/model/0024-dependency-edges-resolve-against-the-union.md)); and
it has no grant, cutover, exposure or placement concept. At most a reference
for what a visual authoring front end looks like.

### kubert

A `kubectx`/`kubens` alternative with isolated shells per context, multi-context
execution and context protection, MIT, v0.8.1
([repository](https://github.com/idebeijer/kubert),
[releases](https://github.com/idebeijer/kubert/releases)). It has no model, no
diagram and no manifest input. It has no bearing on the modelling question; its
inclusion in the feedback is most likely a mix-up with another tool.

### Combined

The three do not compose into a solution: none validates anything, none
models a dependency as a declared, typed edge, and only KubeOrch authors
anything at all. The useful combination is narrower: deploy-kit renders,
KubeDiagrams draws what was rendered. The graphical notation the feedback asks
for is better served on the model side (a diagram of the Ecore metamodel and of
an intent instance, which the course's tooling already produces) than on the
object side.

## Application-model DSLs

These describe an application in terms of its components and the resources it
needs, and bind those needs to concrete providers per environment. They are the
closest relatives of Project Intent.

### Score

A workload specification, CNCF Sandbox, with reference implementations for
Compose and Kubernetes (`score-compose` 0.47.0, `score-k8s` 0.19.0; schema
`score.dev/v1b1`) ([spec](https://github.com/score-spec/spec),
[score-k8s](https://github.com/score-spec/score-k8s)).

- A workload declares `resources` by `type`, optional `class` and `id`, and
  reads their outputs through placeholders:
  `postgresql://${resources.db.username}:${resources.db.password}@${resources.db.host}`
  ([reference](https://docs.score.dev/docs/score-specification/score-spec-reference/)).
  Resources with the same type, class and id are the same resource across
  workloads.
- **Provisioners** bind a type to an implementation. In `score-k8s` they are
  `*.provisioners.yaml` files matched by `type`, `class` and `id`; the first
  match wins and files load lexicographically, so a custom provisioner
  overrides a default. A provisioner has `init`, `state`, `shared` and
  `outputs` templates
  ([default provisioners](https://raw.githubusercontent.com/score-spec/score-k8s/main/internal/provisioners/default/zz-default.provisioners.yaml),
  [README](https://github.com/score-spec/score-k8s/blob/main/README.md)).
- Validation is the JSON Schema plus a failure on an unknown placeholder at
  generation time. No cross-workload invariant exists.

**For deploy-kit:** `${resources.db.host}` is the same idea as
`${dependency:platform-postgres.host}`. Score's consumer names a *type*
(any Postgres); deploy-kit's names a *provider* and a surface, which is what
lets deploy-kit derive egress policy and ordering from the edge.

### KubeVela and the Open Application Model

KubeVela v1.11.0, Apache-2.0, implementing OAM
([repository](https://github.com/kubevela/kubevela),
[OAM spec](https://github.com/oam-dev/spec)).

- An `Application` lists `components` (each a `type` with `properties`) and
  `traits`. Types are `ComponentDefinition`s and `TraitDefinition`s written in
  CUE: a `parameter` block for the user-facing options, an `output` for the
  rendered object and `outputs` for extra objects
  ([webservice](https://raw.githubusercontent.com/kubevela/kubevela/master/vela-templates/definitions/internal/component/webservice.cue),
  [scaler](https://raw.githubusercontent.com/kubevela/kubevela/master/vela-templates/definitions/internal/trait/scaler.cue)).
- Multi-cluster delivery is a policy pipeline run by a `deploy` workflow
  step: `topology` picks clusters (`clusters` or `clusterLabelSelector`),
  `override` patches properties per component, and `replication` duplicates
  ([policy reference](https://kubevela.io/docs/end-user/policies/references/),
  [replication](https://kubevela.io/docs/end-user/policies/replication/)).
- Components carry no typed dependency on each other in the pages read;
  how one component learns another's address is **unverified**.

**For deploy-kit:** the select, patch, replicate ordering is a clean statement
of what a multi-cluster placement would need. Validation is per property
against a definition; nothing spans the estate.

### Radius

Radius v0.61.1, Apache-2.0
([repository](https://github.com/radius-project/radius)). An application's
containers declare `connections` to resources; each connection injects
environment variables named `CONNECTION_<NAME>_<PROPERTY>`, for example
`CONNECTION_REDIS_URL`
([Redis schema](https://docs.radapp.io/reference/resource-schema/cache/redis/)).
An **Environment** binds each resource type to a **Recipe** (Bicep or
Terraform) that provisions it, so the same application gets a different
provider per environment
([recipe registration](https://docs.radapp.io/reference/cli/rad_recipe_register/)).
The detailed pages were partly unreachable; the connection and recipe shapes
come from schema pages and search summaries and are **unverified** beyond
that.

**For deploy-kit:** the Environment-to-Recipe binding is the closest analogue
to the Platform document's engine catalog: the application names the kind of
thing, the platform says how it is provided.

### Humanitec Platform Orchestrator

A commercial orchestrator. Resource Definitions bind a resource type to a
driver, chosen by matching criteria such as `env_type`; workloads read outputs
through `${resources.<type>.outputs.<key>}`
([placeholders](https://developer.humanitec.com/platform-orchestrator/docs/platform-orchestrator/reference/placeholders/),
[resource definitions](https://developer.humanitec.com/platform-orchestrator/docs/platform-orchestrator/resources/resource-definitions/)).
The specificity weights between criteria are **unverified**.

### Dapr

Dapr v1.18.5, Apache-2.0 ([repository](https://github.com/dapr/dapr)). An
application calls a building block by **component name** (`statestore`), never
by the backing store's address; the component (`kind: Component`,
`spec.type: state.redis`) can be replaced under the same name
([state how-to](https://docs.dapr.io/developing-applications/building-blocks/state-management/howto-get-save-state/)).
With the `HotReload` feature, an updated component "is first closed, and then
reinitialized using the new configuration", and "is unavailable for a short
period of time"
([components concept, v1.15](https://raw.githubusercontent.com/dapr/docs/v1.15/daprdocs/content/en/concepts/components-concept.md)).
Swapping a component does not move its data.

**For deploy-kit:** the stable name the application addresses is the Stable
Address idea, at the API level rather than the DNS level.

### OASIS TOSCA

TOSCA 2.0 is an OASIS Standard
([specification](https://docs.oasis-open.org/tosca/TOSCA/v2.0/TOSCA-v2.0.html)),
following the Simple Profile in YAML 1.3
([1.3](https://docs.oasis-open.org/tosca/TOSCA-Simple-Profile-YAML/v1.3/os/TOSCA-Simple-Profile-YAML-v1.3-os.html)).

- Node types carry properties, attributes, operations, **requirements** and
  **capabilities**. A requirement naming a target node template becomes a
  relationship; an unbound ("dangling") requirement is fulfilled at deployment
  from candidate nodes. **Substitution mappings** let a whole service template
  stand in for one node behind the same façade.
- Declarative workflows derive operation order from the relationship graph.
- Graphical notation exists outside the standard: Vino4TOSCA (Breitenbücher,
  Binz, Kopp, Leymann, Schumm, OTM 2012,
  [doi:10.1007/978-3-642-33606-5_25](https://doi.org/10.1007/978-3-642-33606-5_25))
  and the Eclipse Winery web modeller, which "graphically model[s] TOSCA
  topologies" and is still pushed to in 2026
  ([README](https://raw.githubusercontent.com/eclipse/winery/master/README.md);
  Kopp et al., ICSOC 2013,
  [doi:10.1007/978-3-642-45005-1_64](https://doi.org/10.1007/978-3-642-45005-1_64)).

**For deploy-kit:** `dependsOn: [{application, surface}]` is structurally a
TOSCA requirement bound to a capability, and placement against node facts is a
`node_filter` on a `host` requirement. TOSCA is the standard deploy-kit's
source model should justify itself against, and Vino4TOSCA/Winery are the
answer to "is there a graphical notation for this kind of model".

### Acorn

Acorn's repository now redirects to an unrelated product and its library was
archived in 2023 (**unverified** beyond the redirect). Not a design reference.

### What they share

| | dependency model | how a provider is swapped | estate-wide checks | moves data |
|---|---|---|---|---|
| Score | resource by type, class, id; `${resources.x.y}` | provisioner matched per type | no | no |
| KubeVela | none typed | `override` per cluster | no | no |
| Radius | `connections`, `CONNECTION_*` env | Recipe bound per Environment | no | no |
| Humanitec | resource by type; `${resources.x.outputs.y}` | Resource Definition by criteria | no | no |
| Dapr | component by name | replace component, same name | no | no |
| TOSCA | requirement bound to capability | substitution mapping | type checks only | no |
| deploy-kit | `{application, surface}` edge | (the redesign: a derived Move) | yes, over the composed union | (the redesign: per engine) |

Four patterns recur: a consumer names a need rather than an address; outputs
reach it through placeholders; the provider behind the need is bound per
environment; and the binding is changed by editing the binding. None of the
six moves data or fences writes when the binding changes, and none checks an
invariant across applications before deploying.

## Configuration languages

These produce manifests rather than model an application. Each was read for
its constraint mechanism and for where a cross-object invariant would live.

| language | paradigm | constraint mechanism | whole-estate invariant |
|---|---|---|---|
| [CUE](https://cuelang.org/docs/) v0.17.1, [Timoni](https://timoni.sh/) v0.35.0 | unification lattice; schema and data are values | constraints are values (`width: 33.3 & >10`); `cue vet` | only if every project unifies in one package; cycles are not reliably rejected ([spec](https://cuelang.org/docs/reference/spec/)) |
| [KCL](https://kcl-lang.io/) v0.13.1, CNCF Sandbox | typed schemas | `check:` blocks per schema instance ([guide](https://kcl-lang.io/docs/user_docs/guides/schema-definition)) | only in one program importing every project |
| [Pkl](https://pkl-lang.org/main/current/language-reference/index.html) 0.32.1 | classes with typed properties | `Int(isBetween(0, 1023))` | only in one evaluation |
| [Jsonnet](https://jsonnet.org/), [Tanka](https://tanka.dev/) v0.39.4 | lazy functional data | `assert` | ad hoc asserts in one program |
| [cdk8s](https://cdk8s.io/docs/latest/) | general-purpose code | the host language | in code, with no declared model |
| [Helm](https://helm.sh/docs/topics/charts/) v4.3.0 | text templates over YAML | `values.schema.json` on merged values | no |
| [Kustomize](https://kubectl.docs.kubernetes.io/guides/config_management/components/) v5.8.3 | overlays and patches | none built in | no |
| [Nickel](https://nickel-lang.org/), [Dhall](https://github.com/dhall-lang/dhall-kubernetes) | typed functional config | contracts; typecheck and `assert` | only in one program |

In every one, a dependency between two applications is a hostname written by
hand, and a cross-object invariant is either code in one program that loads
the whole estate or an external policy step. None gives that program an
abstract syntax separate from the concrete syntax, a model to navigate, or a
trace from an input field to an output field. CUE and KCL come closest to
deploy-kit in spirit, and CUE's specification is explicit that a reference
cycle is not reliably an error, which is exactly the check `E_DEPENDENCY_CYCLE`
makes.

This sharpens the design's earlier rejection of templating: the problem with
Helm and Kustomize is less the templating than the absence of a model for an
estate-wide rule to live in.

## The MDE literature

Bibliographic data was confirmed for every item; the column says how much of
the paper itself was read.

| work | what it models | read |
|---|---|---|
| Merle, Petrillo, *Visualizing Cloud-native Applications with KubeDiagrams*, 2025, [arXiv:2505.22879](https://arxiv.org/abs/2505.22879) | diagrams of manifests and live state; no metamodel | abstract |
| OASIS, *TOSCA Version 2.0*, 2025, [spec](https://docs.oasis-open.org/tosca/TOSCA/v2.0/TOSCA-v2.0.html) | node, relationship, policy types; declarative workflows from the dependency graph | specification, partly |
| Breitenbücher et al., *Vino4TOSCA: A Visual Notation for Application Topologies based on TOSCA*, OTM 2012, [doi](https://doi.org/10.1007/978-3-642-33606-5_25) | a graphical notation for TOSCA topologies | record only |
| Kopp et al., *Winery: A Modeling Tool for TOSCA-based Cloud Applications*, ICSOC 2013, [doi](https://doi.org/10.1007/978-3-642-45005-1_64) | the web modeller for TOSCA | record and README |
| Wurster et al., *The Essential Deployment Metamodel*, SICS 2019, [doi](https://doi.org/10.1007/s00450-019-00412-x), [arXiv:1905.07314](https://arxiv.org/abs/1905.07314) | a technology-neutral deployment metamodel distilled from a review of declarative deployment tools | abstract |
| Challita et al., *Model-Based Cloud Resource Management with TOSCA and OCCI*, 2020, [arXiv:2001.07900](https://arxiv.org/abs/2001.07900) | mapping OCCI to TOSCA; a desired-versus-running diff marking entities added, updated, deleted | abstract |
| Zalila et al., *MoDMaCAO*, SoSyM 2022, [doi](https://doi.org/10.1007/s10270-022-01024-x) | model-driven design, validation and configuration management of OCCI cloud applications | record only |
| Ferry et al., *CloudMF*, UCC 2014, [doi](https://doi.org/10.1109/ucc.2014.36) | a DSL and models@run.time environment for multi-cloud applications | abstract |
| Blair, Bencomo, France, *Models@run.time*, IEEE Computer 2009, [doi](https://doi.org/10.1109/mc.2009.326) | runtime adaptation driven by models of the running system | abstract |
| Hummel et al., *K8sPCM*, ECSA 2026, [KITopen](https://publikationen.bibliothek.kit.edu/1000195065) | an Xtext DSL mirroring manifests, generating a Palladio performance model | abstract |
| Casale et al., *RADON*, SICS 2019, [doi](https://doi.org/10.1007/s00450-019-00413-w) | TOSCA-based modelling and orchestration for serverless applications | abstract |
| Di Cosmo et al., *Aeolus: A component model for the cloud*, Information and Computation 2014, [doi](https://doi.org/10.1016/j.ic.2014.11.002) | components with typed provide/require ports and life cycles; the decidability of reaching a configuration | record only |
| Chardet, Coullon, Pertin, Pérez, *Madeus: A Formal Deployment Model*, HPCS 2018, [doi](https://doi.org/10.1109/hpcs.2018.00118) | per-component life cycles with fine-grained dependencies, for parallel deployment | abstract |
| Chardet, Coullon, Robillard, *Toward safe and efficient reconfiguration with Concerto*, SCP 2020, [doi](https://doi.org/10.1016/j.scico.2020.102582) | Madeus extended to reconfiguration of a running system | record only |
| Philippe et al., *Fast Choreography of Cross-DevOps Reconfiguration with Ballet*, SANER 2024, [doi](https://doi.org/10.1109/saner60148.2024.00007) | decentralised reconfiguration across teams and sites | abstract |
| de Jong, van Deursen, Cleve, *Zero-Downtime SQL Database Schema Evolution for Continuous Deployment*, ICSE-SEIP 2017, [doi](https://doi.org/10.1109/icse-seip.2017.5) | QuantumDB: schema changes without taking the service offline | abstract |
| Kapferer, Zimmermann, *Domain-specific Language and Tools for Strategic Domain-driven Design*, MODELSWARD 2020, [paper](https://www.scitepress.org/Papers/2020/89105/) | the Context Mapper DSL: bounded contexts and context maps | abstract |
| Zimmermann et al., *MDSL*, [specification](https://microservice-api-patterns.github.io/MDSL-Specification/index) | a textual DSL for service contracts and bindings | specification |
| Rademacher et al., *Model-Driven Engineering of Microservice Architectures: The LEMMA Approach*, 2024, [doi](https://doi.org/10.1007/978-3-031-44412-8_5); Sorgalla et al., 2021, [arXiv:2107.12425](https://arxiv.org/abs/2107.12425) | four viewpoint languages for microservice architecture, generating deployment specifications | abstracts |
| Gysel et al., *Service Cutter*, ESOCC 2016, [doi](https://doi.org/10.1007/978-3-319-44482-6_12) | service decomposition from coupling criteria | record only |
| Rahman et al., *Security Smells in Ansible and Chef Scripts*, TOSEM, [arXiv:1907.07159](https://arxiv.org/abs/1907.07159); Oliveira et al., *A Defect Taxonomy for Infrastructure as Code*, 2025, [arXiv:2505.01568](https://arxiv.org/abs/2505.01568) | defect and smell taxonomies for infrastructure code; configuration-data defects are the most frequent | abstracts |

Four lines of work emerge:

- **Metamodel plus textual DSL, generating artefacts.** Context Mapper, MDSL,
  LEMMA and K8sPCM each pair a metamodel with an Xtext-style language. This is
  deploy-kit's route; none of them reaches an estate-wide deployment with its
  network policy and release ordering.
- **A neutral deployment model.** TOSCA and EDMM aim at one model rendered to
  many technologies. deploy-kit is deliberately Kubernetes-specific and gains
  the estate-wide invariants that a neutral model cannot state.
- **Desired versus running.** Models@run.time, CloudMF and the TOSCA/OCCI line
  compare a model of the running system with the desired one to produce
  management actions, which is GitOps reconciliation in research terms and the
  frame a derived Move belongs to.
- **Dependency-aware deployment and reconfiguration.** Aeolus, Madeus,
  Concerto and Ballet order life-cycle actions by component dependencies, and
  de Jong et al. change a schema without downtime. deploy-kit's Move sits
  between the two: dependency-aware (consumers flip together) and
  data-preserving (sync, fence, reverse).

No Ecore metamodel of Kubernetes itself was found; the closest Kubernetes MDE
work is K8sPCM, an analysis direction (manifests to a performance model) rather
than a generation one.

## Positioning

What deploy-kit does that nothing surveyed does:

1. **Invariants over a composed estate, at compile time.** Every DSL and
   language above checks one object, one module or one application.
   deploy-kit composes every Project into one union and checks references,
   identity, cycles and contraction order over it.
2. **Network policy derived from declared edges.** KubeDiagrams draws policy
   after the fact; no surveyed model derives it.
3. **A release barrier.** An Application's members switch together or not at
   all; the DSLs deploy components independently.
4. **A derived, data-preserving provider move** (the redesign). The DSLs swap
   a binding; RDS Blue/Green moves data but only for one managed database;
   nothing combines a declared dependency graph with a per-engine sync, fence
   and flip.
5. **Two implementations held to one oracle.** The TypeScript and EMF
   implementations are tested separately against committed oracle files; no
   surveyed work reports a parity setup of this kind.

Directions a thesis on MDE for service-oriented architecture could take from
here, for discussion with the course's teachers: an estate-level invariant
catalogue evaluated against real estates and the IaC defect taxonomies; a
graphical concrete syntax for the intent model, evaluated against Vino4TOSCA
and KubeDiagrams; derived moves of shared providers, compared with RDS
Blue/Green and the Concerto line; and a multi-cluster extension of the model
(see [`infrastructure-and-tenancy.md`](infrastructure-and-tenancy.md)).
