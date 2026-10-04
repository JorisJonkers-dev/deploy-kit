// The images lock (spec/v1/20-resolved-deployment.md#the-images-lock): every
// image alias a document names, resolved to one digest and the user the image
// runs as. A pinned input, carried by digest; nothing authored names a tag.
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

/** Whether two locks of one alias resolve it to the same image, run as the same user. */
export const sameImage = (a: LockedImage, b: LockedImage): boolean =>
  a.repository === b.repository &&
  a.digest === b.digest &&
  a.uid === b.uid &&
  a.gid === b.gid;
