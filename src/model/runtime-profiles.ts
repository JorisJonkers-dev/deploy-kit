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
