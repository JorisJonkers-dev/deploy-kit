// The `networking` adapter (spec/v1/16-dependencies.md#network-policy): one
// namespace-wide default-deny per project, and per Process the policy its
// derived allow set and the baseline admit, every peer and every port read off
// the projection.
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
      egress: [...edges, ...baseline],
    },
  };
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
      objects: application.processes.map((process) =>
        policyOf(process, application),
      ),
    })),
  ];
}
