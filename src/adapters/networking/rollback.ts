// A Rollback's database dump's policies (spec/v1/30-deliverables.md#a-rollbacks-backup):
// its pods reach the datastore's surface and the cluster's DNS and nothing
// else, nothing reaches them, and the datastore admits them on that surface.
// Both leave the render with the request.
import type { Deliverable } from "../../objects/deliverable.ts";
import type { NetworkPolicy } from "../../objects/kubernetes.ts";
import { instanceOf, labelsOf } from "../shared/labels.ts";
import { ROLLBACK_BACKUPS_DIRECTORY } from "../shared/paths.ts";
import type { RollbackDump } from "../shared/rollback-dump.ts";
import { ADAPTER, peerOf, tcp } from "./render.ts";

/** The cluster's DNS, which every pod resolves its peers through. */
const DNS = { namespace: "kube-system", port: 53 };

export function renderRollbackPolicies(
  project: string,
  dump: RollbackDump,
): Deliverable[] {
  const labels = labelsOf(
    { name: dump.instance, runtime: "none" },
    dump.application,
  );
  const policies: NetworkPolicy[] = [
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: { name: dump.instance, namespace: dump.namespace, labels },
      spec: {
        podSelector: { matchLabels: instanceOf(dump.instance) },
        policyTypes: ["Ingress", "Egress"],
        egress: [
          {
            to: [peerOf(dump.datastore.namespace, dump.datastore.process)],
            ports: [tcp(dump.port)],
          },
          {
            to: [peerOf(DNS.namespace, undefined)],
            ports: [{ protocol: "UDP", port: DNS.port }, tcp(DNS.port)],
          },
        ],
      },
    },
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: `${dump.instance}-ingress`,
        namespace: dump.datastore.namespace,
        labels,
      },
      spec: {
        podSelector: { matchLabels: instanceOf(dump.datastore.process) },
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [peerOf(dump.namespace, dump.instance)],
            ports: [tcp(dump.port)],
          },
        ],
      },
    },
  ];
  return [
    {
      path: `${ROLLBACK_BACKUPS_DIRECTORY}/${project}-networkpolicy.yaml`,
      adapter: ADAPTER,
      objects: policies,
    },
  ];
}
