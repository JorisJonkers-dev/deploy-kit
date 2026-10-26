// An Application moving between Projects
// (spec/v1/40-composition.md#an-application-moving-between-projects): declared
// by the new Project before the old one stops declaring it, and held by the
// union once, as the declaration outside the namespace its active Instance
// runs in. The old declaration renders the source until the Move retires it,
// and renders nothing after.
import type { ClusterStateDocument } from "../model/cluster-state.ts";
import type { Diagnostic } from "../model/diagnostic.ts";
import { departureOf, retiredOf, movePolicyOf } from "../model/move.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";

/** A Project's file as composition reads it: its name, its project and the ids it declares. */
export interface Declaring {
  readonly name: string;
  readonly project: string;
  readonly applications: readonly string[];
}

/** The declaration an Application is moving out of. */
export interface Departing {
  /** The file of the Project it is moving out of. */
  readonly name: string;
  readonly project: string;
  readonly application: string;
  /** Where it stands among that Project's Applications. */
  readonly index: number;
  /** Retired, the source is gone, and the declaration renders nothing. */
  readonly retired: boolean;
}

/**
 * Every declaration an Application is moving out of: of an Id exactly two
 * Projects declare, the one in the namespace ClusterState records its active
 * Instance in. An Id declared twice that no Instance settles stays a
 * duplicate.
 */
export function departuresOf(
  projects: readonly Declaring[],
  clusterState: ClusterStateDocument,
  platform: PlatformIntentDocument,
): Departing[] {
  const declared = new Map<string, { project: Declaring; index: number }[]>();
  for (const project of projects)
    project.applications.forEach((id, index) =>
      declared.set(id, [...(declared.get(id) ?? []), { project, index }]),
    );
  return [...declared].flatMap(([id, declarations]): Departing[] => {
    if (declarations.length !== 2) return [];
    const departure = departureOf(
      clusterState,
      platform,
      id,
      declarations.map(({ project }) => namespaceOf(project.project)),
    );
    if (departure === undefined) return [];
    // The two Projects are two namespaces, and the source runs in one of them.
    const { project, index } = declarations.find(
      ({ project: candidate }) =>
        namespaceOf(candidate.project) === departure.from,
    ) as { project: Declaring; index: number };
    return [
      {
        name: project.name,
        project: project.project,
        application: id,
        index,
        retired: departure.retired,
      },
    ];
  });
}

/**
 * A Project that stops declaring an Application whose source Instance still
 * runs in its namespace, while another Project declares it: the source would
 * leave the render before the Move that carries its data has retired it.
 */
export function moveOpenDiagnostics(
  projects: readonly Declaring[],
  clusterState: ClusterStateDocument,
  platform: PlatformIntentDocument,
): Diagnostic[] {
  const retention = movePolicyOf(platform)?.retention;
  // A recorded Instance with no instance list and an empty one hold none alike.
  // Stryker disable next-line ArrayDeclaration
  return (clusterState.instances ?? []).flatMap((record): Diagnostic[] => {
    const holder = projects.find(
      ({ project }) => namespaceOf(project) === record.namespace,
    );
    const target = projects.find(({ applications }) =>
      applications.includes(record.application),
    );
    if (
      holder === undefined ||
      target === undefined ||
      holder.applications.includes(record.application) ||
      (retention !== undefined &&
        retiredOf(record, retention, clusterState.capturedAt))
    )
      return [];
    return [
      {
        code: "E_MOVE_OPEN",
        document: holder.name,
        path: "/applications",
        message: `${holder.project} stops declaring ${record.application}, whose source Instance still serves from ${record.namespace} while it moves to ${target.project}`,
        hint: "Keep declaring the Application here until its Move's source has retired, then remove it.",
      },
    ];
  });
}

/**
 * A diagnostic about a Project whose departing declaration composition set
 * aside, pointed back at where it is written: an Application after the
 * departing one stands one place further on.
 */
export function restored(
  diagnostic: Diagnostic,
  departing: readonly Departing[],
): Diagnostic {
  const match = /^\/applications\/(\d+)(.*)/.exec(diagnostic.path);
  if (match === null) return diagnostic;
  // Each declaration set aside at or before it moves it one place on.
  const at = departing
    .filter(({ name }) => name === diagnostic.document)
    .map(({ index }) => index)
    .sort((a, b) => a - b)
    .reduce(
      (written, index) => (index <= written ? written + 1 : written),
      Number(match[1]),
    );
  return {
    ...diagnostic,
    path: `/applications/${String(at)}${match[2] as string}`,
  };
}
