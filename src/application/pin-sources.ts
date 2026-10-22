// The pin source of every artifact a composition writes one for
// (spec/v1/55-delivery.md#rendered-artifacts-and-pins): derived from the
// Platform document and the Reconcile Unit DAG, and written whole, so the
// units it applies are always the ones its artifact holds. One is written
// when the pin moves, and when the committed one no longer says what
// composition derives. A Project's artifact holds its one unit; the
// estate-scoped one holds the unit that provisions secrets and one per tier
// it carries routes for.
import {
  ESTATE_ARTIFACT,
  ESTATE_SOURCE,
  renderPinSource,
  sourceOf,
  type SourceUnit,
} from "../adapters/flux/source.ts";
import { brokenInvariant } from "../model/internal-failure.ts";
import { PIN_ANNOTATIONS } from "../model/pin-annotations.ts";
import {
  fluxNamespaceOf,
  holds,
  type PlatformIntentDocument,
} from "../model/platform-intent.ts";
import {
  edgeUnitOf,
  ROLLBACK_BACKUPS_UNIT,
  SECRETS_UNIT,
  unitOf,
} from "../model/reconcile-units.ts";
import type { ResolvedProject } from "../model/resolution.ts";
import { rolloutAnnotations, type Rollout } from "../model/rollout.ts";
import { readPinSource, samePinSource } from "../read/pin-source.ts";
import {
  ROLLBACK_BACKUPS_DIRECTORY,
  SECRETS_DIRECTORY,
  tierDirectory,
} from "../adapters/shared/paths.ts";
import type { RenderedObject } from "../objects/deliverable.ts";
import type { RenderedFile, Serializer } from "./render-intent-set.ts";

/** One pin source: the artifact it pins, and the file the Estate repository commits for it. */
export interface PinSource {
  readonly name: string;
  readonly path: string;
  readonly text: string;
}

/** An artifact as composition holds it: its name and the files it publishes. */
interface Artifact {
  readonly name: string;
  readonly files: readonly RenderedFile[];
  /** The Rollout a Project's moving pin starts. */
  readonly rollout?: Rollout | undefined;
}

const ESTATE = ESTATE_ARTIFACT;
const INDEX = "/kustomization.yaml";
const SECRETS = SECRETS_DIRECTORY;

// Unit names are distinct within the list they sort, so `<=` would order the
// same list.
// Stryker disable next-line EqualityOperator
const byName = (a: string, b: string): number => (a < b ? -1 : 1);

/** Each unit once, in name order. */
const units = (names: readonly string[]): string[] =>
  [...new Set(names)].sort(byName);

/**
 * The Reconcile Units an artifact holds, each with the path it applies and
 * the units that must be Ready first
 * (spec/v1/20-resolved-deployment.md#the-reconcile-unit).
 */
function unitsOf(
  { name, files }: Artifact,
  projects: readonly ResolvedProject[],
  platform: PlatformIntentDocument,
): SourceUnit[] {
  const declaring = (application: string | undefined): string[] =>
    projects
      .filter(({ project, applications }) =>
        applications.some(({ id }) => holds(application, project, id)),
      )
      .map(({ project }) => unitOf(project));
  if (name !== ESTATE) {
    // A delivered artifact that is not the estate's is a resolved Project's.
    const project = projects.find(
      (candidate) => candidate.project === name,
    ) as ResolvedProject;
    return [
      {
        name: unitOf(name),
        path: `apps/${name}`,
        after: units(
          project.applications.flatMap(
            // A missing list and an empty one follow nothing alike.
            // Stryker disable next-line ArrayDeclaration
            ({ reconcileAfter }) => reconcileAfter ?? [],
          ),
        ),
      },
    ];
  }
  // The estate's artifact holds a unit where it holds that unit's index: a
  // directory of Vault documents alone applies nothing, and neither does a
  // tier no route reaches.
  const indexed = (directory: string): boolean =>
    files.some(({ path }) => path === `${directory}${INDEX}`);
  return [
    ...platform.tiers
      .filter((tier) => indexed(tierDirectory(tier.name)))
      .map((tier): SourceUnit => ({
        name: edgeUnitOf(tier.name),
        path: tierDirectory(tier.name),
        // A route needs its tier's proxy and its own Project's namespace:
        // every Project the tier serves, of which pinSources keeps those
        // on the estate path.
        after: units([
          ...declaring(tier.traefik),
          ...projects
            .filter(({ applications }) =>
              applications.some(({ exposure }) =>
                // Stryker disable next-line ArrayDeclaration
                (exposure ?? []).some((served) => served.tier === tier.name),
              ),
            )
            .map(({ project }) => unitOf(project)),
        ]),
      })),
    ...(indexed(SECRETS)
      ? [
          {
            name: SECRETS_UNIT,
            path: SECRETS,
            // The Vault policy job writes into the Secret Store, which its
            // project's unit brings up.
            after: declaring(platform.secretStore),
          },
        ]
      : []),
    ...(indexed(ROLLBACK_BACKUPS_DIRECTORY)
      ? [
          {
            name: ROLLBACK_BACKUPS_UNIT,
            path: ROLLBACK_BACKUPS_DIRECTORY,
            // Each Job runs in a Project already on the estate path, as the
            // backup identity that Project's unit brought up.
            // Stryker disable next-line ArrayDeclaration
            after: [],
          },
        ]
      : []),
  ];
}

/**
 * The pin source composition writes, as the file the Estate repository
 * commits: that of each of `moving`, whose pin moves, and that of every other
 * artifact of `delivered` whose `committed` source holds other objects than
 * the one derived now; how either is written says nothing. A source written while its pin stays keeps the digest it is
 * committed at, and stays a first delivery's where it is one. A paused
 * Project's keeps its units as committed, since the ones derived now come from
 * a fragment a human is holding back; what it says of the path itself, the
 * repository, the signer and the pull Secret, follows the Platform document
 * all the same.
 *
 * A unit follows only units `delivered` holds: a Project still on the old path
 * has no unit on this one, which would never become Ready, and is already
 * running where the old path put it. A Project's artifact that moves and is
 * not yet `pinned` is a first delivery, the handover's, and recreates the
 * Deployments it cannot take over in place.
 */
export function pinSources(
  moving: readonly Artifact[],
  delivered: readonly Artifact[],
  projects: readonly ResolvedProject[],
  platform: PlatformIntentDocument,
  serialize: Serializer,
  held: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
  pinned: ReadonlySet<string> = new Set(),
  committed: Readonly<Record<string, string>> = {},
): PinSource[] {
  const onPath = new Set(
    delivered.flatMap((artifact) =>
      unitsOf(artifact, projects, platform).map(({ name }) => name),
    ),
  );
  const { artifacts: published } = platform.bootstrap.flux;
  const flux = {
    namespace: fluxNamespaceOf(platform),
    repository: published.repository,
    signer: published.signer,
    pullSecret: published.pullSecret,
  };
  const moves = new Map(moving.map(({ name, rollout }) => [name, rollout]));
  return delivered.flatMap((artifact): PinSource[] => {
    const { name } = artifact;
    const path = `projects/${name}/source.yaml`;
    const derive = (
      recreate: boolean,
      rollout: Readonly<Record<string, string>>,
      digest?: string,
    ): RenderedObject[] =>
      renderPinSource(
        name === ESTATE ? ESTATE_SOURCE : sourceOf(name),
        name,
        unitsOf(artifact, projects, platform).map((unit) => ({
          ...unit,
          after: unit.after.filter((followed) => onPath.has(followed)),
          ...(Object.keys(rollout).length === 0
            ? {}
            : { annotations: rollout }),
        })),
        flux,
        held[name],
        recreate,
        digest,
      );
    const file = (objects: readonly RenderedObject[]): PinSource => ({
      name,
      path,
      text: serialize(objects, path),
    });
    if (moves.has(name)) {
      const rollout = moves.get(name);
      return [
        file(
          derive(
            name !== ESTATE && !pinned.has(name),
            rollout === undefined ? {} : rolloutAnnotations(rollout),
          ),
        ),
      ];
    }
    const before = committed[name];
    if (before === undefined) return [];
    const pin = readPinSource(before);
    if (pin === undefined)
      throw brokenInvariant(`${path}: a committed pin source names no digest`);
    // The Rollout stays the committed one: the release that moved the pin,
    // which a later release that renders the same does not replace.
    const derived = derive(pin.recreates, pin.rollout, pin.digest);
    const written = file(
      PIN_ANNOTATIONS.pausedBy in (held[name] ?? {})
        ? // The source itself is derived; its units stay the committed ones.
          [
            ...derived.slice(0, 1),
            ...(pin.units as unknown as RenderedObject[]),
          ]
        : derived,
    );
    return samePinSource(written.text, before) ? [] : [written];
  });
}
