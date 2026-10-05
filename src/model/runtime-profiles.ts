// Runtime Profiles (spec/v1/10-project-intent.md#runtime-profiles): what a
// Process's `runtime` injects, so no project writes it. Only the profiles that
// export telemetry and HTTP server metrics inject anything.
import {
  GATE_SURFACE,
  OTLP_SURFACE,
  type PlatformIntentDocument,
} from "./platform-intent.ts";
import type { Runtime } from "./vocabularies.ts";

const EXPORTING: ReadonlySet<Runtime> = new Set(["jvm", "node", "python"]);

/** Whether a runtime's profile exports telemetry and HTTP server metrics. */
export const exports = (runtime: Runtime): boolean => EXPORTING.has(runtime);

/** The namespace every Application of a project lives in. */
export const namespaceOf = (project: string): string => `${project}-system`;

/** The identity a Process's backups run as, apart from the Process's own. */
export const backupIdentityOf = (process: string): string =>
  `${process}-backup`;

/** The identity an Application's migration runs as, apart from every Process's. */
export const migrationIdentityOf = (application: string): string =>
  `${application}-migration`;

/**
 * What an identity's Vault auth role and its policy are both called
 * (spec/v1/16-dependencies.md#process-identity): one auth mount holds every
 * project's, so the name carries the namespace the identity is unique in.
 */
export const vaultNameOf = (namespace: string, identity: string): string =>
  `${namespace}-${identity}`;

/**
 * The name an identity's cluster-scoped objects carry
 * (spec/v1/16-dependencies.md#kubernetes-api-access-is-declared-and-admitted):
 * no namespace holds them apart, so the name carries it.
 */
export const clusterNameOf = (namespace: string, identity: string): string =>
  `${namespace}-${identity}`;

/** The in-cluster address of one Process's port. */
export const addressOf = (
  process: string,
  project: string,
  port: number,
): string =>
  `${process}.${namespaceOf(project)}.svc.cluster.local:${String(port)}`;

/** Enough of a project to find a Process's port: authored or lowered. */
interface Declares {
  readonly project: string;
  readonly applications: readonly {
    readonly id: string;
    readonly processes: readonly {
      readonly name: string;
      readonly provides?: Readonly<Record<string, number>>;
    }[];
  }[];
}

/** The address of the Process of `application` that provides `surface`, where one does. */
export function surfaceAddress(
  projects: readonly Declares[],
  application: string | undefined,
  surface: string,
): string | undefined {
  for (const { project, applications } of projects)
    for (const { id, processes } of applications)
      if (id === application)
        for (const process of processes) {
          const port = process.provides?.[surface];
          if (port !== undefined) return addressOf(process.name, project, port);
        }
  return undefined;
}

/** The endpoint an `http://` client is handed for `application`'s `surface`. */
const endpoint = (address: string | undefined): string | undefined =>
  address === undefined ? undefined : `http://${address}`;

/**
 * The endpoint every exporting profile is handed
 * (spec/v1/14-platform-intent.md#telemetry): the named collector's `otlp`
 * surface, or nothing where the platform names no collector or the union
 * declares none that receives.
 */
export const collectorEndpoint = (
  platform: PlatformIntentDocument,
  projects: readonly Declares[],
): string | undefined =>
  endpoint(
    surfaceAddress(projects, platform.telemetry?.collector, OTLP_SURFACE),
  );

/**
 * The endpoint every Canary's webhooks ask (spec/v1/55-delivery.md#the-release-gate):
 * the named Release Gate's `http` surface.
 */
export const gateEndpoint = (
  platform: PlatformIntentDocument,
  projects: readonly Declares[],
): string | undefined =>
  endpoint(surfaceAddress(projects, platform.delivery?.gate, GATE_SURFACE));

/** The Secret Store every grant reads from: its `http` surface, where the platform names one. */
export const secretStoreAddress = (
  platform: PlatformIntentDocument,
  projects: readonly Declares[],
): string | undefined =>
  surfaceAddress(projects, platform.secretStore, GATE_SURFACE);

/** The endpoint the secrets operator connects to the Secret Store through. */
export const secretStoreEndpoint = (
  platform: PlatformIntentDocument,
  projects: readonly Declares[],
): string | undefined => endpoint(secretStoreAddress(platform, projects));
