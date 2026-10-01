// The pin annotations (spec/v1/55-delivery.md#pause-and-rollback): how a
// Pause and a Rollback are recorded on a Project's OCIRepository in the Estate
// repository. A Pause carries who, when and why; a Rollback carries those and
// the release it went to. A Project carrying none of them is not paused.
import { z } from "zod";
import { reference, semver } from "./composition-lock.ts";

const text = z.string().min(1);

/** The annotation keys, in the order the spec's table lists them. */
export const PIN_ANNOTATIONS = {
  pausedBy: "estate.jorisjonkers.dev/paused-by",
  pausedAt: "estate.jorisjonkers.dev/paused-at",
  pausedReason: "estate.jorisjonkers.dev/paused-reason",
  rollbackVersion: "estate.jorisjonkers.dev/rollback-version",
  rollbackFragment: "estate.jorisjonkers.dev/rollback-fragment",
} as const;

const pause = {
  [PIN_ANNOTATIONS.pausedBy]: text,
  [PIN_ANNOTATIONS.pausedAt]: z.iso.datetime({ offset: true }),
  [PIN_ANNOTATIONS.pausedReason]: text,
};

/** Not paused, paused, or rolled back and paused: never a Rollback without its Pause. */
export const pinAnnotations = z
  .union([
    z.strictObject({}),
    z.strictObject(pause),
    z.strictObject({
      ...pause,
      [PIN_ANNOTATIONS.rollbackVersion]: semver,
      [PIN_ANNOTATIONS.rollbackFragment]: reference,
    }),
  ])
  .meta({ id: "PinAnnotations" });

export type PinAnnotationsDocument = z.output<typeof pinAnnotations>;
