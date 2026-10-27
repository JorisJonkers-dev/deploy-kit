// The ClusterState snapshot (spec/v1/20-resolved-deployment.md#cluster-state):
// what only the cluster can say, captured once and pinned by digest. What a
// node can hold is not here: that is declared, in the node contract.
import { z } from "zod";
import { MOVE_STEPS } from "./vocabularies.ts";

const text = z.string().min(1);

/** A bound PersistentVolume, and the node holding it. */
const binding = z.strictObject({ claim: text, node: text });

/** Where a Process ran when the snapshot was taken. */
const placement = z.strictObject({ process: text, node: text });

/**
 * A Rollback's one-shot backup Job, and how it ended
 * (spec/v1/55-delivery.md#pause-and-rollback): what the rollback workflow
 * waits on before it moves a pin.
 */
const backup = z.strictObject({
  request: text,
  project: text,
  job: text,
  outcome: z.enum(["succeeded", "failed"]),
  finishedAt: z.iso.datetime(),
});

/**
 * An engine Process's active Instance, as the Release Gate records it serving
 * (spec/v1/55-delivery.md#moves): its version, namespace and node, and for an
 * open Move the step it is at and when its flip held.
 */
const instance = z.strictObject({
  application: text,
  instance: text,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  namespace: text,
  node: text,
  phase: z.enum(MOVE_STEPS).exactOptional(),
  flippedAt: z.iso.datetime().exactOptional(),
});

export const clusterState = z.strictObject({
  apiVersion: z.literal("state.jorisjonkers.dev/v1"),
  kind: z.literal("ClusterState"),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  cluster: text,
  capturedAt: z.iso.datetime(),
  bindings: z.array(binding),
  placements: z.array(placement),
  backups: z.array(backup).exactOptional(),
  instances: z.array(instance).exactOptional(),
});

export type ClusterStateDocument = z.output<typeof clusterState>;
