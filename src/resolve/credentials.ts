// The credential each of a Process's edges to a database derives
// (spec/v1/10-project-intent.md#migration): the project's data role, or its
// owner role where the Application migrates itself, issued by the Secret Store
// and delivered as the edge says.
import type {
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import {
  dataRole,
  ownerRole,
  reachesDatabase,
} from "../model/project-intent-queries.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { destinationOf } from "./secrets.ts";

type ResolvedGrant = NonNullable<ResolvedProcess["secrets"]>[number];

export interface CredentialContext {
  readonly project: string;
  readonly union: readonly EffectiveProject[];
  /** Whether the Process's Application migrates its own schema, and so holds the owner role. */
  readonly migratesItself: boolean;
}

/** Where a Process reads the credential an edge derives: the role's credential path. */
export const credentialPathOf = (role: string): string =>
  `database/creds/${role}`;

/** The role a Process's edges to its project's database derive. */
export const credentialRoleOf = (context: CredentialContext): string =>
  context.migratesItself
    ? ownerRole(context.project)
    : dataRole(context.project);

/** One grant per database role the Process's edges derive, as the first such edge delivers it. */
export function resolveCredentials(
  process: EffectiveProcess,
  context: CredentialContext,
): ResolvedGrant[] {
  // A missing list and an empty one hold no edge alike.
  // Stryker disable next-line ArrayDeclaration
  const edge = (process.dependsOn ?? []).find((candidate) =>
    reachesDatabase(candidate, context.union),
  );
  if (edge === undefined) return [];
  const path = credentialPathOf(credentialRoleOf(context));
  const delivery = edge.credentials?.delivery ?? "self";
  return [
    {
      engine: "database",
      delivery,
      paths: [{ path, allows: ["read"] }],
      ...(delivery === "self"
        ? {}
        : { destination: destinationOf(process.name, path) }),
      // ruleDiagnostics refused a file credential without both.
      ...(delivery === "file"
        ? {
            mountAt: edge.credentials?.mountAt as string,
            fileMode: edge.credentials?.fileMode as string,
          }
        : {}),
      ...(edge.credentials?.rotation.tolerates === "restart"
        ? { restartTargets: [process.name] }
        : {}),
    },
  ];
}
