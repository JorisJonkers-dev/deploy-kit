// The database an Application's edges derive
// (spec/v1/16-dependencies.md#the-database-catalog): whether its schema is
// moved by a changelog, and where the datastore holding it answers. Both the
// migration plan and the datastore's own policy read it, so neither derives it
// twice.
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import { ownsDatabases } from "../model/project-intent-queries.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import { homeOf } from "../model/runtime-profiles.ts";

type Egress = NonNullable<ResolvedProcess["egress"]>[number];

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
 * surface that edge names. None where no edge names a surface such a Process
 * provides.
 */
export function datastoreOf(
  application: EffectiveApplication,
  union: readonly EffectiveProject[],
  platform: Pick<PlatformIntentDocument, "handover">,
): Egress | undefined {
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
                      rule: "datastore" as const,
                      ...homeOf(platform, project, id, name),
                      port: provides[edge.surface] as number,
                    },
                  ],
            ),
          ),
      ),
    )
    .at(0);
}
