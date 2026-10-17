// Where a pod may be scheduled, as the nodes layer 2 resolved for it, by name
// (spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection).
import type { NodeAffinity } from "../../objects/kubernetes.ts";

/** The nodes a pod may land on, required and never preferred. */
export const nodeAffinityOf = (nodes: readonly string[]): NodeAffinity => ({
  nodeAffinity: {
    requiredDuringSchedulingIgnoredDuringExecution: {
      nodeSelectorTerms: [
        {
          matchExpressions: [
            { key: "kubernetes.io/hostname", operator: "In", values: nodes },
          ],
        },
      ],
    },
  },
});

/**
 * A Job's retries, where it retries until one attempt succeeds: the largest
 * `backoffLimit` the API holds, since it has no unbounded spelling. The delay
 * between attempts is the controller's, capped at six minutes.
 */
export const UNTIL_SUCCEEDED = 2_147_483_647;
