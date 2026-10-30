// The Node Agents (spec/v1/14-platform-intent.md#node-agents), rendered as the
// `node` Project's share of the tree: each agent a DaemonSet in `node-system`,
// held to the nodes its facts name, with the privileges its catalog entry
// fixes. The `node` Project declares nothing, so nothing here is authored.
import {
  GPU_SHARES,
  NODE_PROJECT,
  type AgentImage,
  type ResolvedNodeAgent,
  type NodeAgent,
  type SpokenPool,
} from "../../model/node-agents.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type {
  ClusterRole,
  ClusterRoleBinding,
  ConfigMap,
  Labels,
  Namespace,
  ServiceAccount,
} from "../../objects/kubernetes.ts";
import type {
  AgentContainer,
  AgentDaemonSet,
  AgentDeployment,
  AgentPodSpec,
  AgentVolume,
  AddressPool,
  L2Advertisement,
} from "../../objects/node-agents.ts";
import { managedOnly } from "../shared/labels.ts";
import { projectDirectory } from "../shared/paths.ts";
import { nodeAffinityOf } from "../shared/placement.ts";
import { ADAPTER, NEVER_PRUNED } from "./render.ts";

export const NODE_NAMESPACE = `${NODE_PROJECT}-system`;

/** The device resource the device plugin advertises, one share at a time. */
const GPU_RESOURCE = "nvidia.com/gpu";
/** The speaker's controller, which runs once beside the speakers. */
const CONTROLLER = "l4-controller";
/** The metrics port of MetalLB's speaker and controller. */
const METALLB_METRICS = 7472;

/** What a catalog entry fixes for its container, beyond its image and request. */
interface Privileges {
  readonly hostNetwork?: true;
  readonly hostPID?: true;
  readonly args?: readonly string[];
  readonly env?: AgentContainer["env"];
  readonly port?: number;
  readonly securityContext: AgentContainer["securityContext"];
  readonly mounts?: readonly {
    readonly name: string;
    readonly hostPath: string;
    readonly mountPath: string;
    readonly readOnly?: true;
    readonly propagate?: true;
  }[];
}

const DROPPED = { drop: ["ALL"] as const };

/** The privileges each agent holds, fixed by the catalog and never authored. */
const CATALOG: Readonly<Record<NodeAgent, Privileges>> = {
  // The NVIDIA device plugin registers each card's shares with the kubelet.
  "gpu-device": {
    hostPID: true,
    env: [
      { name: "CONFIG_FILE", value: "/config/config.yaml" },
      { name: "FAIL_ON_INIT_ERROR", value: "true" },
      { name: "NVIDIA_VISIBLE_DEVICES", value: "all" },
      { name: "PASS_DEVICE_SPECS", value: "true" },
    ],
    securityContext: { privileged: true },
    mounts: [
      {
        name: "device-plugins",
        hostPath: "/var/lib/kubelet/device-plugins",
        mountPath: "/var/lib/kubelet/device-plugins",
      },
      { name: "cdi", hostPath: "/var/run/cdi", mountPath: "/var/run/cdi" },
    ],
  },
  // dcgm-exporter reads each card's counters and which pod holds its shares.
  "gpu-metrics": {
    env: [
      { name: "DCGM_EXPORTER_KUBERNETES", value: "true" },
      { name: "DCGM_EXPORTER_LISTEN", value: ":9400" },
    ],
    port: 9400,
    securityContext: {
      runAsNonRoot: false,
      runAsUser: 0,
      capabilities: { add: ["SYS_ADMIN"], drop: ["ALL"] },
    },
    mounts: [
      {
        name: "pod-resources",
        hostPath: "/var/lib/kubelet/pod-resources",
        mountPath: "/var/lib/kubelet/pod-resources",
        readOnly: true,
      },
    ],
  },
  // node-exporter reads the host's own filesystems and network, read-only.
  "node-metrics": {
    hostNetwork: true,
    hostPID: true,
    args: [
      "--path.procfs=/host/proc",
      "--path.sysfs=/host/sys",
      "--path.rootfs=/host/root",
      "--web.listen-address=:9100",
    ],
    port: 9100,
    securityContext: {
      runAsNonRoot: true,
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: DROPPED,
    },
    mounts: [
      {
        name: "proc",
        hostPath: "/proc",
        mountPath: "/host/proc",
        readOnly: true,
      },
      { name: "sys", hostPath: "/sys", mountPath: "/host/sys", readOnly: true },
      {
        name: "root",
        hostPath: "/",
        mountPath: "/host/root",
        readOnly: true,
        propagate: true,
      },
    ],
  },
  // MetalLB's speaker answers ARP for the pools' addresses from its node.
  "l4-speaker": {
    hostNetwork: true,
    args: [
      `--port=${String(METALLB_METRICS)}`,
      `--namespace=${NODE_NAMESPACE}`,
      "--log-level=info",
    ],
    env: [
      {
        name: "METALLB_NODE_NAME",
        valueFrom: { fieldRef: { fieldPath: "spec.nodeName" } },
      },
      {
        name: "METALLB_HOST",
        valueFrom: { fieldRef: { fieldPath: "status.hostIP" } },
      },
    ],
    port: METALLB_METRICS,
    securityContext: {
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: { add: ["NET_RAW"], drop: ["ALL"] },
    },
  },
};

/** The rules the speaker and its controller ask of the API, cluster-wide. */
const METALLB_READS = [
  "ipaddresspools",
  "l2advertisements",
  "bgppeers",
  "bgpadvertisements",
  "communities",
  "bfdprofiles",
];
const RULES: Readonly<Record<string, ClusterRole["rules"]>> = {
  "l4-speaker": [
    {
      apiGroups: [""],
      resources: ["services", "endpoints", "nodes", "namespaces", "pods"],
      verbs: ["get", "list", "watch"],
    },
    {
      apiGroups: ["discovery.k8s.io"],
      resources: ["endpointslices"],
      verbs: ["get", "list", "watch"],
    },
    { apiGroups: [""], resources: ["events"], verbs: ["create", "patch"] },
    {
      apiGroups: ["metallb.io"],
      resources: [...METALLB_READS, "servicel2statuses"],
      verbs: ["get", "list", "watch"],
    },
    {
      apiGroups: ["metallb.io"],
      resources: ["servicel2statuses", "servicel2statuses/status"],
      verbs: ["create", "delete", "update", "patch"],
    },
  ],
  [CONTROLLER]: [
    {
      apiGroups: [""],
      resources: ["services", "namespaces"],
      verbs: ["get", "list", "watch"],
    },
    { apiGroups: [""], resources: ["services/status"], verbs: ["update"] },
    { apiGroups: [""], resources: ["events"], verbs: ["create", "patch"] },
    {
      apiGroups: ["metallb.io"],
      resources: METALLB_READS,
      verbs: ["get", "list", "watch"],
    },
    {
      apiGroups: ["metallb.io"],
      resources: ["ipaddresspools/status"],
      verbs: ["update"],
    },
  ],
};

const labelsOf = (name: string): Labels => ({
  ...managedOnly(),
  "app.kubernetes.io/name": name,
  "app.kubernetes.io/part-of": NODE_PROJECT,
});
const selectorOf = (name: string): Labels => ({
  "app.kubernetes.io/name": name,
});
const metadataOf = (name: string) => ({
  name,
  namespace: NODE_NAMESPACE,
  labels: labelsOf(name),
});
const directoryOf = (agent: NodeAgent): string =>
  `${projectDirectory(NODE_PROJECT)}/${agent}`;

const containerOf = (
  name: string,
  { image, memory, cpu }: AgentImage,
  privileges: Privileges,
  limits: Readonly<Record<string, string>> = {},
  config: boolean = false,
): AgentContainer => {
  const mounts = [
    // An agent with no host path and one with an empty list mount none alike.
    // Stryker disable next-line ArrayDeclaration
    ...(privileges.mounts ?? []).map(
      ({ name: mount, mountPath, readOnly, propagate }) => ({
        name: mount,
        mountPath,
        // An absent flag and an undefined one render alike: YAML drops the key.
        // Stryker disable next-line ConditionalExpression
        ...(readOnly === true ? { readOnly } : {}),
        ...(propagate === true
          ? { mountPropagation: "HostToContainer" as const }
          : {}),
      }),
    ),
    ...(config
      ? [{ name: "config", mountPath: "/config", readOnly: true as const }]
      : []),
  ];
  return {
    name,
    image,
    // An absent list and an undefined one render alike: YAML drops the key.
    // Stryker disable next-line ConditionalExpression
    ...(privileges.args === undefined ? {} : { args: privileges.args }),
    // Stryker disable next-line ConditionalExpression
    ...(privileges.env === undefined ? {} : { env: privileges.env }),
    ...(privileges.port === undefined
      ? {}
      : { ports: [{ name: "metrics", containerPort: privileges.port }] }),
    resources: { requests: { memory, cpu }, limits: { memory, ...limits } },
    securityContext: privileges.securityContext,
    ...(mounts.length === 0 ? {} : { volumeMounts: mounts }),
  };
};

const podOf = (
  name: string,
  nodes: readonly string[],
  container: AgentContainer,
  privileges: Privileges,
  extra: Partial<AgentPodSpec> & { readonly config?: true } = {},
): AgentPodSpec => {
  const volumes: AgentVolume[] = [
    ...(privileges.mounts ?? []).map(({ name: volume, hostPath }) => ({
      name: volume,
      hostPath: { path: hostPath },
    })),
    ...(extra.config === true ? [{ name: "config", configMap: { name } }] : []),
  ];
  return {
    serviceAccountName: name,
    automountServiceAccountToken: RULES[name] !== undefined,
    priorityClassName: "system-node-critical",
    // The runtime's syscall filter holds for every agent: a privileged
    // container is unconfined whatever its pod asks.
    securityContext: { seccompProfile: { type: "RuntimeDefault" } },
    ...(privileges.hostNetwork === true ? { hostNetwork: true } : {}),
    ...(privileges.hostPID === true ? { hostPID: true } : {}),
    // An absent class and an undefined one render alike: YAML drops the key.
    // Stryker disable next-line ConditionalExpression
    ...(extra.runtimeClassName === undefined
      ? {}
      : { runtimeClassName: extra.runtimeClassName }),
    affinity: nodeAffinityOf(nodes),
    containers: [container],
    ...(volumes.length === 0 ? {} : { volumes }),
  };
};

const daemonSetOf = (name: string, spec: AgentPodSpec): AgentDaemonSet => ({
  apiVersion: "apps/v1",
  kind: "DaemonSet",
  metadata: metadataOf(name),
  spec: {
    selector: { matchLabels: selectorOf(name) },
    updateStrategy: {
      type: "RollingUpdate",
      rollingUpdate: { maxUnavailable: 1 },
    },
    template: { metadata: { labels: labelsOf(name) }, spec },
  },
});

const serviceAccountOf = (name: string): ServiceAccount => ({
  apiVersion: "v1",
  kind: "ServiceAccount",
  metadata: metadataOf(name),
});

/** The time-slicing the device plugin reads: each card advertised as its shares. */
const timeSlicing = `version: v1
sharing:
  timeSlicing:
    resources:
      - name: ${GPU_RESOURCE}
        replicas: ${String(GPU_SHARES)}
`;

const rbacOf = (
  names: readonly string[],
): (ClusterRole | ClusterRoleBinding)[] =>
  names.flatMap((name) => [
    {
      apiVersion: "rbac.authorization.k8s.io/v1" as const,
      kind: "ClusterRole" as const,
      metadata: { name: `${NODE_PROJECT}:${name}`, labels: labelsOf(name) },
      rules: RULES[name] as ClusterRole["rules"],
    },
    {
      apiVersion: "rbac.authorization.k8s.io/v1" as const,
      kind: "ClusterRoleBinding" as const,
      metadata: { name: `${NODE_PROJECT}:${name}`, labels: labelsOf(name) },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io" as const,
        kind: "ClusterRole" as const,
        name: `${NODE_PROJECT}:${name}`,
      },
      subjects: [
        { kind: "ServiceAccount" as const, name, namespace: NODE_NAMESPACE },
      ],
    },
  ]);

const poolsOf = (
  pools: readonly SpokenPool[],
): (AddressPool | L2Advertisement)[] =>
  pools.flatMap(({ name, range, nodes }) => [
    {
      apiVersion: "metallb.io/v1beta1" as const,
      kind: "IPAddressPool" as const,
      metadata: { name, namespace: NODE_NAMESPACE, labels: managedOnly() },
      // A Service takes a pool's address only by naming the pool.
      spec: { addresses: [range], autoAssign: false as const },
    },
    {
      apiVersion: "metallb.io/v1beta1" as const,
      kind: "L2Advertisement" as const,
      metadata: { name, namespace: NODE_NAMESPACE, labels: managedOnly() },
      spec: {
        ipAddressPools: [name],
        nodeSelectors:
          nodeAffinityOf(nodes).nodeAffinity
            .requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms,
      },
    },
  ]);

const controllerOf = (
  controller: AgentImage,
  nodes: readonly string[],
): AgentDeployment => {
  const privileges: Privileges = {
    args: [
      `--port=${String(METALLB_METRICS)}`,
      `--namespace=${NODE_NAMESPACE}`,
      "--webhook-mode=disabled",
      "--log-level=info",
    ],
    port: METALLB_METRICS,
    securityContext: {
      runAsNonRoot: true,
      runAsUser: controller.uid,
      runAsGroup: controller.gid,
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: DROPPED,
    },
  };
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: metadataOf(CONTROLLER),
    spec: {
      replicas: 1,
      strategy: { type: "Recreate" },
      selector: { matchLabels: selectorOf(CONTROLLER) },
      template: {
        metadata: { labels: labelsOf(CONTROLLER) },
        spec: {
          ...podOf(
            CONTROLLER,
            nodes,
            containerOf(CONTROLLER, controller, privileges),
            privileges,
          ),
          // It runs once and no node needs it: losing it delays an address,
          // never a node's traffic.
          priorityClassName: "system-cluster-critical",
        },
      },
    },
  };
};

/** One agent's share of the `node` Project's tree. */
function agentDeliverables(agent: ResolvedNodeAgent): Deliverable[] {
  const privileges = CATALOG[agent.agent];
  const directory = directoryOf(agent.agent);
  const gpu = agent.agent === "gpu-device";
  const limits = agent.agent === "gpu-metrics" ? { [GPU_RESOURCE]: "1" } : {};
  const spec = podOf(
    agent.agent,
    agent.nodes,
    containerOf(agent.agent, agent, privileges, limits, gpu),
    privileges,
    {
      // Stryker disable next-line ConditionalExpression
      ...(agent.runtimeClass === undefined
        ? {}
        : { runtimeClassName: agent.runtimeClass }),
      ...(gpu ? { config: true as const } : {}),
    },
  );
  const speaker = agent.controller !== undefined;
  return [
    {
      path: `${directory}/serviceaccount.yaml`,
      adapter: ADAPTER,
      objects: [
        serviceAccountOf(agent.agent),
        ...(speaker ? [serviceAccountOf(CONTROLLER)] : []),
      ],
    },
    {
      path: `${directory}/workload.yaml`,
      adapter: ADAPTER,
      objects: [
        daemonSetOf(agent.agent, spec),
        ...(agent.controller === undefined
          ? []
          : [controllerOf(agent.controller, agent.nodes)]),
      ],
    },
    ...(gpu
      ? [
          {
            path: `${directory}/configmap.yaml`,
            adapter: ADAPTER,
            objects: [
              {
                apiVersion: "v1",
                kind: "ConfigMap",
                metadata: metadataOf(agent.agent),
                data: { "config.yaml": timeSlicing },
              } satisfies ConfigMap,
            ],
          },
        ]
      : []),
    ...(speaker
      ? [
          {
            path: `${directory}/rbac.yaml`,
            adapter: ADAPTER,
            objects: rbacOf([agent.agent, CONTROLLER]),
          },
          {
            path: `${directory}/pools.yaml`,
            adapter: ADAPTER,
            // The speaker always carries the pools it announces.
            objects: poolsOf(agent.pools as readonly SpokenPool[]),
          },
        ]
      : []),
  ];
}

/**
 * The `node` Project's share of the tree. Every node runs `node-metrics`, so a
 * node contract, which names at least one node, always derives an agent.
 */
export function renderNodeAgents(
  agents: readonly ResolvedNodeAgent[],
): Deliverable[] {
  const namespace: Namespace = {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: NODE_NAMESPACE,
      labels: managedOnly(),
      annotations: NEVER_PRUNED,
    },
  };
  return [
    {
      path: `${projectDirectory(NODE_PROJECT)}/namespace.yaml`,
      adapter: ADAPTER,
      objects: [namespace],
    },
    ...agents.flatMap(agentDeliverables),
  ];
}
