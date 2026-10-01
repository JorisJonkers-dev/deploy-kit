// The rules the pinned inputs answer before resolution reads them
// (spec/v1/20-resolved-deployment.md#pinned-inputs): the node contract read is
// the one the Platform document pins, every image alias is locked, and every
// Process has somewhere to land. After these, resolution is total.
import type { Diagnostic } from "../model/diagnostic.ts";
import { eligibleNodes } from "../model/eligibility.ts";
import type { EffectiveProject } from "../model/effective-intent.ts";
import { migrationImage } from "../model/migration-proof.ts";
import type { PinnedSet } from "../model/resolution.ts";

interface Located {
  readonly document: string;
  readonly effective: EffectiveProject;
}

function contractRefusals(
  set: PinnedSet,
  contractDigest: string,
  platform: string,
): Diagnostic[] {
  return set.platform.metadata.nodeContract === contractDigest
    ? []
    : [
        {
          code: "E_NODE_CONTRACT_MISMATCH",
          document: platform,
          path: "/metadata/nodeContract",
          message: `the node contract read is ${contractDigest}, not the one this document pins`,
          hint: "Pin the digest of the node contract the render reads, or read the one pinned.",
        },
      ];
}

function processRefusals(set: PinnedSet, { document, effective }: Located) {
  return effective.applications.flatMap((application, a) =>
    application.processes.flatMap((process, p) => {
      const at = `/applications/${String(a)}/processes/${String(p)}`;
      const images = [
        { image: process.image, path: `${at}/image` },
        ...(process.sidecars ?? []).map(({ image }, s) => ({
          image,
          path: `${at}/sidecars/${String(s)}/image`,
        })),
      ];
      return [
        ...images
          .filter(({ image }) => !Object.hasOwn(set.imagesLock.images, image))
          .map(({ image, path }): Diagnostic => ({
            code: "E_UNLOCKED_IMAGE",
            document,
            path,
            message: `the images lock holds no entry for ${image}`,
            hint: "Lock the alias, or name one the images lock holds.",
          })),
        ...(eligibleNodes(process, set.nodeContract).length === 0
          ? [
              {
                code: "E_PLACEMENT_UNSATISFIABLE",
                document,
                path: `${at}/placement`,
                message: `no node in the node contract can hold ${process.name}`,
                hint: "Relax a placement dimension, or lower what the Process asks for.",
              },
            ]
          : []),
      ];
    }),
  );
}

/** Every backup method the platform names is an image the lock holds. */
const methodRefusals = (set: PinnedSet, platform: string): Diagnostic[] =>
  Object.entries(set.platform.engines)
    .filter(
      ([, method]) => !Object.hasOwn(set.imagesLock.images, method.backup),
    )
    .map(([engine, method]) => ({
      code: "E_UNLOCKED_IMAGE",
      document: platform,
      path: `/engines/${engine}/backup`,
      message: `the images lock holds no entry for ${method.backup}`,
      hint: "Lock the alias, or name one the images lock holds.",
    }));

/** Every Application that moves its schema with a changelog has its migration image locked. */
const migrationRefusals = (set: PinnedSet, { document, effective }: Located) =>
  effective.applications.flatMap((application, a): Diagnostic[] => {
    const image = migrationImage(application.id);
    return typeof application.migration === "object" &&
      !Object.hasOwn(set.imagesLock.images, image)
      ? [
          {
            code: "E_UNLOCKED_IMAGE",
            document,
            path: `/applications/${String(a)}/migration`,
            message: `the images lock holds no entry for ${image}`,
            hint: "Lock the migration image the Application's CI builds from the platform's runner.",
          },
        ]
      : [];
  });

/** Every rule the pinned inputs break, before resolution reads them. */
export const pinnedDiagnostics = (
  set: PinnedSet,
  located: readonly Located[],
  contractDigest: string,
  platform: string,
): Diagnostic[] => [
  ...contractRefusals(set, contractDigest, platform),
  ...methodRefusals(set, platform),
  ...located.flatMap((project) => processRefusals(set, project)),
  ...located.flatMap((project) => migrationRefusals(set, project)),
];
