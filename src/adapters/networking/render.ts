// The `networking` adapter (spec/v1/16-dependencies.md#network-policy): one
// namespace-wide default-deny per project, per Process the policy its derived
// allow set and the baseline admit, and per backup identity the policy its
// backup plan admits, every peer and every port read off the projection.
import type { ResolvedProject } from "../../model/resolution.ts";
import { SPAWN_LABEL } from "../../model/spawn-label.ts";
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
  MEMBER_LABEL,
  labelsOf,
  managedOnly,
  namespaceSelector,
} from "../shared/labels.ts";
import { applicationDirectory, projectDirectory } from "../shared/paths.ts";
import { namespaceOf } from "../../model/runtime-profiles.ts";

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
 * Every gate member's pods, in any namespace deploy-kit manages: the label is
 * rendered only on a Process the release-gate inputs name
 * (spec/v1/16-dependencies.md#the-member-label).
 */
const membersPeer: PolicyPeer = {
  namespaceSelector: { matchLabels: managedOnly() },
  podSelector: { matchLabels: { ...MEMBER_LABEL } },
};

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
  const moving = moveRulesOf(process, application);
  const ingress = [...admitted, ...l4, ...probes, ...moving.ingress];
  // A missing list and an empty one admit the same nothing.
  // Stryker disable next-line ArrayDeclaration
  const edges = (process.dependencies ?? []).flatMap((edge) =>
    (edge.peers ?? []).map((peer) => ({
      to: [peerOf(peer.namespace, peer.process)],
      ports: portsOf(peer.port, mesh),
    })),
  );
  // The pods it makes from its templates, on the surfaces they serve it.
  // A Process that makes no pod reaches none.
  // Stryker disable next-line ArrayDeclaration
  const spawned = (process.spawns ?? []).flatMap((spawn) =>
    spawn.surfaces === undefined
      ? []
      : [
          {
            to: [
              {
                namespaceSelector: {
                  matchLabels: namespaceSelector(application.namespace),
                },
                podSelector: { matchLabels: { [SPAWN_LABEL]: spawn.selector } },
              },
            ],
            ports: spawn.surfaces.flatMap(({ port }) => portsOf(port, mesh)),
          },
        ],
  );
  // The baseline admits UDP and TCP alike, since the cluster's DNS answers on
  // both; only its peers other than DNS are reached through the mesh.
  const baseline = (process.egress ?? []).map((peer) =>
    // The gate's own requests reach every member's pods, on whichever port
    // the member's own policy admits them.
    peer.rule === "gate-members"
      ? { to: [membersPeer] }
      : {
          to: [peerOf(peer.namespace, peer.process)],
          ports: [
            { protocol: "UDP" as const, port: peer.port },
            tcp(peer.port),
            ...(mesh === undefined || peer.rule === DNS
              ? []
              : [tcp(mesh.tunnelPort)]),
          ],
        },
  );
  // Where the Kubernetes API answers, for a Process that holds access to it:
  // an address, because the API server is no pod a selector reaches.
  // A missing block and an empty list admit the same nowhere.
  // Stryker disable next-line ArrayDeclaration
  const api = (process.api?.server ?? []).map(({ cidr, port }) => ({
    to: [{ ipBlock: { cidr } }],
    ports: [tcp(port)],
  }));
  // The nameservers a Process that serves DNS resolves through, by address:
  // they are off the cluster, and answer on UDP and on TCP.
  const upstream =
    process.nameservers === undefined
      ? []
      : [
          {
            to: process.nameservers.map((address) => ({
              ipBlock: { cidr: `${address}/32` },
            })),
            ports: [
              { protocol: "UDP" as const, port: DNS_PORT },
              tcp(DNS_PORT),
            ],
          },
        ];
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
      egress: [
        ...edges,
        ...spawned,
        ...baseline,
        ...moving.egress,
        ...upstream,
        ...api,
        ...internet,
      ],
    },
  };
}

/**
 * What an open Move admits between a Process's Instances and its step Jobs
 * (spec/v1/16-dependencies.md#the-derived-allow-set): every Instance carries
 * the Process's label, so one rule reaches both. The Jobs reach every
 * Instance on the engine's surface, and each Instance reaches the other on
 * it, wherever the method syncs from.
 */
function moveRulesOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): {
  ingress: { from: PolicyPeer[]; ports: PolicyPort[] }[];
  egress: { to: PolicyPeer[]; ports: PolicyPort[] }[];
} {
  const method = process.move?.method;
  if (method === undefined) return { ingress: [], egress: [] };
  const ports = portsOf(method.port, application.mesh);
  const instances = method.egress
    .filter(({ rule }) => rule === "datastore")
    .map((peer) => peerOf(peer.namespace, peer.process));
  return {
    ingress: [
      {
        from: [
          peerOf(
            application.namespace,
            (process.move as NonNullable<ResolvedProcess["move"]>).identity,
          ),
          ...instances,
        ],
        ports,
      },
    ],
    egress: [{ to: instances, ports }],
  };
}

/**
 * The move identity's own policy: what its Jobs reach, the Instances on the
 * engine's surface, the store and the cluster's DNS, and where the
 * Kubernetes API answers, which the flip writes to; and nothing in.
 */
function movePolicyOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): NetworkPolicy[] {
  const move = process.move;
  if (move?.method === undefined) return [];
  return [
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: move.identity,
        namespace: application.namespace,
        labels: labelsOf(
          { name: move.identity, runtime: "none" },
          application.id,
        ),
      },
      spec: {
        podSelector: { matchLabels: instanceOf(move.identity) },
        policyTypes: ["Ingress", "Egress"],
        egress: [
          ...move.method.egress.map((peer) => ({
            to: [peerOf(peer.namespace, peer.process)],
            ports: egressPortsOf(peer, application.mesh),
          })),
          // A platform that says where the API answers is one a flip reaches.
          // Stryker disable next-line ArrayDeclaration
          ...(move.server ?? []).map(({ cidr, port }) => ({
            to: [{ ipBlock: { cidr } }],
            ports: [tcp(port)],
          })),
        ],
      },
    },
  ];
}

type Spawn = NonNullable<ResolvedProcess["spawns"]>[number];

/**
 * The policy of the pods a Process makes from one spawn template
 * (spec/v1/16-dependencies.md#spawn-templates): named for the Process and the
 * template, it selects them by their label. Only the Process that made them
 * reaches them, on the surfaces the template serves; they reach their edges,
 * the cluster's DNS and, where the template says so, the internet.
 */
function spawnPolicyOf(
  process: ResolvedProcess,
  spawn: Spawn,
  application: ResolvedApplicationDocument,
): NetworkPolicy {
  const mesh = application.mesh;
  // A template that serves nothing is reached by nothing.
  // Stryker disable next-line ArrayDeclaration
  const surfaces = spawn.surfaces ?? [];
  const ingress =
    surfaces.length === 0
      ? []
      : [
          {
            from: [peerOf(application.namespace, process.name)],
            ports: surfaces.flatMap(({ port }) => portsOf(port, mesh)),
          },
        ];
  // A template with no edge and one with an empty list reach nothing alike.
  // Stryker disable next-line ArrayDeclaration
  const edges = (spawn.dependencies ?? []).flatMap((edge) =>
    // An edge to a provider off the cluster has no peer a selector reaches.
    // Stryker disable next-line ArrayDeclaration
    (edge.peers ?? []).map((peer) => ({
      to: [peerOf(peer.namespace, peer.process)],
      ports: portsOf(peer.port, mesh),
    })),
  );
  const baseline = spawn.egress.map((peer) => ({
    to: [peerOf(peer.namespace, peer.process)],
    ports: egressPortsOf(peer, mesh),
  }));
  const internet =
    spawn.internetEgress === undefined
      ? []
      : [{ to: [{ ipBlock: { cidr: ANY_IPV4, except: [...NOT_PUBLIC] } }] }];
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: spawn.selector,
      namespace: application.namespace,
      labels: labelsOf(process, application.id),
    },
    spec: {
      podSelector: { matchLabels: { [SPAWN_LABEL]: spawn.selector } },
      policyTypes: ["Ingress", "Egress"],
      ...(ingress.length === 0 ? {} : { ingress }),
      egress: [...edges, ...baseline, ...internet],
    },
  };
}

type Backup = NonNullable<
  NonNullable<ResolvedProcess["volumes"]>[number]["backup"]
>;

/** The cluster's DNS answers on UDP, and on TCP for a truncated response. */
const DNS = "cluster-dns";

/** The port every resolver answers on. */
const DNS_PORT = 53;

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
  const namespace = namespaceOf(project.project);
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
          // A Process that makes no pod has no template to police.
          // Stryker disable next-line ArrayDeclaration
          ...(process.spawns ?? []).map((spawn) =>
            spawnPolicyOf(process, spawn, application),
          ),
          ...backupPoliciesOf(process, application),
          ...movePolicyOf(process, application),
        ]),
        ...migrationPoliciesOf(application),
      ],
    })),
  ];
}
