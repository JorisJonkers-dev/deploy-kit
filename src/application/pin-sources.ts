// The pin source of every artifact whose pin a composition moves
// (spec/v1/55-delivery.md#rendered-artifacts-and-pins): derived from the
// Platform document and the Reconcile Unit DAG, and rewritten whole with each
// move, so the units it applies are always the ones its artifact holds. A
// Project's artifact holds its one unit; the estate-scoped one holds the unit
// that provisions secrets and one per tier it carries routes for.
import {
  ESTATE_ARTIFACT,
  ESTATE_SOURCE,
  renderPinSource,
  sourceOf,
  type SourceUnit,
} from "../adapters/flux/source.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import { edgeUnitOf, SECRETS_UNIT, unitOf } from "../model/reconcile-units.ts";
import type { ResolvedProject } from "../model/resolution.ts";
import { SECRETS_DIRECTORY, tierDirectory } from "../adapters/shared/paths.ts";
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
      .filter(({ applications }) =>
        applications.some(({ id }) => id === application),
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
  ];
}

/**
 * The pin source of each of `artifacts`, as the file the Estate repository
 * commits. A unit follows only units `delivered` holds: a Project still on the
 * old path has no unit on this one, which would never become Ready, and is
 * already running where the old path put it.
 */
export function pinSources(
  artifacts: readonly Artifact[],
  delivered: readonly Artifact[],
  projects: readonly ResolvedProject[],
  platform: PlatformIntentDocument,
  serialize: Serializer,
  held: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): PinSource[] {
  const onPath = new Set(
    delivered.flatMap((artifact) =>
      unitsOf(artifact, projects, platform).map(({ name }) => name),
    ),
  );
  const { sourceRef, artifacts: published } = platform.bootstrap.flux;
  const flux = {
    // `sourceRef` names Flux's own source as `<namespace>/<name>`.
    namespace: sourceRef.split("/")[0] as string,
    repository: published.repository,
    signer: published.signer,
  };
  return artifacts.map((artifact) => {
    const path = `projects/${artifact.name}/source.yaml`;
    return {
      name: artifact.name,
      path,
      text: serialize(
        renderPinSource(
          artifact.name === ESTATE ? ESTATE_SOURCE : sourceOf(artifact.name),
          artifact.name,
          unitsOf(artifact, projects, platform).map((unit) => ({
            ...unit,
            after: unit.after.filter((name) => onPath.has(name)),
          })),
          flux,
          held[artifact.name],
        ),
        path,
      ),
    };
  });
}
