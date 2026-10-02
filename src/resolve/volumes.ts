// A Process's volumes resolved (spec/v1/20-resolved-deployment.md#derived-mechanics):
// what each claim holds and where it mounts, what losing it costs, and the
// backup plan its Durability Class derives from the platform's policy for that
// class and the method the platform names for the Process's engine.
import type { EffectiveProcess } from "../model/effective-intent.ts";
import type { ImagesLockDocument, LockedImage } from "../model/images-lock.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { destinationOf } from "./secrets.ts";
import { notChecked } from "../model/internal-failure.ts";

export type ResolvedVolume = NonNullable<ResolvedProcess["volumes"]>[number];
type BackupPlan = NonNullable<ResolvedVolume["backup"]>;

/** The classes whose loss a backup protects against; `reconstructible` earns none. */
const BACKED_UP = new Set(["recoverable", "irreplaceable"]);

function backupOf(
  claim: string,
  durability: ResolvedVolume["durability"],
  process: EffectiveProcess,
  platform: PlatformIntentDocument,
  lock: ImagesLockDocument,
): BackupPlan {
  // A backed-up class has a policy (E_NO_DURABILITY_POLICY) and the Process an
  // engine the platform names a method for (E_DURABILITY_WITHOUT_ENGINE,
  // E_NO_ENGINE_POLICY), whose image the lock holds (E_UNLOCKED_IMAGE).
  const policy = platform.durability[durability] as NonNullable<
    PlatformIntentDocument["durability"]["recoverable"]
  >;
  if (policy.schedule === undefined || policy.retain === undefined)
    throw notChecked(
      `the ${durability} policy derives a backup, and names no schedule and retention`,
    );
  const method = platform.engines[
    process.engine as NonNullable<EffectiveProcess["engine"]>
  ] as { readonly backup: string };
  const image = lock.images[method.backup] as LockedImage;
  const identity = `${process.name}-backup`;
  const { offCluster } = policy;
  return {
    schedule: policy.schedule,
    retain: policy.retain,
    ...(offCluster === undefined ? {} : { offCluster: offCluster.destination }),
    method: `${image.repository}@${image.digest}`,
    uid: image.uid,
    gid: image.gid,
    identity,
    claim: `${claim}-backup`,
    // The platform chose the destination, so the grant on it is derived, and
    // held by the backup identity alone.
    ...(offCluster === undefined
      ? {}
      : {
          credential: {
            path: offCluster.credential,
            access: "read" as const,
            delivery: "env" as const,
            destination: destinationOf(identity, offCluster.credential),
          },
        }),
  };
}

export const resolveVolumes = (
  process: EffectiveProcess,
  platform: PlatformIntentDocument,
  lock: ImagesLockDocument,
): ResolvedVolume[] =>
  (process.volumes ?? []).map(({ claim, mountAt, size, durability }) => ({
    claim,
    mountAt,
    size,
    durability,
    ...(BACKED_UP.has(durability)
      ? { backup: backupOf(claim, durability, process, platform, lock) }
      : {}),
  }));
