// The rules a Platform document and the project files beside it answer
// together: each reference one makes into the other resolves, and each policy
// one asks for the other offers (spec/v1/14-platform-intent.md). A refusal
// names the document it points into, because the object at fault can sit in
// either.
import type { Diagnostic } from "../../domain/diagnostic.ts";
import { ownsDatabases } from "../../domain/project-intent/migration.ts";
import type { PlatformIntentDocument } from "../platform-intent/schema.ts";
import type { ProjectIntentDocument } from "../project-intent/schema.ts";

export interface Named<T> {
  readonly name: string;
  readonly document: T;
}

type Application = ProjectIntentDocument["applications"][number];
type Grant = NonNullable<Application["secrets"]>[number];

function grantRefusals(
  grants: readonly Grant[],
  at: string,
  platform: PlatformIntentDocument,
): Omit<Diagnostic, "document">[] {
  if (platform.substrate.secretsEncryption) return [];
  return grants.flatMap((grant, index) =>
    grant.delivery === "self"
      ? []
      : [
          {
            code: "E_SECRETS_AT_REST_REQUIRED",
            path: `${at}/secrets/${index}`,
            message: `delivery ${grant.delivery} writes a secret into the cluster, and the platform does not encrypt secrets at rest`,
            hint: "Deliver the secret through the application itself, or enable `secretsEncryption` on the platform.",
          },
        ],
  );
}

/** What every project file read together says about who provides what. */
interface Estate {
  /** Every Application some project file declares. */
  readonly declared: ReadonlySet<string>;
  /** The Applications whose engine owns databases, whose consumers derive one. */
  readonly databases: ReadonlySet<string>;
}

type Edge = NonNullable<Application["dependsOn"]>[number];

/** Every edge an Application's Processes hold: their own and every level's above. */
const edgesOf = (
  application: Application,
  project: ProjectIntentDocument,
): readonly Edge[] => [
  ...(project.dependsOn ?? []),
  ...(application.dependsOn ?? []),
  ...application.processes.flatMap((process) => process.dependsOn ?? []),
];

/** `credentials` on an edge whose provider was read and owns no database. */
function credentialsRefusals(
  edges: readonly Edge[] | undefined,
  at: string,
  estate: Estate,
): Omit<Diagnostic, "document">[] {
  // Stryker disable next-line ArrayDeclaration: an element that is no edge has
  // no `credentials`, so a non-empty fallback refuses nothing either.
  return (edges ?? []).flatMap((edge, e) =>
    edge.credentials !== undefined &&
    estate.declared.has(edge.application) &&
    !estate.databases.has(edge.application)
      ? [
          {
            code: "E_CREDENTIALS_WITHOUT_DATABASE",
            path: `${at}/dependsOn/${e}/credentials`,
            message: `${edge.application} owns no database, so this edge derives no credential to rotate`,
            hint: "Delete `credentials`: it only shapes the credential an edge to a database derives.",
          },
        ]
      : [],
  );
}

/**
 * An Application that derives a database answers how its schema moves, and one
 * that derives none does not (spec/v1/10-project-intent.md#migration). Decided
 * only where every edge's provider is among the files read, because a provider
 * outside the set could be either.
 */
function migrationRefusals(
  project: ProjectIntentDocument,
  estate: Estate,
): Omit<Diagnostic, "document">[] {
  const refusals: Omit<Diagnostic, "document">[] = [];
  for (const [a, application] of project.applications.entries()) {
    const at = `/applications/${a}`;
    const edges = edgesOf(application, project);
    const consumes = edges.some((edge) =>
      estate.databases.has(edge.application),
    );
    const decided = edges.every((edge) =>
      estate.declared.has(edge.application),
    );
    if (consumes && application.migration === undefined)
      refusals.push({
        code: "E_MIGRATION_UNDECLARED",
        path: at,
        message:
          "this Application derives a database, and no answer says how its schema moves",
        hint: "Declare `migration: {changelog: <path>}`, `migration: self`, or `migration: none`.",
      });
    if (decided && !consumes && application.migration !== undefined)
      refusals.push({
        code: "E_MIGRATION_WITHOUT_DATABASE",
        path: `${at}/migration`,
        message:
          "this Application derives no database, so there is no schema to move",
        hint: "Delete `migration`, or declare the edge to the database this Application uses.",
      });
    refusals.push(
      ...credentialsRefusals(application.dependsOn, at, estate),
      ...application.processes.flatMap((process, p) =>
        credentialsRefusals(process.dependsOn, `${at}/processes/${p}`, estate),
      ),
    );
  }
  return refusals;
}

/** A managed migration builds on the platform's runner, so the platform must offer one. */
function runnerRefusals(
  project: ProjectIntentDocument,
  platform: PlatformIntentDocument,
): Omit<Diagnostic, "document">[] {
  if (platform.migration !== undefined) return [];
  return project.applications.flatMap((application, a) =>
    typeof application.migration === "object"
      ? [
          {
            code: "E_NO_MIGRATION_POLICY",
            path: `/applications/${a}/migration`,
            message:
              "the platform offers no migration runner for this changelog to build on",
            hint: "Declare the Platform document's `migration` policy: its runner, deadline and resources.",
          },
        ]
      : [],
  );
}

function projectRefusals(
  project: ProjectIntentDocument,
  platform: PlatformIntentDocument,
  estate: Estate,
): Omit<Diagnostic, "document">[] {
  const carried = new Set(platform.tiers.flatMap(({ audiences }) => audiences));
  const refusals: Omit<Diagnostic, "document">[] = [];
  const noTier = (audience: string, path: string): void => {
    if (!carried.has(audience as never))
      refusals.push({
        code: "E_NO_TIER_FOR_AUDIENCE",
        path,
        message: `no tier carries the ${audience} audience`,
        hint: "Carry the audience on a tier of the Platform document, or choose one a tier carries.",
      });
  };

  // A grant at the project header reaches every Process below it, so it is
  // refused where it is written, exactly as one on an Application or a Process.
  refusals.push(...grantRefusals(project.secrets ?? [], "", platform));
  refusals.push(...migrationRefusals(project, estate));
  refusals.push(...credentialsRefusals(project.dependsOn, "", estate));
  refusals.push(...runnerRefusals(project, platform));
  for (const [a, application] of project.applications.entries()) {
    const at = `/applications/${a}`;
    for (const [e, exposure] of (application.exposure ?? []).entries()) {
      noTier(exposure.audience, `${at}/exposure/${e}`);
      for (const [r, route] of exposure.routes.entries())
        if (route.audience !== undefined)
          noTier(route.audience, `${at}/exposure/${e}/routes/${r}`);
    }
    refusals.push(...grantRefusals(application.secrets ?? [], at, platform));
    for (const [p, process] of application.processes.entries()) {
      const processAt = `${at}/processes/${p}`;
      const volumes = process.volumes ?? [];
      // A project file that parsed names an engine only beside a volume whose
      // class derives a backup (E_ENGINE_WITHOUT_DURABILITY), so an engine here
      // is always one the platform must know how to back up.
      if (
        process.engine !== undefined &&
        platform.engines[process.engine] === undefined
      )
        refusals.push({
          code: "E_NO_ENGINE_POLICY",
          path: processAt,
          message: `the platform names no backup image for engine ${process.engine}`,
          hint: "Add the engine to the Platform document's `engines`.",
        });
      for (const [v, volume] of volumes.entries())
        if (platform.durability[volume.durability] === undefined)
          refusals.push({
            code: "E_NO_DURABILITY_POLICY",
            path: `${processAt}/volumes/${v}`,
            message: `the platform has no policy for durability ${volume.durability}`,
            hint: "Add the Durability Class to the Platform document's `durability`.",
          });
      refusals.push(
        ...grantRefusals(process.secrets ?? [], processAt, platform),
      );
    }
  }
  return refusals;
}

/** Every rule the Platform document and the project files beside it break together. */
export function setDiagnostics(
  platform: Named<PlatformIntentDocument>,
  projects: readonly Named<ProjectIntentDocument>[],
): Diagnostic[] {
  const declared = new Set(
    projects.flatMap(({ document }) =>
      document.applications.map(({ id }) => id),
    ),
  );
  const estate: Estate = {
    declared,
    databases: new Set(
      projects.flatMap(({ document }) =>
        document.applications
          .filter((application) => application.processes.some(ownsDatabases))
          .map(({ id }) => id),
      ),
    ),
  };
  const proxies = platform.document.tiers.flatMap((tier, index) =>
    declared.has(tier.traefik)
      ? []
      : [
          {
            code: "E_UNKNOWN_TIER_PROXY",
            document: platform.name,
            path: `/tiers/${index}`,
            message: `no project file declares the Application ${tier.traefik} this tier's proxy names`,
            hint: "Declare the proxy Application in a project file the platform owns.",
          },
        ],
  );
  return [
    ...proxies,
    ...projects.flatMap(({ name, document }) =>
      projectRefusals(document, platform.document, estate).map((refusal) => ({
        ...refusal,
        document: name,
      })),
    ),
  ];
}
