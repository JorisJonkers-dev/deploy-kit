// A Rollback's dump of the Project's own database
// (spec/v1/30-deliverables.md#a-rollbacks-backup): run in the Project's
// namespace with the database credential its Application already holds, so it
// reaches that one database and needs no new Secret Store path, by the method
// the datastore's own backup runs, into a claim of the Project's own. Each
// adapter renders its share of it from what this derives.
import type { ResolvedProject } from "../../model/resolution.ts";
import type { ResolvedProcess } from "../../model/resolved-deployment.ts";

/** Everything the dump's Job, credential and policies are rendered from. */
export interface RollbackDump {
  readonly namespace: string;
  /** The Application whose credential the dump uses: what its objects are part of. */
  readonly application: string;
  /** The Job, its credential and the Secret it syncs: one per request. */
  readonly name: string;
  /** The dump's pods' instance, which its policies select. */
  readonly instance: string;
  /** The Project's rollback claim, which outlives every request. */
  readonly claim: string;
  readonly size: string;
  readonly database: string;
  /** The identity that holds the credential, and the role below the `database` mount. */
  readonly identity: string;
  readonly role: string;
  readonly method: string;
  readonly methodVersion: string | undefined;
  readonly uid: number;
  readonly gid: number;
  readonly host: string;
  readonly port: number;
  /** Where the datastore's Process runs, which the dump's policies admit it to. */
  readonly datastore: { readonly namespace: string; readonly process: string };
}

/** The mount the Secret Store issues database credentials from. */
const MOUNT = "database";
const CREDENTIALS = `${MOUNT}/creds/`;

interface Holder {
  readonly application: string;
  readonly identity: string;
  readonly role: string;
}

/** Every identity of the Project that holds a credential to its database, owners first. */
function holdersOf(project: ResolvedProject): Holder[] {
  const roles = ["owner", "data"].map(
    (kind) => `${CREDENTIALS}${project.project}-${kind}`,
  );
  const held = project.applications.flatMap((application) =>
    [
      ...(application.migration === undefined
        ? []
        : [
            {
              identity: application.migration.identity,
              paths: application.migration.credential.paths,
            },
          ]),
      ...application.processes.flatMap(({ identity, secrets }) =>
        (secrets ?? []).flatMap((grant) =>
          "paths" in grant ? [{ identity, paths: grant.paths }] : [],
        ),
      ),
    ].flatMap(({ identity, paths }) =>
      paths
        .filter(({ path }) => roles.includes(path))
        .map(({ path }) => ({
          application: application.id,
          identity,
          role: path.slice(MOUNT.length + 1),
          rank: roles.indexOf(path),
        })),
    ),
  );
  return held
    .toSorted((a, b) => a.rank - b.rank)
    .map(({ application, identity, role }) => ({
      application,
      identity,
      role,
    }));
}

/** The Process of the union that serves the datastore the Project's edges reach. */
function datastoreOf(
  project: ResolvedProject,
  union: readonly ResolvedProject[],
):
  | { readonly namespace: string; readonly process: ResolvedProcess }
  | undefined {
  const reached = project.applications
    .flatMap(({ processes, migration }) => [
      ...(migration?.egress ?? []),
      ...processes.flatMap(({ egress }) => egress ?? []),
    ])
    .find(({ rule }) => rule === "datastore");
  if (reached === undefined) return undefined;
  const process = union
    .flatMap(({ applications }) => applications)
    .filter(({ namespace }) => namespace === reached.namespace)
    .flatMap(({ processes }) => processes)
    .find(({ name }) => name === reached.process);
  return process === undefined
    ? undefined
    : { namespace: reached.namespace, process };
}

/**
 * The dump a Rollback of `project` runs for `request`, or nothing where the
 * Project holds no credential to a database, or its datastore's backup dumps
 * nothing over the network.
 */
export function rollbackDumpOf(
  project: ResolvedProject,
  request: string,
  union: readonly ResolvedProject[],
): RollbackDump | undefined {
  const [holder] = holdersOf(project);
  const datastore = datastoreOf(project, union);
  const volume = datastore?.process.volumes?.find(
    ({ backup }) => backup?.peer !== undefined,
  );
  const backup = volume?.backup;
  if (
    holder === undefined ||
    datastore === undefined ||
    volume === undefined ||
    backup?.peer === undefined
  )
    return undefined;
  const namespace = project.applications[0]?.namespace as string;
  return {
    namespace,
    application: holder.application,
    name: `${project.project}-database-${request}`,
    instance: `${project.project}-database-dump`,
    claim: `${project.project}-rollback`,
    size: volume.size,
    database: `${project.project}_db`,
    identity: holder.identity,
    role: holder.role,
    method: backup.method,
    methodVersion: backup.methodVersion,
    uid: backup.uid,
    gid: backup.gid,
    host: backup.peer.host,
    port: backup.peer.port,
    datastore: {
      namespace: datastore.namespace,
      process: datastore.process.name,
    },
  };
}
