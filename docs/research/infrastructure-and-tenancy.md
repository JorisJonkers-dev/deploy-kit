# Infrastructure models, multi-cluster and tenancy

How others model what a node can do and generate hosts from it, and what a
multi-cluster or multi-tenant estate would require. Researched 2026-10-09; see
[the index](README.md#method) for the markers used.

Two decisions consume this. The node contract
([0048](../adr/model/0048-node-facts-are-authored-once.md)) is to become an
Infrastructure metamodel, specified and used for placement now, with a
generator of NixOS host configuration left for later. And multi-cluster and
multi-tenant estates are to be evaluated, not built, so the one-cluster premise
([0001](../adr/model/0001-estate-scale-and-ownership.md)) stands while the
questions are recorded.

## Node capabilities

### Node Feature Discovery

[NFD](https://kubernetes-sigs.github.io/node-feature-discovery/stable/usage/customization-guide.html)
v0.19.0 (Kubernetes SIGs, Apache-2.0) runs a worker on every node that detects
hardware and kernel features (`cpu.cpuid`, `kernel.config`, `pci.device`,
`storage.block`, `memory.numa` and others), typed as flags, attributes or
instances. A master writes them as labels under one owned namespace,
`feature.node.kubernetes.io`, and refuses other namespaces unless allowed with
`-extra-label-ns`. A `NodeFeatureRule` derives labels and, when enabled, taints
from matched features:

```yaml
apiVersion: nfd.k8s-sigs.io/v1alpha1
kind: NodeFeatureRule
spec:
  rules:
    - name: "my sample rule"
      labels:
        "feature.node.kubernetes.io/my-sample-feature": "true"
      matchFeatures:
        - feature: kernel.loadedmodule
          matchExpressions:
            dummy: {op: Exists}
```

NFD only labels; the scheduler consumes the labels through ordinary node
selectors and affinity.

### Dynamic Resource Allocation

[DRA](https://kubernetes.io/docs/concepts/scheduling-eviction/dynamic-resource-allocation/)
is stable since Kubernetes v1.35 (`resource.k8s.io/v1`). A driver publishes a
`ResourceSlice` describing the devices on a node; an administrator defines a
`DeviceClass`; a workload's `ResourceClaim` requests devices with a CEL
predicate over the driver's attributes and capacities
([task](https://kubernetes.io/docs/tasks/configure-pod-container/assign-resources/allocate-devices-dra/)):

```yaml
selectors:
  - cel:
      expression: |-
        device.attributes["driver.example.com"].type == "gpu" &&
        device.capacity["driver.example.com"].memory == quantity("64Gi")
```

DRA separates three things the node contract today mixes: what kind of device
(the class), what a node has (published attributes and capacities), and what a
workload asks for (a predicate).

### GPU labels

NVIDIA's GPU Feature Discovery publishes `nvidia.com/gpu.product` (a model
string), `nvidia.com/gpu.memory` (MiB), `nvidia.com/gpu.count`,
`nvidia.com/gpu.family` and the CUDA versions
([README](https://github.com/NVIDIA/k8s-device-plugin/blob/main/docs/gpu-feature-discovery/README.md)).
`gpu.memory` in MiB matches the node contract's `memory_mib`; `gpu.product` is
a raw string, where the node contract's `gpus[].class` is a normalised
category, so a product-to-class mapping is needed either way.

### Platform abstractions

- [Crossplane](https://docs.crossplane.io/latest/composition/compositions/)
  v2.4.2 separates a user-facing API (a `CompositeResourceDefinition` with an
  OpenAPI schema) from a pipeline of composition functions that expand it,
  each receiving observed and desired state and returning desired state. The
  model-and-compiler split is the same shape.
- [Cluster API](https://cluster-api.sigs.k8s.io/user/concepts) v1.14.3 models
  `Cluster`, `Machine`, `MachineSet` and `MachineDeployment`; a Machine is
  immutable and replaced rather than changed, and provider detail sits behind
  an `infrastructureRef`. For fixed bare-metal nodes it is a contrast: there is
  no provisioning loop, so the node contract is the only record.

### TOSCA, Ansible, Terraform

TOSCA's `host` requirement, fulfilled by a Compute node's `host` capability and
narrowed by a `node_filter` with property constraints, is the most complete
published model of placement by capability matching
([Simple Profile 1.3](https://docs.oasis-open.org/tosca/TOSCA-Simple-Profile-YAML/v1.3/os/TOSCA-Simple-Profile-YAML-v1.3-os.html)).
Ansible's inventory contributes inherited scopes with a stated precedence
(`all`, parent groups, child groups, host)
([inventory](https://docs.ansible.com/ansible/latest/inventory_guide/intro_inventory.html)).
Terraform contributes a vocabulary for strength of constraint: `validation`
on inputs, `precondition` and `postcondition` that fail, and `check` blocks
that only warn ([validate](https://developer.hashicorp.com/terraform/language/validate)).

## Generating hosts with Nix

- **The NixOS `services.k3s` module** types `role` as an enum and takes
  `nodeLabel` and `nodeTaint` as `listOf str`, rendered into
  `--node-label=` and `--node-taint=` flags; it validates through `warnings`,
  not `assertions`, so an inconsistent agent configuration evaluates and only
  warns
  ([source](https://github.com/NixOS/nixpkgs/blob/master/nixos/modules/services/cluster/rancher/default.nix)).
  The things the scheduler consumes are exactly the untyped part.
- **The module system** gives typed options (`lib.types.enum`, `listOf`,
  `nullOr`) checked at evaluation, `assertions` that fail the build and
  `warnings` that do not
  ([assertions](https://github.com/NixOS/nixpkgs/blob/master/lib/modules/generic/assertions.nix),
  [types](https://github.com/NixOS/nixpkgs/blob/master/lib/types.nix)).
- **NixOS tests** boot generated machines in VMs and assert on them from a
  Python `testScript`, through `pkgs.testers.runNixOSTest`
  ([manual](https://nixos.org/manual/nixos/stable/)). This is the seam for
  proving a generated host carries the labels and taints the model promised.
- **nixidy** v0.22.1 (MIT) declares Kubernetes resources as typed Nix modules
  and follows the rendered-manifests pattern: CI renders YAML, the diff is
  reviewed, Argo CD applies the committed files
  ([repository](https://github.com/arnarg/nixidy)). **kubenix** does the same
  without a delivery opinion and describes itself as a work in progress
  ([site](https://kubenix.org/)). **colmena** v0.5.0 deploys NixOS hosts from a
  hive that tags nodes ([repository](https://github.com/zhaofengli/colmena)).

nixidy is the nearest precedent for deploy-kit's own delivery (render, review,
pull), and the k3s module is the nearest evidence of what to avoid: let only
typed label and taint records reach the host, and generate the flag strings
from them.

## Implications for an Infrastructure metamodel

Concepts the surveyed systems agree on, each with its source:

| concept | from |
|---|---|
| a **Node** with identity, site and role, whose capabilities record whether they were discovered or declared | NFD's feature sources; DRA's driver-published slices against the node contract's authored facts |
| a **Capability** as a typed record: kind, attributes, capacity as a quantity | DRA `device.attributes` and `device.capacity` |
| a **capability class** separate from the raw product string | DRA `DeviceClass`; GPU Feature Discovery's `gpu.product` |
| an **owned label namespace**, with the derived label set fixed by rule | NFD `feature.node.kubernetes.io` and `-extra-label-ns`; NVIDIA `nvidia.com/gpu.*` |
| **label and taint derivation rules** from capabilities, taints switched on explicitly | `NodeFeatureRule` `labels`, `taints` and `--enable-taints` |
| a **placement predicate** a Process states against capabilities, checked at composition | DRA CEL selectors; TOSCA `node_filter` |
| **hard and advisory constraints** kept distinct | NixOS `assertions` against `warnings`; Terraform `precondition` against `check` |
| **inherited scopes** (site, later cluster and tenant) with a stated precedence | Ansible group and host variables |
| a **pure expansion** from the model to host configuration and labels, observed and desired state kept apart | Crossplane composition functions |
| a **generated-host test** per node class that boots the generated configuration | `runNixOSTest` |

Left open by the research, for the record that adopts the metamodel: the label
prefix the estate owns; whether discovered facts come from a node-side
collector (NFD) or stay authored; and whether the eventual host generator is a
set of Nix modules (nixidy's shape) or a separate language compiled to Nix
(kubenix's shape).

## Multi-tenancy

The Kubernetes documentation frames tenancy as a spectrum from soft to hard,
recommends a namespace per workload even within one tenant, and warns that
"the benefit of stronger tenant isolation must be evaluated against the cost
and complexity of managing multiple clusters"
([multi-tenancy](https://kubernetes.io/docs/concepts/security/multi-tenancy/)).

| model | control plane | data plane | tools |
|---|---|---|---|
| namespace per tenant | shared; RBAC and NetworkPolicy scoped per namespace | shared nodes and kernel | plain Kubernetes, [Capsule](https://github.com/projectcapsule/capsule) |
| virtual control plane per tenant | an API server, controller manager and datastore per tenant | shared nodes unless dedicated or private nodes are configured | [vcluster](https://github.com/loft-sh/vcluster), [Kamaji](https://github.com/clastix/kamaji) |
| cluster per tenant | per tenant | per tenant | Cluster API, placed by OCM or Karmada |

- **Capsule** groups namespaces into a `Tenant` whose network policies,
  quotas, limit ranges and RBAC every namespace inherits, with self-service
  namespace creation by the tenant's owners
  ([tenants](https://projectcapsule.dev/docs/tenants/)).
- **vcluster** gives each tenant its own control plane, invisible to the
  tenant, syncing objects with the host; only its private-node and standalone
  modes isolate the CNI and storage ([README](https://github.com/loft-sh/vcluster)).
- **Kamaji** runs tenant control planes as pods in a management cluster,
  sharing a `Datastore` resource between many of them
  ([repository](https://github.com/clastix/kamaji)).
- **The Hierarchical Namespace Controller was archived on 2025-04-17** and the
  SIG Multi-Tenancy repository before it
  ([HNC](https://github.com/kubernetes-sigs/hierarchical-namespaces),
  [SIG](https://github.com/kubernetes-sigs/multi-tenancy)). Not a basis.

### GitOps tenancy

Flux's multi-tenancy lockdown denies cross-namespace references
(`--no-cross-namespace-refs=true`), denies remote Kustomize bases, and runs a
tenant's Kustomizations under the tenant namespace's `default` service account
unless one is named, so a tenant applies with its own RBAC rather than the
controller's; the platform's own Kustomization stays cluster-admin and is the
single trust point
([multi-tenancy](https://fluxcd.io/flux/installation/configuration/multitenancy/)).
Argo CD's `AppProject` restricts source repositories, destinations and
resource kinds, but its `default` project permits everything and cluster
isolation is opt-in
([projects](https://argo-cd.readthedocs.io/en/stable/user-guide/projects/)).

### Observability tenancy

The customer-dashboards case is decided mostly here:

- **Grafana organisations** give "completely separate experiences, which look
  like multiple instances of Grafana": dashboards, data sources, folders and
  alerts are isolated per organisation and cannot easily be shared across
  them; users and authentication are shared
  ([organisations](https://grafana.com/docs/grafana/latest/administration/organization-management/)).
- **Mimir and Loki** identify a tenant by the `X-Scope-OrgID` header. Mimir
  states that a protective layer is mandatory, "a reverse proxy that
  authenticates requests" and injects the tenant ID
  ([Mimir](https://grafana.com/docs/mimir/latest/manage/secure/authentication-and-authorization/));
  Loki rejects a request without the header with `no org id` while
  `auth_enabled` is on, its default
  ([Loki](https://grafana.com/docs/loki/latest/operations/multi-tenancy/)).
  Tenant isolation is exactly as strong as the proxy that sets the header.

### Data tenancy

PostgreSQL row-level security denies by default once enabled and is bypassed
by superusers, by `BYPASSRLS` roles and, unless forced, by the table owner
([RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)). The
database catalog already gives each Project its own database
([chapter 16](../../spec/v1/16-dependencies.md#the-database-catalog)), which is
database-per-tenant if a tenant is a Project; schema-per-tenant and shared
tables with RLS were not researched.

## Multi-cluster

- **Karmada** (CNCF graduated) pushes from its own control plane: a
  `PropagationPolicy` selects resources and clusters, an `OverridePolicy`
  patches per cluster ([repository](https://github.com/karmada-io/karmada)).
- **Open Cluster Management** (CNCF Sandbox) pulls: "the work-agent on each
  managed cluster actively pulls ManifestWork resources from its dedicated
  namespace on the hub", and a `Placement` chooses clusters
  ([repository](https://github.com/open-cluster-management-io/ocm)). Pull is
  deploy-kit's own delivery shape.
- **KubeFed was archived on 2023-04-25**
  ([repository](https://github.com/kubernetes-sigs/kubefed)).
- **Cross-cluster addressing is by name.** The Multi-Cluster Services API
  exports a Service with a `ServiceExport` and resolves it as
  `<service>.<namespace>.svc.clusterset.local`; its KEP declares network
  policy semantics a non-goal
  ([KEP-1645](https://github.com/kubernetes/enhancements/tree/master/keps/sig-multicluster/1645-multi-cluster-services-api)).
  Cilium's global services use the same Service name in every cluster and
  require non-overlapping Pod CIDRs and a shared certificate authority
  ([setup](https://docs.cilium.io/en/stable/network/clustermesh/setup/index.html),
  [global services](https://docs.cilium.io/en/stable/network/clustermesh/global-services/)).
  Submariner and Liqo connect cluster networks by gateway or by peering
  ([Submariner](https://github.com/submariner-io/submariner),
  [Liqo](https://github.com/liqotech/liqo)).

## Design questions for a parked decision

What a record parking multi-cluster and multi-tenancy should ask, and what
would unpark it:

1. **Is a Tenant above the Project?** If so, what does it own: namespaces,
   Vault paths, Flux Kustomizations, a Grafana organisation, a DNS zone?
   Capsule's tenant, a group of namespaces inheriting policy, is the closest
   existing shape.
2. **Where does a cluster enter?** As a placement dimension a Project or an
   Application selects (OCM `Placement`, Karmada `PropagationPolicy`), or as a
   concept of the Infrastructure model that nodes belong to. The second keeps
   placement one mechanism.
3. **How does an edge cross clusters?** A Stable Address as an ExternalName
   resolves only where DNS reaches the target. Across clusters it needs a
   shared name domain (`clusterset.local`, or Cilium's same-name model) or a
   published endpoint, and the model, not a DNS record, must stay the source of
   truth for where a provider is.
4. **What do tenants see of observability?** A Grafana organisation per tenant
   isolates fully but shares nothing; a Mimir or Loki tenant per customer needs
   an authenticating proxy on every read and write path.
5. **Which single-cluster assumptions break?** One Vault with one Kubernetes
   auth mount; one Flux root holding cluster-admin; one Release Gate; ExternalName
   addresses; namespace-scoped default-deny policy, which says nothing about
   traffic between clusters.
6. **What would unpark it:** a second cluster that needs a provider from the
   first; a second party whose data must not be visible to the first; or a
   trust-root change in Flux or Vault forced by either.
