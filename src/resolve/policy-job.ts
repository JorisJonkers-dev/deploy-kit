// The Vault policy job (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied):
// derived where the platform names its image and a Secret Store answers, as
// one identity in the Secret Store's own namespace. Nothing declares it as a
// Process: its input is the render itself.
import type { PinnedSet } from "../model/resolution.ts";
import type { LockedImage } from "../model/images-lock.ts";
import type { ResolvedPolicyJob } from "../model/resolved-deployment.ts";
import { inSeconds, seconds } from "../model/durations.ts";
import { secretStoreEndpoint } from "../model/runtime-profiles.ts";
import { DNS_PORT, storeOf } from "./policy.ts";

/** The identity the job runs as, and the name its objects start with. */
export const POLICY_JOB = "vault-policy";

export function resolvePolicyJob(
  set: PinnedSet,
): ResolvedPolicyJob | undefined {
  const declared = set.platform.policyJob;
  const address = secretStoreEndpoint(set.platform, set.projects);
  if (declared === undefined || address === undefined) return undefined;
  // The alias is checked against the lock before resolution runs:
  // E_UNLOCKED_IMAGE.
  const image = set.imagesLock.images[declared.image] as LockedImage;
  const store = storeOf({ platform: set.platform, union: set.projects });
  return {
    identity: POLICY_JOB,
    namespace: store.namespace,
    image: `${image.repository}@${image.digest}`,
    uid: image.uid,
    gid: image.gid,
    role: declared.role,
    address,
    memory: declared.memory,
    cpu: declared.cpu,
    deadline: inSeconds(seconds(declared.deadline)),
    egress: [
      store,
      {
        rule: "cluster-dns",
        namespace: set.platform.substrate.clusterDns,
        port: DNS_PORT,
      },
    ],
  };
}
