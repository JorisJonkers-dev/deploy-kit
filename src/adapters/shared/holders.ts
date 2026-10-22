// The identities of one Application that hold a grant
// (spec/v1/16-dependencies.md#what-a-grant-confers): each Process holding one,
// each backup identity holding its destination's and its peer's credentials,
// and the migration
// identity holding its database's owner credential. The `vso`
// and `vault-policy` adapters both read them, so neither derives them twice.
import type {
  ResolvedApplicationDocument,
  ResolvedProcess,
} from "../../model/resolved-deployment.ts";
import type { Labels } from "../../objects/kubernetes.ts";
import { labelsOf } from "./labels.ts";

export type Grant = NonNullable<ResolvedProcess["secrets"]>[number];
/** A kv grant. */
export type KvGrant = Extract<Grant, { readonly path: string }>;

/** The sign-in provider's write on a client credential, read by its Process itself. */
export type ClientGrant = Extract<Grant, { readonly client: string }>;

/** A grant an engine issues: a transit operation, or a database credential. */
export type EngineGrant = Exclude<Grant, KvGrant | ClientGrant>;

/**
 * Whether a grant is synced to a Secret: a kv grant delivered `env` or `file`,
 * or a database credential an edge delivers `env`.
 */
export const isSynced = (
  grant: Grant,
): grant is (KvGrant | EngineGrant) & { destination: string } =>
  // An absent destination is an absent key, so asking for the key is enough.
  "destination" in grant;

export interface Holder {
  /** The ServiceAccount the holder runs as. */
  readonly identity: string;
  readonly labels: Labels;
  readonly grants: readonly Grant[];
}

/** The labels of an identity that is no Process: it runs no Runtime Profile. */
const apart = (identity: string, application: string): Labels =>
  labelsOf({ name: identity, runtime: "none" }, application);

/**
 * A backup identity holds the credentials its Process's backups share: an
 * off-cluster destination's, where one of them copies off-cluster, and the one
 * every backup of a Process that is dumped over the network logs in with.
 */
function backupHolder(process: ResolvedProcess, application: string): Holder[] {
  // A missing list and an empty one hold no backup alike.
  // Stryker disable next-line ArrayDeclaration
  const backups = (process.volumes ?? []).flatMap(({ backup }) =>
    backup === undefined ? [] : [backup],
  );
  const [first] = backups;
  if (first === undefined) return [];
  const grants = [
    backups.find(({ credential }) => credential !== undefined)?.credential,
    first.peer?.credential,
  ].filter((grant) => grant !== undefined);
  return grants.length === 0
    ? []
    : [
        {
          identity: first.identity,
          labels: apart(first.identity, application),
          grants,
        },
      ];
}

/** A migration identity holds the owner credential of its project's database. */
const migrationHolder = ({
  id,
  migration,
}: ResolvedApplicationDocument): Holder[] =>
  migration === undefined
    ? []
    : [
        {
          identity: migration.identity,
          labels: apart(migration.identity, id),
          grants: [migration.credential],
        },
      ];

/**
 * A Process holds its own grants, and the VPN's credential where it attaches:
 * the VPN container runs as the Process's identity, and only it reads that
 * credential.
 */
function processHolder(
  process: ResolvedProcess,
  application: string,
): Holder[] {
  const grants = [
    ...(process.secrets ?? []),
    ...(process.vpn === undefined ? [] : [process.vpn.credential]),
  ];
  return grants.length === 0
    ? []
    : [
        {
          identity: process.identity,
          labels: labelsOf(process, application),
          grants,
        },
      ];
}

export const holdersOf = (
  application: ResolvedApplicationDocument,
): Holder[] => [
  ...application.processes.flatMap((process) => [
    ...processHolder(process, application.id),
    ...backupHolder(process, application.id),
  ]),
  ...migrationHolder(application),
];
