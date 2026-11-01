// The database an Application's edges derive
// (spec/v1/16-dependencies.md#the-database-catalog): whether its schema is
// moved by a changelog, and where the datastore holding it answers. Both the
// migration plan and the catalog read it, so neither derives it twice.
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import { ownsDatabases } from "../model/project-intent-queries.ts";
import type { EgressPeer } from "../model/resolved-deployment.ts";
import { homeOf } from "../model/runtime-profiles.ts";
import { consumedOf } from "../model/consumer-label.ts";

type Egress = EgressPeer;

/** Whether an Application moves its schema with a changelog the platform's runner applies. */
export const managed = (application: EffectiveApplication): boolean =>
  typeof application.migration === "object";

// A missing list and an empty one reach no provider alike.
// Stryker disable next-line ArrayDeclaration
const edgesOf = ({ dependsOn }: EffectiveProcess) => dependsOn ?? [];

/**
 * Where the project's database answers
 * (spec/v1/16-dependencies.md#the-database-catalog): the first edge of the
 * Application that reaches a Process whose engine owns databases, on the
 * surface that edge names, and that surface as a consumer label names it.
 * None where no edge names a surface such a Process provides.
 */
export function databaseEdgeOf(
  application: EffectiveApplication,
  union: readonly EffectiveProject[],
): { readonly peer: Egress; readonly consumes: string } | undefined {
  return application.processes
    .flatMap(edgesOf)
    .flatMap((edge) =>
      union.flatMap(({ project, applications }) =>
        applications
          .filter(({ id }) => id === edge.application)
          .flatMap(({ id, processes }) =>
            processes.filter(ownsDatabases).flatMap(({ name, provides }) =>
              provides?.[edge.surface] === undefined
                ? []
                : [
                    {
                      peer: {
                        rule: "datastore" as const,
                        ...homeOf(project, name),
                        port: provides[edge.surface] as number,
                      },
                      consumes: consumedOf(id, edge.surface),
                    },
                  ],
            ),
          ),
      ),
    )
    .at(0);
}

/** Where the project's database answers, as the peer a policy names. */
export const datastoreOf = (
  application: EffectiveApplication,
  union: readonly EffectiveProject[],
): Egress | undefined => databaseEdgeOf(application, union)?.peer;
