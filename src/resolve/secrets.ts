// A Process's grants, Assets and sidecars to their share of its element of the
// Resolved Deployment (spec/v1/20-resolved-deployment.md#derived-mechanics):
// what each grant is synced to and restarts, each Asset under the
// content-hashed name an edit changes, and each sidecar's image by digest.
import type { EffectiveProcess } from "../model/effective-intent.ts";
import type { Hasher } from "../model/hasher.ts";
import type { ImagesLockDocument, LockedImage } from "../model/images-lock.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { notChecked, notSupported } from "../model/internal-failure.ts";

type ResolvedGrant = NonNullable<ResolvedProcess["secrets"]>[number];
type ResolvedAsset = NonNullable<ResolvedProcess["assets"]>[number];
type ResolvedSidecar = NonNullable<ResolvedProcess["sidecars"]>[number];

/** The KV-v2 mount a `kv` path is read through, which a Secret's name leaves out. */
const KV_MOUNT = /^secret\/data\//;
/** How many hex digits of an Asset's content digest its name carries. */
const CONTENT_DIGITS = 10;

/** The Secret a grant's value is synced to: the Process, then the path below the mount. */
export const destinationOf = (process: string, path: string): string =>
  `${process}-${path.replace(KV_MOUNT, "").replaceAll("/", "-")}`;

/** What a transit operation may do, on the one path it maps to. */
const transitPath = (key: string, operation: string): string =>
  operation === "rotate"
    ? `transit/keys/${key}/rotate`
    : `transit/${operation}/${key}`;

type Grant = NonNullable<EffectiveProcess["secrets"]>[number];
type EngineGrant = Exclude<Grant, { readonly path: string }>;

/** The paths a non-kv grant's policy covers: one per transit operation, or the role's credential. */
function enginePaths(grant: EngineGrant): ResolvedEngine["paths"] {
  if ("key" in grant)
    return grant.operations.map((operation) => ({
      path: transitPath(grant.key, operation),
      allows: ["update"],
    }));
  return [{ path: `database/creds/${grant.role}`, allows: ["read"] }];
}

type ResolvedEngine = Extract<ResolvedGrant, { readonly engine: string }>;

export function resolveGrants(process: EffectiveProcess): ResolvedGrant[] {
  // A missing list and an empty one hold no grant alike.
  // Stryker disable next-line ArrayDeclaration
  return (process.secrets ?? []).map((grant): ResolvedGrant => {
    const restart =
      grant.rotation.tolerates === "restart"
        ? { restartTargets: [process.name] }
        : {};
    // A non-kv grant is delivered `self`, or E_NON_KV_DELIVERY refused it.
    if (!("path" in grant))
      return {
        engine: grant.engine,
        delivery: "self",
        paths: enginePaths(grant),
        ...restart,
      };
    return {
      path: grant.path,
      keys: grant.keys,
      access: grant.access,
      delivery: grant.delivery,
      ...(grant.delivery === "self"
        ? {}
        : { destination: destinationOf(process.name, grant.path) }),
      ...(grant.mountAt === undefined ? {} : { mountAt: grant.mountAt }),
      ...(grant.fileMode === undefined ? {} : { fileMode: grant.fileMode }),
      // A rotation restarts the Process in place, and a reload restarts nothing.
      ...restart,
    };
  });
}

/** An Asset's file name, spelled as the part of an object name it becomes. */
const spelled = (from: string): string =>
  (from.split("/").pop() as string)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-");

export function resolveAssets(
  process: EffectiveProcess,
  files: ReadonlyMap<string, string>,
  hash: Hasher,
): ResolvedAsset[] {
  // A missing list and an empty one hold no Asset alike.
  // Stryker disable next-line ArrayDeclaration
  return (process.assets ?? []).map(({ from, mountAt }) => {
    const content = files.get(from);
    if (content === undefined)
      throw notChecked(
        `${from}: an Asset whose file is not read beside its project is refused, which is not checked yet`,
      );
    if (content.includes("${"))
      throw notSupported(
        `${from}: a placeholder in an Asset is not resolved yet`,
      );
    const digest = hash(content).split(":")[1] as string;
    return {
      name: `${process.name}-${spelled(from)}-${digest.slice(0, CONTENT_DIGITS)}`,
      from,
      mountAt,
      content,
    };
  });
}

export const resolveSidecars = (
  process: EffectiveProcess,
  lock: ImagesLockDocument,
): ResolvedSidecar[] =>
  // A missing list and an empty one hold no sidecar alike.
  // Stryker disable next-line ArrayDeclaration
  (process.sidecars ?? []).map(({ name, image, memory, cpu }) => {
    // Every sidecar's alias is checked against the lock: E_UNLOCKED_IMAGE.
    const locked = lock.images[image] as LockedImage;
    return {
      name,
      image: `${locked.repository}@${locked.digest}`,
      memory,
      cpu,
    };
  });
