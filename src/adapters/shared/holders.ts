// The identities of one Application that hold a grant
// (spec/v1/16-dependencies.md#what-a-grant-confers): each Process holding one,
// and each backup identity holding its destination's credential. The `vso`
// and `vault-policy` adapters both read them, so neither derives them twice.
import type {
  ResolvedApplicationDocument,
  ResolvedProcess,
} from "../../model/resolved-deployment.ts";
import type { Labels } from "../../objects/kubernetes.ts";
import { labelsOf } from "./labels.ts";

export type Grant = NonNullable<ResolvedProcess["secrets"]>[number];
/** A kv grant: the one engine whose value is ever synced to a Secret. */
export type KvGrant = Extract<Grant, { readonly path: string }>;

/** Whether a grant is synced to a Secret: a kv grant delivered `env` or `file`. */
export const isSynced = (
  grant: Grant,
): grant is KvGrant & { destination: string } =>
  // An absent destination is an absent key, so asking for the key is enough.
  "destination" in grant;

export interface Holder {
  /** The ServiceAccount the holder runs as. */
  readonly identity: string;
  readonly labels: Labels;
  readonly grants: readonly Grant[];
}

/** A backup identity holds the one credential its Process's backups share. */
function backupHolder(process: ResolvedProcess, application: string): Holder[] {
  // A missing list and an empty one hold no backup alike.
  // Stryker disable next-line ArrayDeclaration
  const backup = (process.volumes ?? []).find(
    ({ backup: plan }) => plan?.credential !== undefined,
  )?.backup;
  if (backup === undefined) return [];
  return [
    {
      identity: backup.identity,
      labels: labelsOf({ name: backup.identity, runtime: "none" }, application),
      grants: [backup.credential as Grant],
    },
  ];
}

export const holdersOf = (application: ResolvedApplicationDocument): Holder[] =>
  application.processes.flatMap((process) => [
    ...(process.secrets === undefined
      ? []
      : [
          {
            identity: process.identity,
            labels: labelsOf(process, application.id),
            grants: process.secrets,
          },
        ]),
    ...backupHolder(process, application.id),
  ]);
