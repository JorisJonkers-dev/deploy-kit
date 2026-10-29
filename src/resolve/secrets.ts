// A Process's grants, Assets and sidecars to their share of its element of the
// Resolved Deployment (spec/v1/20-resolved-deployment.md#derived-mechanics):
// what each grant is synced to and restarts, each Asset under the
// content-hashed name an edit changes, and each sidecar's image by digest.
import type { EffectiveProcess } from "../model/effective-intent.ts";
import type { Hasher } from "../model/hasher.ts";
import {
  type ImagesLockDocument,
  type LockedImage,
  versionOf,
} from "../model/images-lock.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { notSupported } from "../model/internal-failure.ts";
import {
  GENERATED_DEFAULTS,
  isGenerated,
  isOptional,
  keyName,
} from "../model/project-intent-queries.ts";

type ResolvedGrant = NonNullable<ResolvedProcess["secrets"]>[number];
type ResolvedAsset = NonNullable<ResolvedProcess["assets"]>[number];
type ResolvedSidecar = NonNullable<ResolvedProcess["sidecars"]>[number];

/** The KV-v2 mount a `kv` path is read through, which a Secret's name leaves out. */
const KV_MOUNT = /^secret\/data\//;
/** How many hex digits of an Asset's content digest its name carries. */
const CONTENT_DIGITS = 10;

/** The Secret a grant's value is synced to: the Process, then the path below the mount. */
/**
 * What a changed value restarts: the Process that holds it. A scheduled
 * Process has nothing running to restart, and each run reads the value it
 * starts with (spec/v1/10-project-intent.md#scheduled-processes).
 */
export const restartOf = (
  process: EffectiveProcess,
): { restartTargets?: string[] } =>
  process.lifecycle === "scheduled" ? {} : { restartTargets: [process.name] };

export const destinationOf = (process: string, path: string): string =>
  `${process}-${path.replace(KV_MOUNT, "").replaceAll("/", "-")}`;

/** The one path a transit operation maps to, and what it may do there. */
function transitPath(
  key: string,
  operation: string,
): ResolvedEngine["paths"][number] {
  // `read` is the key's public part and versions, which the key itself serves.
  if (operation === "read")
    return { path: `transit/keys/${key}`, allows: ["read"] };
  return {
    path:
      operation === "rotate"
        ? `transit/keys/${key}/rotate`
        : `transit/${operation}/${key}`,
    allows: ["update"],
  };
}

type Grant = NonNullable<EffectiveProcess["secrets"]>[number];
type EngineGrant = Exclude<Grant, { readonly path: string }>;

/** The paths a non-kv grant's policy covers: one per transit operation, or the role's credential. */
function enginePaths(grant: EngineGrant): ResolvedEngine["paths"] {
  if ("key" in grant)
    return grant.operations.map((operation) =>
      transitPath(grant.key, operation),
    );
  return [{ path: `database/creds/${grant.role}`, allows: ["read"] }];
}

type ResolvedEngine = Extract<ResolvedGrant, { readonly engine: string }>;

export function resolveGrants(process: EffectiveProcess): ResolvedGrant[] {
  // A missing list and an empty one hold no grant alike.
  // Stryker disable next-line ArrayDeclaration
  return (process.secrets ?? []).map((grant): ResolvedGrant => {
    const restart =
      grant.rotation.tolerates === "restart" ? restartOf(process) : {};
    // A non-kv grant is delivered `self`, or E_NON_KV_DELIVERY refused it.
    if (!("path" in grant))
      return {
        engine: grant.engine,
        delivery: "self",
        paths: enginePaths(grant),
        ...restart,
      };
    const generated = grant.keys.flatMap((key) => {
      if (!isGenerated(key)) return [];
      const { adopt, ...made } = key.generate;
      // The schema refused a location that is not one path and one key.
      const [path, adopted] = (adopt?.split("#") ?? []) as [string, string];
      return [
        {
          key: key.name,
          ...GENERATED_DEFAULTS,
          ...made,
          ...(adopt === undefined ? {} : { adopt: { path, key: adopted } }),
        },
      ];
    });
    const optional = grant.keys.filter(isOptional).map(keyName);
    return {
      path: grant.path,
      keys: grant.keys.map(keyName),
      ...(generated.length === 0 ? {} : { generated }),
      ...(optional.length === 0 ? {} : { optional }),
      access: grant.access,
      delivery: grant.delivery,
      ...(grant.delivery === "self"
        ? {}
        : { destination: destinationOf(process.name, grant.path) }),
      ...(grant.mountAt === undefined ? {} : { mountAt: grant.mountAt }),
      ...(grant.fileMode === undefined ? {} : { fileMode: grant.fileMode }),
      // A synced value restarts the Process in place once the operator syncs
      // it, whatever the rotation tolerates; read by the Process itself, a
      // rotation restarts it, and a reload restarts nothing.
      ...(grant.delivery === "self" ? restart : restartOf(process)),
    };
  });
}

/** An Asset's file name, spelled as the part of an object name it becomes. */
const spelled = (from: string): string =>
  (from.split("/").pop() as string)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-");

/** A placeholder of one of the sources an env file reads (spec/v1/10-project-intent.md#placeholder-sources). */
const PLACEHOLDER = /\$\{(?:secret|dependency|exposure|client):/;

export function resolveAssets(
  process: EffectiveProcess,
  files: ReadonlyMap<string, string>,
  hash: Hasher,
): ResolvedAsset[] {
  // A missing list and an empty one hold no Asset alike.
  // Stryker disable next-line ArrayDeclaration
  return (process.assets ?? []).map((asset) => {
    const { from } = asset;
    // The file is read beside its project, or E_ASSET_NOT_FOUND refused it.
    const content = files.get(from) as string;
    // A placeholder names its source; any other `${` is the file's own text,
    // such as a variable the application expands itself.
    if (PLACEHOLDER.test(content))
      throw notSupported(
        `${from}: a placeholder in an Asset is not resolved yet`,
      );
    const digest = hash(content).split(":")[1] as string;
    return {
      name: `${process.name}-${spelled(from)}-${digest.slice(0, CONTENT_DIGITS)}`,
      from,
      ...("mountAt" in asset
        ? { mountAt: asset.mountAt }
        : { seedAt: asset.seedAt }),
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
  (process.sidecars ?? []).map(
    ({ name, image, command, args, memory, cpu, volumes, init }) => {
      // Every sidecar's alias is checked against the lock: E_UNLOCKED_IMAGE.
      const locked = lock.images[image] as LockedImage;
      return {
        name,
        image: `${locked.repository}@${locked.digest}`,
        ...versionOf("imageVersion", locked),
        ...(command === undefined ? {} : { command }),
        ...(args === undefined ? {} : { args }),
        memory,
        cpu,
        ...(volumes === undefined ? {} : { volumes }),
        ...(init === undefined ? {} : { init }),
      };
    },
  );
