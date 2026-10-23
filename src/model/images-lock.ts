// The images lock (spec/v1/20-resolved-deployment.md#the-images-lock): every
// image alias a document names, resolved to one digest, the user the image
// runs as and the version of the software in it. A pinned input, carried by
// digest; nothing authored names a tag.
import { z } from "zod";
import type { EffectiveProject } from "./effective-intent.ts";
import { migrationImage } from "./migration-proof.ts";

const text = z.string().min(1);
const id = z.int().min(0);

const lockedImage = z.strictObject({
  repository: text,
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  uid: id,
  gid: id,
  version: text,
});

export const imagesLock = z.strictObject({
  apiVersion: z.literal("lock.jorisjonkers.dev/v1"),
  kind: z.literal("ImagesLock"),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: text,
  images: z.record(text, lockedImage),
});

export type ImagesLockDocument = z.output<typeof imagesLock>;
export type LockedImage = z.output<typeof lockedImage>;

/**
 * Every image alias a project file names, once each, sorted: each Process's
 * image, each sidecar's, and the migration image of an Application that moves
 * its schema with a changelog. A fragment's share of the images lock holds
 * exactly these (spec/v1/40-composition.md#fragments).
 */
export const aliasesOf = (project: EffectiveProject): string[] =>
  [
    ...new Set(
      project.applications.flatMap((application) => [
        ...application.processes.flatMap((process) => [
          process.image,
          ...(process.sidecars ?? []).map(({ image }) => image),
        ]),
        ...(typeof application.migration === "object"
          ? [migrationImage(application.id)]
          : []),
      ]),
    ),
  ].sort();

/**
 * Every alias a project file names whose image a pod runs as the user the lock
 * records, once each, sorted: each Process's image and the migration image of
 * an Application that moves its schema with a changelog. A sidecar runs as its
 * Process, so its own user is never read.
 */
export const ownUserAliasesOf = (project: EffectiveProject): string[] =>
  [
    ...new Set(
      project.applications.flatMap((application) => [
        ...application.processes.map(({ image }) => image),
        ...(typeof application.migration === "object"
          ? [migrationImage(application.id)]
          : []),
      ]),
    ),
  ].sort();

/**
 * Whether the image runs as root. The posture runs every pod as non-root, and
 * the kubelet refuses a pod whose user is 0 under `runAsNonRoot`
 * (spec/v1/10-project-intent.md#the-uid-is-a-pinned-input-and-the-volume-needs-a-group).
 */
export const runsAsRoot = ({ uid }: LockedImage): boolean => uid === 0;

/** An image as the lock records it, by the digest a pod pulls. */
export const pulledAs = ({ repository, digest }: LockedImage): string =>
  `${repository}@${digest}`;

/** What `E_IMAGE_RUNS_AS_ROOT` says of an alias locked to a root image. */
export const rootImageMessage = (alias: string, image: LockedImage): string =>
  `${alias} is locked to ${pulledAs(image)}, which runs as uid 0, and the posture runs it with runAsNonRoot, so the kubelet refuses the pod`;

export const ROOT_IMAGE_HINT =
  "Build the image with a numeric non-root USER (USER 1000:1000, say) and lock the release that builds it.";

/**
 * Whether two locks of one alias resolve it to the same image of the same
 * version, run as the same user.
 */
export const sameImage = (a: LockedImage, b: LockedImage): boolean =>
  a.repository === b.repository &&
  a.digest === b.digest &&
  a.uid === b.uid &&
  a.gid === b.gid &&
  a.version === b.version;

/** The locked version beside a resolved image, under `key`. */
export const versionOf = <K extends string>(
  key: K,
  { version }: LockedImage,
): Record<K, string> => ({ [key]: version }) as Record<K, string>;
