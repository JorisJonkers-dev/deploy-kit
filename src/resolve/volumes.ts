// A Process's volumes resolved (spec/v1/20-resolved-deployment.md#derived-mechanics):
// what each claim holds and where it mounts, what losing it costs, and the
// backup plan its Durability Class derives from the platform's policy for that
// class and the method the platform names for the Process's engine.
import type { EffectiveProcess } from "../model/effective-intent.ts";
import type { ImagesLockDocument, LockedImage } from "../model/images-lock.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import {
  backupCredentialOf,
  backupIdentityOf,
  namespaceOf,
} from "../model/runtime-profiles.ts";
import { BACKED_UP, dumpedSurfaceOf } from "../model/backup.ts";
import { DNS_PORT } from "./policy.ts";
import { destinationOf } from "./secrets.ts";

export type ResolvedVolume = NonNullable<ResolvedProcess["volumes"]>[number];
type BackupPlan = NonNullable<ResolvedVolume["backup"]>;

/**
 * What a backup identity's own policy admits
 * (spec/v1/16-dependencies.md#network-policy): the Process it dumps, on the
 * surface the engine's method connects to, and the cluster's DNS. A method that
 * reads the volume alone names no surface and reaches no Process. The Secret
 * Store is not among them: the operator reads the backup's credential for it.
 */
function egressOf(
  process: EffectiveProcess,
  surface: string | undefined,
  project: string,
  platform: PlatformIntentDocument,
): BackupPlan["egress"] {
  return [
    // A named surface is one the Process provides: E_BACKUP_SURFACE_NOT_PROVIDED.
    ...(surface === undefined
      ? []
      : [
          {
            rule: "datastore" as const,
            namespace: namespaceOf(project),
            process: process.name,
            port: process.provides?.[surface] as number,
          },
        ]),
    {
      rule: "cluster-dns" as const,
      namespace: platform.substrate.clusterDns,
      port: DNS_PORT,
    },
  ];
}

function backupOf(
  claim: string,
  durability: ResolvedVolume["durability"],
  process: EffectiveProcess,
  platform: PlatformIntentDocument,
  lock: ImagesLockDocument,
  project: string,
): BackupPlan {
  // A backed-up class has a policy (E_NO_DURABILITY_POLICY) and the Process an
  // engine the platform names a method for (E_DURABILITY_WITHOUT_ENGINE,
  // E_NO_ENGINE_POLICY), whose image the lock holds (E_UNLOCKED_IMAGE).
  const policy = platform.durability[durability] as NonNullable<
    PlatformIntentDocument["durability"]["recoverable"]
  >;
  // E_DURABILITY_POLICY_INCOMPLETE refused a backed-up class with no schedule
  // or retention.
  const method = platform.engines[
    process.engine as NonNullable<EffectiveProcess["engine"]>
  ] as { readonly backup: string };
  const image = lock.images[method.backup] as LockedImage;
  const identity = backupIdentityOf(process.name);
  const { offCluster } = policy;
  const surface = dumpedSurfaceOf(process, platform);
  const dumps = backupCredentialOf(project, process.name);
  return {
    schedule: policy.schedule as string,
    retain: policy.retain as number,
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
    // A method that dumps over the network is told where, and logs in with a
    // credential derived from the Process, which only its backups hold.
    ...(surface === undefined
      ? {}
      : {
          peer: {
            host: `${process.name}.${namespaceOf(project)}.svc.cluster.local`,
            // E_BACKUP_SURFACE_NOT_PROVIDED refused a surface it does not provide.
            port: process.provides?.[surface] as number,
            credential: {
              path: dumps,
              access: "read" as const,
              delivery: "env" as const,
              destination: destinationOf(identity, dumps),
            },
          },
        }),
    egress: egressOf(process, surface, project, platform),
    ...(offCluster === undefined ? {} : { destinations: offCluster.egress }),
  };
}

export const resolveVolumes = (
  process: EffectiveProcess,
  platform: PlatformIntentDocument,
  lock: ImagesLockDocument,
  project: string,
): ResolvedVolume[] =>
  (process.volumes ?? []).map(({ claim, mountAt, size, durability }) => ({
    claim,
    mountAt,
    size,
    durability,
    ...(BACKED_UP.has(durability)
      ? {
          backup: backupOf(claim, durability, process, platform, lock, project),
        }
      : {}),
  }));
