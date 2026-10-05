// What a count above one derives
// (spec/v1/10-project-intent.md#replicas-and-the-disruption-budget,
// spec/v1/30-deliverables.md#flagger-ready-objects): for a blue-green Process
// the autoscaler that holds the count Flagger would otherwise reset, and for
// every Process the budget that keeps a drain from taking more than one pod.
import type {
  ResolvedApplicationDocument,
  ResolvedProcess,
} from "../../model/resolved-deployment.ts";
import type {
  HorizontalPodAutoscaler,
  PodDisruptionBudget,
} from "../../objects/kubernetes.ts";
import { instanceOf, labelsOf } from "../shared/labels.ts";

/** Flagger switches a blue-green Process; any other is replaced by its own Deployment. */
export const blueGreen = (process: ResolvedProcess): boolean =>
  process.switchover === "blue-green";

/** Whether a Process runs more than the one derived replica. */
export const scaled = (process: ResolvedProcess): boolean =>
  process.replicas > 1;

/** Whether an autoscaler holds the Process's count: Flagger owns its Deployment's. */
export const autoscaled = (process: ResolvedProcess): boolean =>
  blueGreen(process) && scaled(process);

/** An autoscaler with equal bounds: the count, held where Flagger reads it. */
export const autoscalerOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): HorizontalPodAutoscaler => ({
  apiVersion: "autoscaling/v2",
  kind: "HorizontalPodAutoscaler",
  metadata: {
    name: process.name,
    namespace: application.namespace,
    labels: labelsOf(process, application.id),
  },
  spec: {
    scaleTargetRef: {
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: process.name,
    },
    minReplicas: process.replicas,
    maxReplicas: process.replicas,
  },
});

/**
 * The budget of a Process above one replica. A blue-green one's selects the
 * primary by the name Flagger gives it, which is what serves between
 * releases; any other's selects its own pods.
 */
export const budgetOf = (
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
): PodDisruptionBudget => ({
  apiVersion: "policy/v1",
  kind: "PodDisruptionBudget",
  metadata: {
    name: process.name,
    namespace: application.namespace,
    labels: labelsOf(process, application.id),
  },
  spec: {
    maxUnavailable: 1,
    selector: {
      matchLabels: blueGreen(process)
        ? { "app.kubernetes.io/name": `${process.name}-primary` }
        : instanceOf(process.name),
    },
  },
});
