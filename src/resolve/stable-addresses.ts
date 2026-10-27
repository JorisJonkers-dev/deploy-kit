// The Stable Addresses (spec/v1/16-dependencies.md#the-stable-address): one per
// surface that an edge of the union names, or that a tier's forward-auth asks,
// each naming where the surface's active Instance serves. A surface nothing
// resolves derives none.
import { servedOf, type Named } from "../model/aliases.ts";
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import {
  stableNameOf,
  type ResolvedStableAddress,
} from "../model/stable-address.ts";

/** An address that is an IP, which no name can stand for. */
const IP = /^[\d.]+$|:/;

/** A surface some Project names, and that Project. */
interface NamedBy extends Named {
  readonly project: string;
}

/** Every surface the union's edges and the tiers' forward-auth name, with who names it. */
function namedOf(
  union: readonly EffectiveProject[],
  platform: PlatformIntentDocument,
): NamedBy[] {
  const edges = union.flatMap(({ project, applications }) =>
    applications.flatMap(({ processes }) =>
      processes.flatMap((process) =>
        [
          // A Process with no edge and one with an empty list name nothing alike.
          // Stryker disable next-line ArrayDeclaration
          ...(process.dependsOn ?? []),
          // A template's pods reach their providers the same way.
          // Stryker disable next-line ArrayDeclaration
          ...(process.spawns ?? []).flatMap(({ dependsOn }) => dependsOn ?? []),
        ].map(({ application, surface }) => ({
          application,
          surface,
          project,
        })),
      ),
    ),
  );
  // A tier's forward-auth is asked by its proxy, whose Project renders the
  // middleware.
  const asked = platform.tiers.flatMap(({ traefik, forwardAuth }) =>
    (forwardAuth === undefined ? [] : [forwardAuth]).map((asking) => ({
      application: asking.provider.slice(asking.provider.indexOf("/") + 1),
      surface: asking.surface,
      project: traefik.slice(0, traefik.indexOf("/")),
    })),
  );
  return [...edges, ...asked];
}

export function resolveStableAddresses(
  union: readonly EffectiveProject[],
  platform: PlatformIntentDocument,
): ResolvedStableAddress[] {
  const named = namedOf(union, platform);
  const names = [...new Set(named.map(stableNameOf))].sort();
  return names.flatMap((name): ResolvedStableAddress[] => {
    const naming = named.filter((one) => stableNameOf(one) === name);
    const [first] = naming as [NamedBy, ...NamedBy[]];
    // A provider the union does not hold is refused before resolution:
    // E_UNRESOLVED_APPLICATION, E_UNKNOWN_SURFACE.
    const served = servedOf(first, union, platform);
    return served === undefined || IP.test(served.host)
      ? []
      : [
          {
            name,
            target: served.host,
            port: served.port,
            consumers: [
              ...new Set(naming.map(({ project }) => project)),
            ].sort(),
          },
        ];
  });
}
