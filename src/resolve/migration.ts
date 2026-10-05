// A managed migration to its plan
// (spec/v1/20-resolved-deployment.md#the-migration): what the proof beside the
// project records about this release, and everything its Jobs run with, each
// a function of the Application id, the project and the Platform document.
import type {
  EffectiveApplication,
  EffectiveProject,
} from "../model/effective-intent.ts";
import type { ImagesLockDocument, LockedImage } from "../model/images-lock.ts";
import { notChecked } from "../model/internal-failure.ts";
import {
  migrationImage,
  type MigrationProofDocument,
} from "../model/migration-proof.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import { ownerRole } from "../model/project-intent-queries.ts";
import type { ResolvedMigration } from "../model/resolved-deployment.ts";
import { migrationIdentityOf } from "../model/runtime-profiles.ts";
import { datastoreOf } from "./database.ts";
import { DNS_PORT, storeOf } from "./policy.ts";

export interface MigrationContext {
  readonly platform: PlatformIntentDocument;
  readonly lock: ImagesLockDocument;
  readonly project: string;
  readonly union: readonly EffectiveProject[];
  /** The migration proof beside the project file, where CI wrote one. */
  readonly proof: MigrationProofDocument | undefined;
}

/** The one database of a project (spec/v1/16-dependencies.md#the-database-catalog). */
const databaseOf = (project: string): string => `${project}_db`;

export function resolveMigration(
  application: EffectiveApplication,
  context: MigrationContext,
): ResolvedMigration {
  // E_UNLOCKED_IMAGE refused a managed migration whose image is not locked.
  const image = context.lock.images[
    migrationImage(application.id)
  ] as LockedImage;
  // E_NO_MIGRATION_POLICY refused a changelog under a platform with no runner.
  const policy = context.platform.migration as NonNullable<
    PlatformIntentDocument["migration"]
  >;
  const proven = context.proof?.applications.find(
    ({ id }) => id === application.id,
  );
  const datastore = datastoreOf(application, context.union);
  if (datastore === undefined)
    throw notChecked(
      `${application.id}: a migration whose Application reaches no surface of the datastore holding its database is not checked yet`,
    );
  return {
    runner: `${image.repository}@${image.digest}`,
    uid: image.uid,
    gid: image.gid,
    ...(proven?.testedAgainst === undefined
      ? {}
      : { testedAgainst: proven.testedAgainst }),
    nonTransactional: proven?.nonTransactional ?? false,
    identity: migrationIdentityOf(application.id),
    deadline: policy.deadline,
    memory: policy.memory,
    cpu: policy.cpu,
    scratch: context.platform.ephemeral.size,
    database: {
      host: `${datastore.process as string}.${datastore.namespace}.svc.cluster.local`,
      port: datastore.port,
      name: databaseOf(context.project),
    },
    // The owner role changes the schema, and only the migration holds it.
    credential: {
      engine: "database",
      delivery: "self",
      paths: [
        {
          path: `database/creds/${ownerRole(context.project)}`,
          allows: ["read"],
        },
      ],
    },
    egress: [
      datastore,
      storeOf(context),
      {
        rule: "cluster-dns",
        namespace: context.platform.substrate.clusterDns,
        port: DNS_PORT,
      },
    ],
  };
}
