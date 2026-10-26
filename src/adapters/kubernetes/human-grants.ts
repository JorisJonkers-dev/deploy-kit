// The Human Grants (spec/v1/14-platform-intent.md#human-grants): each group the
// Platform document grants a built-in cluster role is bound to it by one
// ClusterRoleBinding, cluster-wide. A grant is the platform's and no Project's,
// so the bindings are estate-scoped, and no Application's removal drops one.
import type { HumanGrant } from "../../model/platform-intent.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type { ClusterRoleBinding } from "../../objects/kubernetes.ts";
import { managedOnly } from "../shared/labels.ts";
import { HUMAN_GRANTS_DIRECTORY } from "../shared/paths.ts";
// Attributed to this adapter, which speaks Kubernetes' RBAC vocabulary.
import { ADAPTER } from "./render.ts";

/** The binding a grant renders, named for its group and its role. */
export const humanGrantNameOf = ({ group, clusterRole }: HumanGrant): string =>
  `human:${group}:${clusterRole}`;

export function renderHumanGrants(
  grants: readonly HumanGrant[],
): Deliverable[] {
  if (grants.length === 0) return [];
  const bindings = grants.map((grant): ClusterRoleBinding => ({
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRoleBinding",
    metadata: { name: humanGrantNameOf(grant), labels: managedOnly() },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "ClusterRole",
      name: grant.clusterRole,
    },
    subjects: [
      {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "Group",
        name: grant.group,
      },
    ],
  }));
  return [
    {
      path: `${HUMAN_GRANTS_DIRECTORY}/clusterrolebindings.yaml`,
      adapter: ADAPTER,
      objects: bindings,
    },
  ];
}
