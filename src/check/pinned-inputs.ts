// The rules the pinned inputs answer before resolution reads them
// (spec/v1/20-resolved-deployment.md#pinned-inputs): the node contract read is
// the one the Platform document pins, every image alias is locked, no image a
// pod runs as its own user runs as root, and every Process has somewhere to
// land. After these, resolution is total.
import type { Diagnostic } from "../model/diagnostic.ts";
import {
  eligibleNodes,
  estateJobNodes,
  gpuVendors,
} from "../model/eligibility.ts";
import type {
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import {
  ROOT_IMAGE_HINT,
  rootImageMessage,
  runsAsRoot,
} from "../model/images-lock.ts";
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

/**
 * A Process that requires a GPU requests one vendor's resource
 * (spec/v1/14-platform-intent.md#gpus): its cards share one vendor, and the
 * Platform names that vendor's resource and runtime class.
 */
function gpuRefusals(
  set: PinnedSet,
  process: EffectiveProcess,
  path: string,
  document: string,
): Diagnostic[] {
  if (process.placement.gpu === undefined) return [];
  const vendors = gpuVendors(process, set.nodeContract, set.platform);
  if (vendors.length > 1)
    return [
      {
        code: "E_GPU_VENDOR_AMBIGUOUS",
        document,
        path,
        message: `${process.name} may land on cards of ${vendors.join(", ")}, and one request names one vendor's resource`,
        hint: "Lock the `gpu` to one `vendor`, or to models of one vendor.",
      },
    ];
  const [vendor] = vendors as [string];
  return Object.hasOwn(set.platform.gpus ?? {}, vendor)
    ? []
    : [
        {
          code: "E_NO_GPU_POLICY",
          document,
          path,
          message: `the platform names no resource or runtime class for ${vendor} cards`,
          hint: "Add the vendor to the Platform document's `gpus`.",
        },
      ];
}

/**
 * The image at `path` runs as root where the lock holds it with uid 0: the
 * posture renders that uid beside `runAsNonRoot`, and the kubelet refuses the
 * pod (spec/v1/10-project-intent.md#the-uid-is-a-pinned-input-and-the-volume-needs-a-group).
 */
function rootRefusals(
  set: PinnedSet,
  image: string,
  path: string,
  document: string,
): Diagnostic[] {
  const locked = set.imagesLock.images[image];
  return locked === undefined || !runsAsRoot(locked)
    ? []
    : [
        {
          code: "E_IMAGE_RUNS_AS_ROOT",
          document,
          path,
          message: rootImageMessage(image, locked),
          hint: ROOT_IMAGE_HINT,
        },
      ];
}

function processRefusals(
  set: PinnedSet,
  { document, effective }: Located,
): Diagnostic[] {
  return effective.applications.flatMap((application, a) =>
    application.processes.flatMap((process, p): Diagnostic[] => {
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
        ...rootRefusals(set, process.image, `${at}/image`, document),
        ...(eligibleNodes(process, set.nodeContract, set.platform).length === 0
          ? [
              {
                code: "E_PLACEMENT_UNSATISFIABLE" as const,
                document,
                path: `${at}/placement`,
                message: `no node in the node contract can hold ${process.name}`,
                hint: "Relax a placement dimension, or lower what the Process asks for.",
              },
            ]
          : gpuRefusals(set, process, `${at}/placement/gpu`, document)),
        ...spreadRefusals(set, process, `${at}/replicas`, document),
      ];
    }),
  );
}

/**
 * Replicas spread across nodes need a node each
 * (spec/v1/10-project-intent.md#replicas-and-the-disruption-budget): fewer eligible nodes than the count
 * leave a replica that never schedules. None eligible is the placement's own
 * refusal.
 */
function spreadRefusals(
  set: PinnedSet,
  process: EffectiveProcess,
  path: string,
  document: string,
): Diagnostic[] {
  const { replicas } = process;
  if (replicas?.across === undefined) return [];
  const nodes = eligibleNodes(process, set.nodeContract, set.platform).length;
  return nodes === 0 || nodes >= replicas.count
    ? []
    : [
        {
          code: "E_PLACEMENT_UNSATISFIABLE",
          document,
          path,
          message: `${process.name} keeps ${String(replicas.count)} replicas on different nodes, and ${String(nodes)} can hold it`,
          hint: "Lower the count, relax a placement dimension, or drop `across`.",
        },
      ];
}

/** Every backup and catalog method the platform names is an image the lock holds. */
const methodRefusals = (set: PinnedSet, platform: string): Diagnostic[] =>
  Object.entries(set.platform.engines).flatMap(([engine, method]) =>
    (["backup", "catalog"] as const).flatMap((kind): Diagnostic[] => {
      const image = method[kind];
      return image === undefined || Object.hasOwn(set.imagesLock.images, image)
        ? []
        : [
            {
              code: "E_UNLOCKED_IMAGE",
              document: platform,
              path: `/engines/${engine}/${kind}`,
              message: `the images lock holds no entry for ${image}`,
              hint: "Lock the alias, or name one the images lock holds.",
            },
          ];
    }),
  );

/** The VPN, where the platform runs one, is an image the lock holds. */
const vpnRefusals = (set: PinnedSet, platform: string): Diagnostic[] => {
  const image = set.platform.vpn?.image;
  return image === undefined || Object.hasOwn(set.imagesLock.images, image)
    ? []
    : [
        {
          code: "E_UNLOCKED_IMAGE",
          document: platform,
          path: "/vpn/image",
          message: `the images lock holds no entry for ${image}`,
          hint: "Lock the alias, or name one the images lock holds.",
        },
      ];
};

/**
 * The Vault policy job, where the platform names one, runs an image the lock
 * holds, on some node the contract offers it.
 */
const policyJobRefusals = (set: PinnedSet, platform: string): Diagnostic[] => {
  const job = set.platform.policyJob;
  if (job === undefined) return [];
  return [
    ...(Object.hasOwn(set.imagesLock.images, job.image)
      ? []
      : [
          {
            code: "E_UNLOCKED_IMAGE" as const,
            document: platform,
            path: "/policyJob/image",
            message: `the images lock holds no entry for ${job.image}`,
            hint: "Lock the alias, or name one the images lock holds.",
          },
        ]),
    ...(estateJobNodes(job, set.nodeContract).length === 0
      ? [
          {
            code: "E_PLACEMENT_UNSATISFIABLE" as const,
            document: platform,
            path: "/policyJob",
            message:
              "no node in the node contract without an sdcard medium can hold the Vault policy job",
            hint: "Lower what the job asks for, or give the contract a node that boots from no SD card.",
          },
        ]
      : []),
  ];
};

/** Every Application that moves its schema with a changelog has its migration image locked. */
const migrationRefusals = (set: PinnedSet, { document, effective }: Located) =>
  effective.applications.flatMap((application, a): Diagnostic[] => {
    const image = migrationImage(application.id);
    if (typeof application.migration !== "object") return [];
    const path = `/applications/${String(a)}/migration`;
    return !Object.hasOwn(set.imagesLock.images, image)
      ? [
          {
            code: "E_UNLOCKED_IMAGE",
            document,
            path,
            message: `the images lock holds no entry for ${image}`,
            hint: "Lock the migration image the Application's CI builds from the platform's runner.",
          },
        ]
      : rootRefusals(set, image, path, document);
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
  ...vpnRefusals(set, platform),
  ...policyJobRefusals(set, platform),
  ...located.flatMap((project) => processRefusals(set, project)),
  ...located.flatMap((project) => migrationRefusals(set, project)),
];
