// Libraries (spec/v1/14-platform-intent.md#libraries): a directory on one node
// the Platform document declares, and the names its render derives for a
// project that mounts it.
import type { PlatformIntentDocument } from "./platform-intent.ts";

export type Library = NonNullable<PlatformIntentDocument["libraries"]>[string];

/** The library the Platform document declares under `name`, if it declares one. */
export const libraryOf = (
  platform: Pick<PlatformIntentDocument, "libraries">,
  name: string,
): Library | undefined =>
  platform.libraries !== undefined && Object.hasOwn(platform.libraries, name)
    ? platform.libraries[name]
    : undefined;

/** The claim a project's mount of a library binds, in the project's namespace. */
export const libraryClaimOf = (library: string): string => `library-${library}`;

/** The cluster-scoped volume onto a library's directory, one per namespace that mounts it. */
export const libraryVolumeOf = (namespace: string, library: string): string =>
  `${namespace}-${library}`;
