// A dependency edge resolved against the union and the platform's register of
// providers (spec/v1/16-dependencies.md#dependency-edges): the pair names one
// Process, one port and one address, and the peers a policy admits.
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { DependencyEdge } from "../model/project-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { addressOf, namespaceOf } from "../model/runtime-profiles.ts";

export type ResolvedEdge = NonNullable<ResolvedProcess["dependencies"]>[number];

/** Resolves an edge, or says which provider or surface the union does not hold. */
export function resolveEdge(
  edge: DependencyEdge,
  union: readonly EffectiveProject[],
  platform: PlatformIntentDocument,
): ResolvedEdge {
  const { application, surface } = edge;
  for (const { project, applications } of union)
    for (const declared of applications)
      if (declared.id === application)
        for (const process of declared.processes) {
          const port = process.provides?.[surface];
          if (port !== undefined)
            return {
              application,
              surface,
              address: addressOf(process.name, project, port),
              peers: [
                {
                  namespace: namespaceOf(project),
                  process: process.name,
                  port,
                },
              ],
            };
        }
  const provider = platform.providers?.find(
    ({ name, surfaces }) =>
      name === application && Object.hasOwn(surfaces, surface),
  );
  if (provider === undefined)
    throw new Error(`${application}.${surface}: no provider in the union`);
  return {
    application,
    surface,
    address: `${provider.address}:${String(provider.surfaces[surface])}`,
  };
}
