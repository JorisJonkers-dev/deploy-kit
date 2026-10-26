// The methods that apply each datastore's catalog
// (spec/v1/16-dependencies.md#applying-the-catalog): derived where the engine
// names a catalog method, the platform names the Vault policy job that writes
// the method's own role, and some project on the estate path reads a database
// or names a bucket in the datastore.
import type { EffectiveProject } from "../model/effective-intent.ts";
import { type LockedImage, versionOf } from "../model/images-lock.ts";
import {
  bucketOf,
  bucketStoreOf,
  dataRole,
  ownerRole,
  ownsBuckets,
  ownsDatabases,
} from "../model/project-intent-queries.ts";
import type { PinnedSet } from "../model/resolution.ts";
import type {
  ResolvedCatalogJob,
  ResolvedPolicyJob,
} from "../model/resolved-deployment.ts";
import {
  bucketKeyOf,
  catalogCredentialOf,
  catalogIdentityOf,
  homeOf,
  vaultNameOf,
} from "../model/runtime-profiles.ts";
import { consumedOf } from "../model/consumer-label.ts";
import { datastoreOf } from "./database.ts";
import { DNS_PORT, storeOf } from "./policy.ts";

/** What a derived login document holds, once the datastore is on the estate path. */
const DERIVED_KEYS = { user: "user", password: "password" } as const;

/** What a derived login document holds for an object store's admin API. */
const TOKEN_KEY = { token: "token" } as const;

type AdminLogin = NonNullable<
  NonNullable<
    NonNullable<PinnedSet["platform"]["handover"]>["serving"]
  >[number]["admin"]
>;

/** Whether a project's database is the estate path's to apply. */
const onEstatePath = (set: PinnedSet, project: string): boolean =>
  // No ledger and an empty one hold no legacy project alike.
  // Stryker disable next-line ArrayDeclaration
  !(set.platform.handover?.legacy ?? []).includes(project);

/** One Process's place, as one value two homes compare by. */
// Every worked set holds one database-owning datastore, so no test tells two
// places apart.
// Stryker disable ArrowFunction,StringLiteral
const placeOf = ({
  namespace,
  process,
}: {
  namespace: string;
  process?: string;
}) => `${namespace}/${String(process)}`;
// Stryker restore ArrowFunction,StringLiteral

/** The projects on the estate path whose Applications read a database from one datastore. */
function readersOf(
  set: PinnedSet,
  namespace: string,
  process: string,
): string[] {
  return set.projects
    .filter(({ project }) => onEstatePath(set, project))
    .filter(({ applications }) =>
      applications.some((application) => {
        const datastore = datastoreOf(application, set.projects, set.platform);
        return (
          datastore !== undefined &&
          // Stryker disable next-line ConditionalExpression: as placeOf.
          placeOf(datastore) === placeOf({ namespace, process })
        );
      }),
    )
    .map(({ project }) => project)
    .sort();
}

/** Where a catalog method's objects belong: the Project and Application that run its datastore. */
export interface CatalogHome {
  readonly project: string;
  readonly application: string;
}

/**
 * The catalog methods, and the home of each whose datastore's own Project is
 * on the estate path (spec/v1/16-dependencies.md#applying-the-catalog): that
 * Project's unit applies it. A method with no home belongs to a datastore the
 * old path still runs, and is estate-scoped.
 */
export interface ResolvedCatalogs {
  readonly jobs: readonly ResolvedCatalogJob[];
  readonly homes: ReadonlyMap<ResolvedCatalogJob, CatalogHome>;
}

/** The Process a catalog is derived for, as the union holds it. */
interface Owner {
  readonly project: EffectiveProject;
  readonly application: EffectiveProject["applications"][number];
  readonly process: EffectiveProject["applications"][number]["processes"][number];
}

/** The projects on the estate path whose Processes name buckets in one object store, with the buckets each names. */
function bucketReadersOf(
  set: PinnedSet,
  { application, process }: Owner,
): { readonly project: string; readonly buckets: readonly string[] }[] {
  return set.projects
    .filter(({ project }) => onEstatePath(set, project))
    .map(({ project, applications }) => ({
      project,
      buckets: [
        ...new Set(
          applications
            .flatMap(({ processes }) => processes)
            // A missing list and an empty one hold no edge alike.
            // Stryker disable next-line ArrayDeclaration
            .flatMap(({ dependsOn }) => dependsOn ?? [])
            .filter(
              (edge) =>
                edge.application === application.id &&
                bucketStoreOf(edge, set.projects) === process.name,
            )
            // Stryker disable next-line ArrayDeclaration: an edge reaching a
            // store with no buckets is filtered below either way.
            .flatMap((edge) => edge.buckets ?? [])
            .map((name) => bucketOf(project, name)),
        ),
      ].sort(),
    }))
    .filter(({ buckets }) => buckets.length > 0)
    .sort((a, b) => (a.project < b.project ? -1 : 1));
}

/** The login a catalog method applies its catalog with, where it has one. */
function adminOf(
  set: PinnedSet,
  { project, application, process }: Owner,
): AdminLogin | undefined {
  if (onEstatePath(set, project.project))
    return ownsBuckets(process)
      ? {
          path: catalogCredentialOf(project.project, process.name),
          ...TOKEN_KEY,
        }
      : {
          path: catalogCredentialOf(project.project, process.name),
          ...DERIVED_KEYS,
        };
  // A legacy project is named by a ledger, so the ledger is there.
  // Stryker disable next-line OptionalChaining
  return set.platform.handover?.serving?.find(
    (location) => location.application === application.id,
  )?.admin;
}

/** The catalog one datastore's consumers derive, where any of them is on the estate path. */
function catalogOf(
  set: PinnedSet,
  owner: Owner,
  address: { readonly host: string; readonly port: number },
): ResolvedCatalogJob["catalog"] | undefined {
  const admin = adminOf(set, owner);
  if (ownsBuckets(owner.process)) {
    const readers = bucketReadersOf(set, owner);
    if (readers.length === 0 || admin === undefined || !("token" in admin))
      return undefined;
    return {
      ...address,
      admin,
      keys: readers.map(({ project, buckets }) => ({
        name: project,
        path: bucketKeyOf(project, owner.process.name),
        buckets: [...buckets],
      })),
    };
  }
  const home = homeOf(
    set.platform,
    owner.project.project,
    owner.application.id,
    owner.process.name,
  );
  const readers = readersOf(set, home.namespace, home.process);
  if (readers.length === 0 || admin === undefined || !("user" in admin))
    return undefined;
  return {
    ...address,
    connection: owner.process.name,
    admin,
    databases: readers.map((project) => ({
      name: `${project}_db`,
      owner: ownerRole(project),
      data: dataRole(project),
    })),
  };
}

export function resolveCatalogJobs(
  set: PinnedSet,
  job: ResolvedPolicyJob | undefined,
): ResolvedCatalogs {
  const homes = new Map<ResolvedCatalogJob, CatalogHome>();
  if (job === undefined) return { jobs: [], homes };
  const jobs = set.projects.flatMap((owner: EffectiveProject) =>
    owner.applications.flatMap((application) =>
      application.processes
        .filter((process) => ownsDatabases(process) || ownsBuckets(process))
        .flatMap((process) => {
          // E_NO_ENGINE_POLICY refused an engine the platform has no entry for.
          const engine = process.engine as NonNullable<typeof process.engine>;
          const policy = set.platform.engines[engine] as NonNullable<
            (typeof set.platform.engines)[typeof engine]
          >;
          const surface = policy.catalogSurface ?? policy.surface;
          if (policy.catalog === undefined || surface === undefined) return [];
          const home = homeOf(
            set.platform,
            owner.project,
            application.id,
            process.name,
          );
          // E_CATALOG_SURFACE_NOT_PROVIDED or E_BACKUP_SURFACE_NOT_PROVIDED
          // refused a surface the Process does not provide.
          const port = process.provides?.[surface] as number;
          const catalog = catalogOf(
            set,
            { project: owner, application, process },
            {
              host: `${home.process}.${home.namespace}.svc.cluster.local`,
              port,
            },
          );
          if (catalog === undefined) return [];
          // The alias is checked against the lock before resolution runs:
          // E_UNLOCKED_IMAGE.
          const image = set.imagesLock.images[policy.catalog] as LockedImage;
          const identity = catalogIdentityOf(process.name);
          const store = storeOf({
            platform: set.platform,
            union: set.projects,
          });
          const resolved: ResolvedCatalogJob = {
            identity,
            namespace: home.namespace,
            image: `${image.repository}@${image.digest}`,
            ...versionOf("imageVersion", image),
            uid: image.uid,
            gid: image.gid,
            role: vaultNameOf(home.namespace, identity),
            address: job.address,
            memory: job.memory,
            cpu: job.cpu,
            deadline: job.deadline,
            eligibleNodes: job.eligibleNodes,
            catalog,
            consumes: [consumedOf(application.id, surface)],
            egress: [
              { rule: "datastore", ...home, port },
              store,
              {
                rule: "cluster-dns",
                namespace: set.platform.substrate.clusterDns,
                port: DNS_PORT,
              },
            ],
          };
          if (onEstatePath(set, owner.project))
            homes.set(resolved, {
              project: owner.project,
              application: application.id,
            });
          return [resolved];
        }),
    ),
  );
  return { jobs, homes };
}
