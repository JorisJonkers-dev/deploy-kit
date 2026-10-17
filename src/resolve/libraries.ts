// Each library a Process mounts, resolved against the Platform document that
// declares it (spec/v1/10-project-intent.md#libraries): the directory and its
// node, the group the Process runs with, and the volume and claim its project
// derives onto the directory.
import type { EffectiveProcess } from "../model/effective-intent.ts";
import {
  libraryClaimOf,
  libraryOf,
  libraryVolumeOf,
  type Library,
} from "../model/libraries.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";

export function resolveLibraries(
  process: EffectiveProcess,
  platform: PlatformIntentDocument,
  project: string,
): NonNullable<ResolvedProcess["libraries"]> {
  // A missing list and an empty one mount nothing alike.
  // Stryker disable next-line ArrayDeclaration
  return (process.libraries ?? []).map(
    ({ library, mountAt, subPath, access }) => {
      // Every mounted library is declared, or E_UNKNOWN_LIBRARY refused it.
      const { node, path, gid } = libraryOf(platform, library) as Library;
      return {
        library,
        claim: libraryClaimOf(library),
        volume: libraryVolumeOf(namespaceOf(project), library),
        node,
        path,
        gid,
        mountAt,
        ...(subPath === undefined ? {} : { subPath }),
        access,
      };
    },
  );
}
