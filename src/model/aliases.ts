// The name a consumer reaches its provider by (spec/v1/16-dependencies.md#the-alias):
// the provider's Application Id, a Service in the consumer's own namespace
// that names wherever the provider serves.
import type { ClusterStateDocument } from "./cluster-state.ts";
import { servingOf } from "./move.ts";
import type { PlatformIntentDocument } from "./platform-intent.ts";
import { homeOf, namespaceOf } from "./runtime-profiles.ts";
import { stableHostOf } from "./stable-address.ts";

/** One edge as far as an alias reads it. */
export interface Named {
  readonly application: string;
  readonly surface: string;
}

/** Enough of a project to find where a surface serves: authored or lowered. */
interface Serving {
  readonly project: string;
  readonly applications: readonly {
    readonly id: string;
    readonly processes: readonly {
      readonly name: string;
      readonly provides?: Readonly<Record<string, number>>;
    }[];
  }[];
}

/** Where an edge's provider serves: a host and the surface's port. */
export interface Served {
  readonly host: string;
  readonly port: number;
}

/** What a consumer dials, and the name its alias points at where one renders. */
export interface Reach {
  readonly address: string;
  readonly target?: string;
}

const CLUSTER_DOMAIN = "svc.cluster.local";

const IP = /^[\d.]+$|:/;

/**
 * Where the provider an edge names serves, in the union or in the platform's
 * register: for a Process ClusterState records an Instance of, where that
 * Instance serves.
 */
export function servedOf(
  { application, surface }: Named,
  union: readonly Serving[],
  platform: Pick<PlatformIntentDocument, "handover" | "providers">,
  clusterState?: ClusterStateDocument,
): Served | undefined {
  for (const { project, applications } of union)
    for (const declared of applications)
      if (declared.id === application)
        for (const process of declared.processes) {
          const port = process.provides?.[surface];
          if (port !== undefined) {
            const home = homeOf(platform, project, application, process.name);
            const serving =
              clusterState === undefined
                ? undefined
                : servingOf(clusterState, application, process.name);
            return {
              host: `${serving?.name ?? home.process}.${serving?.namespace ?? home.namespace}.${CLUSTER_DOMAIN}`,
              port,
            };
          }
        }
  const provider = platform.providers?.find(
    ({ name, surfaces }) =>
      name === application && Object.hasOwn(surfaces, surface),
  );
  return provider === undefined
    ? undefined
    : { host: provider.address, port: provider.surfaces[surface] as number };
}

/**
 * The alias's name: the Application Id, or the Id and the surface where the
 * project's edges name several surfaces of it, since a name carries no port.
 */
export function aliasNameOf(
  { application, surface }: Named,
  named: readonly Named[],
): string {
  const surfaces = new Set(
    named
      .filter((edge) => edge.application === application)
      .map((edge) => edge.surface),
  );
  return surfaces.size > 1 ? `${application}-${surface}` : application;
}

/**
 * What `project`'s consumer dials: a provider in its own namespace by its own
 * Service name, an address that is an IP as it stands, anything else by its
 * alias.
 */
export function reachOf(
  edge: Named,
  served: Served,
  project: string,
  named: readonly Named[],
): Reach {
  const port = String(served.port);
  const local = `.${namespaceOf(project)}.${CLUSTER_DOMAIN}`;
  if (served.host.endsWith(local))
    return { address: `${served.host.slice(0, -local.length)}:${port}` };
  if (IP.test(served.host)) return { address: `${served.host}:${port}` };
  // The alias points at the Stable Address, so a provider that moves
  // changes the Stable Address alone, never a consumer's render.
  return {
    address: `${aliasNameOf(edge, named)}:${port}`,
    target: stableHostOf(edge),
  };
}
