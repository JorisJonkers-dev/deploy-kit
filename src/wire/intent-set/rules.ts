// The rules a Platform document and the project files beside it answer
// together: each reference one makes into the other resolves, and each policy
// one asks for the other offers (spec/v1/14-platform-intent.md). A refusal
// names the document it points into, because the object at fault can sit in
// either.
import type { Diagnostic } from "../../domain/diagnostic.ts";
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

function projectRefusals(
  project: ProjectIntentDocument,
  platform: PlatformIntentDocument,
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
      projectRefusals(document, platform.document).map((refusal) => ({
        ...refusal,
        document: name,
      })),
    ),
  ];
}
