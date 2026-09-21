// The rules one authored document answers on its own: the counterpart of the
// Complete OCL invariants the model-driven implementation evaluates, and the
// same refusals at the same places. Each carries the code the specification
// gives it and the JSON Pointer of the object it refuses
// (docs/architecture.md#the-parity-contract), which is the object an invariant
// takes as its context. A rule that needs more than one document belongs to
// composition, not here.
import type { Diagnostic } from "../../domain/diagnostic.ts";
import type { ProjectIntentDocument } from "./schema.ts";

type Application = ProjectIntentDocument["applications"][number];
type Process = Application["processes"][number];
type Grant = NonNullable<Process["secrets"]>[number];
type Placement = NonNullable<Process["placement"]>;
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

/** The derived read path, so a `kv` grant and a `database` grant never collide. */
function grantIdentity(grant: Grant): string {
  if ("path" in grant) return `secret/data/${grant.path}`;
  if (grant.engine === "database") return `database/creds/${grant.role}`;
  return `transit/${grant.key}`;
}

/** Every term a grant states, so only an identical restatement matches. */
const grantTerms = (grant: Grant): string =>
  JSON.stringify([
    grantIdentity(grant),
    "keys" in grant ? grant.keys : null,
    "access" in grant ? grant.access : null,
    "operations" in grant ? grant.operations : null,
    grant.delivery,
    grant.mountAt ?? null,
    grant.fileMode ?? null,
    grant.rotation?.tolerates ?? null,
    grant.rotation?.maxAge ?? null,
  ]);

const edgeTerms = (edge: NonNullable<Process["dependsOn"]>[number]): string =>
  JSON.stringify([edge.application, edge.surface, edge.required ?? null]);

const assetTerms = (asset: NonNullable<Process["assets"]>[number]): string =>
  JSON.stringify([asset.mountAt, asset.from]);

/** The node dimensions, which is what a level above a Process may share. */
const dimensionTerms = (placement: Placement): string =>
  JSON.stringify([
    placement.arch ?? null,
    placement.site ?? null,
    placement.disk ?? null,
    placement.gpu ?? null,
    placement.capabilities ?? null,
  ]);

/** A block naming no dimension shares nothing, so two of them never duplicate. */
const NO_DIMENSIONS = dimensionTerms({});

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
    above.flatMap((one) => [...(pick(one) ?? [])]);

  const grants = new Set(from((one) => one.secrets).map(grantTerms));
  for (const [index, grant] of (level.secrets ?? []).entries())
    if (grants.has(grantTerms(grant)))
      refusals.push(duplicate(`${at}/secrets/${index}`, "this grant"));

  const edges = new Set(from((one) => one.dependsOn).map(edgeTerms));
  for (const [index, edge] of (level.dependsOn ?? []).entries())
    if (edges.has(edgeTerms(edge)))
      refusals.push(duplicate(`${at}/dependsOn/${index}`, "this edge"));

  const assets = new Set(from((one) => one.assets).map(assetTerms));
  for (const [index, asset] of (level.assets ?? []).entries())
    if (assets.has(assetTerms(asset)))
      refusals.push(duplicate(`${at}/assets/${index}`, "this asset"));

  // The families with no object of their own are refused at their level.
  const paths = new Set(from((one) => one.writablePaths));
  const restated = (level.writablePaths ?? []).filter((written) =>
    paths.has(written),
  );
  if (restated.length > 0) refusals.push(duplicate(at, restated.join(", ")));
  else if (
    level.startupBudget !== undefined &&
    above.some((one) => one.startupBudget === level.startupBudget)
  )
    refusals.push(duplicate(at, "this startupBudget"));
  else if (
    level.cutover !== undefined &&
    above.some((one) => one.cutover === level.cutover)
  )
    refusals.push(duplicate(at, "this cutover"));
  else if (level.placement !== undefined) {
    const dimensions = dimensionTerms(level.placement);
    if (
      dimensions !== NO_DIMENSIONS &&
      above.some(
        (one) =>
          one.placement !== undefined &&
          dimensionTerms(one.placement) === dimensions,
      )
    )
      refusals.push(duplicate(at, "these node dimensions"));
  }
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
  if (!levels.some((level) => level.cutover !== undefined))
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

function processRefusals(
  process: Process,
  above: readonly Level[],
  at: string,
): Refusal[] {
  const refusals: Refusal[] = [
    ...duplicateRefusals(process, above, at),
    ...completenessRefusals(process, above, at),
  ];
  const volumes = process.volumes ?? [];
  // The effective answer: it may come from a level above.
  const cutover = [process, ...above].find(
    (level) => level.cutover !== undefined,
  )?.cutover;
  if (cutover === "rolling" && volumes.length > 0)
    refusals.push({
      code: "E_CUTOVER_UNHONOURABLE",
      path: at,
      message: "a volume cannot attach to the surge a rolling cutover needs",
      hint: "Declare `cutover: recreate`, which is what this storage can honour.",
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

function applicationRefusals(
  application: Application,
  project: ProjectIntentDocument,
  at: string,
): Refusal[] {
  const refusals: Refusal[] = [
    ...duplicateRefusals(application, [project], at),
    ...quantityRefusals(application, at),
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

/** Every rule this document breaks, in the order the document reads. */
export function ruleDiagnostics(
  document: ProjectIntentDocument,
): readonly Diagnostic[] {
  return [
    ...quantityRefusals(document, ""),
    ...(document.secrets ?? []).flatMap((grant, index) =>
      grantRefusals(grant, `/secrets/${index}`),
    ),
    ...document.applications.flatMap((application, index) =>
      applicationRefusals(application, document, `/applications/${index}`),
    ),
  ];
}
