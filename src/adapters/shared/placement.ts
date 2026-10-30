// Where a pod may be scheduled, as the nodes layer 2 resolved for it, by name
// (spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection).
import { FORCE_ANNOTATION } from "../../model/pin-annotations.ts";
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

/**
 * An hourly run's retries: a few, and a deadline inside the hour. Its pod
 * template is frozen when the run is created, so a run whose hashed ConfigMap
 * a later render pruned can never succeed, and under `Forbid` would hold off
 * every later run; this one gives up before the next is due.
 */
export const WITHIN_THE_HOUR = {
  backoffLimit: 6,
  activeDeadlineSeconds: 3000,
} as const;

/**
 * The mark on a one-shot Job that the applier recreates rather than updates.
 * A Job's pod template never changes once created, and its name digests only
 * what it is handed, so a change the render alone makes to the template (a
 * hardening control, a label) would leave every later apply refused.
 */
export const RECREATED = { [FORCE_ANNOTATION]: "Enabled" } as const;
