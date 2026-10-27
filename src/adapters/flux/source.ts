// A pin source (spec/v1/55-delivery.md#rendered-artifacts-and-pins): the
// committed Flux objects that put one artifact on the estate path. An
// `OCIRepository` names the artifact by digest and says whose keyless
// signature it accepts, and one Kustomization per Reconcile Unit applies that
// unit's path inside it, after the units it follows. Composition writes the
// file whenever the artifact's pin moves, the first delivery among them, and
// a Project's first delivery recreates a Deployment it cannot update in place.
import {
  FORCE_ANNOTATION,
  PIN_ANNOTATIONS,
} from "../../model/pin-annotations.ts";
import type { FluxKustomization, OciRepository } from "../../objects/custom.ts";
import type { RenderedObject } from "../../objects/deliverable.ts";
import { managedOnly } from "../shared/labels.ts";

/** One Reconcile Unit of an artifact: the path it applies, and the units that must be Ready first. */
export interface SourceUnit {
  readonly name: string;
  readonly path: string;
  readonly after: readonly string[];
  /** What the unit's own metadata carries: a Project's Rollout, which Flux copies into its events. */
  readonly annotations?: Readonly<Record<string, string>>;
}

/** What the Platform document says of the path every pin is on. */
export interface FluxFacts {
  /** The namespace Flux's own objects live in. */
  readonly namespace: string;
  /** Where each artifact is published, one below it per Project. */
  readonly repository: string;
  readonly signer: { readonly issuer: string; readonly subject: string };
  /** The Secret in Flux's namespace a private repository is pulled with; none for a public one. */
  readonly pullSecret?: string | undefined;
}

/** How often a source is fetched and a unit is reconciled: one cadence, stated by the chapter. */
const INTERVAL = "10m";

/**
 * The digest a source carries until its artifact is first published. It names
 * no artifact, so a source applied before its digest is set fetches nothing:
 * an absent `ref` would fetch whatever `latest` names.
 */
export const UNPUBLISHED = `sha256:${"0".repeat(64)}`;

/**
 * Flux reads an identity as a regular expression. The Platform document states
 * one issuer and one subject, so each is matched whole and literally: an
 * unanchored `…/compose.yml@refs/heads/main` would also accept a signature
 * made on a branch named `main-anything`, and an unescaped `.` any character.
 */
const exactly = (text: string): string =>
  `^${text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}$`;

export { FORCE_ANNOTATION };

/**
 * How a unit reads a claim's health: Bound, or still waiting for its first
 * consumer. `local-path` binds a claim on that consumer's node, and a backup
 * claim's only consumer is its nightly CronJob, so a fresh Project would
 * otherwise wait for its first backup to be Ready. The scheduler names the
 * node the moment a consumer is placed, and a claim still Pending after that
 * holds the unit, as Flux's own reading of a claim would
 * (spec/v1/55-delivery.md#what-a-pin-source-holds).
 */
export const CLAIM_HEALTH = {
  apiVersion: "v1",
  kind: "PersistentVolumeClaim",
  current:
    "status.phase == 'Bound' || status.phase == 'Pending' && " +
    "!(has(metadata.annotations) && 'volume.kubernetes.io/selected-node' in metadata.annotations)",
} as const;

/**
 * The patch a Project's first delivery applies: every Deployment it holds is
 * marked for recreation. A live Deployment that the old path applied selects
 * on fewer labels than the render's, and a selector is immutable, so taking it
 * over in place is refused (spec/v1/60-setup.md#handing-over-one-project-at-a-time).
 * Nothing else is marked: a claim recreated is a claim emptied.
 */
export const RECREATE_DEPLOYMENTS = {
  patch: [
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    // With a target, the name in the patch is not read.
    "  name: any",
    "  annotations:",
    `    ${FORCE_ANNOTATION}: Enabled`,
    "",
  ].join("\n"),
  target: { kind: "Deployment" },
} as const;

export const VERSION_LABEL = "app.kubernetes.io/version";

/**
 * Label every pod template a unit applies with its release; a selector is
 * never touched. Composition writes these into a moving Project's index, in
 * the artifact itself (spec/v1/55-delivery.md#rendered-artifacts-and-pins).
 */
export const versionPatches = (version: string) => {
  const labelled = (depth: number): string[] =>
    [
      "template:",
      "  metadata:",
      "    labels:",
      `      ${VERSION_LABEL}: ${JSON.stringify(version)}`,
    ].map((line) => `${"  ".repeat(depth)}${line}`);
  return [
    {
      patch: [
        "apiVersion: apps/v1",
        "kind: Deployment",
        "metadata:",
        "  name: any",
        "spec:",
        ...labelled(1),
        "",
      ].join("\n"),
      target: { kind: "Deployment|StatefulSet|DaemonSet|Job" },
    },
    {
      patch: [
        "apiVersion: batch/v1",
        "kind: CronJob",
        "metadata:",
        "  name: any",
        "spec:",
        "  jobTemplate:",
        "    spec:",
        ...labelled(3),
        "",
      ].join("\n"),
      target: { kind: "CronJob" },
    },
  ] as const;
};

/** A Deployment a Canary targets: a gated Process's, where it is applied. */
export interface GatedDeployment {
  readonly namespace: string;
  readonly name: string;
}

/**
 * Annotate the pod template of every Deployment a Canary targets with when a
 * Retry last ran, so Flagger sees one new revision and analyses the release
 * again, and Flux, applying it as desired state, never reverts it
 * (spec/v1/55-delivery.md#pause-and-rollback). Composition writes these into
 * a Project's index, in the artifact itself, before it hashes the share.
 */
export const retryPatches = (
  retriedAt: string,
  gated: readonly GatedDeployment[],
) =>
  gated.map(({ namespace, name }) => ({
    patch: [
      "apiVersion: apps/v1",
      "kind: Deployment",
      "metadata:",
      `  name: ${name}`,
      "spec:",
      "  template:",
      "    metadata:",
      "      annotations:",
      `        ${PIN_ANNOTATIONS.retriedAt}: ${JSON.stringify(retriedAt)}`,
      "",
    ].join("\n"),
    target: { kind: "Deployment", namespace, name },
  }));

/** The name a Project's source carries; the estate's own is {@link ESTATE_SOURCE}. */
export const sourceOf = (project: string): string => `project-${project}`;

/** The estate-scoped artifact's source. No Project's can be named so: a Project's carries a prefix. */
export const ESTATE_SOURCE = "estate";

/** The estate-scoped artifact, as composition names it: no Project's name starts with an underscore. */
export const ESTATE_ARTIFACT = "_estate";

/**
 * Where an artifact is published: a Project's below the Platform document's
 * repository, and the estate-scoped one beside it, at `<repository>-estate`.
 * An OCI repository's path components start with a letter or a digit, so
 * `_estate` cannot be one, and nothing below the repository is the estate's,
 * so no Project's name can collide with it.
 */
export const artifactRepositoryOf = (
  repository: string,
  artifact: string,
): string =>
  artifact === ESTATE_ARTIFACT
    ? `${repository}-estate`
    : `${repository}/${artifact}`;

export function renderPinSource(
  source: string,
  artifact: string,
  units: readonly SourceUnit[],
  flux: FluxFacts,
  annotations: Readonly<Record<string, string>> = {},
  recreate = false,
  digest: string = UNPUBLISHED,
): RenderedObject[] {
  const repository: OciRepository = {
    apiVersion: "source.toolkit.fluxcd.io/v1",
    kind: "OCIRepository",
    metadata: {
      name: source,
      namespace: flux.namespace,
      labels: managedOnly(),
      // A Pause, a Rollback or a Retry recorded on the pin
      // (spec/v1/55-delivery.md#pause-and-rollback): a rewrite keeps it.
      ...(Object.keys(annotations).length === 0 ? {} : { annotations }),
    },
    spec: {
      interval: INTERVAL,
      url: `oci://${artifactRepositoryOf(flux.repository, artifact)}`,
      ref: { digest },
      ...(flux.pullSecret === undefined
        ? {}
        : { secretRef: { name: flux.pullSecret } }),
      verify: {
        provider: "cosign",
        matchOIDCIdentity: [
          {
            issuer: exactly(flux.signer.issuer),
            subject: exactly(flux.signer.subject),
          },
        ],
      },
    },
  };
  return [
    repository,
    ...units.map(
      ({ name, path, after, annotations: carried }): FluxKustomization => {
        // The release's label travels in the artifact, never here: a patch on
        // this Kustomization could be applied to the artifact it replaces.
        const patches = recreate ? [RECREATE_DEPLOYMENTS] : [];
        return {
          apiVersion: "kustomize.toolkit.fluxcd.io/v1",
          kind: "Kustomization",
          metadata: {
            name,
            namespace: flux.namespace,
            labels: managedOnly(),
            ...(carried === undefined ? {} : { annotations: carried }),
          },
          spec: {
            interval: INTERVAL,
            prune: true,
            // A unit is Ready when what it applied is: a Job that fails holds
            // every unit that follows it.
            wait: true,
            healthCheckExprs: [CLAIM_HEALTH],
            sourceRef: { kind: "OCIRepository", name: source },
            path: `./${path}`,
            ...(after.length === 0
              ? {}
              : { dependsOn: after.map((unit) => ({ name: unit })) }),
            ...(patches.length === 0 ? {} : { patches }),
          },
        };
      },
    ),
  ];
}
