// The pin annotations (spec/v1/55-delivery.md#pause-and-rollback): how a
// Pause, a Rollback and a Retry are recorded on a Project's OCIRepository in
// the Estate repository. A Pause carries who, when and why; a Rollback carries
// those and the release it went to; a Retry carries when it last ran, beside
// either or neither. A Project carrying no Pause is not paused.
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
  retriedAt: "estate.jorisjonkers.dev/retried-at",
} as const;

/** Flux's policy to recreate an object it cannot update; a first delivery sets it. */
export const FORCE_ANNOTATION = "kustomize.toolkit.fluxcd.io/force";

const pause = {
  [PIN_ANNOTATIONS.pausedBy]: text,
  [PIN_ANNOTATIONS.pausedAt]: z.iso.datetime({ offset: true }),
  [PIN_ANNOTATIONS.pausedReason]: text,
};

const retry = {
  [PIN_ANNOTATIONS.retriedAt]: z.iso.datetime({ offset: true }).optional(),
};

/**
 * Not paused, paused, or rolled back and paused: never a Rollback without its
 * Pause. A Retry may stand beside any of the three.
 */
export const pinAnnotations = z
  .union([
    z.strictObject(retry),
    z.strictObject({ ...pause, ...retry }),
    z.strictObject({
      ...pause,
      ...retry,
      [PIN_ANNOTATIONS.rollbackVersion]: semver,
      [PIN_ANNOTATIONS.rollbackFragment]: reference,
    }),
  ])
  .meta({ id: "PinAnnotations" });

export type PinAnnotationsDocument = z.output<typeof pinAnnotations>;
