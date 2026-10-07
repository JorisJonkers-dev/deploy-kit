// A pin source (spec/v1/55-delivery.md#rendered-artifacts-and-pins): the
// committed Flux objects that put one artifact on the estate path. An
// `OCIRepository` names the artifact by digest and says whose keyless
// signature it accepts, and one Kustomization per Reconcile Unit applies that
// unit's path inside it, after the units it follows. Composition writes the
// file whenever the artifact's pin moves, the first delivery among them.
import type { FluxKustomization, OciRepository } from "../../objects/custom.ts";
import type { RenderedObject } from "../../objects/deliverable.ts";
import { managedOnly } from "../shared/labels.ts";

/** One Reconcile Unit of an artifact: the path it applies, and the units that must be Ready first. */
export interface SourceUnit {
  readonly name: string;
  readonly path: string;
  readonly after: readonly string[];
}

/** What the Platform document says of the path every pin is on. */
export interface FluxFacts {
  /** The namespace Flux's own objects live in. */
  readonly namespace: string;
  /** Where each artifact is published, one below it per Project. */
  readonly repository: string;
  readonly signer: { readonly issuer: string; readonly subject: string };
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

/** The name a Project's source carries; the estate's own is {@link ESTATE_SOURCE}. */
export const sourceOf = (project: string): string => `project-${project}`;

/** The estate-scoped artifact's source. No Project's can be named so: a Project's carries a prefix. */
export const ESTATE_SOURCE = "estate";

export function renderPinSource(
  source: string,
  artifact: string,
  units: readonly SourceUnit[],
  flux: FluxFacts,
): RenderedObject[] {
  const repository: OciRepository = {
    apiVersion: "source.toolkit.fluxcd.io/v1",
    kind: "OCIRepository",
    metadata: {
      name: source,
      namespace: flux.namespace,
      labels: managedOnly(),
    },
    spec: {
      interval: INTERVAL,
      url: `oci://${flux.repository}/${artifact}`,
      ref: { digest: UNPUBLISHED },
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
    ...units.map(({ name, path, after }): FluxKustomization => ({
      apiVersion: "kustomize.toolkit.fluxcd.io/v1",
      kind: "Kustomization",
      metadata: { name, namespace: flux.namespace, labels: managedOnly() },
      spec: {
        interval: INTERVAL,
        prune: true,
        // A unit is Ready when what it applied is: a Job that fails holds
        // every unit that follows it.
        wait: true,
        sourceRef: { kind: "OCIRepository", name: source },
        path: `./${path}`,
        ...(after.length === 0
          ? {}
          : { dependsOn: after.map((unit) => ({ name: unit })) }),
      },
    })),
  ];
}
