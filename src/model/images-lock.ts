// The images lock (spec/v1/20-resolved-deployment.md#the-images-lock): every
// image alias a document names, resolved to one digest and the user the image
// runs as. A pinned input, carried by digest; nothing authored names a tag.
import { z } from "zod";

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
