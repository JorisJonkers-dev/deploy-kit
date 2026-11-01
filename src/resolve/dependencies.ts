// A dependency edge resolved against the union and the platform's register of
// providers (spec/v1/16-dependencies.md#dependency-edges): the pair names one
// Process, one port and one address, and the peers a policy admits.
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { DependencyEdge } from "../model/project-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { homeOf } from "../model/runtime-profiles.ts";
import { reachOf, servedOf, type Named } from "../model/aliases.ts";
import type { ClusterStateDocument } from "../model/cluster-state.ts";
import { brokenInvariant } from "../model/internal-failure.ts";
import { departingFromOf } from "../model/move.ts";

export type ResolvedEdge = NonNullable<ResolvedProcess["dependencies"]>[number];

/** Every edge a project's Processes hold, which an alias's name is read against. */
export const edgesOfProject = (
  union: readonly EffectiveProject[],
  project: string,
): Named[] =>
  union
    .filter((candidate) => candidate.project === project)
    .flatMap(({ applications }) => applications)
    .flatMap(({ processes }) => processes)
    .flatMap(({ dependsOn }) => dependsOn ?? []);

/** Resolves `project`'s edge, or says which provider or surface the union does not hold. */
export function resolveEdge(
  edge: DependencyEdge,
  union: readonly EffectiveProject[],
  platform: PlatformIntentDocument,
  project: string,
  clusterState?: ClusterStateDocument,
): ResolvedEdge {
  const { application, surface } = edge;
  const served = servedOf(edge, union, platform);
  if (served === undefined)
    throw brokenInvariant(
      `${application}.${surface}: no provider in the union`,
    );
  const reach = reachOf(edge, served, project, edgesOfProject(union, project));
  for (const { project: home, applications } of union)
    for (const declared of applications)
      if (declared.id === application)
        for (const process of declared.processes)
          if (process.provides?.[surface] !== undefined) {
            const peer = {
              ...homeOf(home, process.name),
              port: served.port,
            };
            // While the provider moves out of another namespace, its source
            // there serves until the Move retires it.
            const from =
              clusterState === undefined
                ? undefined
                : departingFromOf(
                    clusterState,
                    platform,
                    application,
                    process.name,
                    peer.namespace,
                  );
            return {
              application,
              surface,
              ...reach,
              peers: [
                peer,
                ...(from === undefined ? [] : [{ ...peer, namespace: from }]),
              ],
            };
          }
  return { application, surface, ...reach };
}
