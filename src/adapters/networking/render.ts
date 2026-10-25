// The `networking` adapter (spec/v1/16-dependencies.md#network-policy): one
// namespace-wide default-deny per project, per Process the policy its derived
// allow set and the baseline admit, and per backup identity the policy its
// backup plan admits, every peer and every port read off the projection.
import type { ResolvedProject } from "../../model/resolution.ts";
import type {
  ResolvedApplicationDocument,
  ResolvedCatalogJob,
  ResolvedPolicyJob,
  ResolvedProcess,
} from "../../model/resolved-deployment.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type {
  NetworkPolicy,
  PolicyPeer,
  PolicyPort,
  PolicyRange,
} from "../../objects/kubernetes.ts";
import {
  consumerLabelsOf,
  instanceOf,
  labelsOf,
  managedOnly,
  namespaceSelector,
} from "../shared/labels.ts";
import { applicationDirectory, projectDirectory } from "../shared/paths.ts";

export const ADAPTER = "networking";

export const tcp = (port: number): PolicyPort => ({ protocol: "TCP", port });

/** Every IPv4 address; internet egress admits it less the ranges below. */
const ANY_IPV4 = "0.0.0.0/0";

/**
 * What internet egress never reaches: the private ranges, the tailnet,
 * link-local and loopback. Fixed, so no authored or Platform range opens a hole.
 */
const NOT_PUBLIC = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "169.254.0.0/16",
  "127.0.0.0/8",
] as const;

export const peerOf = (
  namespace: string,
  process: string | undefined,
): PolicyPeer => ({
  namespaceSelector: { matchLabels: namespaceSelector(namespace) },
  ...(process === undefined
    ? {}
    : { podSelector: { matchLabels: instanceOf(process) } }),
});

/**
 * Every pod that carries the consumer label of a surface, in any namespace
 * deploy-kit manages: the label is rendered only from an edge the union
 * resolved (spec/v1/16-dependencies.md#the-consumer-label).
 */
const consumerPeerOf = (consumes: string): PolicyPeer => ({
  namespaceSelector: { matchLabels: managedOnly() },
  podSelector: { matchLabels: consumerLabelsOf([consumes]) },
});

/**
 * Flux's notification controller is no Process: nothing renders it, and its
 * pods carry the labels Flux's own install gives them, of which `app` names
 * the controller.
 */
const fluxPeerOf = (namespace: string, controller: string): PolicyPeer => ({
  namespaceSelector: { matchLabels: namespaceSelector(namespace) },
  podSelector: { matchLabels: { app: controller } },
});

type Mesh = ResolvedApplicationDocument["mesh"];

/**
 * The ports a rule admits: the application port and, in an enrolled
 * namespace, the tunnel port an enrolled peer arrives or leaves on instead
 * (spec/v1/16-dependencies.md#the-mesh-tunnel).
 */
const portsOf = (port: number, mesh: Mesh): PolicyPort[] =>
  mesh === undefined ? [tcp(port)] : [tcp(port), tcp(mesh.tunnelPort)];

/** An egress peer's ports: the cluster's DNS on UDP and TCP, outside the mesh; any other through it. */
const egressPortsOf = (
  peer: { readonly rule: string; readonly port: number },
  mesh: Mesh,
): PolicyPort[] =>
  peer.rule === DNS
    ? [{ protocol: "UDP" as const, port: peer.port }, tcp(peer.port)]
    : portsOf(peer.port, mesh);

/** Each port the kubelet probes the Process on, once, in probe order. */
const probePortsOf = ({
  readiness,
  liveness,
  startup,
}: ResolvedProcess): number[] => [
  ...new Set(
    [readiness, liveness, startup].flatMap((probe) =>
      probe === undefined ? [] : ["tcp" in probe ? probe.tcp : probe.port],
    ),
  ),
];

/** The rule that admits the kubelet's probes from the address the mesh rewrites them to. */
function probeRulesOf(
  process: ResolvedProcess,
  { probeSource }: NonNullable<Mesh>,
): { from: PolicyRange[]; ports: PolicyPort[] }[] {
  const ports = probePortsOf(process);
  return ports.length === 0
    ? []
    : [{ from: [{ ipBlock: { cidr: probeSource } }], ports: ports.map(tcp) }];
}

function policyOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): NetworkPolicy {
  const { mesh } = application;
  const admitted = (process.ingress ?? []).map((peer) => ({
    from: [
      peer.rule === "consumer"
        ? consumerPeerOf(peer.consumes)
        : peer.rule === "flux-events"
          ? fluxPeerOf(peer.namespace, peer.process)
          : peerOf(peer.namespace, peer.process),
    ],
    ports: portsOf(peer.port, mesh),
  }));
  // A client off the cluster, on each port an L4 Address carries to the
  // Process: the `Local` policy keeps its address, which may be any.
  // A missing list and an empty one admit the same nothing.
  // Stryker disable next-line ArrayDeclaration
  const l4 = (process.l4Exposure ?? []).flatMap(({ ports }) =>
    ports.map(({ protocol, targetPort }) => ({
      from: [{ ipBlock: { cidr: ANY_IPV4 } }],
      ports: [
        {
          protocol: protocol === "udp" ? ("UDP" as const) : ("TCP" as const),
          port: targetPort,
        },
      ],
    })),
  );
  // In an enrolled namespace the kubelet's probes arrive from the address the
  // mesh rewrites them to. A client off the cluster never arrives through the
  // mesh tunnel, so its rule carries none.
  const probes = mesh === undefined ? [] : probeRulesOf(process, mesh);
  const ingress = [...admitted, ...l4, ...probes];
  // A missing list and an empty one admit the same nothing.
  // Stryker disable next-line ArrayDeclaration
  const edges = (process.dependencies ?? []).flatMap((edge) =>
    (edge.peers ?? []).map((peer) => ({
      to: [peerOf(peer.namespace, peer.process)],
      ports: portsOf(peer.port, mesh),
    })),
  );
  // The baseline admits UDP and TCP alike, since the cluster's DNS answers on
  // both; only its peers other than DNS are reached through the mesh.
  const baseline = (process.egress ?? []).map((peer) => ({
    to: [peerOf(peer.namespace, peer.process)],
    ports: [
      { protocol: "UDP" as const, port: peer.port },
      tcp(peer.port),
      ...(mesh === undefined || peer.rule === DNS
        ? []
        : [tcp(mesh.tunnelPort)]),
    ],
  }));
  // Where the Kubernetes API answers, for a Process that holds access to it:
  // an address, because the API server is no pod a selector reaches.
  // A missing block and an empty list admit the same nowhere.
  // Stryker disable next-line ArrayDeclaration
  const api = (process.api?.server ?? []).map(({ cidr, port }) => ({
    to: [{ ipBlock: { cidr } }],
    ports: [tcp(port)],
  }));
  // Public IPv4 on every port, for a Process that declares internet egress.
  const internet =
    process.internetEgress === undefined
      ? []
      : [{ to: [{ ipBlock: { cidr: ANY_IPV4, except: [...NOT_PUBLIC] } }] }];
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: process.name,
      namespace: application.namespace,
      labels: labelsOf(process, application.id),
    },
    spec: {
      podSelector: { matchLabels: instanceOf(process.name) },
      policyTypes: ["Ingress", "Egress"],
      ...(ingress.length === 0 ? {} : { ingress }),
      egress: [...edges, ...baseline, ...api, ...internet],
    },
  };
}

type Backup = NonNullable<
  NonNullable<ResolvedProcess["volumes"]>[number]["backup"]
>;

/** The cluster's DNS answers on UDP, and on TCP for a truncated response. */
const DNS = "cluster-dns";

/** Each value once, the first time it is met: two backups of one Process share their peers. */
const distinct = <T>(values: readonly T[]): T[] => {
  const met = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (met.has(key)) return false;
    met.add(key);
    return true;
  });
};

/**
 * A backup identity's own policy. Every backup of a Process runs as the one
 * identity, so the policy admits what all of them need: the Process they dump,
 * the cluster's DNS and, for each that copies off-cluster, the ranges its
 * destination is at. Nothing reaches the identity's pods.
 */
function backupPolicyOf(
  backups: readonly [Backup, ...Backup[]],
  application: ResolvedApplicationDocument,
): NetworkPolicy {
  const [{ identity }] = backups;
  const peers = distinct(backups.flatMap(({ egress }) => egress)).map(
    (peer) => ({
      to: [peerOf(peer.namespace, peer.process)],
      ports: egressPortsOf(peer, application.mesh),
    }),
  );
  const ranges = distinct(
    // A missing list and an empty one admit the same nowhere.
    // Stryker disable next-line ArrayDeclaration
    backups.flatMap(({ destinations }) => destinations ?? []),
  ).map(({ cidr, port }) => ({
    to: [{ ipBlock: { cidr } }],
    ports: [tcp(port)],
  }));
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: identity,
      namespace: application.namespace,
      labels: labelsOf({ name: identity, runtime: "none" }, application.id),
    },
    spec: {
      podSelector: { matchLabels: instanceOf(identity) },
      policyTypes: ["Ingress", "Egress"],
      egress: [...peers, ...ranges],
    },
  };
}

/** One policy per backup identity: a Process's backups run as one, whatever it backs up. */
function backupPoliciesOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): NetworkPolicy[] {
  // A missing list and an empty one hold no backup alike.
  // Stryker disable next-line ArrayDeclaration
  const [first, ...rest] = (process.volumes ?? []).flatMap(({ backup }) =>
    backup === undefined ? [] : [backup],
  );
  return first === undefined
    ? []
    : [backupPolicyOf([first, ...rest], application)];
}

/**
 * The Vault policy job's own policy, beside its objects: egress to the Secret
 * Store and to the cluster's DNS, and nothing reaches it. A catalog method's
 * is the same shape, with its datastore among its peers.
 */
export function renderPolicyJobPolicy(
  job: ResolvedPolicyJob | ResolvedCatalogJob,
  file: string,
  directory: string,
): Deliverable {
  const policy: NetworkPolicy = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: job.identity,
      namespace: job.namespace,
      labels: labelsOf({ name: job.identity, runtime: "none" }, job.identity),
    },
    spec: {
      podSelector: { matchLabels: instanceOf(job.identity) },
      policyTypes: ["Ingress", "Egress"],
      egress: job.egress.map((peer) => ({
        to: [peerOf(peer.namespace, peer.process)],
        ports: egressPortsOf(peer, job.mesh),
      })),
    },
  };
  return {
    path: `${directory}/${file}`,
    adapter: ADAPTER,
    objects: [policy],
  };
}

/**
 * The migration identity's own policy
 * (spec/v1/16-dependencies.md#the-migration-identitys-policy): what its plan
 * admits, and nothing in. Its Jobs' pods carry the identity as their instance.
 */
function migrationPoliciesOf(
  application: ResolvedApplicationDocument,
): NetworkPolicy[] {
  const plan = application.migration;
  if (plan === undefined) return [];
  return [
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: plan.identity,
        namespace: application.namespace,
        labels: labelsOf(
          { name: plan.identity, runtime: "none" },
          application.id,
        ),
      },
      spec: {
        podSelector: { matchLabels: instanceOf(plan.identity) },
        policyTypes: ["Ingress", "Egress"],
        egress: plan.egress.map((peer) => ({
          to: [peerOf(peer.namespace, peer.process)],
          ports: egressPortsOf(peer, application.mesh),
        })),
      },
    },
  ];
}

export function renderNetworking(project: ResolvedProject): Deliverable[] {
  const [first] = project.applications;
  const namespace = (first as ResolvedApplicationDocument).namespace;
  const denyAll: NetworkPolicy = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: { name: "default-deny", namespace, labels: managedOnly() },
    spec: {
      podSelector: { matchLabels: {} },
      policyTypes: ["Ingress", "Egress"],
    },
  };
  return [
    {
      path: `${projectDirectory(project.project)}/networkpolicy.yaml`,
      adapter: ADAPTER,
      objects: [denyAll],
    },
    ...project.applications.map((application): Deliverable => ({
      path: `${applicationDirectory(project.project, application.id)}/networkpolicy.yaml`,
      adapter: ADAPTER,
      objects: [
        ...application.processes.flatMap((process) => [
          policyOf(process, application),
          ...backupPoliciesOf(process, application),
        ]),
        ...migrationPoliciesOf(application),
      ],
    })),
  ];
}
