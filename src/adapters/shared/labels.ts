// The fixed label set (spec/v1/10-project-intent.md#the-label-set): every
// rendered Process carries it, and every selector but a disruption budget's
// names `instance`, which Flagger copies unchanged onto the primary.
import type { Labels } from "../../objects/kubernetes.ts";

const MANAGED_BY = { "app.kubernetes.io/managed-by": "deploy-kit" } as const;

/** What an estate- or project-scoped object carries: it belongs to no Process. */
export const managedOnly = (): Labels => ({ ...MANAGED_BY });

/** What an object of the Application itself carries: it belongs to no one Process of it. */
export const applicationLabels = (application: string): Labels => ({
  "app.kubernetes.io/part-of": application,
  ...MANAGED_BY,
});

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

/** The label a pod carries for each surface it consumes, which the provider's policy admits. */
export const consumerLabelsOf = (consumes: readonly string[]): Labels =>
  Object.fromEntries(
    consumes.map((consumed) => [`${CONSUMER_LABEL}${consumed}`, "true"]),
  );

/** The prefix of every consumer label (spec/v1/16-dependencies.md#the-consumer-label). */
export const CONSUMER_LABEL = "consumes.deploy-kit.jorisjonkers.dev/";

/** The selector every rendered object but a disruption budget uses. */
export const instanceOf = (process: string): Labels => ({
  "app.kubernetes.io/instance": process,
});

/** How a namespace is selected: by the name label the substrate sets on it. */
export const namespaceSelector = (namespace: string): Labels => ({
  "kubernetes.io/metadata.name": namespace,
});

/** The annotation that names one container's software version, by container name. */
export const IMAGE_VERSION_ANNOTATION = "image.jorisjonkers.dev/";

type Annotation = readonly [string, string];
// No two containers in a pod share a name, so `<=` would order the same list.
// Stryker disable next-line EqualityOperator
const byKey = ([a]: Annotation, [b]: Annotation): number => (a < b ? -1 : 1);

/**
 * A pod template's metadata: its labels and, for each container whose image
 * the lock records a version for, that version, sorted by container. Never a
 * label: nothing selects on it, and a label cannot hold every version string.
 */
export const podMetadataOf = (
  labels: Labels,
  versions: readonly (readonly [string, string | undefined])[],
): { readonly labels: Labels; readonly annotations?: Labels } => {
  const known = versions
    .filter(
      (entry): entry is readonly [string, string] => entry[1] !== undefined,
    )
    .map(
      ([container, version]) =>
        [`${IMAGE_VERSION_ANNOTATION}${container}`, version] as const,
    )
    .sort(byKey);
  return known.length === 0
    ? { labels }
    : { labels, annotations: Object.fromEntries(known) };
};
