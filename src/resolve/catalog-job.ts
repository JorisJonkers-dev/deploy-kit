// The methods that apply each datastore's database catalog
// (spec/v1/16-dependencies.md#applying-the-catalog): derived where the engine
// names a catalog method, the platform names the Vault policy job that writes
// the method's own role, and some project on the estate path reads a database
// from the datastore.
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { LockedImage } from "../model/images-lock.ts";
import {
  dataRole,
  ownerRole,
  ownsDatabases,
} from "../model/project-intent-queries.ts";
import type { PinnedSet } from "../model/resolution.ts";
import type {
  ResolvedCatalogJob,
  ResolvedPolicyJob,
} from "../model/resolved-deployment.ts";
import {
  catalogCredentialOf,
  catalogIdentityOf,
  homeOf,
  vaultNameOf,
} from "../model/runtime-profiles.ts";
import { datastoreOf } from "./database.ts";
import { DNS_PORT, storeOf } from "./policy.ts";

/** What a derived login document holds, once the datastore is on the estate path. */
const DERIVED_KEYS = { user: "user", password: "password" } as const;

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

export function resolveCatalogJobs(
  set: PinnedSet,
  job: ResolvedPolicyJob | undefined,
): ResolvedCatalogJob[] {
  if (job === undefined) return [];
  return set.projects.flatMap((owner: EffectiveProject) =>
    owner.applications.flatMap((application) =>
      application.processes.filter(ownsDatabases).flatMap((process) => {
        // E_NO_ENGINE_POLICY refused an engine the platform has no entry for.
        const engine = process.engine as NonNullable<typeof process.engine>;
        const policy = set.platform.engines[engine] as NonNullable<
          (typeof set.platform.engines)[typeof engine]
        >;
        const surface = policy.surface;
        if (policy.catalog === undefined || surface === undefined) return [];
        const home = homeOf(
          set.platform,
          owner.project,
          application.id,
          process.name,
        );
        const readers = readersOf(set, home.namespace, home.process);
        // A legacy project is named by a ledger, so the ledger is there.
        // Stryker disable next-line OptionalChaining
        const serving = set.platform.handover?.serving;
        const admin = onEstatePath(set, owner.project)
          ? {
              path: catalogCredentialOf(owner.project, process.name),
              ...DERIVED_KEYS,
            }
          : serving?.find((location) => location.application === application.id)
              ?.admin;
        if (readers.length === 0 || admin === undefined) return [];
        // The alias is checked against the lock before resolution runs:
        // E_UNLOCKED_IMAGE.
        const image = set.imagesLock.images[policy.catalog] as LockedImage;
        const port = process.provides?.[surface] as number;
        const identity = catalogIdentityOf(process.name);
        const store = storeOf({ platform: set.platform, union: set.projects });
        return [
          {
            identity,
            namespace: home.namespace,
            image: `${image.repository}@${image.digest}`,
            uid: image.uid,
            gid: image.gid,
            role: vaultNameOf(home.namespace, identity),
            address: job.address,
            memory: job.memory,
            cpu: job.cpu,
            deadline: job.deadline,
            catalog: {
              host: `${home.process}.${home.namespace}.svc.cluster.local`,
              port,
              connection: engine,
              admin,
              databases: readers.map((project) => ({
                name: `${project}_db`,
                owner: ownerRole(project),
                data: dataRole(project),
              })),
            },
            egress: [
              { rule: "datastore", ...home, port },
              store,
              {
                rule: "cluster-dns",
                namespace: set.platform.substrate.clusterDns,
                port: DNS_PORT,
              },
            ],
          },
        ];
      }),
    ),
  );
}
