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

function processRefusals(process: Process, at: string): Refusal[] {
  const refusals: Refusal[] = [];
  const volumes = process.volumes ?? [];
  if (process.cutover === "rolling" && volumes.length > 0)
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

function applicationRefusals(application: Application, at: string): Refusal[] {
  const refusals: Refusal[] = [];
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
    refusals.push(...processRefusals(process, `${at}/processes/${index}`));
  return refusals;
}

/** Every rule this document breaks, in the order the document reads. */
export function ruleDiagnostics(
  document: ProjectIntentDocument,
): readonly Diagnostic[] {
  return document.applications.flatMap((application, index) =>
    applicationRefusals(application, `/applications/${index}`),
  );
}
