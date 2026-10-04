// The `networking` adapter (spec/v1/16-dependencies.md#network-policy): one
// namespace-wide default-deny per project, per Process the policy its derived
// allow set and the baseline admit, and per backup identity the policy its
// backup plan admits, every peer and every port read off the projection.
import type { ResolvedProject } from "../../model/resolution.ts";
import type {
  ResolvedApplicationDocument,
  ResolvedProcess,
} from "../../model/resolved-deployment.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type {
  NetworkPolicy,
  PolicyPeer,
  PolicyPort,
} from "../../objects/kubernetes.ts";
import {
  instanceOf,
  labelsOf,
  managedOnly,
  namespaceSelector,
} from "../shared/labels.ts";
import { applicationDirectory, projectDirectory } from "../shared/paths.ts";

export const ADAPTER = "networking";

const tcp = (port: number): PolicyPort => ({ protocol: "TCP", port });

const peerOf = (
  namespace: string,
  process: string | undefined,
): PolicyPeer => ({
  namespaceSelector: { matchLabels: namespaceSelector(namespace) },
  ...(process === undefined
    ? {}
    : { podSelector: { matchLabels: instanceOf(process) } }),
});

function policyOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): NetworkPolicy {
  const ingress = (process.ingress ?? []).map((peer) => ({
    from: [peerOf(peer.namespace, peer.process)],
    ports: [tcp(peer.port)],
  }));
  // A missing list and an empty one admit the same nothing.
  // Stryker disable next-line ArrayDeclaration
  const edges = (process.dependencies ?? []).flatMap((edge) =>
    (edge.peers ?? []).map((peer) => ({
      to: [peerOf(peer.namespace, peer.process)],
      ports: [tcp(peer.port)],
    })),
  );
  // The cluster's DNS answers on UDP, and on TCP for a truncated response.
  const baseline = (process.egress ?? []).map((peer) => ({
    to: [peerOf(peer.namespace, peer.process)],
    ports: [{ protocol: "UDP" as const, port: peer.port }, tcp(peer.port)],
  }));
  // Where the Kubernetes API answers, for a Process that holds access to it:
  // an address, because the API server is no pod a selector reaches.
  // A missing block and an empty list admit the same nowhere.
  // Stryker disable next-line ArrayDeclaration
  const api = (process.api?.server ?? []).map(({ cidr, port }) => ({
    to: [{ ipBlock: { cidr } }],
    ports: [tcp(port)],
  }));
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
      egress: [...edges, ...baseline, ...api],
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
      ports:
        peer.rule === DNS
          ? [{ protocol: "UDP" as const, port: peer.port }, tcp(peer.port)]
          : [tcp(peer.port)],
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
      objects: application.processes.flatMap((process) => [
        policyOf(process, application),
        ...backupPoliciesOf(process, application),
      ]),
    })),
  ];
}
