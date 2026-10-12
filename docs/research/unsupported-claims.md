# Claims behind the settled decisions that no source backed

Which claims about a third-party tool or about the live estate the map's
settled decisions rest on, and whether each holds. Researched 2026-10-12 for
JorisJonkers-dev/deploy-kit#363, on the map JorisJonkers-dev/deploy-kit#341;
see [the index](README.md#method) for the markers used.

Every line under the map's "Decisions so far" was read with the resolution it
links. A claim is listed here when a decision depends on it and neither this
directory nor a primary source cited in the resolution backed it. Most come
from the four live-need decisions, because those retire or replace a component.
The other twelve resolutions decide the repository's own shape (chapters,
codes, the register, the coursework implementation) and lean on no third-party
behaviour, with two exceptions listed under
[Release and delivery](#release-and-delivery).

This file reports and does not decide. A claim that fails is named with the
ticket whose decision rests on it; what that decision does about it is the
ticket's business.

## Sources

| source | version or commit | what was read |
|---|---|---|
| JorisJonkers-dev/fleet-infra | `4e4a9bb` (2026-10-02), the commit the resolutions cite | the manifests under `cluster/flux/apps/`, read-only |
| JorisJonkers-dev/nix-config | `606e400` (2026-10-07) | `nix/profiles/control-plane.nix`, `nix/profiles/worker.nix`, `nix/modules/roles/gpu-nvidia.nix`, `nix/hosts/`, `generated/nodes/` |
| JorisJonkers-dev/estate | `be99537` (2026-10-08) | `node-contract.yml`, `platform.intent.yml` |
| the live cluster | 2026-10-12, `kubectl get` only, nothing written | nodes, Services, DaemonSets, CronJobs, webhook configurations, CRDs, runtime classes, storage, priority classes, MetalLB and cert-manager objects |
| upstream documentation | the version each page documents, named per row | the page that owns the claim |
| upstream source | the tag the live cluster runs, named per row; the default branch for a project the cluster does not run (release-please, lego, Reloader's and local-path-provisioner's README, the `mongo` image) | the type definition or the controller branch that decides the behaviour |

The live cluster runs k3s `v1.35.2+k3s1` on six nodes (five in Enschede, one
in Frankfurt) with containerd 2.1.5, Traefik v3.7.12, Vault Secrets Operator
(VSO) 1.5.1, MetalLB v0.15.3, cert-manager v1.21.1, prometheus-operator
v0.93.1, grafana-operator v5.25.0, the NVIDIA device plugin v0.20.0, Alloy
v1.19.2, Garage v2.3.0 and Flux's helm-controller v1.5.3
(`kubectl get nodes,deploy,ds,sts -A`).

Where a documentation page was too long to read whole, the project's own
source for that page, or the code it describes, was read at the matching tag
and is the link given.

## Verdicts

Four verdicts are used:

- **holds**: a primary source, or the live estate, confirms the claim as the
  resolution states it.
- **holds with a condition**: the claim is true only when the stated condition
  is met, and the resolution does not state it.
- **fails**: the source says otherwise. The cell says what is true instead.
- **Unverified**: no primary source was found, or the claim needs a drill.
  Nothing unverified is counted as holding.

Each claim has an id so the notes below the tables can refer to it.

### Certificates and admission webhooks

| id | claim | decision | verdict | condition or correction | primary source |
|---|---|---|---|---|---|
| C1 | A wildcard certificate can only be issued through the DNS-01 challenge | [Decide how the foundation's HelmReleases are rendered and owned](https://github.com/JorisJonkers-dev/deploy-kit/issues/356) | holds | none | [Traefik v3.7, ACME, Wildcard Domains](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/); [Let's Encrypt, Challenge Types](https://letsencrypt.org/docs/challenge-types/) |
| C2 | A Traefik ACME resolver can issue the wildcard in place of cert-manager's `ClusterIssuer` and `Certificate` | same | holds with a condition | One replica per Traefik instance, for as long as the resolver exists: Traefik documents that several instances cannot run with Let's Encrypt enabled, and names cert-manager as the way to get that. The public Traefik already runs one replica. See [note](#c2-to-c5-the-wildcard-under-traefik-acme) | [Traefik v3.7, ACME](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/) |
| C3 | ACME state can sit on a `reconstructible` claim | same | holds with a condition | Losing the file costs one new issuance. Let's Encrypt issues at most 5 certificates per exact set of names every 7 days, refilling one every 34 hours, and every instance that issues the same names draws on the same allowance | [Let's Encrypt, Rate Limits](https://letsencrypt.org/docs/rate-limits/) |
| C4 | The wildcard has one consumer, the public Traefik's default TLS store, so the `Certificate` and the `TLSStore` can disappear | same | fails | The LAN Traefik serves the same certificate. Traefik reads only the store named `default`, cluster-wide; both instances load it, and ten LAN routes terminate TLS on `websecure`. An ACME certificate lives in one instance's storage file and is no Kubernetes Secret, so the LAN instance needs a resolver, a claim and a token of its own. See [note](#c2-to-c5-the-wildcard-under-traefik-acme) | [Traefik v3.7, TLSStore](https://doc.traefik.io/traefik/reference/routing-configuration/kubernetes/crd/tls/tlsstore/); fleet-infra `cluster/flux/apps/edge/traefik-default-tls.yaml`, `core/lan-ingress-controller/release.yaml` |
| C5 | VSO can deliver the Cloudflare token the resolver needs | same | holds | Traefik takes DNS provider credentials from environment variables; the Cloudflare provider reads `CF_DNS_API_TOKEN`. A Secret that VSO syncs can feed it, as it feeds cert-manager and external-dns today | [Traefik v3.7, ACME](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/); [lego, Cloudflare](https://github.com/go-acme/lego/blob/master/docs/content/dns/zz_gen_cloudflare.md); fleet-infra `cluster/flux/apps/vso-secrets/cloudflare-cert-manager.yaml` |
| C6 | cert-manager's webhook is the only required one; MetalLB's, prometheus-operator's and the Vault injector's are optional, so no webhook need be rendered | same | holds with a condition | The four admission webhook configurations live are exactly these. MetalLB's `bgppeers.metallb.io` CRD also declares a conversion webhook that points at `metallb-webhook-service`, and the resolution moves the `metallb.io` CRDs into the bootstrap set. Nothing calls it while no `BGPPeer` object exists. See [note](#c6-the-conversion-webhook-that-stays) | [cert-manager, The webhook](https://cert-manager.io/docs/concepts/webhook/); [Kubernetes, Webhook conversion](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definition-versioning/#webhook-conversion); [MetalLB v0.15.3 `controller/main.go`](https://github.com/metallb/metallb/blob/v0.15.3/controller/main.go) (`--webhook-mode`); [MetalLB v0.15.3 CRDs](https://github.com/metallb/metallb/blob/v0.15.3/charts/metallb/charts/crds/templates/crds.yaml); [prometheus-operator, Admission webhook](https://prometheus-operator.dev/docs/platform/webhook/) |

### Secret delivery

| id | claim | decision | verdict | condition or correction | primary source |
|---|---|---|---|---|---|
| C7 | A `VaultDynamicSecret` can read a credential from the `rabbitmq` engine as it does from `database` | [Decide how the model meets the live needs no chapter covers](https://github.com/JorisJonkers-dev/deploy-kit/issues/351) | holds | The resource takes any `mount` and `path`; the documentation says all Vault secret engines are supported and calls its engine list non-exhaustive. No `VaultDynamicSecret` reads `rabbitmq` live, so this is not exercised | [VSO 1.5.1 `vaultdynamicsecret_types.go`](https://github.com/hashicorp/vault-secrets-operator/blob/v1.5.1/api/v1beta1/vaultdynamicsecret_types.go); [VSO, Vault as a secret source](https://developer.hashicorp.com/vault/docs/deploy/kubernetes/vso/sources/vault) |
| C8 | agents-api reads a RabbitMQ dynamic credential today | same | fails | The annotation still names `rabbitmq/creds/app-consumer`, but the template under it reads the static `secret/data/platform/rabbitmq`. The dynamic credential was dropped after Vault revoked the user under a running pod. No live workload uses a RabbitMQ dynamic credential. See [note](#c7-to-c9-the-rabbitmq-grant) | fleet-infra `cluster/flux/apps/stateless/agents-api/deployment.yaml`, `cluster/flux/apps/data/vault/bootstrap-auth.sh` |
| C9 | The `rabbitmq` engine gives each consumer its own role with its own lifetime | same | holds with a condition | A role carries `tags`, `vhosts` and `vhost_topics` only. The lease lifetime is one setting for the whole mount (`config/lease`), not per role, and the estate's bootstrap passes `default_ttl` and `max_ttl` to a role, where the API defines no such parameters. See [note](#c7-to-c9-the-rabbitmq-grant) | [Vault, RabbitMQ secrets engine API](https://developer.hashicorp.com/vault/api-docs/secret/rabbitmq); [Vault, RabbitMQ secrets engine](https://developer.hashicorp.com/vault/docs/secrets/rabbitmq) |
| C10 | A rotated secret restarts its workload through `rolloutRestartTargets`, so nothing else is needed for restarts | [Decide how the foundation's HelmReleases are rendered and owned](https://github.com/JorisJonkers-dev/deploy-kit/issues/356) | holds with a condition | Targets are `Deployment`, `DaemonSet`, `StatefulSet` and `argo.Rollout`. A static secret changes only when VSO polls it (`refreshAfter`, 1 hour on most live objects), because instant updates need Vault Enterprise; a restart is skipped when `hmacSecretData` is off; a paused Deployment is refused. See [note](#c10-to-c12-what-retiring-reloader-and-the-injector-rests-on) | [VSO 1.5.1 `vaultstaticsecret_types.go`](https://github.com/hashicorp/vault-secrets-operator/blob/v1.5.1/api/v1beta1/vaultstaticsecret_types.go); [`rollout_restart.go`](https://github.com/hashicorp/vault-secrets-operator/blob/v1.5.1/helpers/rollout_restart.go); [`vaultdynamicsecret_controller.go`](https://github.com/hashicorp/vault-secrets-operator/blob/v1.5.1/controllers/vaultdynamicsecret_controller.go); [VSO, Vault as a secret source](https://developer.hashicorp.com/vault/docs/deploy/kubernetes/vso/sources/vault) |
| C11 | Reloader has one user, hermes, which can move to VSO's restart targets | same | holds | hermes's Secret already restarts it through VSO. Reloader's remaining job is three ConfigMaps, and a Deployment rolls whenever its pod template changes, which a content hash in the template provides | fleet-infra `cluster/flux/apps/agents/hermes/deployment.yaml`, `credentials-vss.yaml`; [Reloader README](https://github.com/stakater/Reloader/blob/master/README.md); [Kubernetes, Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#updating-a-deployment) |
| C12 | VSO covers every delivery shape the Vault Agent injector serves today | [Decide how the model meets the live needs no chapter covers](https://github.com/JorisJonkers-dev/deploy-kit/issues/351) | holds with a condition | All 19 injected pods run the agent once (`agent-pre-populate-only`), so none relies on a sidecar that renews. Fourteen also ask for the Vault token itself (`agent-inject-token`). VSO defines no resource that delivers a token; no manifest reads the token file, but the images were not inspected. See [note](#c10-to-c12-what-retiring-reloader-and-the-injector-rests-on) | fleet-infra, 19 files under `cluster/flux/apps/` carrying `vault.hashicorp.com/agent-inject`; [VSO API reference](https://developer.hashicorp.com/vault/docs/deploy/kubernetes/vso/api-reference) |
| C13 | Nothing uses the Vault CSI provider | [Decide how the foundation's HelmReleases are rendered and owned](https://github.com/JorisJonkers-dev/deploy-kit/issues/356) | holds | fleet-infra holds no `SecretProviderClass`, and the cluster has no `CSIDriver` at all, so the provider's six pods serve nothing | fleet-infra `cluster/flux/apps/` (no match for `SecretProviderClass`); `kubectl get csidriver` |

### L4 exposure

| id | claim | decision | verdict | condition or correction | primary source |
|---|---|---|---|---|---|
| C14 | The estate's load balancer is MetalLB in layer 2 mode, and k3s ServiceLB is off | [Decide how the model meets the live needs no chapter covers](https://github.com/JorisJonkers-dev/deploy-kit/issues/351) | holds | The k3s server starts with `--disable=servicelb`, which MetalLB requires on k3s. One pool, `192.168.0.97-192.168.0.99`, with one `L2Advertisement` | nix-config `nix/profiles/control-plane.nix`; fleet-infra `cluster/flux/apps/metallb-config/config.yaml`; [MetalLB on K3s](https://metallb.io/configuration/k3s/); [K3s, Service Load Balancer](https://docs.k3s.io/networking/networking-services) |
| C15 | A LoadBalancer Service with the `Local` traffic policy keeps the client address | same | holds | none | [Kubernetes, Using Source IP](https://kubernetes.io/docs/tutorials/services/source-ip/); [MetalLB, Usage, Layer2](https://metallb.io/usage/) |
| C16 | One L4 exposure can carry TCP and UDP on one address, taken from a declared pool | same | holds | The address is requested with the `metallb.io/loadBalancerIPs` annotation. Both AdGuard Services already do this | [Kubernetes, Load balancers with mixed protocol types](https://kubernetes.io/docs/concepts/services-networking/service/#load-balancers-with-mixed-protocol-types); [MetalLB, Usage](https://metallb.io/usage/); fleet-infra `cluster/flux/apps/utility-system/adguard-ha/service-a.yaml` |
| C17 | The LoadBalancer Service is the one L4 mechanism, so stalwart moves from `hostPort` to it | same | fails | stalwart runs on the Frankfurt node, where no address pool exists and the only public address is the node's own. MetalLB states that it is in general not compatible with cloud providers. The public Traefik's LoadBalancer Service is `<pending>` and serves through `hostPort` for this reason. See [note](#c17-l4-exposure-on-the-frankfurt-node) | [MetalLB, Cloud compatibility](https://metallb.io/installation/clouds/); fleet-infra `cluster/flux/apps/mail/stalwart/deployment.yaml`, `core/ingress-controller/release.yaml`; `kubectl get svc -A` |
| C18 | With two replicas behind one VIP, MetalLB re-announces the VIP from the surviving replica's node | [Decide how the model meets soft scheduling, spread, anti-affinity and parked replicas](https://github.com/JorisJonkers-dev/deploy-kit/issues/355) | holds with a condition | Only one replica serves at a time: in layer 2 mode all traffic for an address goes to one node, and under `Local` pods off that node receive none. Failover after a node failure is documented as "within a few seconds", and clients that cache the old hardware address wait longer. See [note](#c18-one-vip-in-front-of-two-replicas) | [MetalLB, Layer 2 concepts](https://metallb.io/concepts/layer2/); [MetalLB, Usage, Layer2](https://metallb.io/usage/) |
| C19 | The speaker can be derived from a non-empty address pool alone | [Decide how the foundation's HelmReleases are rendered and owned](https://github.com/JorisJonkers-dev/deploy-kit/issues/356) | holds with a condition | A pool is reachable only from the nodes on its network segment. The pool must name those nodes (or their site), the advertisement must select them, and a Process with an exposure in that pool must be placed on them. Live, the speaker runs on all six nodes with no selector, and it works only because every such workload is pinned to Enschede. See [note](#c19-and-c25-to-c29-node-agents-from-node-facts) | [MetalLB, Advanced L2 configuration](https://metallb.io/configuration/_advanced_l2_configuration/); `kubectl get ipaddresspool,l2advertisement,servicel2status -A` |

### Spread and parked

| id | claim | decision | verdict | condition or correction | primary source |
|---|---|---|---|---|---|
| C20 | Required pod anti-affinity on the hostname gives a hard one-per-node guarantee | [Decide how the model meets soft scheduling, spread, anti-affinity and parked replicas](https://github.com/JorisJonkers-dev/deploy-kit/issues/355) | holds | It is checked when a pod is scheduled and not afterwards. A topology spread constraint with `DoNotSchedule` is the weaker construct: it bounds a skew, and its documentation says the constraint is not guaranteed to hold once pods are removed | [Kubernetes, Inter-pod affinity and anti-affinity](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#inter-pod-affinity-and-anti-affinity); [Kubernetes, Topology spread, Known limitations](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/#known-limitations) |
| C21 | A Process with `across: node` rolls out whenever the eligible nodes are at least as many as its replicas, the only case the build refuses being fewer | same | holds with a condition | When replicas equal eligible nodes, a rolling update that surges cannot place the new pod: every eligible node already holds a matching pod. The default strategy surges for small replica counts. It holds with more eligible nodes than replicas, with `maxSurge: 0`, or with `matchLabelKeys: [pod-template-hash]`. Derived from the documented behaviour, not drilled. See [note](#c21-rollout-when-replicas-equal-eligible-nodes) | [Kubernetes, Deployments, Rolling update](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment); [Kubernetes, matchLabelKeys](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#matchlabelkeys); [Kubernetes v1.35.2 feature gates](https://github.com/kubernetes/kubernetes/blob/v1.35.2/pkg/features/kube_features.go) |
| C22 | `suspend: true` parks a scheduled Process | same | holds with a condition | It stops new Jobs and leaves a running Job running. On resume, a CronJob without `startingDeadlineSeconds` starts the most recent missed run at once. None of the nine live CronJobs sets a deadline. See [note](#c22-what-suspending-a-cronjob-does) | [Kubernetes, CronJob, Schedule suspension](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#schedule-suspension); [Kubernetes v1.35.2 `cronjob_controllerv2.go`](https://github.com/kubernetes/kubernetes/blob/v1.35.2/pkg/controller/cronjob/cronjob_controllerv2.go) |
| C23 | A `scheduled` Process renders a CronJob that never runs twice at once | [Decide how the model meets the live needs no chapter covers](https://github.com/JorisJonkers-dev/deploy-kit/issues/351) | holds | `concurrencyPolicy: Forbid` skips a run while the previous one is unfinished. It applies within one CronJob only | [Kubernetes, CronJob, Concurrency policy](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#concurrency-policy) |

### Node agents, GPUs and placement

| id | claim | decision | verdict | condition or correction | primary source |
|---|---|---|---|---|---|
| C24 | The node contract already declares each GPU's `vendor` and `model` | [Decide how the model meets soft scheduling, spread, anti-affinity and parked replicas](https://github.com/JorisJonkers-dev/deploy-kit/issues/355) | holds | Two nodes declare one NVIDIA GPU each (`gtx960m`, `t1000`), and the generated node labels carry both values | estate `node-contract.yml`; nix-config `generated/nodes/enschede-t1000-1/k3s-labels.nix` |
| C25 | `gpu-device` can be derived from a node's NVIDIA GPU fact | [Decide how the foundation's HelmReleases are rendered and owned](https://github.com/JorisJonkers-dev/deploy-kit/issues/356) | holds with a condition | The plugin needs the NVIDIA driver, the NVIDIA container toolkit and a container runtime configured for it on the host, none of which the render installs. The estate's two GPU nodes need different driver branches. See [note](#c19-and-c25-to-c29-node-agents-from-node-facts) | [NVIDIA device plugin v0.20.0 README, Prerequisites](https://github.com/NVIDIA/k8s-device-plugin/blob/v0.20.0/README.md#prerequisites); [K3s, NVIDIA Container Runtime](https://docs.k3s.io/advanced#alternative-container-runtime-support); nix-config `nix/modules/roles/gpu-nvidia.nix`, `nix/hosts/enschede-gtx-960m-1/default.nix` |
| C26 | `gpu-metrics` can be derived from the same fact | same | holds with a condition | As C25. Live, dcgm-exporter also requests one `nvidia.com/gpu`, so it occupies one of the shared slots on each GPU node (C30). Its host requirements beyond the live values are Unverified: the project's README states none | fleet-infra `cluster/flux/apps/observability/nvidia-dcgm-exporter/release.yaml` |
| C27 | `node-metrics` can be derived for every node | same | holds | node-exporter runs on all six nodes with host network, host PID and the host's `/proc`, `/sys` and `/`, and selects on the operating system only | `kubectl get ds -n observability metrics-stack-prometheus-node-exporter` |
| C28 | Alloy is a host-privileged node agent that reads pod logs from the node | same | fails | The live Alloy tails logs through the Kubernetes API (`loki.source.kubernetes`). Its pods mount no host path, use neither host network nor host PID, and run with a read-only root file system. The component's documentation says it needs no privileged container, no node file system and no DaemonSet | fleet-infra `cluster/flux/apps/observability/alloy/release.yaml`; [Alloy, loki.source.kubernetes](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.kubernetes/); `kubectl get ds -n observability alloy` |
| C29 | The five catalog entries are the estate's node agents | same | holds with a condition | They are the host-privileged ones (less Alloy, C28). Two more DaemonSets run: `vault-csi-provider`, which retires, and `loki-canary`, which holds no host privilege and which no entry or Process covers. See [note](#c19-and-c25-to-c29-node-agents-from-node-facts) | `kubectl get ds -A` |
| C30 | A Process that requires a GPU derives one device request and the runtime class | [Decide how the model meets the live needs no chapter covers](https://github.com/JorisJonkers-dev/deploy-kit/issues/351) | holds with a condition | The request is a `limits` entry. Live it is a share, not a device: the plugin advertises four time-sliced replicas per GPU, with no memory or fault isolation between them, and dcgm-exporter takes one. The sharing setting is therefore a catalog fact the derivation depends on. See [note](#c30-what-one-device-request-means-live) | [Kubernetes, Schedule GPUs](https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/); [NVIDIA device plugin v0.20.0 README, Shared access to GPUs](https://github.com/NVIDIA/k8s-device-plugin/blob/v0.20.0/README.md#shared-access-to-gpus); fleet-infra `cluster/flux/apps/core/nvidia-device-plugin/release.yaml` |
| C31 | A `local-path` binding already pins a claim to its node | [Decide how the model meets soft scheduling, spread, anti-affinity and parked replicas](https://github.com/JorisJonkers-dev/deploy-kit/issues/355) | holds | The provisioner sets node affinity on the hostname, and every live volume carries it | [local-path-provisioner README](https://github.com/rancher/local-path-provisioner/blob/master/README.md); `kubectl get pv` |
| C32 | The priority class can be derived from what a Process is | [Decide how the model meets the live needs no chapter covers](https://github.com/JorisJonkers-dev/deploy-kit/issues/351) | holds with a condition | The mechanism is a class name on the pod. The rule as decided does not reproduce what runs: `platform-critical-app` is on auth-api, agents-api and knowledge-api, which are not foundation Applications, and `platform-data` is on seven knowledge-platform workloads and on Vault. The handover diff will show each as a change | [Kubernetes, Pod Priority and Preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/); fleet-infra (`grep -rn priorityClassName cluster/flux/apps`) |

### Hardening, egress and engines

| id | claim | decision | verdict | condition or correction | primary source |
|---|---|---|---|---|---|
| C33 | A non-root process cannot bind a port below 1024 without `NET_BIND_SERVICE`, so `E_PRIVILEGED_PORT_UNDER_NONROOT` guards a real hazard | [Decide how the model meets the live needs no chapter covers](https://github.com/JorisJonkers-dev/deploy-kit/issues/351) | fails | Not on k3s. k3s configures containerd with `enable_unprivileged_ports` on any kernel from 4.11, which sets `net.ipv4.ip_unprivileged_port_start=0` in every pod that is not on the host network. Read from source; **Settle by drill**, because no live pod binds a low port as non-root. See [note](#c33-low-ports-under-a-non-root-user) | [k3s v1.35.2 `config_linux.go`](https://github.com/k3s-io/k3s/blob/v1.35.2%2Bk3s1/pkg/agent/containerd/config_linux.go); [k3s v1.35.2 `templates.go`](https://github.com/k3s-io/k3s/blob/v1.35.2%2Bk3s1/pkg/agent/templates/templates.go); [containerd v2.1.5, CRI plugin config](https://github.com/containerd/containerd/blob/v2.1.5/docs/cri/config.md) |
| C34 | jellyfin's root init container can be replaced by the volume group the spec derives | same | holds with a condition | Only if the directory becomes a claim. jellyfin already sets `fsGroup: 1000`, and the init container exists because the directory is a `hostPath`, on which the kubelet manages no ownership. A `local` volume, which is what the estate's claims are, is managed | [Kubernetes v1.35.2 `host_path.go`](https://github.com/kubernetes/kubernetes/blob/v1.35.2/pkg/volume/hostpath/host_path.go) (`Managed: false`); [`local.go`](https://github.com/kubernetes/kubernetes/blob/v1.35.2/pkg/volume/local/local.go); [Kubernetes, Configure a Security Context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/); fleet-infra `cluster/flux/apps/media/jellyfin/deployment.yaml` |
| C35 | Two routes with one host on one proxy have no defined winner | same | holds | Traefik orders routers by rule length and documents a tie-break only between different providers. Two equal rules from one provider have none | [Traefik v3.7, Rules and priority](https://doc.traefik.io/traefik/reference/routing-configuration/http/routing/rules-and-priority/) |
| C36 | `egress: internet` renders as an allow to `0.0.0.0/0` minus the cluster and LAN ranges | same | holds with a condition | The excluded ranges must include the tailnet. Every node's address is a Tailscale address (`100.64.0.0/10`), which is neither a cluster range nor the LAN, so without it the rule also allows each node's host services and every other tailnet device. `0.0.0.0/0` covers IPv4 only, and traffic to a pod's own node is always allowed. k3s enforces the policy with its embedded controller | [Kubernetes, Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/); [K3s, Network Policy Controller](https://docs.k3s.io/networking/networking-services); `kubectl get nodes -o wide`; nix-config `nix/profiles/worker.nix` |
| C37 | A provider renders a selectorless Service and an EndpointSlice | same | holds | none. The live `ollama-heavy` uses the older Endpoints object | [Kubernetes, Services without selectors](https://kubernetes.io/docs/concepts/services-networking/service/#services-without-selectors) |
| C38 | A `before: true` sidecar runs to completion before the Process starts | same | holds | That is an init container | [Kubernetes, Init Containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/) |
| C39 | The `s3` engine can give each consuming Project one bucket and one scoped key | same | holds | The estate's S3 server is Garage. A Garage bucket cannot be accessed until a key is allowed on it, and read, write and owner are granted per key and bucket. Whether a backup image exists for it is Unverified | [Garage, Quick Start](https://garagehq.deuxfleurs.fr/documentation/quick-start/); fleet-infra `cluster/flux/apps/data/garage/` |
| C40 | The `mongo` engine has a backup image | same | holds | The official image installs MongoDB's tools package beside the server | [docker-library/mongo `8.0/Dockerfile`](https://github.com/docker-library/mongo/blob/master/8.0/Dockerfile) |

### Human access and Grafana content

| id | claim | decision | verdict | condition or correction | primary source |
|---|---|---|---|---|---|
| C41 | A human grant is one `ClusterRoleBinding` of a built-in ClusterRole to a group the API server prefixes with `oidc:` | [Decide how the model meets human access grants and Grafana content](https://github.com/JorisJonkers-dev/deploy-kit/issues/357) | holds | The prefix is set on the control plane. Kubernetes describes `admin`, `edit` and `view` as intended for a RoleBinding in one namespace; binding them cluster-wide is permitted | nix-config `nix/profiles/control-plane.nix`; [Kubernetes, Authenticating, OpenID Connect Tokens](https://kubernetes.io/docs/reference/access-authn-authz/authentication/#openid-connect-tokens); [Kubernetes, RBAC, User-facing roles](https://kubernetes.io/docs/reference/access-authn-authz/rbac/#user-facing-roles) |
| C42 | Two dashboards with one `uid` overwrite each other silently | same | holds | The operator posts every dashboard with `Overwrite: true` | [grafana-operator v5.25.0 `dashboard_controller.go`](https://github.com/grafana/grafana-operator/blob/v5.25.0/controllers/dashboard_controller.go) |
| C43 | A dashboard file without a `uid` is the same hazard | same | fails | A dashboard without one does not collide. The operator falls back to the Kubernetes UID of the `GrafanaDashboard` object, so the dashboard's address changes whenever the object is recreated, as a namespace Move recreates it. The check is still worth making, for a different reason | [grafana-operator v5.25.0 `uid.go`](https://github.com/grafana/grafana-operator/blob/v5.25.0/controllers/content/uid.go) |
| C44 | A grafana.com dashboard can be vendored as plain JSON like any other | same | holds with a condition | All nine live ones depend on the operator replacing `${DS_PROMETHEUS}` through the object's `datasources` mapping, which works on any JSON source. The adapter must render that mapping, or the vendored file must have the input resolved | [grafana-operator v5.25.0 `resolver.go`](https://github.com/grafana/grafana-operator/blob/v5.25.0/controllers/content/resolver.go); fleet-infra `cluster/flux/apps/grafana-dashboards/dashboards/` |
| C45 | One `AlertmanagerConfig` in the monitoring namespace routes the whole estate's alerts | same | holds with a condition | The operator's default strategy, `OnNamespace`, makes a config process only alerts whose `namespace` label equals its own. The rendered `Alertmanager` must set `alertmanagerConfigMatcherStrategy.type: None`, as the live chart values do | [prometheus-operator v0.93.1 `alertmanager_types.go`](https://github.com/prometheus-operator/prometheus-operator/blob/v0.93.1/pkg/apis/monitoring/v1/alertmanager_types.go); fleet-infra `cluster/flux/apps/observability/metrics-stack/release.yaml` |
| C46 | prometheus-operator can stay without its admission webhook | [Decide how the foundation's HelmReleases are rendered and owned](https://github.com/JorisJonkers-dev/deploy-kit/issues/356) | holds | The webhook is a separate deployment that validates rules and configs and converts `AlertmanagerConfig` between versions. The live config is `v1alpha1`, and its CRD declares no conversion webhook | [prometheus-operator, Admission webhook](https://prometheus-operator.dev/docs/platform/webhook/); `kubectl get crd` |

### Release and delivery

| id | claim | decision | verdict | condition or correction | primary source |
|---|---|---|---|---|---|
| C47 | A `Release-As` footer steers release-please to 1.0.0 | [Decide between a spec/v2 and reworking v1 in place](https://github.com/JorisJonkers-dev/deploy-kit/issues/348) | holds with a condition | The footer must be at the bottom of the body of the commit that lands on `main`. The repository squash-merges and builds that body from the branch's commit messages, so the footer has to end up last. It is also required: with `bump-minor-pre-major` set, a breaking commit alone gives 0.11.0 | [release-please README](https://github.com/googleapis/release-please/blob/main/README.md#how-do-i-change-the-version-number); [`src/commit.ts`](https://github.com/googleapis/release-please/blob/main/src/commit.ts); this repository's `release-please-config.json` |
| C48 | A chart that templates its CRDs deletes them, and every object of their kind, on uninstall | [Decide how the foundation's HelmReleases are rendered and owned](https://github.com/JorisJonkers-dev/deploy-kit/issues/356); [Order the Project handovers and what the spec must settle before each](https://github.com/JorisJonkers-dev/deploy-kit/issues/349) | holds | Helm deletes every object in the release's stored manifest, and deleting a CRD deletes its objects. MetalLB's chart is such a chart; a chart that ships CRDs in its `crds` directory is not | [Helm v3.19.0 `uninstall.go`](https://github.com/helm/helm/blob/v3.19.0/pkg/action/uninstall.go); [Helm, Custom Resource Definitions](https://helm.sh/docs/chart_best_practices/custom_resource_definitions/); [Kubernetes, Delete a CustomResourceDefinition](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/#delete-a-customresourcedefinition); [MetalLB v0.15.3 chart](https://github.com/metallb/metallb/tree/v0.15.3/charts/metallb/charts/crds/templates) |
| C49 | Moving a chart's CRDs into the bootstrap set before its HelmRelease is removed keeps them | same | holds with a condition | Not by itself. Helm deletes what its stored manifest lists, whoever else applies the object. The CRD survives if the stored manifest carries `helm.sh/resource-policy: keep` for it, or if the `HelmRelease` is suspended before it is deleted, in which case helm-controller skips the uninstall altogether. See [note](#c48-and-c49-removing-a-helmrelease-without-losing-its-crds) | [Helm, Tell Helm not to uninstall a resource](https://helm.sh/docs/howto/charts_tips_and_tricks/); [helm-controller v1.5.3 `helmrelease_controller.go`](https://github.com/fluxcd/helm-controller/blob/v1.5.3/internal/controller/helmrelease_controller.go) (`reconcileDelete`) |

## Notes

### C2 to C5: the wildcard under Traefik ACME

Traefik's ACME page (v3.7, the version the estate runs) says a wildcard
certificate can only be generated through a DNS-01 challenge, that the
resolver's certificates are stored in one file (`storage`, `acme.json` by
default), and that it is not possible to run several Traefik instances with
Let's Encrypt enabled. It recommends a certificate controller "such as
Cert-Manager" for anyone who needs that. The decision therefore trades
cert-manager for a hard limit of one replica on each Traefik instance that
holds a resolver.

The resolution describes the wildcard as "the public Traefik's default TLS
store". The store is not the public Traefik's. Traefik uses only the
`TLSStore` named `default`, and its documentation says there cannot be two of
that name in different namespaces. fleet-infra defines it once, in
`edge-system`, and both Traefik releases watch every namespace, so both serve
the certificate it names. Ten `IngressRoute` objects carry the `traefik-lan`
class, and all ten listen on `websecure` with `tls: {}`. That the LAN instance
presents this certificate was read from the manifests and not checked with a
handshake.

Under ACME there is no Secret for a second instance to read. Two more facts
bear on what the LAN tier does next:

- The estate's Platform document declares the `lan` tier as `listener: plain`
  with `certificates: none` (estate `platform.intent.yml`), which is not what
  runs.
- Every hostname is under `.dev`, and the registry states that the whole
  top-level domain is on the HSTS preload list, "making HTTPS required on all
  connections to .dev websites"
  ([Google Registry, .dev](https://www.registry.google/domains/dev/)). A
  browser will not open a `.dev` host over plain HTTP.

The certificate does not have to leave the model as a store: a `TLSStore` may
name a resolver and a domain (`defaultGeneratedCert`) in place of a Secret,
and an entry point may apply a resolver to every router attached to it
([Traefik v3.7, EntryPoints](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/)).
Because the store is cluster-wide, a resolver it names must exist in every
instance that reads it.

stalwart is not a consumer: its mail listeners take their certificate from
stalwart's own ACME configuration, held in its datastore (fleet-infra
`cluster/flux/apps/mail/stalwart/deployment.yaml`).

### C6: the conversion webhook that stays

`kubectl get validatingwebhookconfigurations,mutatingwebhookconfigurations`
lists four names: `cert-manager-webhook` (both kinds),
`metallb-webhook-configuration`, `metrics-stack-admission` (both kinds) and
`vault-agent-injector-cfg`. VSO installs none. MetalLB's controller takes `--webhook-mode`, whose value
`disabled` turns its validating webhook off.

One webhook of another kind remains. Of every CRD in the cluster, one declares
`spec.conversion.strategy: Webhook`: `bgppeers.metallb.io`, pointing at
`metallb-webhook-service` in `metallb-system`. The live object also carries a
CA bundle that the chart's template does not, so something writes to the CRD
after it is applied. Kubernetes calls a conversion webhook when an object is
requested, watched or written in a version other than the stored one. The
stored version is `v1beta2`, the estate has no `BGPPeer` and uses layer 2
only, so nothing calls it today. The `metallb.io` CRDs that move to the
bootstrap set carry this stanza unless it is removed from them.

### C7 to C9: the RabbitMQ grant

The resolution says `rabbitmq` joins the grant union "as a dynamic
credential", delivered "like the database grant", and the inventory it builds
on says agents-api reads `rabbitmq/creds/app-consumer` today. The second
statement is out of date. In
`cluster/flux/apps/stateless/agents-api/deployment.yaml` the annotation
`agent-inject-secret-agents-api.env` still names that path, but the template
that produces the file reads `secret/data/platform/rabbitmq`, with a comment
recording why: the agent renders once and exits, nothing renewed the lease,
and "Vault revoked the RabbitMQ user out from under a running pod". auth-api
carries the same comment. The engine is mounted and has one role
(`bootstrap-auth.sh`), and nothing reads from it.

So the decision adds a credential kind no workload uses, to replace a static
one. That is a design choice and not a failed claim, but three facts about the
engine are not in the resolution:

- A role is a name with `tags`, `vhosts` and `vhost_topics`. A role per
  consumer is therefore possible.
- The lease lifetime is set once per mount, at `rabbitmq/config/lease` (`ttl`,
  `max_ttl`). The bootstrap script passes `default_ttl="72h"` and
  `max_ttl="768h"` to the role, which the role endpoint does not define, and
  writes no `config/lease`. What lifetime the live mount issues was not read
  from Vault.
- When a lease ends, Vault deletes the RabbitMQ user. With VSO the lease is
  renewed until its maximum and the credential is then replaced, which
  restarts every consumer (C10). The estate already runs this cycle for
  Postgres: `database/roles/tribelt` has a 24-hour maximum, so tribelt rolls
  daily.

What a RabbitMQ client holding an open connection sees when its user is
deleted is Unverified beyond the estate's own incident note.

### C10 to C12: what retiring Reloader and the injector rests on

VSO restarts a workload by patching the annotation
`vso.secrets.hashicorp.com/restartedAt` into the target's pod template
(`helpers/rollout_restart.go`). For a dynamic secret the controller does this
after each sync that writes a new credential, and returns before that point
when it only renews the lease (`vaultdynamicsecret_controller.go`). For a
static secret it does so "whenever the Vault secret changes between
reconciliation events", and it reads on the `refreshAfter` interval: the
documentation says instant updates require Vault Enterprise, which the estate
does not run. Of the 38 live `VaultStaticSecret` objects, 32 poll hourly, 5
daily and 1 every ten minutes, so a changed KV value reaches a pod up to that
much later. The specification's own rule for rotation under Flagger is already
decided in
[0053](../adr/model/0053-rotating-a-secret-is-not-a-release.md) and is not
re-examined here.

The injector's live uses, counted over the 19 pod templates that enable it
(22 injected files, each with a template):

| shape | count | VSO equivalent |
|---|---|---|
| a KV secret rendered through a template into an env file | 19 files | a `VaultStaticSecret` with a transformation, as the live ones already use |
| a KV secret written as a key file with mode `0400` (`id_ed25519`) | 2 files | a synced Secret mounted as a file |
| the Vault chart's sample reader (`sample.txt`) | 1 file | none needed |
| run once and exit (`agent-pre-populate-only`) | 19 of 19 | nothing to replace: no pod depends on a sidecar |
| the Vault token itself (`agent-inject-token`) | 14 | none: VSO defines `VaultStaticSecret`, `VaultDynamicSecret`, `VaultPKISecret`, `HCPVaultSecretsApp` and `CSISecrets`, and none delivers a token |

No manifest in fleet-infra reads `/vault/secrets/token`; the backup and
metrics-token jobs that need a token log in to Vault themselves. Whether a
container image reads the injected token was not checked, since that needs the
images and not the manifests. If one does, it is an Application that "talks to
Vault itself" in the resolution's words, and takes the `self` path.

### C17: L4 exposure on the Frankfurt node

The resolution renders an L4 exposure "only as a LoadBalancer Service with the
`Local` traffic policy", with "an address from a Platform-declared pool", and
moves stalwart to it "so there is one mechanism".

stalwart is pinned to `site: frankfurt` and binds eight ports with `hostPort`
on that node's one public address. The estate has one pool, on the Enschede
LAN. fleet-infra already records what happens to a LoadBalancer Service in
Frankfurt, in the public Traefik's values: "MetalLB only hands out IPs on the
enschede LAN, so the LoadBalancer service alone binds nothing reachable from
the public internet", and the Service's external address is `<pending>` in the
cluster today. That Traefik serves ports 80 and 443 through `hostPort`.

MetalLB's documentation says that it is in general not compatible with cloud
providers, and that on a virtual network only addresses the platform assigned
to the machine resolve, which breaks layer 2 mode; it adds that providers of
dedicated servers usually do not support the protocols MetalLB needs either.
The Frankfurt node is rented from a hosting provider. Whether that provider
can route a second address to it in a way MetalLB can announce is Unverified.

The k3s mechanism that binds a Service's ports on a node's own address is
ServiceLB, which works through host ports, leaves a Service pending when no
node has the port free, and is disabled on this cluster (C14). The k3s page
says another load balancer needs ServiceLB disabled and says nothing about
running the two side by side.

The same gap applies to the public tier itself: whatever renders
`traefik-public` must reach ports 80 and 443 on that node without a pool.

### C18: one VIP in front of two replicas

MetalLB's layer 2 page: "In layer 2 mode, all traffic for a service IP goes to
one node", and it "does not implement a load balancer". Its usage page, for the
`Local` policy: "Pods that aren't on the current leader node receive no
traffic". The second AdGuard replica is therefore a standby. When the
announcing node fails, the others detect it through memberlist and one takes
over, sending gratuitous packets; the page puts this at "within a few
seconds" and notes that a client which ignores those packets keeps the stale
address until its cache expires. The announcer is chosen among nodes with an
active endpoint, so the address also moves when the pod, and not the node,
stops being ready.

The live design answers the same failure in the client instead: two addresses
in the router, and a resolver that asks the second when the first is silent
(fleet-infra `cluster/flux/apps/utility-system/adguard-ha/deployment-b.yaml`).
The resolution replaces that with the cluster-side failover described here.

### C19 and C25 to C29: node agents from node facts

The resolution derives five agents from "facts already authored". Checked one
by one against what each needs:

| entry | derived from | holds? | what the fact does not carry |
|---|---|---|---|
| `gpu-device` | a node with an `nvidia` GPU | with a condition | the driver, the container toolkit and the generated CDI specification on the host; the `nvidia-cdi` runtime class; the sharing setting (C30) |
| `gpu-metrics` | the same | with a condition | the same host state; one GPU slot per node |
| `node-metrics` | every node | yes | nothing |
| `log-collector` | every node | not as described (C28) | nothing: it needs no node access at all |
| `l4-speaker` | a non-empty address pool | with a condition | which nodes sit on the pool's network segment |

**GPU host state.** The device plugin's prerequisites are NVIDIA drivers, the
NVIDIA container toolkit and a container runtime configured to use it. k3s
detects the runtime executables when it starts and adds `nvidia` and
`nvidia-cdi` to containerd; a pod must name the runtime class unless the
default runtime is changed. In the estate that host state comes from
nix-config's `gpu-nvidia` role, and it is per model: the GTX 960M needs the
legacy 580 driver branch, and the comment beside that pin records the failure
when it is wrong (no CDI specification, the plugin dies, the node advertises
no GPU). A node fact of `vendor: nvidia` places the agent correctly; whether
the agent then works depends on host configuration that Infrastructure Intent
would have to generate or assert.

**The speaker.** `kubectl get nodes -o wide` shows every node's address as a
Tailscale address; flannel runs over `tailscale0`. The pool is the Enschede
LAN's, and the Frankfurt node has no interface on it. The live speaker
DaemonSet nevertheless runs on all six nodes, and the one `L2Advertisement`
has no node selector and no interface list. This works because the three
Services in the pool use the `Local` policy and their pods are pinned to
Enschede, so only Enschede speakers are ever eligible to announce. A derived
speaker needs that made explicit: MetalLB's advanced layer 2 page gives
`nodeSelectors` for exactly the case where "only a subset of the nodes are
exposed to a given network". The speaker's pods also run three FRR containers
that layer 2 mode does not use.

**DaemonSets outside the catalog.** Eight DaemonSets run. Five are the
catalog's, `nvidia-device-plugin-mps-control-daemon` is the plugin chart's and
schedules nowhere, `vault-csi-provider` retires, and `loki-canary` is part of
the Loki chart. It holds no host privilege, so it is not a node agent in the
resolution's sense, but it is a workload that runs once per node, which a
Process with a replica count does not express.

### C21: rollout when replicas equal eligible nodes

The resolution refuses `across: node` at build "when fewer eligible nodes
exist than `count`". The equal case passes the build and then depends on the
rollout strategy:

- A Deployment's defaults are 25% surge and 25% unavailable; the surge rounds
  up and the unavailable count rounds down. For two replicas that is one
  extra pod and none removed first.
- The surge pod carries the same labels as the pods it replaces, so the
  anti-affinity term matches them, and every eligible node already holds one.
  It stays Pending, and the rollout does not progress.

Three things avoid it, each documented: more eligible nodes than replicas;
`maxSurge: 0` with `maxUnavailable: 1`; or `matchLabelKeys:
[pod-template-hash]` on the anti-affinity term, which scopes the term to one
revision "so that a rolling upgrade won't break affinity" and is generally
available and locked on since Kubernetes 1.33. The last one lets an old and a
new pod share a node during the rollout.

adguard-ha is not at risk today: all five Enschede nodes carry the `adguard`
capability and it asks for two. A Process that switches over through Flagger
is a separate case: Flagger rewrites the anti-affinity selector of the primary
Deployment with a `-primary` suffix, so the canary and the primary do not
exclude each other ([Flagger, FAQ](https://docs.flagger.app/faq)).

This entry is reasoned from the documented behaviour of the scheduler and the
Deployment controller. **Settle by drill**: a two-replica Deployment with the
required term on a two-node selector, then a template change.

### C22: what suspending a CronJob does

The CronJob page says suspension "does not affect Jobs that the CronJob has
already started", and carries this caution: "Executions that are suspended
during their scheduled time count as missed Jobs. When `.spec.suspend` changes
from `true` to `false` on an existing CronJob without a starting deadline, the
missed Jobs are scheduled immediately."

The controller at v1.35.2 returns early while the CronJob is suspended. Once
it is not, it takes the most recent schedule time before now and creates one
Job for it, unless `startingDeadlineSeconds` is set and that time is older
than the deadline, in which case it records a missed schedule and waits for
the next one. So unparking a `scheduled` Process runs it once, immediately,
however long it was parked, unless the rendered CronJob carries a deadline.
The four suspended agents CronJobs carry none.

Parking also does not stop work in flight: a Job that started before the edit
runs to its end.

### C30: what one device request means live

Kubernetes takes a GPU only under `limits` (a request, if written, must equal
it). The device plugin's live configuration sets `timeSlicing` with
`replicas: 4` for `nvidia.com/gpu`, so each GPU node advertises four. The
plugin's README is explicit about what that buys: "nothing special is done to
isolate workloads that are granted replicas from the same underlying GPU", and
they share a fault domain. dcgm-exporter requests one replica on each GPU
node, leaving three for the workloads that request one, which today are
jellyfin and immich's machine learning.

The derivation "one device request" is therefore sound against a plugin
configured to share. Against one that is not, a node has one `nvidia.com/gpu`,
and the metrics agent's own request would leave none.

### C33: low ports under a non-root user

[Chapter 10](../../spec/v1/10-project-intent.md#a-privileged-port-needs-the-capability-that-binds-it)
states the hazard as: a port below 1024 "cannot be bound by a non-root process
without `CAP_NET_BIND_SERVICE`". The resolution keeps
`E_PRIVILEGED_PORT_UNDER_NONROOT` on that basis and has four Applications
change their images.

That is true of a Linux host with default settings and not of a pod on this
cluster. containerd's CRI plugin has an option, `enable_unprivileged_ports`,
which "configures net.ipv4.ip_unprivileged_port_start=0 for all containers
which are not using host network". k3s writes its own containerd
configuration and sets the option from `kernel.CheckKernelVersion(4, 11, 0)`;
the estate's nodes run kernel 6.18. With that setting any user may bind any
port inside the pod's network namespace, with every capability dropped.

No live pod demonstrates it: a query over every running pod found none that
declares a container port below 1024 while running as a non-root user outside
the host network. **Settle by drill**: a pod with `runAsUser: 1000` and all
capabilities dropped that listens on port 80.

The exception in the option's own description matters for the model: it does
not apply to a pod on the host network.

### C48 and C49: removing a HelmRelease without losing its CRDs

Three behaviours meet here:

- Helm's uninstall deletes the objects in the release's stored manifest, less
  those marked `helm.sh/resource-policy: keep`. A CRD under a chart's
  `templates` is in that manifest. A CRD in a chart's `crds` directory is not:
  Helm installs it and "there is no support at this time for upgrading or
  deleting CRDs using Helm".
- Kubernetes deletes every custom object when its CRD is deleted.
- helm-controller uninstalls the release when a `HelmRelease` is deleted,
  "if the resource has not been suspended" (`reconcileDelete`).

MetalLB v0.15.3 ships its CRDs as a template in a sub-chart, so removing its
`HelmRelease` as it stands deletes the address pool and the advertisement with
them. Having a Flux Kustomization apply the same CRDs first does not change
that: Helm does not ask who else manages an object before deleting what its
manifest lists.

Two documented routes keep the CRDs: the `keep` annotation, which must be in
the stored manifest and therefore needs one upgrade that renders it; or
suspending the `HelmRelease` and then deleting it, which leaves every object
of the release in place for the render to take over. Which charts among the
19 live releases template their CRDs was checked for MetalLB only.

## Not verified

- **The LAN certificate, by handshake.** Read from the manifests; the LAN
  address is not reachable from where this was researched.
- **Whether a container image reads the injected Vault token** (C12). Needs
  the images.
- **Vault's own state.** Mounts, roles and lease settings were read from
  `bootstrap-auth.sh`, not from Vault.
- **A second public address for the Frankfurt node, and ServiceLB beside
  MetalLB** (C17). No primary page settles either.
- **dcgm-exporter's host requirements** (C26). The project's README defers to
  an installation guide that was not read.
- **A backup image for Garage** (C39).
- **Which live charts, other than MetalLB, template their CRDs** (C48).
- **What a RabbitMQ client sees when its user is deleted** (C9).

## Settle by drill

| claim | drill |
|---|---|
| C21: a surging rollout stalls when replicas equal eligible nodes under required anti-affinity | a two-replica Deployment with the term, selected onto two nodes; change the template and watch for a Pending pod |
| C22: unparking runs one missed Job at once | suspend a CronJob across at least one schedule time, resume it, and list its Jobs |
| C33: a non-root process binds a port below 1024 in a k3s pod | a pod with `runAsUser: 1000` and `capabilities.drop: [ALL]` listening on port 80 |
| C18: how long DNS is unanswered when the announcing node fails | two replicas behind one VIP; stop the announcing node's pod, then the node, and time the gap from a LAN client |
