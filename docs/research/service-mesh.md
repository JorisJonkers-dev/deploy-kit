# A service mesh for east-west mTLS: Istio ambient and Kiali

What it takes to run Istio in ambient mode (ztunnel on every node, waypoints
only where layer 7 is needed) with Kiali as the traffic map on this estate, and
how to run it well. The goal it serves: mutual TLS and encryption for every
in-cluster service-to-service hop, consistent service names, and a web UI that
shows which services talk to which. Researched 2026-10-20; see
[the index](README.md#method) for the markers used.

This is evidence, not decision. Nothing here adopts a mesh. Where a finding
bears on a recorded decision, the decision is named and left as it is; changing
one is an ADR's job, in the pull request that changes what it decides.

Versions as of the research date:

| component | version used here | released | source |
|---|---|---|---|
| Istio (istiod, istio-cni, ztunnel) | 1.31.2, the newest stable; 1.30.6 is the other supported minor | 2026-10-16 | [supported releases](https://istio.io/latest/docs/releases/supported-releases/), `gh release list --repo istio/istio` |
| Kiali | v2.33.0 | 2026-10-04 | `gh release list --repo kiali/kiali` |
| cert-manager istio-csr | v0.18.0 | 2026-09-18 | `gh release list --repo cert-manager/istio-csr` |
| Gateway API, as Istio 1.31.2 is built | v1.6.0 | | [`go.mod`](https://github.com/istio/istio/blob/1.31.2/go.mod#L113) |

Istio 1.31.2 was four days old on the research date; the supported-releases
page lists "1.31.2+" as the 1.31 patch with no known CVEs.

## The estate, as read

Read-only, on 2026-10-20 (`kubectl get`, and Prometheus queried through the API
server's service proxy):

- **Nodes.** Three amd64 nodes on `v1.36.5+k3s1` (NixOS 26.11) and three arm64
  Raspberry Pis on `v1.35.2+k3s1` (NixOS 26.05, kernel 6.18.22). Pod CIDRs are
  IPv4 only (`10.42.x.0/24`), and the `kubernetes` Service is single-stack IPv4.
- **The Pis are Raspberry Pi 4s.** `node_cpu_scaling_frequency_max_hertz` reads
  1.8 GHz on all three, the hwmon chips are `rpi_volt` and `cpu_thermal`, and the
  host modules load `sdhci_iproc` and `pcie_brcmstb`. 1.8 GHz is the BCM2711
  Cortex-A72 clock in the
  [Pi 4 product brief](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-product-brief.pdf);
  the Pi 5's BCM2712 runs at 2.4 GHz
  ([processors](https://www.raspberrypi.com/documentation/computers/processors.html)).
  `enschede-pi-1` is the 8 GB board (cordoned); `pi-2` and `pi-3` have
  3 840 960 Ki allocatable, of which `pi-2` already has 1 682 Mi requested and
  `pi-3` 408 Mi.
- **CNI.** k3s's embedded flannel, `vxlan`, `--flannel-iface tailscale0`, every
  node's `flannel.alpha.coreos.com/public-ip` a `100.x` Tailscale address.
  Tailscale "uses WireGuard"
  ([Tailscale](https://tailscale.com/kb/1151/what-is-tailscale)), whose
  symmetric cipher is ChaCha20-Poly1305
  ([WireGuard protocol](https://www.wireguard.com/protocol/)).
- **Host networking.** Only `node-exporter` (every node), `metallb-speaker`
  (every node) and a leftover `node-debugger` pod run with `hostNetwork`.
  Traefik (80, 443) and Stalwart (25, 110, 143, 465, 587, 993, 995, 4190) use
  `hostPort`, which keeps them in the pod network.
- **Policy.** Sixteen `NetworkPolicy` objects exist, most of them scoped to the
  application port (for example `immich-postgres` admits 5432 only).
- **Gateway API.** The CRDs are installed at `v1.5.1`, `standard` channel, with
  the labels of the `traefik-lan` HelmRelease and two field managers
  (`helm-controller`, `k3s`). No `TCPRoute` CRD.
- **Prometheus.** `metrics-stack-prometheus` v3.14.0, retention 15 d, pinned to
  the Frankfurt node, selecting ServiceMonitors and PodMonitors labelled
  `release: metrics-stack` in any namespace.
- **Stable Addresses.** The live `ExternalName` Services sit in each consumer's
  namespace (for example `outline-system/platform-postgres` CNAME-ing to
  `postgres.data-system.svc.cluster.local`), not yet in `estate-system` as
  [chapter 16](../../spec/v1/16-dependencies.md#the-stable-address) specifies.
- **Init containers that need the network.** `vault-agent-init` on `auth-api`,
  `postgres` and `rabbitmq`; `download-pyroscope-agent` on `auth-api`; and a
  `gluetun` VPN as a native sidecar (`restartPolicy: Always`, `NET_ADMIN`) on
  `qbittorrent`.

## Requirements

### Hard prerequisites

| requirement | what the estate has | source |
|---|---|---|
| Kubernetes 1.32 to 1.37 for Istio 1.31 (the 1.31.0 announcement says 1.32 to 1.36) | 1.35 and 1.36: both supported | [supported releases](https://istio.io/latest/docs/releases/supported-releases/), [1.31 announcement](https://istio.io/latest/news/releases/1.31.x/announcing-1.31/) |
| arm64 images | `istio/pilot`, `istio/ztunnel`, `istio/install-cni`, `istio/proxyv2` at 1.31.2 and `quay.io/kiali/kiali`, `kiali-operator` at v2.33.0 all carry an `arm64` manifest | registry manifest lists, read 2026-10-20 |
| images from Docker Hub, not `gcr.io/istio-release`, which 1.31 stops publishing to | | [1.31 announcement](https://istio.io/latest/news/releases/1.31.x/announcing-1.31/) |
| the istio-cni node agent, "**required** in the ambient data plane mode" | none yet | [Istio CNI](https://istio.io/latest/docs/setup/additional-setup/cni/) |
| k3s CNI paths, through `global.platform=k3s` with a bundled CNI | flannel is bundled, so the platform value applies | [platform prerequisites](https://istio.io/latest/docs/ambient/install/platform-prerequisites/) |
| kernel modules for the iptables backend; ambient adds `xt_connmark`, `xt_mark`, `ip_set`, `ip_set_hash_ip` | present on all six nodes, read 2026-10-20, through the `nft_compat` path; the legacy table modules are absent and not needed: see [Netfilter on NixOS](#netfilter-on-nixos) | [platform requirements](https://istio.io/latest/docs/ops/deployment/platform-requirements/) |
| for the optional nftables backend: `nft` 1.0.1+, kernel 5.13+, and `nft_tproxy`, `nft_socket` and the rest | kernel 6.18 meets the version | [platform requirements](https://istio.io/latest/docs/ops/deployment/platform-requirements/), `nativeNftables: false` by default in [istio-cni values](https://github.com/istio/istio/blob/1.31.2/manifests/charts/istio-cni/values.yaml) |
| Gateway API CRDs, only if waypoints are used | `v1.5.1` standard, owned by the `traefik-lan` HelmRelease; Istio's install page applies `v1.6.0` `experimental-install.yaml` when none exist | [Helm install](https://istio.io/latest/docs/ambient/install/helm/) |
| Helm 3.6 or later for Istio, 3.10 or later for Kiali | rendered by deploy-kit, applied by Flux | [Helm install](https://istio.io/latest/docs/ambient/install/helm/), [Kiali via Helm](https://kiali.io/docs/installation/installation-guide/install-with-helm/) |
| istiod's debug interface on port 8080 (`ENABLE_DEBUG_ON_HTTP=true`, the default), which Kiali needs for proxy status | | [Kiali prerequisites](https://kiali.io/docs/installation/installation-guide/prerequisites/) |
| Prometheus, for Kiali's graph, metrics and health | `metrics-stack-prometheus` | [Kiali Prometheus](https://kiali.io/docs/configuration/external-services/metrics/prometheus/) |

**Kiali and Istio 1.31.** The compatibility table on the Kiali prerequisites
page renders rows up to Istio 1.30 (Kiali 2.26 and later), but the page states
that "Starting with Kiali v2.4, each Kiali release is tested against the
currently supported Istio releases"
([prerequisites](https://kiali.io/docs/installation/installation-guide/prerequisites/)).
Kiali v2.33.0 was released after Istio 1.31.0, so it falls under that rule,
and the test run shows it. Kiali carries no minimum or maximum Istio constant
in source; its nightly `Test Istio Version` workflow resolves the newest three
Istio minors at run time
([test-istio-version.yml](https://github.com/kiali/kiali/blob/v2.33.0/.github/workflows/test-istio-version.yml),
[determine-test-istio-version.sh](https://github.com/kiali/kiali/blob/v2.33.0/hack/istio/determine-test-istio-version.sh)).
Its run of 2026-10-04 12:02 UTC
([run 37200739064](https://github.com/kiali/kiali/actions/runs/37200739064))
resolved "offset [0]: 1.31.1" and passed every job, the ambient Cypress suites
included, on commit `0b0d4e7`, the parent of the `Release v2.33.0` commit
`0e8be88` (`gh api repos/kiali/kiali/compare/v2.33.0...0b0d4e7` reads
`behind_by: 1, ahead_by: 0`). The master runs from 2026-10-17 on pass again
after a red week; they test master, not the tag, so 1.31.2 itself against
v2.33.0 rests on the patch-release compatibility the table assumes.

**NixOS specifics.**

- **CNI paths.** The `k3s` platform profile sets `cniConfDir:
  /var/lib/rancher/k3s/agent/etc/cni/net.d` and `cniBinDir:
  /var/lib/rancher/k3s/data/cni`
  ([`profile-platform-k3s.yaml`](https://github.com/istio/istio/blob/1.31.2/manifests/charts/istio-cni/files/profile-platform-k3s.yaml)),
  while the prerequisites page's example for a non-bundled CNI uses
  `/var/lib/rancher/k3s/data/current/bin/`. k3s extracts its binaries under
  `/var/lib/rancher/k3s/data`, with a `cni` directory, a `current` symlink and a
  hash-named directory
  ([K3s initialization](https://docs.k3s.io/blog/2025/03/25/K3s-initialization)).
  The NixOS `services.k3s` module is used here with no `--data-dir`, so the
  defaults should hold; that both directories exist on a NixOS node is **settle
  by drill** (drill 1).
- **iptables, not nftables, on the host.** `networking.nftables.enable`
  defaults to `false`, and nothing in `nix-config` or `nixos-modules` sets it.
  If it is ever enabled, the NixOS module puts `ip_tables` in
  `boot.blacklistedKernelModules`
  ([nftables.nix](https://github.com/NixOS/nixpkgs/blob/nixos-26.05/nixos/modules/services/networking/nftables.nix)),
  which would take away a module the iptables backend's `iptable_*` tables need,
  so that change and `nativeNftables` would have to land together.
- **`iptables` on NixOS is the nf_tables flavour.** The nixpkgs package
  defaults `nftablesCompat ? true` and links `iptables`, `iptables-save` and
  `iptables-restore` to `xtables-nft-multi`
  ([package.nix](https://github.com/NixOS/nixpkgs/blob/f3a73bcf5d1c5b75a66cf35a48957e30d41d647a/pkgs/by-name/ip/iptables/package.nix#L17-L88));
  the NixOS firewall uses `pkgs.iptables` while `networking.nftables.enable` is
  false
  ([firewall.nix](https://github.com/NixOS/nixpkgs/blob/f3a73bcf5d1c5b75a66cf35a48957e30d41d647a/nixos/modules/services/networking/firewall.nix#L111)),
  and the k3s package puts the same `iptables` and `ipset` on its `PATH`
  ([builder.nix](https://github.com/NixOS/nixpkgs/blob/f3a73bcf5d1c5b75a66cf35a48957e30d41d647a/pkgs/applications/networking/cluster/k3s/builder.nix#L413-L420)),
  so flannel's and kube-router's host rules are nf_tables rules. istio-cni
  picks `iptables-legacy` only if that binary already sees rules in the
  namespace, otherwise `iptables-nft`
  ([implementation.go](https://github.com/istio/istio/blob/1.31.2/tools/istio-iptables/pkg/dependencies/implementation.go#L121-L201)),
  so on these hosts it lands on nft, matching. A leftover legacy rule on a host
  would flip it; drill 1 checks for one.
- **Privileges.** ztunnel adds `NET_ADMIN` and `SYS_ADMIN` and runs at
  `system-node-critical`
  ([ztunnel DaemonSet](https://github.com/istio/istio/blob/1.31.2/manifests/charts/ztunnel/templates/daemonset.yaml));
  the CNI agent re-adds `CAP_SYS_ADMIN`, `CAP_NET_ADMIN` and `CAP_NET_RAW`
  ([cni README](https://github.com/istio/istio/blob/1.31.2/cni/README.md)). The
  namespace that holds them needs a Pod Security level that admits that.

### Netfilter on NixOS

- **What 1.31 in-pod redirection uses.** Inside each enrolled pod: `mangle`
  with `mark` and `CONNMARK`, `nat` with `REDIRECT` to 15001, 15006 and 15053,
  and `raw` with `CT --zone 1` for DNS
  ([default.golden](https://github.com/istio/istio/blob/1.31.2/cni/pkg/iptables/testdata/default.golden)),
  plus `ip rule fwmark 0x111/0xfff lookup 100` at priority 32764 with a local
  route to `lo` in table 100
  ([iptables_linux.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/iptables/iptables_linux.go#L48-L63),
  [config.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/config/config.go#L28-L35)).
  On the host: one `nat` `POSTROUTING` rule with `owner --socket-exists`, `set
  --match-set istio-inpod-probes-v4` and `SNAT` to `169.254.7.127`
  ([hostprobe.golden](https://github.com/istio/istio/blob/1.31.2/cni/pkg/iptables/testdata/hostprobe.golden),
  [iptables.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/iptables/iptables.go#L629-L657)),
  over an ipset of type `hash:ip`
  ([nldeps_linux.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/ipset/nldeps_linux.go#L43)).
  No `TPROXY` target and no `socket` match: the TPROXY names in the code are
  the mark's and routing table's, not the target's. In kernel terms:
  `iptable_mangle`, `iptable_nat`, `iptable_raw`, `xt_mark`, `xt_connmark`,
  `xt_REDIRECT`, `xt_CT`, `xt_tcpudp`, `xt_owner`, `xt_set`, `xt_nat`,
  `ip_set`, `ip_set_hash_ip`, `IP_MULTIPLE_TABLES` and
  `NF_CONNTRACK_ZONES`, reached through `nft_compat` when the binary is
  `iptables-nft`. The native nftables backend (`nativeNftables: false` by
  default) writes the same rules as `inet` tables and needs no `nft_tproxy`
  or `nft_socket` either
  ([nftables default.golden](https://github.com/istio/istio/blob/1.31.2/cni/pkg/nftables/testdata/default.golden)).
- **What the NixOS kernel builds.** Neither `nix-config` nor `nixos-modules`
  v0.4.0 sets `boot.kernelPackages`, so every node runs nixpkgs'
  `linuxPackages`, which is `linux_6_18`
  ([linux-kernels.nix](https://github.com/NixOS/nixpkgs/blob/f3a73bcf5d1c5b75a66cf35a48957e30d41d647a/pkgs/top-level/linux-kernels.nix#L749)):
  the mainline kernel, not `linux_rpi4`, which `node_uname_info` agrees with
  (`6.18.22`, `#1-NixOS SMP Sat Apr 11 12:26:52 UTC 2026` on all three Pis).
  `common-config.nix` sets `NETFILTER_ADVANCED`, `IP_MULTIPLE_TABLES`,
  `NF_CONNTRACK_ZONES`, `IKCONFIG` and `IKCONFIG_PROC` to `yes` and turns
  none of the symbols above off
  ([common-config.nix](https://github.com/NixOS/nixpkgs/blob/f3a73bcf5d1c5b75a66cf35a48957e30d41d647a/pkgs/os-specific/linux/kernel/common-config.nix#L312-L369)),
  and both the `pc` and `aarch64-multiplatform` platforms build with
  `autoModules = true`
  ([platforms.nix](https://github.com/NixOS/nixpkgs/blob/f3a73bcf5d1c5b75a66cf35a48957e30d41d647a/lib/systems/platforms.nix#L362-L368)),
  which answers every remaining tristate question with `m`
  ([generate-config.pl](https://github.com/NixOS/nixpkgs/blob/f3a73bcf5d1c5b75a66cf35a48957e30d41d647a/pkgs/os-specific/linux/kernel/generate-config.pl#L90)).
  Every module above is therefore built, as a module or (on aarch64, which
  sets `preferBuiltin`) into the kernel. That last point is why the check is
  `zgrep` on `/proc/config.gz`, not `modinfo`, which fails on a built-in
  symbol. The read is of the current `nixos-26.05` head; the Pis' kernel was
  built in April, so the nodes were read too.
- **What the running nodes carry (read 2026-10-20, all six nodes).** Twelve of
  the fifteen symbols are `y` or `m` on every node. The three absent are the
  legacy table modules `IP_NF_MANGLE`, `IP_NF_RAW` and `IP_NF_NAT`: not even
  listed as unset, because 6.18 hides them behind the legacy xtables option,
  which these kernels do not enable, while `IP_NF_IPTABLES`, `NFT_COMPAT`,
  `NFT_NAT` and `NF_TABLES_IPV4` are present. That leaves the `iptables-nft`
  path only: `-t mangle`, `-t raw` and `-t nat` become nft tables of those
  names and the xt matches and targets run through `nft_compat`, the same path
  flannel and kube-router already use on these nodes. Every node reports
  `iptables v1.8.12` or `v1.8.13 (nf_tables)`, `/proc/net/ip_tables_names`
  does not exist (no legacy table was ever loaded), and `iptables-legacy-save`
  lists zero rules, so istio-cni's backend detection has nothing to pick the
  legacy binary for. Whether `CT --zone` in the nft-backed `raw` table and the
  `REDIRECT` rules load inside a pod is drill 1.

### Charts, order and CRDs

The ambient install is four charts in a fixed order, `base`, `istiod` with
`profile=ambient`, `cni` with `profile=ambient`, `ztunnel`, plus the optional
`gateway`, which this estate does not need because Traefik stays the edge
([Helm install](https://istio.io/latest/docs/ambient/install/helm/)). For a
render-only, Flux-applied estate:

- **CRDs ride the `base` chart as templates**, not under `crds/`: the chart
  comment says CRD templates are "defaulted to true as we want to always
  self-manage CRD upgrades via plain templates"
  ([`base/templates/crds.yaml`](https://github.com/istio/istio/blob/1.31.2/manifests/charts/base/templates/crds.yaml)).
  `helm template` therefore emits them, so they can be rendered and applied in
  a Flux Kustomization ahead of istiod, the way the bootstrap set already
  carries CRDs ([chapter 14](../../spec/v1/14-platform-intent.md#the-bootstrap-set)).
  Helm never deletes CRDs on uninstall
  ([Helm install](https://istio.io/latest/docs/ambient/install/helm/)).
- **Gateway API CRDs have an owner already.** They carry the `traefik-lan`
  HelmRelease's labels. Raising them to v1.6.0 for Istio means either moving
  ownership out of the Traefik release or confirming that waypoints work on
  v1.5.1 standard; `istioctl analyze` warns on "outdated Gateway API CRDs"
  ([1.31 announcement](https://istio.io/latest/news/releases/1.31.x/announcing-1.31/)).
  Read from source, v1.5.1 is enough for waypoints. Istio 1.31 is built
  against v1.6.0, but gates on the CRDs' `bundle-version` annotation only per
  kind: `grpcroutes` at 1.1, `backendtlspolicies` at 1.4, `tlsroutes` at 1.5
  and `tcproutes` at 1.6, below which istiod does not watch that kind
  ([minimumversions.go](https://github.com/istio/istio/blob/1.31.2/pkg/config/schema/gatewayapi/minimumversions.go#L24-L33),
  analyzer `IST0176` in
  [messages.yaml](https://github.com/istio/istio/blob/1.31.2/pkg/config/analysis/msg/messages.yaml#L715-L718)).
  `Gateway`, `GatewayClass` and `HTTPRoute`, which a waypoint uses, carry no
  bundle gate; precheck asks only that they serve `v1beta1` and `v1`
  ([precheck.go](https://github.com/istio/istio/blob/1.31.2/istioctl/pkg/precheck/precheck.go#L232-L275)).
  The live CRDs read `bundle-version: v1.5.1`, `channel: standard`, and
  `TCPRoute` is absent, so the only Istio feature lost is TCPRoute routing.
  `istioctl analyze` in drill 1 confirms it on the cluster.
- **Kiali has two install paths.** The `kiali-operator` chart plus a `Kiali`
  CR is the recommended one; the `kiali-server` chart "is not recommended and
  is only provided for convenience" and lacks some operator features
  ([Kiali via Helm](https://kiali.io/docs/installation/installation-guide/install-with-helm/)).
  The operator is a second controller producing objects from a CR; the server
  chart renders to plain manifests, which is the shape a render-only estate
  reviews. That is a trade-off to decide, not a finding.

### Footprint

| component | runs | default request | measured load figure | source |
|---|---|---|---|---|
| istiod | one Deployment | 500m CPU, 2048 Mi | none published; scales "with the amount of configurations and possible system states" | [istiod values](https://github.com/istio/istio/blob/1.31.2/manifests/charts/istio-control/istio-discovery/values.yaml), [performance](https://istio.io/latest/docs/ops/deployment/performance-and-scalability/) |
| ztunnel | one per node | 200m CPU, 512 Mi, sized for "~200k pod cluster or 100k concurrently open connections" | about 0.06 vCPU and 12 MB at 1 000 HTTP rps, 1 KB payload | [ztunnel values](https://github.com/istio/istio/blob/1.31.2/manifests/charts/ztunnel/values.yaml), [performance](https://istio.io/latest/docs/ops/deployment/performance-and-scalability/) |
| istio-cni | one per node | 100m CPU, 100 Mi | none published | [istio-cni values](https://github.com/istio/istio/blob/1.31.2/manifests/charts/istio-cni/values.yaml) |
| waypoint | one Deployment per waypoint | 100m CPU, 128 Mi; limit 2 CPU, 1 Gi | about 0.25 vCPU and 60 MB at 1 000 rps, 2 worker threads | [istiod values](https://github.com/istio/istio/blob/1.31.2/manifests/charts/istio-control/istio-discovery/values.yaml), [performance](https://istio.io/latest/docs/ops/deployment/performance-and-scalability/) |
| Kiali server | one Deployment | 10m CPU, 64 Mi; limit 1 Gi | none published; "tends to grow in resource usage as your cluster grows" | [kiali-server values](https://github.com/kiali/helm-charts/blob/v2.33.0/kiali-server/values.yaml), [prerequisites](https://kiali.io/docs/installation/installation-guide/prerequisites/) |

The published load figures were measured on x86 bare metal with flannel, for
Istio 1.24 ([performance](https://istio.io/latest/docs/ops/deployment/performance-and-scalability/)).

**Against a 4 GB Pi.** The per-node pair requests 612 Mi by default, 16 % of
`pi-2`'s 3 840 960 Ki allocatable; on `pi-2` it raises requested memory from
1 682 Mi to 2 294 Mi. The 512 Mi ztunnel request is sized for a cluster three
orders of magnitude larger than this one's 113 running pods, so it is a value
to lower, not a floor; what a Pi's ztunnel actually holds over a day is
**settle by drill** (drill 2). istiod's 2 Gi request does not belong on a Pi at
all: the amd64 nodes are its place, and Frankfurt already has 75 % of its
memory requested.

### What each estate component needs

| component | what ambient does with it | what it needs |
|---|---|---|
| **Traefik** (`traefik`, `traefik-lan`) | a pod-network pod; enrolled, its upstream hop to a backend is HBONE mTLS | enrolment; a port-level `PERMISSIVE` exception for its own listening ports once the mesh is `STRICT`, because client traffic from the internet or LAN is plaintext and `STRICT` "will cause traffic from outside the mesh to be denied" ([add workloads](https://istio.io/latest/docs/ambient/usage/add-workloads/)); port-level PeerAuthentication with a workload selector is converted for ztunnel ([peer-authentication.md](https://github.com/istio/istio/blob/1.31.2/architecture/ambient/peer-authentication.md)) |
| Traefik to a service with a waypoint | Traefik balances over pod IPs by default (`nativeLB` is false); a waypoint for `service` traffic is skipped for traffic "sent directly to a workload (a pod or VM IP)" ([waypoint](https://istio.io/latest/docs/ambient/usage/waypoint/)) | `nativeLB: true` on that route's service, or `nativeLBByDefault` on the provider, so Traefik addresses the ClusterIP ([Traefik service](https://doc.traefik.io/traefik/reference/routing-configuration/kubernetes/crd/http/service/), [Kubernetes CRD provider](https://doc.traefik.io/traefik/reference/install-configuration/providers/kubernetes/kubernetes-crd/)); or a waypoint for `workload` or `all`. Whether the waypoint's `ingress-use-waypoint` rule, written for Istio gateways, touches a meshed Traefik at all is **settle by drill** (drill 4) |
| **Prometheus** | not a mesh component | ztunnel scraped on 15020, istiod on its `http-monitoring` port, waypoints on 15020; and, once workloads are `STRICT`, Prometheus itself enrolled, or its plaintext scrapes of application ports are denied. See [Prometheus and Kiali](#prometheus-and-kiali) |
| **node-exporter, metallb-speaker** (`hostNetwork`) | never captured: "Host-network pods can never be captured (we cannot insert redirection rules into a netns they do not own)" ([enablement_selector.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/util/enablement_selector.go#L82)) | nothing; a scrape from enrolled Prometheus to a host IP leaves as passthrough |
| **Vault Agent injector** (`vault-agent-init`), `download-pyroscope-agent` | the CNI plugin, for an ambient pod, pushes the add event to the node agent and fails the pod's network setup if it cannot reach it ([plugin.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/plugin/plugin.go#L241-L274)); the agent injects the redirect rules and then waits for ztunnel's acknowledgement ([net_linux.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/nodeagent/net_linux.go#L147)) | nothing: the sidecar-mode init-container caveat (UID 1337, exclusions) is scoped to sidecars ([Istio CNI](https://istio.io/latest/docs/setup/additional-setup/cni/)). Read from source, an ambient pod's init containers start with ztunnel already in its path; confirming it with `vault-agent-init` is part of drill 3 |
| **Stable Addresses** (`ExternalName`) | not modelled: istiod skips the Service, with the comment "ExternalName services are not implemented by ambient (but will still work)", the DNS answer is forwarded upstream and ztunnel handles the connection "based on the target" ([services.go](https://github.com/istio/istio/blob/1.31.2/pilot/pkg/serviceregistry/ambient/services.go#L258-L265)); resolution of ExternalName Services under ztunnel's DNS proxy was fixed in [#54278](https://github.com/istio/istio/pull/54278) ([release note](https://github.com/istio/istio/blob/1.31.2/releasenotes/notes/externalname-ambient.yaml)) | nothing for L4 mTLS, since the connection is made to the target's ClusterIP. See [Stable Addresses under the mesh](#stable-addresses-under-the-mesh) |
| **Postgres, RabbitMQ, Valkey, Jellyfin** | opaque TCP through ztunnel | nothing at L4; enrolling `data-system` meshes every consumer edge |
| **Stalwart** (server-first SMTP, IMAP, POP3) | inbound plaintext is classified by port, HBONE on 15008 and plaintext on 15006 ([traffic redirection](https://istio.io/latest/docs/ambient/architecture/traffic-redirection/)), so ztunnel does not wait on client bytes; the server-first caveat is stated for permissive-mode sniffing and protocol selection ([application requirements](https://istio.io/latest/docs/ops/deployment/application-requirements/)) | a port-level `PERMISSIVE` exception for the internet-facing mail ports, as for Traefik; no waypoint on it. That SMTP greets correctly through ztunnel is **settle by drill** (drill 4) |
| **qBittorrent** with a `gluetun` sidecar | gluetun holds `NET_ADMIN` in the same network namespace as istio-cni's redirect rules | `istio.io/dataplane-mode=none` on the pod, and no gluetun setting changes that. See [gluetun and the in-pod rules](#gluetun-and-the-in-pod-rules) |
| **Admission webhooks** (cert-manager's, and any other the API server calls) | the k3s API server runs in the host process, outside the mesh, so its calls are plaintext | leave those namespaces unenrolled, or `PERMISSIVE` on the webhook port |
| **kubelet probes** | SNATed to `169.254.7.127` so they can be told apart ([NetworkPolicy](https://istio.io/latest/docs/ambient/usage/networkpolicy/)) | an `ipBlock` for `169.254.7.127/32` in any default-deny ingress NetworkPolicy |
| `istio-system`, `kube-system`, `flux-system` | `kube-system` is in istio-cni's default `excludeNamespaces` ([istio-cni values](https://github.com/istio/istio/blob/1.31.2/manifests/charts/istio-cni/values.yaml)); ztunnel labels itself `istio.io/dataplane-mode: none` | keep Flux out of the mesh: an ambient pod cannot start while its node's CNI agent is down ([upgrade](https://istio.io/latest/docs/ambient/upgrade/helm/)), and Flux is what would deliver the fix |

### Prometheus and Kiali

Kiali reads only Prometheus for the graph. What it queries
([required metrics](https://kiali.io/docs/faq/general/#requiredmetrics)):

- **ztunnel (L4):** `istio_tcp_sent_bytes_total`,
  `istio_tcp_received_bytes_total`, `istio_tcp_connections_opened_total`,
  `istio_tcp_connections_closed_total`, `istio_build`,
  `workload_manager_active_proxy_count`. Kiali's ambient FAQ names the first
  two "where `app=ztunnel`" as the ones the graph needs
  ([ambient FAQ](https://kiali.io/docs/faq/ambient/)).
- **waypoints (L7):** `istio_requests_total` with `reporter=waypoint`, and the
  `istio_request_*` / `istio_response_*` histograms.
- **istiod:** `pilot_info`, `pilot_proxy_convergence_time_*`, `pilot_services`,
  `pilot_xds`, `pilot_xds_pushes`.
- **cAdvisor / process:** `container_cpu_usage_seconds_total`,
  `container_memory_working_set_bytes`, `process_*`, for the control-plane card.
- **attributes:** `connection_security_policy` and `destination_principal`
  drive the graph's security (padlock) display.

**The `app` label is load-bearing.** Kiali filters ztunnel series on the
literal `app="ztunnel"`
([security_policy.go](https://github.com/kiali/kiali/blob/v2.33.0/graph/telemetry/istio/appender/security_policy.go#L205),
[metrics.go](https://github.com/kiali/kiali/blob/v2.33.0/business/metrics.go#L352)).
That label is the ztunnel pod's own label, carried onto the series only by a
scrape that maps pod labels: Istio's sample Prometheus does it with a
`labelmap` of `__meta_kubernetes_pod_label_(.+)`
([`prometheus.yaml`](https://github.com/istio/istio/blob/1.31.2/samples/addons/prometheus.yaml)).
The Prometheus Operator sample Istio ships keeps only containers named
`istio-proxy` (which ztunnel's container is), sets `namespace` and `pod`, and
maps no pod label
([`prometheus-operator.yaml`](https://github.com/istio/istio/blob/1.31.2/samples/addons/extras/prometheus-operator.yaml)),
and its objects carry `release: istio`, which this estate's Prometheus does not
select. So the estate needs its own PodMonitor (label `release: metrics-stack`)
for ztunnel on `ztunnel-stats` 15020 with a relabel that writes `app`, one for
waypoint pods, and a ServiceMonitor for istiod's `http-monitoring` port. Whether
the graph then draws L4 edges is drill 3.

**Tracing.** "In Ambient, Ztunnel doesn't report traces"; only waypoints do
([ambient FAQ](https://kiali.io/docs/faq/ambient/)). Kiali reads Tempo through
its API or a Jaeger frontend, configured under `external_services.tracing`
([Kiali Tempo](https://kiali.io/docs/configuration/external-services/tracing/tempo/)).
Tempo is optional for Kiali, as is Grafana
([prerequisites](https://kiali.io/docs/installation/installation-guide/prerequisites/)).
**Prometheus URL.** Kiali assumes `http://prometheus.<istio namespace>:9090`
and must be pointed at `metrics-stack-prometheus.observability:9090`
([Kiali Prometheus](https://kiali.io/docs/configuration/external-services/metrics/prometheus/)).

## Best practice

### mTLS: permissive first, then strict

- Ambient's default is `PERMISSIVE`, and `DISABLE` is ignored
  ([L4 policy](https://istio.io/latest/docs/ambient/usage/l4-policy/)). Between
  two enrolled pods every hop is already HBONE mTLS; `STRICT` adds the refusal
  of plaintext from outside the mesh. The security guide's advice is to
  "migrate to strict mode when possible"
  ([security best practices](https://istio.io/latest/docs/ops/best-practices/security/)).
- **Order:** enrol namespaces one at a time under `PERMISSIVE`; confirm every
  workload shows `HBONE` in `istioctl ztunnel-config workloads`, that ztunnel
  access logs carry the expected `src.identity` and `dst.identity`, and that
  `istio_tcp_connections_opened_total` reads
  `connection_security_policy="mutual_tls"`
  ([verify mTLS](https://istio.io/latest/docs/ambient/usage/verify-mtls-enabled/));
  then set a mesh-wide `STRICT` PeerAuthentication in the root namespace, with
  workload-scoped `portLevelMtls` exceptions for the edge listeners (Traefik,
  Stalwart).
- **The evidence before `STRICT`** is a window with no plaintext arriving at an
  enrolled workload: inbound series without `connection_security_policy`
  `mutual_tls`, read per destination. How long that window must be is drill 5.

### Authorization: default-deny, allow by identity

- "define your Istio authorization policies following the default-deny
  pattern", and prefer "`ALLOW`-with-positive-matching"
  ([security best practices](https://istio.io/latest/docs/ops/best-practices/security/)).
  Once any ALLOW policy selects a pod, only explicitly allowed traffic passes
  ([L4 policy](https://istio.io/latest/docs/ambient/usage/l4-policy/)).
- ztunnel enforces L4 only: principals, namespaces, IP blocks, ports. A policy
  with L7 rules that ztunnel would have to enforce "will fail safe by becoming
  a `DENY` policy" ([L4 policy](https://istio.io/latest/docs/ambient/usage/l4-policy/)).
  L7 rules go on a waypoint with `targetRefs`; from 1.25 a policy can bind to
  the `istio-waypoint` GatewayClass, alongside the classic default-deny that
  ztunnel enforces
  ([security best practices](https://istio.io/latest/docs/ops/best-practices/security/)).
- **Dry-run exists for ztunnel, behind a flag.** istiod forwards
  `istio.io/dry-run` policies to ztunnel only with
  `AMBIENT_ENABLE_DRY_RUN_AUTHORIZATION_POLICY=true` (default `false`, ztunnel
  1.29 or later)
  ([features/ambient.go](https://github.com/istio/istio/blob/1.31.2/pilot/pkg/features/ambient.go#L97));
  ztunnel then logs `dry-run: deny policy match`, `dry-run: allow policy
  match` and `dry-run: no allow policies match` instead of enforcing
  ([state.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/state.rs#L613-L657)).
  Those lines go through `authpol_log!`, which logs at `info` only when
  ztunnel's `AUTHZ_POLICY_INFO_LOGGING=true` and at `debug` otherwise
  ([metrics.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/proxy/metrics.rs#L533-L541),
  [config.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/config.rs#L134-L137)),
  and the chart's `logLevel: info` hides `debug`
  ([ztunnel values](https://github.com/istio/istio/blob/1.31.2/manifests/charts/ztunnel/values.yaml#L120-L122)).
  So a dry-run needs both the istiod flag and `env.AUTHZ_POLICY_INFO_LOGGING:
  "true"` on the ztunnel chart, which the DaemonSet template passes through
  ([daemonset.yaml](https://github.com/istio/istio/blob/1.31.2/manifests/charts/ztunnel/templates/daemonset.yaml#L187-L190)).
  No metric counts dry-run decisions; the evidence is log lines only. And
  "no allow policies match", the would-be-denied signal, is logged only while
  no enforcing ALLOW policy selects the workload; once one does, a dry-run
  ALLOW's matches are still logged but its misses are not.
- A missing or mismatched waypoint is not an error: "ztunnel routes traffic
  directly to the destination, rather than failing the request"; enforce L7
  policy with an AuthorizationPolicy that admits only the waypoint's identity
  ([waypoint](https://istio.io/latest/docs/ambient/usage/waypoint/)).

### Waypoints only where L7 is needed

ztunnel carries mTLS, L4 authorization and TCP telemetry; "L7 features need a
waypoint" ([waypoint](https://istio.io/latest/docs/ambient/usage/waypoint/)).
Kiali draws L4 edges from ztunnel alone, and needs a waypoint only for request
rates, response codes and traces ([ambient FAQ](https://kiali.io/docs/faq/ambient/)).
A waypoint is chosen by the address the client used: traffic "addressed to a
service which does not have a waypoint" skips it even if the workload has one
([waypoint](https://istio.io/latest/docs/ambient/usage/waypoint/)). On this
estate that makes a waypoint per namespace a cost per namespace (a Deployment of
100m and 128 Mi requested) for HTTP detail the edge already logs; the
proportionate start is none.

### Upgrades and the support window

- Two minors are supported at once; a minor is "supported until 6 weeks after
  the N+2 minor release". 1.31's end of life is expected around February 2027
  ([supported releases](https://istio.io/latest/docs/releases/supported-releases/)).
  That is roughly one control-plane minor upgrade every three months to stay
  supported.
- Order: CRDs (`base`) first; a new istiod revision beside the old one; then
  istio-cni and ztunnel, each "within one minor version" of the control plane;
  waypoints move when their revision tag moves
  ([ambient upgrade](https://istio.io/latest/docs/ambient/upgrade/helm/)). The
  control plane may be one version ahead of the data plane, never behind
  ([supported releases](https://istio.io/latest/docs/releases/supported-releases/)).
- **ztunnel cannot be canaried**: an in-place upgrade "will briefly disrupt all
  ambient mesh traffic on the node, **even with the use of revisions**"; cordon
  and drain first where long-lived connections matter
  ([ambient upgrade](https://istio.io/latest/docs/ambient/upgrade/helm/)). The
  datastores' pooled connections (HikariCP up to 30 minutes,
  [provider-moves](provider-moves.md#what-bounds-the-flip)) are exactly such
  connections.
- **istio-cni cannot be canaried either**, and while it restarts it "will
  prevent new pods from being started on that node"; pods already enrolled keep
  working ([ambient upgrade](https://istio.io/latest/docs/ambient/upgrade/helm/)).

### Certificate authority

- istiod's built-in CA self-signs a root valid for 3 650 days and issues
  workload certificates for 24 hours by default
  ([constants.go](https://github.com/istio/istio/blob/1.31.2/security/pkg/cmd/constants.go#L21-L41)).
  Istio calls the plug-in-CA walk-through a demo and says "For a production
  cluster setup, it is highly recommended to use a production-ready CA", with
  the root kept offline
  ([plug in CA certificates](https://istio.io/latest/docs/tasks/security/cert-management/plugin-ca-cert/)).
- **istio-csr** replaces istiod's signer with cert-manager, through an issuer
  that can put arbitrary SANs in a certificate (CA, Vault; not ACME, so not
  `letsencrypt-cloudflare`). It must be installed before Istio: adding it later
  "is unsupported because it's exceptionally difficult to do safely"
  ([istio-csr](https://cert-manager.io/docs/usage/istio-csr/)). Under ambient
  it needs `--ca-trusted-node-accounts istio-system/ztunnel`, because ztunnel
  requests certificates for the identities it impersonates
  ([istio-csr README](https://github.com/cert-manager/istio-csr#istio-ambient)).
- For one cluster and one maintainer the proportionate choice is between the
  built-in self-signed root (nothing to run, and a ten-year root nobody has to
  rotate soon) and a `cacerts` intermediate signed by Vault's PKI (a root that
  lives outside the cluster). istio-csr adds a third component in the issuance
  path and an install-order constraint for no capability a single cluster
  needs. Which one to take is a decision, not a finding.

### Kiali access

- Default strategy on Kubernetes is `token`; `header` expects a reverse proxy
  to inject an `Authorization` token or impersonation headers; `anonymous`
  "will leave Kiali unsecured" and is meant for a reverse proxy that does the
  authentication
  ([authentication](https://kiali.io/docs/configuration/authentication/),
  [header](https://kiali.io/docs/configuration/authentication/header/),
  [anonymous](https://kiali.io/docs/configuration/authentication/anonymous/)).
- `openid` with namespace access control needs an API server that accepts the
  provider's tokens, and Kiali must "re-use this existing application/client"
  ([openid](https://kiali.io/docs/configuration/authentication/openid/)). The
  Frankfurt server already runs with `oidc-issuer-url=https://auth.jorisjonkers.dev`
  and `oidc-client-id=headlamp` (its `k3s.io/node-args`), so `openid` would
  reuse the `headlamp` client.
- The lightest fit with the edge as it is: `anonymous` behind the existing
  forward-auth middleware, plus `deployment.view_only_mode: true`, which lets
  Kiali "read service mesh resources … but it does not allow any change"
  ([anonymous](https://kiali.io/docs/configuration/authentication/anonymous/)),
  so nobody can change an Istio object from the UI behind Flux's back.

### Prometheus scrape and retention

The production pattern Istio documents is hierarchical federation with
recording rules that sum away `instance` and pod labels
([observability best practices](https://istio.io/latest/docs/ops/best-practices/observability/)),
and Kiali's ztunnel queries are written to work "with either series shape"
([metrics.go](https://github.com/kiali/kiali/blob/v2.33.0/business/metrics.go#L348)).
At about thirty Processes and six ztunnels the raw series in one Prometheus at
the current 15-day retention is the proportionate start; the series count it
adds is part of drill 2.

### NetworkPolicy beside the mesh

- "ambient does not and will never bypass Kubernetes `NetworkPolicy`
  enforcement"; an ingress policy on an enrolled pod must admit TCP 15008, and
  the probe address `169.254.7.127/32`
  ([NetworkPolicy](https://istio.io/latest/docs/ambient/usage/networkpolicy/)).
  ztunnel's own notes say the same of 15008, inbound and outbound, "for all
  application pods"
  ([ztunnel ARCHITECTURE.md](https://github.com/istio/ztunnel/blob/1.31.2/ARCHITECTURE.md)).
- **Consequence for the port in a policy:** the page's examples admit 15008
  beside the application port, because tunnelled traffic arrives on 15008 and
  is "proxied back to the original destination port" inside the pod. A
  NetworkPolicy then sees every meshed flow on 15008, so the application port
  in an ingress rule stops discriminating meshed traffic; the port check moves
  to AuthorizationPolicy's `ports`. The live port-scoped policies
  (`immich-postgres` on 5432, `overleaf-redis` on 6379, and the rest) would cut
  meshed clients off until 15008 is added.
- **What kube-router sees, from source.** ztunnel creates every in-pod socket
  inside the pod's network namespace, marked `0x539`
  ([inpod/config.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/inpod/config.rs#L57-L110)),
  and listens for HBONE on 15008 there
  ([config.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/config.rs#L688)).
  A meshed connection therefore leaves the client pod as client pod IP to
  destination pod IP, port 15008, even when the client addressed a Service;
  ztunnel's own timeout error reads "maybe a NetworkPolicy is blocking HBONE
  port 15008"
  ([proxy.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/proxy.rs#L393-L394)).
  The hop from ztunnel to the application on the original port stays inside
  the destination pod and never crosses the host. k3s v1.35.2 embeds
  `k3s-io/kube-router` v2.6.3-k3s1, whose rule for a `from` peer with `ports`
  matches the source ipset and `--dport` of each listed port, and nothing else
  ([policy.go](https://github.com/k3s-io/kube-router/blob/v2.6.3-k3s1/pkg/controllers/netpol/policy.go#L213-L231),
  [appendRuleToPolicyChain](https://github.com/k3s-io/kube-router/blob/v2.6.3-k3s1/pkg/controllers/netpol/policy.go#L486-L520)).
  So a `from: podSelector` still matches a meshed client (the source address is
  the client pod's), and `ports: [5432]` refuses it (the destination port is
  15008). The same holds for egress: a client's `to` rule with `ports` must
  list 15008 too.
- **What the live policies need.** Of the sixteen, fourteen scope a port
  towards an in-cluster peer; only `flux-system/allow-egress` and
  `allow-webhooks` admit all ports. Ingress, 12: `agents-system/hermes`
  (9119), `runner-default` (8090), `data-system/mongo` (27017),
  `flux-system/allow-scraping` (8080), `immich-system/immich-ml` (3003),
  `immich-postgres` (5432), `immich-server` (2283),
  `karakeep-system/karakeep` (3000), `karakeep-chrome` (9222),
  `karakeep-search` (7700), `overleaf-system/overleaf` (8000) and
  `overleaf-redis` (6379). Egress to a pod peer, 7: `hermes` and
  `runner-default` (8080, 8082 to `kubernetes-mcp-server` and runners),
  `data-system/garage-asset-sync` (3900), `hindsight-system/hindsight` (5432),
  `immich-server` (5432, 3003, 6379), `karakeep` (9222, 7700, 3900) and
  `overleaf` (27017, 3900, 6379, 587). Each such rule needs TCP 15008 beside
  its port, for the same peer, once both ends are enrolled, and keeps the
  application port for any peer that stays outside the mesh; each ingress
  policy also needs `169.254.7.127/32` for probes. The 443 egress rules to
  `0.0.0.0/0` and the DNS rules to `kube-system` are unaffected.
- Through a waypoint the provider's peer becomes the waypoint pod, so a policy
  admitting only the consumer pod would refuse it. Drill 3 confirms the
  kube-router reading on one pair.

### Failure modes

| event | effect | source |
|---|---|---|
| ztunnel restarts or upgrades on a node | all ambient traffic on that node briefly interrupted; long-lived connections drop | [ambient upgrade](https://istio.io/latest/docs/ambient/upgrade/helm/) |
| istio-cni not running on a node (boot, upgrade, crash) | new ambient pods on that node do not start; running ones continue | [ambient upgrade](https://istio.io/latest/docs/ambient/upgrade/helm/), [plugin.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/plugin/plugin.go#L241-L274) |
| node agent reaches the pod but not ztunnel | the pod is annotated as partially enrolled and the add is retried | [meshdataplane_linux.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/nodeagent/meshdataplane_linux.go#L137) |
| a waypoint is missing | ztunnel sends traffic straight to the destination, L7 policy silently not applied | [waypoint](https://istio.io/latest/docs/ambient/usage/waypoint/) |
| istiod unreachable | see [When istiod is unreachable](#when-istiod-is-unreachable): existing pods keep working for 12 to 24 h; meshed connections of pods created during the outage fail; a ztunnel restarted during it never turns Ready | ztunnel source, below; drill 2 confirms |
| a node reboots | both DaemonSets are `system-node-critical`; an ambient pod's network setup fails until the node's istio-cni agent answers, so it waits for istio-cni | [ztunnel DaemonSet](https://github.com/istio/istio/blob/1.31.2/manifests/charts/ztunnel/templates/daemonset.yaml), [Istio CNI](https://istio.io/latest/docs/setup/additional-setup/cni/), [plugin.go](https://github.com/istio/istio/blob/1.31.2/cni/pkg/plugin/plugin.go#L241-L274) |

### When istiod is unreachable

Read from ztunnel 1.31.2:

- **Configuration is kept.** The xDS client keeps every resource it holds
  across a broken stream, reconnects with a backoff from 10 ms doubling to
  15 s, and on reconnect echoes the versions it holds so istiod can skip
  unchanged ones
  ([client.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/xds/client.rs#L228-L240),
  [backoff](https://github.com/istio/ztunnel/blob/1.31.2/src/xds/client.rs#L495-L580)).
  Nothing clears the proxy state on disconnect, so routing and policy run on
  the last push. That state is in memory only: ztunnel reports Ready only
  after the first full xDS sync
  ([client.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/xds/client.rs#L691-L697),
  [app.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/app.rs#L52)), so a
  ztunnel that restarts during the outage holds nothing and every enrolled pod
  on its node loses the mesh until istiod returns.
- **Certificates.** ztunnel asks for its own TTL, `SECRET_TTL`, default 24 h
  ([config.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/config.rs#L104)),
  which istiod grants up to `MAX_WORKLOAD_CERT_TTL`, default 90 days, and
  refuses above it rather than clamping
  ([ca.go](https://github.com/istio/istio/blob/1.31.2/security/pkg/pki/ca/ca.go#L493-L502),
  [istio_ca.go](https://github.com/istio/istio/blob/1.31.2/pilot/pkg/bootstrap/istio_ca.go#L90-L97));
  istiod's `DEFAULT_WORKLOAD_CERT_TTL` (24 h) applies only to a CSR with no
  TTL. Renewal is due at half the lifetime
  ([certificate.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/tls/certificate.rs#L402-L408)).
  A failed renewal keeps the still-valid certificate and retries per identity
  with exponential backoff from 0.5 s capped at 150 s, up to the certificate's
  expiry
  ([manager.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/identity/manager.rs#L346-L405)).
  Past expiry the identity is `Unavailable` and its connections fail.
- **New pods.** istio-cni enrols a new pod without istiod, but ztunnel learns
  the pod's trust domain, and so its certificate, only from xDS: "We don't
  know the trust domain until we get the workload from XDS"
  ([proxy.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/proxy.rs#L199-L213)).
  A pod created during the outage starts, but its meshed connections fail, in
  both directions, until istiod pushes it.
- **The budget.** With the default 24 h certificate renewed at 12 h, an outage
  that starts just before a renewal leaves 12 h, one that starts just after it
  24 h: **12 to 24 h** for existing pods on a ztunnel that does not restart.
  Raising `SECRET_TTL` on ztunnel (for example to 72 h, under the 90-day cap)
  stretches it in proportion. Drill 2 confirms the shape.

## Fit with this estate

### Double encryption across nodes

Cross-node pod traffic already leaves through `tailscale0` inside WireGuard.
Under ambient it would be HBONE mTLS inside VXLAN inside WireGuard: encrypted
twice. Same-node traffic is encrypted once, by HBONE only. The second layer buys
what WireGuard does not give: workload identity per ServiceAccount, policy by
that identity, and encryption of same-node hops. It costs CPU on both ends of
every hop, which matters only on the Pis.

### CPU on a Raspberry Pi 4

- **ztunnel negotiates AES-GCM only.** Its default build is `tls-aws-lc`
  ([Cargo.toml](https://github.com/istio/ztunnel/blob/1.31.2/Cargo.toml)), and
  that provider lists `TLS13_AES_256_GCM_SHA384` and `TLS13_AES_128_GCM_SHA256`,
  adding four ECDHE AES-GCM suites only when TLS 1.2 is enabled
  ([tls/lib.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/tls/lib.rs#L97-L122)).
  There is no ChaCha20-Poly1305 suite to fall back to.
- **No supported switch adds one.** Every crypto feature ztunnel builds with
  (`tls-aws-lc`, `tls-ring`, `tls-boring`, `tls-openssl`) replaces the
  provider's suite list with the same two TLS 1.3 AES-GCM suites; the only
  runtime toggles are `TLS12_ENABLED=true`, which adds four ECDHE AES-GCM
  suites, and `COMPLIANCE_POLICY=pqc`, which changes key exchange only
  ([Cargo.toml](https://github.com/istio/ztunnel/blob/1.31.2/Cargo.toml#L8-L14),
  [lib.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/lib.rs#L49-L55),
  [tls/lib.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/tls/lib.rs#L42-L163)).
  ztunnel reads no cipher or protocol setting from istiod's mesh config:
  nothing under `src/` names `cipherSuites`, `minProtocolVersion` or
  `meshMTLS`. The published image ships the default build: istio 1.31.2 pins
  ztunnel `9d7fce4`, the `1.31.2` tag
  ([istio.deps](https://github.com/istio/istio/blob/1.31.2/istio.deps#L11-L14)),
  and copies the binary the ztunnel release job built
  ([build_ztunnel.sh](https://github.com/istio/istio/blob/1.31.2/bin/build_ztunnel.sh#L139-L151),
  [Dockerfile.ztunnel](https://github.com/istio/istio/blob/1.31.2/pilot/docker/Dockerfile.ztunnel#L24));
  that job runs `make release` with no `TLS_MODE`
  ([ztunnel-1.31.yaml](https://github.com/istio/test-infra/blob/ba5f88f198b3da37e2284d08bd2d10c66252db5e/prow/aws/config/jobs/ztunnel-1.31.yaml#L631-L642)),
  which falls through to a plain `cargo build --release`, so `tls-aws-lc`
  ([release.sh](https://github.com/istio/ztunnel/blob/1.31.2/scripts/release.sh#L29-L41)).
  `ztunnel version` and ztunnel's first log line print
  `CryptoProvider:"tls-aws-lc"`
  ([version.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/version.rs#L55-L67)). ChaCha20 would
  take a patch to `src/tls/lib.rs` in every ztunnel on both ends of a hop: a
  fork, outside what Istio releases and supports.
- **The Pi 5's brief names the crypto extension; the Pi 4's does not.** The
  BCM2712 is a "Cortex-A76 CPU, with Cryptographic Extension"
  ([Pi 5 brief](https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf));
  the Pi 4 brief describes the BCM2711 as a "quad-core Cortex-A72 (Arm v8)
  64-bit SoC @ 1.8GHz" and names none
  ([Pi 4 brief](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-product-brief.pdf)),
  nor does the BCM2711 section of
  [processors](https://www.raspberrypi.com/documentation/computers/processors.html).
  Arm sells the extension separately: its manual is written for "a
  System-on-Chip (SoC) that uses the processor with the optional Cryptography
  Extension"
  ([Cortex-A72 Cryptography Extension TRM](https://documentation-service.arm.com/static/5e7b68a77158f500bd5be790),
  ARM 100097_0002_04_en, p. 6), and a Raspberry Pi engineer has said of that
  licence that it "cannot be added later"
  ([forum, 2018](https://forums.raspberrypi.com/viewtopic.php?t=207888)), of
  the BCM2837. No Raspberry Pi document states the BCM2711's answer; the
  kernel reads it from `ID_AA64ISAR0_EL1` into the `Features` line of
  `/proc/cpuinfo`, and on `enschede-pi-3` (read 2026-10-20) that line carries
  `asimd` but neither `aes` nor `pmull`. **The Pi 4 has no AES or PMULL
  instructions.** Its kernel builds `CRYPTO_AES_ARM64_CE=y`, which is the
  driver, not the hardware. `enschede-t1000-1`'s i7-9750H reports `aes` and
  `avx2`.
- **Without the extension, aws-lc stays constant-time but slow.** aws-lc-rs
  1.18.2 links aws-lc-sys 0.46.0
  ([Cargo.lock](https://github.com/istio/ztunnel/blob/1.31.2/Cargo.lock#L230-L243)),
  which bundles aws-lc `fa9bc8d`
  ([aws-lc-sys](https://github.com/aws/aws-lc-rs/tree/aws-lc-sys/v0.46.0/aws-lc-sys)).
  Its AES-GCM key setup picks the Armv8 AES instructions when present, else
  `vpaes`, the NEON vector-permute AES, else a bitsliced constant-time C
  fallback
  ([e_aes.c](https://github.com/aws/aws-lc/blob/fa9bc8d6f7cfb2cf849b247fb06bbbfc41ecc9d6/crypto/fipsmodule/cipher/e_aes.c#L242-L282),
  [aes/internal.h](https://github.com/aws/aws-lc/blob/fa9bc8d6f7cfb2cf849b247fb06bbbfc41ecc9d6/crypto/fipsmodule/aes/internal.h#L60-L70));
  GHASH falls back from `PMULL` to a NEON multiply
  ([gcm.c](https://github.com/aws/aws-lc/blob/fa9bc8d6f7cfb2cf849b247fb06bbbfc41ecc9d6/crypto/fipsmodule/modes/gcm.c#L257-L281)).
  The `vpaes` source calls itself "constant-time" and gives 20.4 cycles per
  byte for parallel modes (CTR) on a Cortex-A57, the A72's predecessor; the
  A72 is not in the table
  ([vpaes-armv8.pl](https://github.com/aws/aws-lc/blob/fa9bc8d6f7cfb2cf849b247fb06bbbfc41ecc9d6/crypto/fipsmodule/aes/asm/vpaes-armv8.pl#L17-L33)).
  The same library's NEON ChaCha20 takes 4.43 to 4.90 cycles per byte on that
  core
  ([chacha-armv8.pl](https://github.com/aws/aws-lc/blob/fa9bc8d6f7cfb2cf849b247fb06bbbfc41ecc9d6/crypto/chacha/asm/chacha-armv8.pl#L15-L21)).
  At 1.8 GHz that is about 88 MB/s per core for AES-CTR alone, before GHASH,
  against about 370 MB/s for ChaCha20: arithmetic on A57 figures, not a
  measurement.
- **Measured.** OpenSSL 3.6.1 `speed -evp`, 16 KiB blocks, one core, 3 s
  each, 2026-10-20:

  | node | AES-128-GCM | ChaCha20-Poly1305 |
  |---|---|---|
  | `enschede-pi-3` (Cortex-A72, no AES) | 70 473 kB/s, about 564 Mbit/s | 322 305 kB/s, about 2.58 Gbit/s |
  | `enschede-t1000-1` (i7-9750H, AES-NI) | 5 540 274 kB/s | 2 354 934 kB/s |

  On the Pi, AES-GCM is 4.6 times slower than ChaCha20, and within 20 % of the
  A57-derived 88 MB/s for AES-CTR above. OpenSSL is not aws-lc, but both fall
  back to NEON vector-permute AES and a NEON GHASH, so the figure stands in
  for ztunnel's until drill 2's `iperf3` run. Every HBONE byte a Pi sends or
  receives is therefore software AES-GCM, about one core per 560 Mbit/s on
  each end, on top of WireGuard's ChaCha20 for cross-node bytes; 100 Mbit/s
  costs roughly 18 % of one core for the mTLS alone.
- **Judged acceptable.** The maintainer's call on 2026-10-20: the Pis serve
  frontends and small controllers, talk little across nodes and never move
  bulk data. The pods running on `pi-2` and `pi-3` that day bear it out
  (`home-portal`, `outline`, `estate-dashboard`, `tribelt`, `adguard-ha-a`,
  `release-gate`, `collector`, `kubernetes-mcp-server`, `reloader`,
  `metrics-server`, `local-path-provisioner`, `cert-manager-webhook`,
  `vault-agent-injector`). Pi workloads are enrolled, not excluded; AdGuard's
  UDP DNS is not captured at all, and the two admission webhooks on `pi-3`
  stay outside the mesh as drill 5 already says. What remains for drill 2 is
  ztunnel's memory against the 2 643 MiB `pi-3` had available.

### Stable Addresses under the mesh

- **L4 mTLS works through an alias.** istiod does not model the ExternalName
  Service, the CNAME resolves to the target Service's ClusterIP, and ztunnel
  acts on that address
  ([services.go](https://github.com/istio/istio/blob/1.31.2/pilot/pkg/serviceregistry/ambient/services.go#L258-L265)).
  The policy and identity that apply are the target's. The same holds for
  the per-consumer alias of
  [0109](../adr/model/0109-a-consumer-reaches-its-provider-by-its-application-id.md),
  an ExternalName in the consumer's namespace naming the Stable Address: a
  chain of two CNAMEs that still ends at one ClusterIP.
- **Mesh TLS does not use the alias name.** The certificate carries the
  workload's identity, and the client checks "that the service account presented
  in the server certificate is authorized to run the target service"
  ([security concepts](https://istio.io/latest/docs/concepts/security/)). The
  TLS-name mismatch [0093](../adr/model/0093-a-provider-is-reached-through-its-stable-address.md)
  records as a limit of the alias concerns application TLS, not this layer.
- **A waypoint attaches to the target, not the alias.** Waypoint selection
  follows the Service the traffic was addressed to
  ([waypoint](https://istio.io/latest/docs/ambient/usage/waypoint/)), here the
  target's ClusterIP; an `HTTPRoute` would name the target Service. The request
  still carries the alias as its `Host`. Whether a waypoint routes such a
  request without a hostname match is **settle by drill** (drill 3).
- **DNS.** ztunnel's DNS capture is on by default (`dnsCapture: true`,
  [istio-cni values](https://github.com/istio/istio/blob/1.31.2/manifests/charts/istio-cni/values.yaml)).
  Whether its proxy changes the CNAME's 5-second TTL that the Move's flip relies
  on ([provider-moves](provider-moves.md#what-bounds-the-flip)) is **settle by
  drill**: `dig` the alias from an enrolled pod (drill 3).
- **Kiali draws the target.** The edge appears consumer to provider workload,
  not via the alias. Expected from the above; confirmed in drill 3.

### gluetun and the in-pod rules

The live `qbittorrent` pod runs `qmcgaw/gluetun@sha256:fa19cc76…`, the digest
Docker Hub lists for `v3.41.3`, as a native sidecar with `NET_ADMIN` and
`NET_RAW`, WireGuard to ProtonVPN, `FIREWALL_INPUT_PORTS=8080` and
`FIREWALL_OUTBOUND_SUBNETS=100.64.0.0/10,192.168.0.0/16,172.16.0.0/12,10.42.0.0/16,10.43.0.0/16`.
Read against gluetun v3.41.3 and istio-cni 1.31.2:

- **The firewalls do not collide.** gluetun writes only the `filter` table:
  `DROP` policies on `INPUT`, `OUTPUT` and `FORWARD`, then accepts for `lo`,
  established traffic, the VPN endpoint, the pod's own subnet in and out, the
  outbound subnets and the input ports
  ([enable.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/firewall/enable.go#L74-L160),
  [iptables.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/firewall/iptables.go#L88-L106));
  its `--flush` runs only when it disables itself, and only on `filter`.
  istio-cni writes `mangle`, `nat` and `raw`. Redirected and HBONE packets
  travel on `lo`, the pod subnet or `10.42.0.0/16`, all of which gluetun
  accepts.
- **Policy routing does.** gluetun adds `ip rule`s at priority 98 (to the pod
  subnet, `main`), 99 (to each outbound subnet, table 199), 100 (from the pod
  IP, table 200 via `eth0`) and 101 (not fwmark 51820, the WireGuard table)
  ([local.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/routing/local.go#L97-L104),
  [outbound.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/routing/outbound.go#L12-L14),
  [inbound.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/routing/inbound.go#L10-L13),
  [wireguard.go](https://github.com/qdm12/gluetun/blob/v3.41.3/internal/provider/utils/wireguard.go#L22-L23)).
  ztunnel hands an inbound connection to the application with the client's
  address as source, through a transparent socket it enables on a best-effort
  basis when `ENABLE_ORIG_SRC` is unset
  ([inbound.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/proxy/inbound.rs#L305-L321),
  [proxy.rs](https://github.com/istio/ztunnel/blob/1.31.2/src/proxy.rs#L618-L636)).
  The application's replies carry mark `0x111` and must reach istio-cni's
  `fwmark 0x111 lookup 100` rule at priority 32764 to be routed back to
  ztunnel on `lo`. Under gluetun every such reply leaves from the pod IP and
  matches rule 98, 99 or 100 first, so it goes out `eth0` straight to the
  client, around ztunnel, and the inbound connection never completes.
  Outbound would work: ztunnel's sockets are marked `0x539`, which routes
  cluster addresses through rule 99 and everything else through rule 101 into
  the tunnel.
- **No gluetun setting repairs it.** `FIREWALL_OUTBOUND_SUBNETS` and
  `FIREWALL_INPUT_PORTS` act on rules 99 and `filter`; rules 100 and 101 still
  match every reply. Only `ENABLE_ORIG_SRC=false` on ztunnel would, and it is
  node-wide, costing every pod on the node its client's source address.
  `istio.io/dataplane-mode=none` stays. This is read from source, not run.

### Conflicts with recorded premises

None of these records is edited here; each names what a mesh decision would
have to reopen.

- [0052](../adr/model/0052-an-application-is-the-release-unit.md) rests in part
  on "one small controller is cheaper than a service mesh". It rejected a mesh
  as the release mechanism; a mesh adopted for mTLS does not make the Release
  Gate redundant, but the cost comparison the premise states would no longer
  be between the gate and nothing.
- [0093](../adr/model/0093-a-provider-is-reached-through-its-stable-address.md)
  rejected "a mesh as the indirection" for putting "a proxy in every
  connection's path". Ambient puts ztunnel in every enrolled path whatever the
  indirection is, while leaving the alias doing the indirection. The rejection
  stands as worded; its cost argument changes.
- [0035](../adr/model/0035-network-policy-is-default-deny-and-render-only.md)
  derives a per-port allow set and picks Cilium for an audit stage whose flow
  records decide promotion. Under ambient: every meshed flow is on 15008 to
  NetworkPolicy, so the per-port half of each rule moves to AuthorizationPolicy;
  Cilium cannot read L7 inside Istio's mTLS
  ([Cilium Istio integration](https://docs.cilium.io/en/stable/network/servicemesh/istio/));
  and ztunnel's flag-gated dry-run AuthorizationPolicy is a second candidate
  for the audit stage the record waits on a CNI for.

### Deriving AuthorizationPolicy from the edge set

The model already holds everything an identity policy needs, which is what makes
this derivable rather than authored:

- **Principal per Process.** Each Process has its own ServiceAccount, named for
  the Process, in `<project>-system`
  ([chapter 16](../../spec/v1/16-dependencies.md#process-identity),
  [0031](../adr/model/0031-identity-per-process.md)). Its mesh principal is
  `cluster.local/ns/<project>-system/sa/<process>`, the format the L4 policy
  example uses ([L4 policy](https://istio.io/latest/docs/ambient/usage/l4-policy/)).
- **One allow-nothing per project namespace**, mirroring the default-deny
  NetworkPolicy, and **one ALLOW per provider Process**: `selector` its pods,
  `from.principals` the inbound edge set's consumer principals, `to.ports` the
  surface port. The other rows of
  [the derived allow set](../../spec/v1/16-dependencies.md#the-derived-allow-set)
  (route tier, metrics stack, backup and migration identities, Flux's
  notification controller) become principals too, where their pods are enrolled.
- **A source outside the mesh has no principal**, so a rule for one (the API
  server's webhook calls, an unenrolled Flux) can match only `ipBlocks`.
- **Two policy kinds, two jobs.** NetworkPolicy stays the floor that holds even
  if ztunnel is bypassed or a namespace is left out, and gains the 15008 and
  probe rules; AuthorizationPolicy carries the identity and port. One
  `networking` adapter emitting both from one allow set would keep them from
  drifting.

### Cilium later

When flannel gives way to Cilium
([chapter 60](../../spec/v1/60-setup.md#cni)): `cni.exclusive=false`, or Cilium
deletes istio-cni's chained configuration; `bpf.masquerade=true` "is not
currently supported", Cilium's default iptables masquerading is; with
kube-proxy replacement, `socketLB.hostNamespaceOnly=true`; and under any Cilium
default-deny, a `CiliumClusterwideNetworkPolicy` admitting `169.254.7.127/32`
for probes
([platform prerequisites](https://istio.io/latest/docs/ambient/install/platform-prerequisites/),
[Cilium Istio integration](https://docs.cilium.io/en/stable/network/servicemesh/istio/)).
Cilium advises against running both projects' L7 HTTP policy at once, "to avoid
split-brain problems" (same page). The k3s paths change too: with a
non-bundled CNI the `global.platform=k3s` defaults no longer apply and
`cniConfDir`/`cniBinDir` are set by hand
([platform prerequisites](https://istio.io/latest/docs/ambient/install/platform-prerequisites/)).

## Alternatives considered

| option | one-line reason it was not chosen | source |
|---|---|---|
| Linkerd | the open-source project "no longer provides stable release artifacts" since February 2024, so a supported line means edge releases or a vendor build; its proxy runs "as sidecar containers in the pods", one per pod | [releases](https://linkerd.io/releases/), [architecture](https://linkerd.io/2-edge/reference/architecture/) |
| Cilium mutual authentication | "a beta feature", "still incomplete"; the handshake is out-of-band and encryption comes from WireGuard or IPsec separately; needs SPIRE; and Cilium is not the CNI yet | [mutual authentication](https://docs.cilium.io/en/stable/network/servicemesh/mutual-authentication/mutual-authentication/) |
| Istio sidecar mode | an Envoy per pod, requesting 100m and 128 Mi each by default (up to about 14 Gi across the 113 running pods), plus the sidecar-mode init-container caveats | [istiod values](https://github.com/istio/istio/blob/1.31.2/manifests/charts/istio-control/istio-discovery/values.yaml), [Istio CNI](https://istio.io/latest/docs/setup/additional-setup/cni/) |
| Consul | out of scope as overkill: server agents as a StatefulSet with persistent volumes, and Envoy sidecars managed by Consul dataplane | [Consul on Kubernetes](https://developer.hashicorp.com/consul/docs/k8s/architecture) |

## Drills

Each settles the claims marked above. None needs anything beyond a lab
namespace or a Pi taken out of service; none should run first on the
production estate.

1. **Install on NixOS k3s.** The node reads it used to start with are done
   ([Node reads](#node-reads-2026-10-20)); render the four charts
   with `global.platform=k3s` and apply them; confirm `istio-cni-node` and
   `ztunnel` Ready on both; confirm the in-pod `CT --zone` and `REDIRECT`
   rules load through `nft_compat`; create one waypoint against the existing
   v1.5.1 standard Gateway API CRDs and read `istioctl analyze`.
2. **Footprint and cipher cost on a Pi, 24 h.** Enrol a workload pair on
   `pi-3` and sample ztunnel
   and istio-cni memory and CPU over 24 h; run `iperf3` between two pods
   across nodes, meshed and unmeshed, and record CPU per Mbit/s on the Pi;
   count the series the ztunnel PodMonitor adds; stop istiod for an hour and
   confirm enrolled traffic still flows, that a pod created meanwhile cannot
   open a meshed connection, and that a ztunnel restarted meanwhile stays not
   Ready.
3. **The Stable Address path.** From an enrolled consumer, `dig` a Stable
   Address (TTL through ztunnel's DNS proxy), connect through it to an enrolled
   Postgres and to an HTTP provider, and confirm: `istioctl ztunnel-config
   workloads` shows `HBONE`; the access log names both identities; Kiali draws
   the edge with a padlock; a kube-router NetworkPolicy with a `from`
   podSelector still admits the meshed client; a waypoint on the HTTP target
   routes a request whose `Host` is the alias; and `vault-agent-init` in an
   enrolled pod fetches its secrets.
4. **The Traefik hop and server-first ports.** Enrol `traefik-lan`, set
   `nativeLB` on one route, and confirm the Traefik-to-backend hop is
   `mutual_tls` in Kiali and the access log, with and without a waypoint on
   the backend; under `STRICT` plus a port-level `PERMISSIVE` on Traefik's and
   Stalwart's listeners, an external client still reaches both, and an SMTP
   client receives Stalwart's greeting.
5. **STRICT breaks nothing.** Enrol every namespace except `kube-system`,
   `istio-system`, `flux-system`, the webhook hosts and `qbittorrent-system`
   under `PERMISSIVE`; collect inbound series without `mutual_tls` until 14
   consecutive days show none (the same window
   [chapter 60](../../spec/v1/60-setup.md#cni) sets for policy promotion); then
   `STRICT`, and watch failed connections and probe failures for another 14
   days.

### Stage 1 results, 2026-10-20

Drills 1, 3 and 4 ran first in a throwaway k3d cluster: k3d v5.8.3 with
k3s `v1.36.5+k3s1` (the production version), one server and two agents,
flannel with kube-router network policy, Istio 1.31.2 ambient from the release
tarball's charts, the v1.5.1 standard Gateway API CRDs, Kiali v2.33.0 with
anonymous view-only access, and Istio's sample Prometheus. The nodes are not
NixOS, so drill 1 is settled only in part.

**Install.**

- The Helm repository's index (generated 2026-10-16) stops at `1.31.0-rc.0`
  and has no 1.31 GA charts, and `oci://gcr.io/istio-release/charts/base:1.31.2`
  does not exist. The release tarball's charts and the `docker.io/istio` 1.31.2
  images do. A Flux install needs another chart source.
- `global.platform=k3d` sets `cniBinDir: /bin`, which k3s 1.36 (inside k3d too)
  does not read. `global.platform=k3s` sets bin
  `/var/lib/rancher/k3s/data/cni` and conf
  `/var/lib/rancher/k3s/agent/etc/cni/net.d`. The bin directory differs from
  the `data/current/bin` the [node reads](#node-reads-2026-10-20) listed, so
  confirm where flannel's binary sits on the first production node before
  istio-cni installs there.
- With `istio-cni` chained into the conflist but its binary missing from the
  kubelet's bin directory, every new pod on that node fails sandbox creation
  (`failed to find plugin "istio-cni" in path`), in every namespace, enrolled
  or not. Deletion fails the same way, so pods stick in `Terminating`. In 1.31
  ambient `istio-cni-node` is not host-network, so it needs the broken chain
  itself and cannot repair it: the lab recovered by copying the binary onto
  each node by hand. A production install has to pin istio-cni to one
  cordoned node first, with a rollback that removes the conflist entry over
  SSH.
- ztunnel logs `CryptoProvider:"tls-aws-lc"`, and `istioctl analyze -A` raises
  no `IST0176` on Gateway API v1.5.1.

**Drill 3, the Stable Address path.**

- The chain consumer alias, `estate-system` CNAME, provider A record keeps its
  5 s TTL at each step under the mesh.
- Enrolling a namespace (a label, no restart) under a port-scoped
  NetworkPolicy that admits 80 and 5432 breaks HTTP and Postgres at once.
  Adding 15008 to the same rule restores both, so the derived allow set must
  carry 15008 wherever a rule is port-scoped.
- kube-router's `namespaceSelector` plus `podSelector` still matches the meshed
  client, because ztunnel keeps the source IP; an enrolled pod the rule does not
  select stays denied.
- The ztunnel access log names both SPIFFE identities, destination port 15008,
  and the real Service as `dst.service`.
- A waypoint on the HTTP provider returns 503 until a policy admits the
  waypoint pod to the provider on 15008, because the provider's peer becomes
  the waypoint. Then the request succeeds, and the provider sees the alias as
  `Host`.
- An init container in an enrolled pod reaches its provider through ztunnel,
  the shape `vault-agent-init` needs.

**Drill 4, the Traefik hop and server-first ports.**

- Traefik's pooled backend connections opened before enrolment stay
  plaintext until Traefik restarts. Enrolling Traefik means restarting it.
- By default (pod IPs) the hop is mTLS from `edge/sa/traefik` to the backend
  and skips a waypoint; with `nativeLB` it goes through the waypoint.
- Server-first SMTP greets both meshed and outside clients. The lab used
  Mailpit v1.31.6, because Stalwart v0.16.20 in bootstrap mode listens on 8080
  only; Stalwart's own greeting stays with stage 2.
- Mesh-wide `STRICT` breaks outside clients to Traefik; a port-level
  `PERMISSIVE` on Traefik's entry port and the SMTP port restores them.

**Kiali.** Every meshed edge (client to Postgres, client to waypoint, waypoint
to provider, Traefik to provider) reads `isMTLS=100`, the outside-to-Traefik
edge reads no mTLS, and aliases resolve to the real workloads in the graph.

**Not settled in stage 1:** the NixOS nodes and the in-pod rules through
`nft_compat` (drill 1), the Pi footprint, cipher cost and istiod outage
behaviour (drill 2), the series the production ztunnel PodMonitor adds, and
drill 5.

## Open questions after source review

A source pass on 2026-10-20 (ztunnel and istio at `1.31.2`, kiali at
`v2.33.0`, aws-lc at `fa9bc8d`, gluetun at `v3.41.3`, k3s-io/kube-router at
`v2.6.3-k3s1`, nixpkgs `nixos-26.05` at `f3a73bc`) settled the ztunnel cipher
question, the istiod-outage budget, the dry-run log level, Kiali's 1.31
testing, kube-router's view of HBONE, gluetun, the netfilter feature list,
the iptables flavour and the Gateway API floor.

### Node reads, 2026-10-20

Read-only commands the maintainer ran over SSH settled the items the source
pass handed on:

| item | read | result |
|---|---|---|
| Armv8 AES and PMULL on the BCM2711 | `Features` line of `/proc/cpuinfo` on `enschede-pi-3` | `asimd` only: no AES, no PMULL ([CPU on a Raspberry Pi 4](#cpu-on-a-raspberry-pi-4)) |
| software AES-GCM against ChaCha20 | `openssl speed -evp`, OpenSSL 3.6.1 from the Nix store | Pi 70 MB/s against 322 MB/s; amd64 5.5 GB/s against 2.4 GB/s |
| netfilter symbols | `zgrep` of the fifteen symbols on `/proc/config.gz`, all six nodes | twelve present everywhere; the legacy `IP_NF_MANGLE`, `IP_NF_RAW`, `IP_NF_NAT` absent, which the nft path does not need ([Netfilter on NixOS](#netfilter-on-nixos)) |
| the matches ambient adds | `modprobe -n` on a Pi and an amd64 node | `xt_connmark`, `xt_mark`, `xt_set`, `ip_set`, `ip_set_hash_ip` loadable on both |
| iptables flavour and legacy state | `iptables --version`, `/proc/net/ip_tables_names`, `iptables-legacy-save`, all six nodes | `nf_tables` everywhere, no legacy table loaded, zero legacy rules |
| the k3s CNI directories | `ls` on a Pi and an amd64 node | bin `/var/lib/rancher/k3s/data/current/bin`; conf `/var/lib/rancher/k3s/agent/etc/cni/net.d/10-flannel.conflist`, identical on both architectures |

The lab install of drill 1 settled the CRDs at v1.5.1 and the crypto provider
([stage 1 results](#stage-1-results-2026-10-20)). What still needs a NixOS
node:

| open item | command | where |
|---|---|---|
| that the in-pod rules load through `nft_compat` without the legacy table modules | `kubectl -n istio-system logs ds/istio-cni-node` for an enrolled pod, and `nsenter -t <pid> -n nft list ruleset` on its node | a Pi and an amd64 node |

Stage 1 also settled the DNS proxy's TTL, a waypoint routing an alias `Host`
and the kube-router reading (drill 3), and the Traefik hop with and without
`nativeLB` (drill 4). The rest needs the mesh on the estate's own nodes and
stays with its drill: ztunnel's memory and CPU over a day and per Mbit/s
(drill 2), the outage behaviour read above (drill 2), and Stalwart's own
greeting (drill 4).
