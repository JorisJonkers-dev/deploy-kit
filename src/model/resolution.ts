// What resolution reads (spec/v1/20-resolved-deployment.md#pinned-inputs): the
// composed union lowered to the Effective Intent, and every other pinned input,
// each already read into its model. The set is closed; nothing else is read.
import type { ClusterStateDocument } from "./cluster-state.ts";
import type { EffectiveProject } from "./effective-intent.ts";
import type { ImagesLockDocument } from "./images-lock.ts";
import type { NodeContractDocument } from "./node-contract.ts";
import type { PinnedInput } from "./resolved-deployment.ts";
import type { PlatformIntentDocument } from "./platform-intent.ts";

export interface PinnedSet {
  readonly platform: PlatformIntentDocument;
  readonly nodeContract: NodeContractDocument;
  readonly imagesLock: ImagesLockDocument;
  readonly clusterState: ClusterStateDocument;
  readonly projects: readonly EffectiveProject[];
}

/** One pinned input, by the name its digest is recorded under. */
export interface InputDigest {
  readonly input: PinnedInput;
  readonly name: string;
  readonly digest: string;
}
