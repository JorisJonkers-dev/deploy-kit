// The priority classes (spec/v1/14-platform-intent.md#priority): the two the
// Platform document declares, rendered once, estate-scoped, since a class is
// the cluster's and every Project's pods name one.
import type { PlatformIntentDocument } from "../../model/platform-intent.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type { PriorityClass } from "../../objects/kubernetes.ts";
import { managedOnly } from "../shared/labels.ts";
import { PRIORITY_CLASSES_DIRECTORY } from "../shared/paths.ts";
// Attributed to this adapter, which speaks Kubernetes' scheduling vocabulary.
import { ADAPTER } from "./render.ts";

export function renderPriorityClasses(
  policy: PlatformIntentDocument["priority"],
): Deliverable[] {
  if (policy === undefined) return [];
  const classOf = (
    { name, value }: { readonly name: string; readonly value: number },
    description: string,
  ): PriorityClass => ({
    apiVersion: "scheduling.k8s.io/v1",
    kind: "PriorityClass",
    metadata: { name, labels: managedOnly() },
    value,
    globalDefault: false,
    preemptionPolicy: "PreemptLowerPriority",
    description,
  });
  return [
    {
      path: `${PRIORITY_CLASSES_DIRECTORY}/priorityclasses.yaml`,
      adapter: ADAPTER,
      objects: [
        classOf(policy.data, "A datastore: it schedules before what reads it."),
        classOf(
          policy.critical,
          "The foundation and the Applications the platform names: they keep scheduling under pressure.",
        ),
      ],
    },
  ];
}
