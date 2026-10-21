// A Rollback's dump of the Project's own database
// (spec/v1/30-deliverables.md#a-rollbacks-backup): run in the Project's
// namespace with the owner credential the Project already holds, so it reaches
// that one database and needs no new Secret Store path, by the method the
// datastore's own backup runs, into a claim of the Project's own. Each adapter
// renders its share of it from what this derives.
import type { ResolvedProject } from "../../model/resolution.ts";
import type {
  ResolvedCatalogJob,
  ResolvedProcess,
} from "../../model/resolved-deployment.ts";

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
  /** The identity that holds the owner credential, and its role below the `database` mount. */
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

type Egress = NonNullable<ResolvedProcess["egress"]>[number];
type EngineGrant = Extract<
  NonNullable<ResolvedProcess["secrets"]>[number],
  { readonly paths: unknown }
>;

/**
 * The first identity of the Project that holds its database's owner
 * credential: the migration identity of an Application whose changelog the
 * runner applies, or a Process of one that migrates itself.
 */
function ownerOf(
  project: ResolvedProject,
  role: string,
): { readonly application: string; readonly identity: string } | undefined {
  return project.applications
    .flatMap((application) =>
      [
        ...application.processes.flatMap(({ identity, secrets }) =>
          (secrets ?? [])
            .filter((grant): grant is EngineGrant => "paths" in grant)
            .flatMap(({ paths }) =>
              paths.map(({ path }) => ({ identity, path })),
            ),
        ),
        ...(application.migration?.credential.paths ?? []).map(({ path }) => ({
          identity: (application.migration as { identity: string }).identity,
          path,
        })),
      ]
        .filter(({ path }) => path === role)
        .map(({ identity }) => ({ application: application.id, identity })),
    )
    .at(0);
}

/**
 * The dump a Rollback of `project` runs for `request`, or nothing where no
 * catalog creates the Project a database, or where its datastore keeps no
 * backup that dumps over the network to run.
 */
export function rollbackDumpOf(
  project: ResolvedProject,
  request: string,
  union: readonly ResolvedProject[],
  catalogs: readonly ResolvedCatalogJob[],
): RollbackDump | undefined {
  const database = `${project.project}_db`;
  const role = `database/creds/${project.project}-owner`;
  // The catalog that creates the database names the datastore that holds it.
  const catalog = catalogs.find(({ catalog: { databases } }) =>
    databases.some(({ name }) => name === database),
  );
  if (catalog === undefined) return undefined;
  // A database the catalog creates is owned, and the identity that migrates
  // its schema holds the owner's credential.
  const owner = ownerOf(project, role) as NonNullable<
    ReturnType<typeof ownerOf>
  >;
  // A catalog method connects to its datastore, and resolution placed it.
  const reached = catalog.egress.find(
    ({ rule }) => rule === "datastore",
  ) as Egress;
  const datastore = union
    .flatMap(({ applications }) => applications)
    .filter(({ namespace }) => namespace === reached.namespace)
    .flatMap(({ processes }) => processes)
    .find(({ name }) => name === reached.process) as ResolvedProcess;
  // A datastore keeps its data on a volume, so its list is never missing.
  // Stryker disable next-line ArrayDeclaration
  const volume = (datastore.volumes ?? []).find(
    ({ backup }) => backup?.peer !== undefined,
  );
  if (volume === undefined) return undefined;
  const backup = volume.backup as NonNullable<typeof volume.backup>;
  return {
    namespace: (project.applications[0] as { namespace: string }).namespace,
    application: owner.application,
    name: `${project.project}-database-${request}`,
    instance: `${project.project}-database-dump`,
    claim: `${project.project}-rollback`,
    size: volume.size,
    database,
    identity: owner.identity,
    role: role.slice("database/".length),
    method: backup.method,
    methodVersion: backup.methodVersion,
    uid: backup.uid,
    gid: backup.gid,
    host: catalog.catalog.host,
    port: catalog.catalog.port,
    datastore: { namespace: reached.namespace, process: datastore.name },
  };
}
