// The ClusterState snapshot (spec/v1/20-resolved-deployment.md#cluster-state):
// what only the cluster can say, captured once and pinned by digest. What a
// node can hold is not here: that is declared, in the node contract.
import { z } from "zod";

const text = z.string().min(1);

/** A bound PersistentVolume, and the node holding it. */
const binding = z.strictObject({ claim: text, node: text });

/** Where a Process ran when the snapshot was taken. */
const placement = z.strictObject({ process: text, node: text });

export const clusterState = z.strictObject({
  apiVersion: z.literal("state.jorisjonkers.dev/v1"),
  kind: z.literal("ClusterState"),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  cluster: text,
  capturedAt: z.iso.datetime(),
  bindings: z.array(binding),
  placements: z.array(placement),
});

export type ClusterStateDocument = z.output<typeof clusterState>;
