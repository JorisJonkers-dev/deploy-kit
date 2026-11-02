// The methods that apply each datastore's catalog
// (spec/v1/16-dependencies.md#applying-the-catalog): derived where the engine
// names a catalog method, the platform names the Vault policy job that writes
// the method's own role, and some project reads a database or names a bucket
// in the datastore.
import type { EffectiveProject } from "../model/effective-intent.ts";
import { type LockedImage, versionOf } from "../model/images-lock.ts";
import {
  bucketCorsOf,
  bucketNameOf,
  bucketOf,
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

/** What a derived login document holds. */
const DERIVED_KEYS = { user: "user", password: "password" } as const;

/** What a derived login document holds for an object store's admin API. */
const TOKEN_KEY = { token: "token" } as const;

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

/** The projects whose Applications read a database from one datastore. */
function readersOf(
  set: PinnedSet,
  namespace: string,
  process: string,
): string[] {
  return set.projects
    .filter(({ applications }) =>
      applications.some((application) => {
        const datastore = datastoreOf(application, set.projects);
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
 * The catalog methods, and the home of each: its datastore's own Project,
 * whose unit applies it (spec/v1/16-dependencies.md#applying-the-catalog).
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

/** One project's share of an object store's catalog: its buckets, and the origins each admits. */
interface BucketReader {
  readonly project: string;
  readonly buckets: readonly string[];
  readonly cors: readonly {
    readonly bucket: string;
    readonly origins: readonly string[];
  }[];
}

/**
 * The origin an exposure's pages are served from: its tier's scheme and its
 * host, as `${exposure:…#url}` reads it.
 */
function originOf(
  set: PinnedSet,
  exposure: NonNullable<Owner["application"]["exposure"]>[number],
): string {
  // A tier carries the exposure's audience, or E_NO_TIER_FOR_AUDIENCE refused it.
  const tier = set.platform.tiers.find(({ audiences }) =>
    audiences.includes(exposure.audience),
  ) as PinnedSet["platform"]["tiers"][number];
  return `${tier.listener === "tls" ? "https" : "http"}://${exposure.host}`;
}

/**
 * The projects whose Processes name buckets in one object store, with the
 * buckets each names and the origins each bucket admits cross-origin
 * (spec/v1/16-dependencies.md#a-bucket-a-browser-calls).
 */
// A missing list and an empty one hold no edge, and no bucket, alike; and no
// two readers share a project, so `<=` would order the same list.
// Stryker disable ArrayDeclaration,EqualityOperator
function bucketReadersOf(
  set: PinnedSet,
  { application }: Pick<Owner, "application">,
): BucketReader[] {
  return set.projects
    .map(({ project, applications }): BucketReader => {
      const origins = new Map<string, Set<string>>();
      const buckets = new Set<string>();
      for (const consumer of applications)
        for (const edge of consumer.processes
          .flatMap(({ dependsOn }) => dependsOn ?? [])
          // Surfaces are unique in an Application, so it runs one store
          // that provides the surface its catalog is applied over.
          .filter((edge) => edge.application === application.id))
          for (const entry of edge.buckets ?? []) {
            const bucket = bucketOf(project, bucketNameOf(entry));
            buckets.add(bucket);
            for (const name of bucketCorsOf(entry)) {
              // A `cors` entry names an exposure of the consuming
              // Application, or E_UNKNOWN_CORS_EXPOSURE refused it.
              const exposure = (consumer.exposure ?? []).find(
                (candidate) => candidate.name === name,
              ) as NonNullable<typeof consumer.exposure>[number];
              const held = origins.get(bucket) ?? new Set<string>();
              held.add(originOf(set, exposure));
              origins.set(bucket, held);
            }
          }
      return {
        project,
        buckets: [...buckets].sort(),
        cors: [...origins.keys()].sort().map((bucket) => ({
          bucket,
          origins: [...(origins.get(bucket) as Set<string>)].sort(),
        })),
      };
    })
    .filter(({ buckets }) => buckets.length > 0)
    .sort((a, b) => (a.project < b.project ? -1 : 1));
}
// Stryker restore ArrayDeclaration,EqualityOperator

/** The catalog one datastore's consumers derive, where any consumer reads from it. */
function catalogOf(
  set: PinnedSet,
  owner: Owner,
  address: { readonly host: string; readonly port: number },
): ResolvedCatalogJob["catalog"] | undefined {
  const path = catalogCredentialOf(owner.project.project, owner.process.name);
  if (ownsBuckets(owner.process)) {
    const readers = bucketReadersOf(set, owner);
    if (readers.length === 0) return undefined;
    return {
      ...address,
      admin: { path, ...TOKEN_KEY },
      keys: readers.map(({ project, buckets, cors }) => ({
        name: project,
        path: bucketKeyOf(project, owner.process.name),
        buckets: [...buckets],
        // Written only where some bucket admits an origin, so a catalog
        // whose buckets no browser calls reads as it did before.
        ...(cors.length === 0
          ? {}
          : {
              cors: cors.map(({ bucket, origins }) => ({
                bucket,
                origins: [...origins],
              })),
            }),
      })),
    };
  }
  const home = homeOf(owner.project.project, owner.process.name);
  const readers = readersOf(set, home.namespace, home.process);
  if (readers.length === 0) return undefined;
  return {
    ...address,
    connection: owner.process.name,
    admin: { path, ...DERIVED_KEYS },
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
          const home = homeOf(owner.project, process.name);
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
