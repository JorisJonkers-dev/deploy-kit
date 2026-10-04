// A fragment's share of the images lock, and the union composition hands
// resolution (spec/v1/40-composition.md#fragments). A share holds the aliases
// its project file names and nothing else. The union is every share together:
// an alias two shares lock to the same image is one entry, and an alias they
// lock differently is a refusal at the share that changed. Nothing here
// performs IO.
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { EffectiveProject } from "../model/effective-intent.ts";
import {
  aliasesOf,
  sameImage,
  type ImagesLockDocument,
  type LockedImage,
} from "../model/images-lock.ts";
import { readImagesLock } from "../read/pinned-inputs.ts";
import { readYaml } from "../read/yaml.ts";
import type { AuthoredFile } from "./check-intent-set.ts";

/** The name a share has inside a fragment, and the lock has beside the Platform document. */
export const IMAGES_LOCK = "images.lock.yml";

/** One images lock file, read, with every refusal placed at `document`. */
export function readLock(
  text: string,
  document: string,
): Result<ImagesLockDocument> {
  const yaml = readYaml(text);
  const read = yaml.ok ? readImagesLock(yaml.value) : yaml;
  return read.ok
    ? read
    : {
        ok: false,
        diagnostics: read.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          document,
        })),
      };
}

/**
 * A project's share of the lock it is handed: every alias the project file
 * names, and no other. An alias the lock does not hold is refused, so a
 * fragment never names an image nothing can pull.
 */
export function shareOf(
  lock: AuthoredFile,
  project: EffectiveProject,
): Result<ImagesLockDocument> {
  const read = readLock(lock.text, lock.name);
  if (!read.ok) return read;
  const aliases = aliasesOf(project);
  const unlocked = aliases.filter(
    (alias) => !Object.hasOwn(read.value.images, alias),
  );
  if (unlocked.length > 0)
    return {
      ok: false,
      diagnostics: unlocked.map((alias) => ({
        code: "E_UNLOCKED_IMAGE",
        document: lock.name,
        path: "/images",
        message: `the images lock holds no entry for ${alias}`,
        hint: "Lock every alias the project file names before its fragment is published.",
      })),
    };
  return {
    ok: true,
    value: {
      ...read.value,
      name: project.project,
      images: Object.fromEntries(
        aliases.map((alias) => [
          alias,
          read.value.images[alias] as LockedImage,
        ]),
      ),
    },
  };
}

/** One fragment's share, where its files sit in the union, and whether the fragment is new. */
export interface Share {
  readonly directory: string;
  /** False for the Platform document's lock, and for a fragment the previous lock recorded. */
  readonly changed: boolean;
  readonly lock: ImagesLockDocument;
}

const spelled = ({ repository, digest, uid, gid }: LockedImage): string =>
  `${repository}@${digest} as ${String(uid)}:${String(gid)}`;

type Held = readonly [string, readonly Share[]];
// Aliases are distinct keys, so `<=` would order the same list.
// Stryker disable next-line EqualityOperator
const byAlias = ([a]: Held, [b]: Held): number => (a < b ? -1 : 1);

/**
 * Every share as one lock. Where shares lock an alias differently, the ones
 * refused are the changed ones that disagree with what the unchanged ones
 * hold; where nothing unchanged settles it, every share that holds the alias.
 */
export function unionOf(
  shares: readonly Share[],
  name: string,
  schemaVersion: string,
): Result<ImagesLockDocument> {
  const holders = new Map<string, Share[]>();
  for (const share of shares)
    for (const alias of Object.keys(share.lock.images))
      holders.set(alias, [...(holders.get(alias) ?? []), share]);

  const diagnostics: Diagnostic[] = [];
  const images: Record<string, LockedImage> = {};
  for (const [alias, held] of [...holders].sort(byAlias)) {
    const image = (share: Share): LockedImage =>
      share.lock.images[alias] as LockedImage;
    const [first] = held as [Share, ...Share[]];
    images[alias] = image(first);
    if (held.every((share) => sameImage(image(share), image(first)))) continue;

    // What the unchanged shares hold stands, when they hold one thing.
    const settled = held.filter(({ changed }) => !changed);
    const [reference] = settled;
    const refused =
      reference !== undefined &&
      settled.every((share) => sameImage(image(share), image(reference)))
        ? held.filter((share) => !sameImage(image(share), image(reference)))
        : held;
    for (const share of refused) {
      const other = held.find(
        (candidate) => !sameImage(image(candidate), image(share)),
      ) as Share;
      diagnostics.push({
        code: "E_IMAGE_LOCK_CONFLICT",
        document: `${share.directory}/${IMAGES_LOCK}`,
        path: `/images/${alias}`,
        message: `${alias} is locked to ${spelled(image(share))} here, and to ${spelled(image(other))} in ${other.directory}/${IMAGES_LOCK}`,
        hint: "One alias resolves to one image estate-wide: lock the same digest, uid and gid, or name another alias.",
      });
    }
  }
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : {
        ok: true,
        value: {
          apiVersion: "lock.jorisjonkers.dev/v1",
          kind: "ImagesLock",
          schemaVersion,
          name,
          images,
        },
      };
}

/** A fragment, as composition hands it over for the lock. */
export interface Carrier {
  /** Where the fragment's files sit in the union. */
  readonly directory: string;
  readonly changed: boolean;
  /** The document whose images the lock must cover: the project file, or the Platform document. */
  readonly document: string;
  /** Every alias that document names; none where it does not parse, which resolution reports. */
  readonly names: readonly string[];
  /** The lock file the fragment carries, where it carries one. */
  readonly lock: AuthoredFile | undefined;
}

const unlockedIn = (
  { document, names }: Carrier,
  held: (alias: string) => boolean,
): Diagnostic[] =>
  names
    .filter((alias) => !held(alias))
    .map((alias) => ({
      code: "E_UNLOCKED_IMAGE",
      document,
      path: "",
      message: `no lock this document is resolved from holds an entry for ${alias}`,
      hint: "Lock the alias in this fragment's own share or in the Platform document's lock: a fragment is never resolved from another Project's share.",
    }));

const fileOf = ({ directory }: Carrier): string =>
  `${directory}/${IMAGES_LOCK}`;

/**
 * The one lock a composition resolves from. The Platform document's lock is
 * read whole. A Project's share is read only for the aliases its own project
 * file names, and every alias a document names must be locked by its own
 * fragment or by the Platform document's lock, so no fragment decides the image
 * another one runs.
 */
export function composedLock(
  platform: Carrier,
  projects: readonly Carrier[],
  name: string,
  schemaVersion: string,
): Result<ImagesLockDocument> {
  const own =
    platform.lock === undefined
      ? undefined
      : readLock(platform.lock.text, fileOf(platform));
  if (own?.ok === false) return own;
  const estate = own?.value.images ?? {};
  const shares: Share[] =
    own === undefined
      ? []
      : [
          {
            directory: platform.directory,
            changed: platform.changed,
            lock: own.value,
          },
        ];
  const diagnostics = unlockedIn(platform, (alias) =>
    Object.hasOwn(estate, alias),
  );

  for (const project of projects) {
    const read =
      project.lock === undefined
        ? undefined
        : readLock(project.lock.text, fileOf(project));
    if (read?.ok === false) {
      diagnostics.push(...read.diagnostics);
      continue;
    }
    const held = read?.value.images ?? {};
    const images = Object.fromEntries(
      project.names
        .filter((alias) => Object.hasOwn(held, alias))
        .map((alias) => [alias, held[alias] as LockedImage]),
    );
    if (read !== undefined)
      shares.push({
        directory: project.directory,
        changed: project.changed,
        lock: { ...read.value, images },
      });
    diagnostics.push(
      ...unlockedIn(
        project,
        (alias) => Object.hasOwn(images, alias) || Object.hasOwn(estate, alias),
      ),
    );
  }
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : unionOf(shares, name, schemaVersion);
}
