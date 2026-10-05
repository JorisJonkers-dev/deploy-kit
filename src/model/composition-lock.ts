// The composition lock (spec/v1/40-composition.md#the-composition-lock): the
// output of a composition, recording every input it rendered from by digest
// and exact version, so re-composing from it reproduces the composed digest.
// Each fragment records the release it published from, and a Project whose
// newest fragment was refused records why it stayed where it was
// (spec/v1/40-composition.md#a-refused-project-is-isolated).
import { z } from "zod";

const text = z.string().min(1);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const commit = z.string().regex(/^[a-f0-9]{40}$/);
/** An exact released version, as release-please tags it, without the `v`. */
export const semver = z.string().regex(/^\d+\.\d+\.\d+$/);
/** An OCI artifact named by digest, never by tag: no `:` after the last `/`. */
export const reference = z
  .string()
  .regex(/^(?:[^@\s/]+\/)+[^@\s/:]+@sha256:[a-f0-9]{64}$/);

const lockedFragment = z
  .strictObject({
    ref: reference,
    project: text,
    repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    schemaVersion: semver,
    version: semver,
    revisions: z.record(text, digest),
    sourceSha: commit,
    inputsSha: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .meta({ id: "LockedFragment" });

// Why a Project stayed where it was. `refused` is the fragment composition
// would not take; a participant that published none has none to name.
const isolation = z
  .strictObject({
    refused: reference.exactOptional(),
    codes: z.array(z.string().regex(/^E_[A-Z0-9_]+$/)).min(1),
  })
  .meta({ id: "Isolation" });

const chainLink = z
  .strictObject({ digest, commit, timestamp: z.iso.datetime() })
  .meta({ id: "ChainLink" });

export const compositionLock = z
  .strictObject({
    apiVersion: z.literal("resolved.jorisjonkers.dev/v1"),
    kind: z.literal("CompositionLock"),
    metadata: z.strictObject({ cluster: text, generatedAt: z.iso.datetime() }),
    spec: z.strictObject({
      schemaVersion: semver,
      toolkitVersion: semver,
      composedDigest: digest,
      previousLockDigest: digest.exactOptional(),
      lockChain: z.array(chainLink),
      fragments: z.record(text, lockedFragment),
      isolated: z.record(text, isolation).exactOptional(),
      clusterStateDigest: digest,
    }),
  })
  .meta({ id: "CompositionLock" });

export type CompositionLockDocument = z.output<typeof compositionLock>;
