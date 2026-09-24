// The rules one authored document answers on its own: the counterpart of the
// Complete OCL invariants the model-driven implementation evaluates, and the
// same refusals at the same places. Each carries the code the specification
// gives it and the JSON Pointer of the object it refuses
// (docs/architecture.md#the-parity-contract), which is the object an invariant
// takes as its context. A rule that needs more than one document belongs to
// composition, not here.
import type { Diagnostic } from "../../domain/diagnostic.ts";
import {
  declared,
  sameDeclaration,
} from "../../domain/project-intent/declaration.ts";
import { ownerRole } from "../../domain/project-intent/migration.ts";
import type { ProjectIntentDocument } from "./schema.ts";

type Application = ProjectIntentDocument["applications"][number];
type Process = Application["processes"][number];
type Grant = NonNullable<Process["secrets"]>[number];
/** Any of the three levels Shared Intent may be declared at. */
type Level = Pick<
  Process,
  | "secrets"
  | "dependsOn"
  | "assets"
  | "writablePaths"
  | "placement"
  | "startupBudget"
  | "cutover"
>;

interface Refusal {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly hint: string;
}

/** The durability classes the platform derives a backup for, which need an engine. */
const BACKED_UP = new Set(["recoverable", "irreplaceable"]);

/** The access and delivery pairs chapter 10's matrix refuses. */
const ILLEGAL_DELIVERY = new Set([
  "self-renew/env",
  "custody/env",
  "custody/file",
]);

function grantRefusals(grant: Grant, at: string): Refusal[] {
  const refusals: Refusal[] = [];
  if (grant.delivery === "env" && grant.rotation?.tolerates === "reload")
    refusals.push({
      code: "E_ENV_CANNOT_RELOAD",
      path: `${at}/rotation`,
      message: "an environment variable cannot be reloaded without a restart",
      hint: "Deliver the secret as a file or through the application itself, or tolerate a restart.",
    });
  if (
    "access" in grant &&
    ILLEGAL_DELIVERY.has(`${grant.access}/${grant.delivery}`)
  )
    refusals.push({
      code: "E_ILLEGAL_DELIVERY_FOR_ACCESS",
      path: at,
      message: `access ${grant.access} cannot be delivered as ${grant.delivery}`,
      hint: "See the access by delivery matrix in spec/v1/10-project-intent.md#which-tier-may-use-which-delivery.",
    });
  if ("engine" in grant && grant.delivery !== "self")
    refusals.push({
      code: "E_NON_KV_DELIVERY",
      path: at,
      message: `a ${grant.engine} grant is delivered by the application itself`,
      hint: "Write `delivery: self`: the value is fetched, never projected.",
    });
  return refusals;
}

// -- Shared Intent (spec/v1/10-project-intent.md#shared-intent). Every refusal
// below sits on the lower declaration: the one an author deletes to fix it.

/** The node dimensions, which is what a level above a Process may share. */
const DIMENSIONS = ["arch", "site", "disk", "gpu", "capabilities"] as const;

const duplicate = (path: string, what: string): Refusal => ({
  code: "E_SHARED_DECLARATION_DUPLICATED",
  path,
  message: `${what} is declared again, unchanged, at a level above this one`,
  hint: "Delete this copy, or change it: a lower declaration replaces the one above, and a restatement does nothing.",
});

/** Every duplicate this level restates from a level above it. */
function duplicateRefusals(
  level: Level,
  above: readonly Level[],
  at: string,
): Refusal[] {
  const refusals: Refusal[] = [];
  const from = <T>(pick: (one: Level) => readonly T[] | undefined): T[] =>
    above.flatMap((one) => [...declared(pick(one))]);

  const grants = from((one) => one.secrets);
  for (const [index, grant] of declared(level.secrets).entries())
    if (grants.some((above) => sameDeclaration(above, grant)))
      refusals.push(duplicate(`${at}/secrets/${index}`, "this grant"));

  const edges = from((one) => one.dependsOn);
  for (const [index, edge] of declared(level.dependsOn).entries())
    if (edges.some((above) => sameDeclaration(above, edge)))
      refusals.push(duplicate(`${at}/dependsOn/${index}`, "this edge"));

  const assets = from((one) => one.assets);
  for (const [index, asset] of declared(level.assets).entries())
    if (assets.some((above) => sameDeclaration(above, asset)))
      refusals.push(duplicate(`${at}/assets/${index}`, "this asset"));

  // The families with no object of their own share one refusal, at their level:
  // it is the object an invariant takes as its context, so a refusal each would
  // be several diagnostics at one pointer.
  const paths = new Set(from((one) => one.writablePaths));
  const restated = [
    ...declared(level.writablePaths).filter((written) => paths.has(written)),
    ...(level.startupBudget !== undefined &&
    above.some((one) => one.startupBudget === level.startupBudget)
      ? ["startupBudget"]
      : []),
    ...(level.cutover !== undefined &&
    above.some((one) => one.cutover === level.cutover)
      ? ["cutover"]
      : []),
    // Each dimension separately, which is what makes `site` above and `arch`
    // below two declarations of two things.
    ...DIMENSIONS.filter((key) => {
      const value = level.placement?.[key];
      return (
        value !== undefined &&
        above.some((one) => sameDeclaration(one.placement?.[key], value))
      );
    }),
  ];
  if (restated.length > 0) refusals.push(duplicate(at, restated.join(", ")));
  return refusals;
}

/** Eligibility sums every container's quantity, so a shared one is refused. */
function quantityRefusals(level: Level, at: string): Refusal[] {
  const placement = level.placement;
  if (placement === undefined) return [];
  const written = (["memory", "cpu"] as const).filter(
    (key) => placement[key] !== undefined,
  );
  if (written.length === 0) return [];
  return [
    {
      code: "E_SHARED_QUANTITY",
      path: `${at}/placement`,
      message: `${written.join(" and ")} is per container and cannot be shared`,
      hint: "Write the quantity on each Process: eligibility sums the Process and its sidecars.",
    },
  ];
}

/** Either may be answered above the Process, so what is refused is no answer. */
function completenessRefusals(
  process: Process,
  above: readonly Level[],
  at: string,
): Refusal[] {
  const refusals: Refusal[] = [];
  const levels = [process, ...above];
  if (
    process.lifecycle !== "prepare" &&
    !levels.some((level) => level.cutover !== undefined)
  )
    refusals.push({
      code: "E_CUTOVER_MISSING",
      path: at,
      message:
        "no level answers whether this Process keeps serving as it cuts over",
      hint: "Declare `cutover` on the Process, its Application or the project header.",
    });
  const own = process.placement;
  const missing = (["memory", "cpu"] as const).filter(
    (key) => own?.[key] === undefined,
  );
  if (missing.length > 0)
    refusals.push({
      code: "E_PLACEMENT_INCOMPLETE",
      path: at,
      message: `this Process declares no ${missing.join(" and no ")}, and a quantity is never shared`,
      hint: "Declare the quantities in the Process's own `placement` block: only the node dimensions can come from a level above.",
    });
  return refusals;
}

/** The lowest level's answer to the cutover question, or none if no level answers. */
function effectiveCutover(
  process: Process,
  above: readonly Level[],
): Process["cutover"] {
  return [process, ...above].find((level) => level.cutover !== undefined)
    ?.cutover;
}

/** What only a Process that serves declares, which a prepare Process does not. */
function prepareRefusals(process: Process, at: string): Refusal[] {
  if (process.lifecycle !== "prepare") return [];
  const serving = (
    [
      ["provides", process.provides],
      ["probes", process.probes],
      ["replicas", process.replicas],
      ["cutover", process.cutover],
    ] as const
  )
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (serving.length === 0) return [];
  return [
    {
      code: "E_PREPARE_PROCESS_SERVES",
      path: at,
      message: `a prepare Process runs to completion before the new version starts, and declares ${serving.join(", ")}, which only a serving Process has`,
      hint: "Delete them: a prepare Process listens on nothing, has no readiness, runs once and cuts over nothing.",
    },
  ];
}

function processRefusals(
  process: Process,
  above: readonly Level[],
  at: string,
): Refusal[] {
  const refusals: Refusal[] = [
    ...duplicateRefusals(process, above, at),
    ...completenessRefusals(process, above, at),
    ...prepareRefusals(process, at),
  ];
  const volumes = process.volumes ?? [];
  // The effective answer: it may come from a level above. A prepare Process
  // cuts over nothing, so no answer applies to it.
  const cutover =
    process.lifecycle === "prepare"
      ? undefined
      : effectiveCutover(process, above);
  if (cutover === "continuous" && volumes.length > 0)
    refusals.push({
      code: "E_CUTOVER_UNHONOURABLE",
      path: at,
      message:
        "a volume cannot attach to the second copy a continuous cutover starts beside the old one",
      hint: "Declare `cutover: interrupted`, which is what this storage can honour.",
    });
  const backedUp = volumes.filter((volume) => BACKED_UP.has(volume.durability));
  if (process.engine !== undefined && backedUp.length === 0)
    refusals.push({
      code: "E_ENGINE_WITHOUT_DURABILITY",
      path: at,
      message: `engine ${process.engine} names a backup method nothing here derives`,
      hint: "Declare a volume whose durability derives a backup, or drop the engine.",
    });
  if (process.engine === undefined)
    for (const [index, volume] of volumes.entries())
      if (BACKED_UP.has(volume.durability))
        refusals.push({
          code: "E_DURABILITY_WITHOUT_ENGINE",
          path: `${at}/volumes/${index}`,
          message: `durability ${volume.durability} derives a backup, and the backup method comes from the engine`,
          hint: "Declare the Process's `engine`, or a durability that derives no backup.",
        });
  for (const [index, grant] of (process.secrets ?? []).entries())
    refusals.push(...grantRefusals(grant, `${at}/secrets/${index}`));
  return refusals;
}

/** The Release Unit switches as one, so its members answer the cutover question alike. */
function mixedCutoverRefusals(
  application: Application,
  project: ProjectIntentDocument,
  at: string,
): Refusal[] {
  const answers = new Set(
    application.processes
      .filter((process) => process.lifecycle === "application")
      .map((process) => effectiveCutover(process, [application, project]))
      .filter((cutover) => cutover !== undefined),
  );
  if (answers.size < 2) return [];
  return [
    {
      code: "E_RELEASE_UNIT_MIXED_CUTOVER",
      path: at,
      message:
        "the Processes of one Application answer the cutover question differently, and they switch as one",
      hint: "Move the Process that cannot keep serving into an Application of its own, or declare `cutover: interrupted` for the whole Application.",
    },
  ];
}

function applicationRefusals(
  application: Application,
  project: ProjectIntentDocument,
  at: string,
): Refusal[] {
  const refusals: Refusal[] = [
    ...duplicateRefusals(application, [project], at),
    ...quantityRefusals(application, at),
    ...mixedCutoverRefusals(application, project, at),
  ];
  if (
    application.observability !== undefined &&
    application.observability.scrape === undefined
  )
    refusals.push({
      code: "E_ALERT_CLASS_WITHOUT_SIGNAL",
      path: `${at}/observability`,
      message:
        "a class states how loudly to wake someone, and no signal says what about",
      hint: "Declare the `scrape` that carries the signal, or omit the block.",
    });
  for (const [index, exposure] of (application.exposure ?? []).entries()) {
    const seen = new Set<string>();
    for (const [route, { path, match }] of exposure.routes.entries()) {
      const pair = `${match} ${path}`;
      if (seen.has(pair))
        refusals.push({
          code: "E_DUPLICATE_ROUTE_MATCH",
          path: `${at}/exposure/${index}/routes/${route}`,
          message: `two routes share the ${match} match of ${path}`,
          hint: "Two routes that cannot be ordered are one route: delete or narrow one.",
        });
      seen.add(pair);
    }
  }
  for (const [index, grant] of (application.secrets ?? []).entries())
    refusals.push(...grantRefusals(grant, `${at}/secrets/${index}`));
  for (const [index, process] of application.processes.entries())
    refusals.push(
      ...processRefusals(
        process,
        [application, project],
        `${at}/processes/${index}`,
      ),
    );
  return refusals;
}

// -- Migration (spec/v1/10-project-intent.md#migration).

/** A database grant naming the owner role, which no Process is given by hand. */
function ownerRoleRefusals(
  grants: readonly Grant[] | undefined,
  project: string,
  at: string,
): Refusal[] {
  return (grants ?? []).flatMap((grant, index) =>
    "role" in grant && grant.role === ownerRole(project)
      ? [
          {
            code: "E_OWNER_ROLE_GRANTED",
            path: `${at}/secrets/${index}`,
            message: `the ${grant.role} role changes the project's schema, and only its migration holds it`,
            hint: "Delete the grant: an Application declaring `migration` gets the owner role derived, and every other Process reads its data through the credential its database edge derives.",
          },
        ]
      : [],
  );
}

/** One Application of a project moves its database's schema, or none does. */
function migrationOwnerRefusals(document: ProjectIntentDocument): Refusal[] {
  const moving = document.applications.flatMap((application, index) =>
    application.migration === undefined || application.migration === "none"
      ? []
      : [index],
  );
  return moving.slice(1).map((index) => ({
    code: "E_MIGRATION_OWNER_DUPLICATED",
    path: `/applications/${index}/migration`,
    message:
      "a second Application of this project declares how the project's database schema moves",
    hint: "Declare `migration: none` here: one Application of a project moves its schema, and the others read the data it defines.",
  }));
}

/** Every rule this document breaks, in the order the document reads. */
export function ruleDiagnostics(
  document: ProjectIntentDocument,
): readonly Diagnostic[] {
  const project = document.project;
  return [
    ...quantityRefusals(document, ""),
    ...ownerRoleRefusals(document.secrets, project, ""),
    ...document.applications.flatMap((application, a) => [
      ...ownerRoleRefusals(application.secrets, project, `/applications/${a}`),
      ...application.processes.flatMap((process, p) =>
        ownerRoleRefusals(
          process.secrets,
          project,
          `/applications/${a}/processes/${p}`,
        ),
      ),
    ]),
    ...migrationOwnerRefusals(document),
    ...(document.secrets ?? []).flatMap((grant, index) =>
      grantRefusals(grant, `/secrets/${index}`),
    ),
    ...document.applications.flatMap((application, index) =>
      applicationRefusals(application, document, `/applications/${index}`),
    ),
  ];
}
