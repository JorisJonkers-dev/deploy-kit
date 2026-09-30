// The fixed label set (spec/v1/10-project-intent.md#the-label-set): every
// rendered Process carries it, and every selector but a disruption budget's
// names `instance`, which Flagger copies unchanged onto the primary.
import type { Labels } from "../../objects/kubernetes.ts";

const MANAGED_BY = { "app.kubernetes.io/managed-by": "deploy-kit" } as const;

/** What an estate- or project-scoped object carries: it belongs to no Process. */
export const managedOnly = (): Labels => ({ ...MANAGED_BY });

/** The five labels of one Process of one Application. */
export const labelsOf = (
  process: { readonly name: string; readonly runtime: string },
  application: string,
): Labels => ({
  "app.kubernetes.io/name": process.name,
  "app.kubernetes.io/instance": process.name,
  "app.kubernetes.io/part-of": application,
  ...MANAGED_BY,
  "app.kubernetes.io/component": process.runtime,
});

/** The selector every rendered object but a disruption budget uses. */
export const instanceOf = (process: string): Labels => ({
  "app.kubernetes.io/instance": process,
});

/** How a namespace is selected: by the name label the substrate sets on it. */
export const namespaceSelector = (namespace: string): Labels => ({
  "kubernetes.io/metadata.name": namespace,
});
