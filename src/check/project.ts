// The rules one authored document answers on its own: the counterpart of the
// Complete OCL invariants the model-driven implementation evaluates, and the
// same refusals at the same places. Each carries the code the specification
// gives it and the JSON Pointer of the object it refuses
// (docs/architecture.md#the-parity-contract), which is the object an invariant
// takes as its context. A rule that needs more than one document belongs to
// composition.ts, not here. The env files beside a project file are checked
// here too, because they are part of what one project authors.
import type { Diagnostic, RefusalCode } from "../model/diagnostic.ts";
import type { EnvScope, ScopedEnv } from "../model/env.ts";
import type {
  ApplicationDocument as Application,
  DependencyEdge,
  Grant,
  ProcessDocument as Process,
  ProjectIntentDocument,
  SharedIntent as Level,
} from "../model/project-intent.ts";
import {
  clientExposure,
  routeFor,
  declared,
  effectiveCutover,
  isGenerated,
  NODE_DIMENSIONS,
  ownsDatabases,
  ownerRole,
  sameDeclaration,
} from "../model/project-intent-queries.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";
import { assetPathOf, writablePathOf } from "../model/project-intent.ts";
import { RUNS_TO_COMPLETION, serves } from "../model/vocabularies.ts";
import { consumedOf, isLabelName } from "../model/consumer-label.ts";

interface Refusal {
  readonly code: RefusalCode;
  readonly path: string;
  readonly message: string;
  readonly hint: string;
}

/** The durability classes the platform derives a backup for, which need an engine. */
const BACKED_UP = new Set(["recoverable", "irreplaceable"]);

/**
 * The files a Process's effective Assets are read from: at each path, the
 * lowest level's Asset is the one that arrives there, so a level above that
 * a lower one replaced at the same path contributes nothing.
 */
function effectiveAssetSources(levels: readonly Level[]): Set<string> {
  const arriving = new Map<string, string>();
  for (const level of levels)
    for (const asset of declared(level.assets))
      if (!arriving.has(assetPathOf(asset)))
        arriving.set(assetPathOf(asset), asset.from);
  return new Set(arriving.values());
}

/** The access and delivery pairs chapter 10's matrix refuses. */
const ILLEGAL_DELIVERY = new Set([
  "self-renew/env",
  "custody/env",
  "custody/file",
]);

function grantRefusals(grant: Grant, at: string): Refusal[] {
  const refusals: Refusal[] = [];
  if (grant.delivery === "env" && grant.rotation.tolerates === "reload")
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
  const paths = new Set(from((one) => one.writablePaths).map(writablePathOf));
  const restated = [
    ...declared(level.writablePaths)
      .map(writablePathOf)
      .filter((written) => paths.has(written)),
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
    ...NODE_DIMENSIONS.filter((key) => {
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
    serves(process.lifecycle) &&
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

/** What a Process that runs to completion phrases its refusal as. */
const COMPLETES = {
  prepare: "a prepare Process runs to completion before the new version starts",
  scheduled: "a scheduled Process runs to completion at each slot",
} as const satisfies Record<keyof typeof RUNS_TO_COMPLETION, string>;

/** What only a Process that serves declares, which one that runs to completion does not. */
function completionRefusals(process: Process, at: string): Refusal[] {
  if (serves(process.lifecycle)) return [];
  const lifecycle = process.lifecycle as keyof typeof RUNS_TO_COMPLETION;
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
      code: RUNS_TO_COMPLETION[lifecycle],
      path: at,
      message: `${COMPLETES[lifecycle]}, and declares ${serving.join(", ")}, which only a serving Process has`,
      hint: `Delete them: a ${lifecycle} Process listens on nothing, has no readiness, runs one copy and cuts over nothing.`,
    },
  ];
}

/** A schedule is a scheduled Process's, and a scheduled Process has one. */
function scheduleRefusals(process: Process, at: string): Refusal[] {
  const scheduled = process.lifecycle === "scheduled";
  if (scheduled && process.schedule === undefined)
    return [
      {
        code: "E_SCHEDULE_MISSING",
        path: at,
        message: "a scheduled Process names no schedule to run at",
        hint: "Declare `schedule`, five cron fields from minute to weekday.",
      },
    ];
  if (!scheduled && process.schedule !== undefined)
    return [
      {
        code: "E_SCHEDULE_UNSCHEDULED",
        path: `${at}/schedule`,
        message: `a ${process.lifecycle} Process is not run on a schedule, so nothing reads this one`,
        hint: "Declare `lifecycle: scheduled`, or delete the schedule.",
      },
    ];
  return [];
}

function processRefusals(
  process: Process,
  above: readonly Level[],
  at: string,
): Refusal[] {
  const refusals: Refusal[] = [
    ...duplicateRefusals(process, above, at),
    ...completenessRefusals(process, above, at),
    ...completionRefusals(process, at),
    ...scheduleRefusals(process, at),
  ];
  const volumes = process.volumes ?? [];
  // The effective answer: it may come from a level above. A Process that runs
  // to completion cuts over nothing, so no answer applies to it.
  const cutover = serves(process.lifecycle)
    ? effectiveCutover([process, ...above])
    : undefined;
  if (cutover === "continuous" && volumes.length > 0)
    refusals.push({
      code: "E_CUTOVER_UNHONOURABLE",
      path: at,
      message:
        "a volume cannot attach to the second copy a continuous cutover starts beside the old one",
      hint: "Declare `cutover: interrupted`, which is what this storage can honour.",
    });
  const backedUp = volumes.filter((volume) => BACKED_UP.has(volume.durability));
  // An engine that owns databases derives its consumers' catalog, backed up or not.
  if (
    process.engine !== undefined &&
    backedUp.length === 0 &&
    !ownsDatabases(process)
  )
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
  // A sidecar mounts the Process's own volumes, and no other.
  // Stryker disable next-line ArrayDeclaration
  for (const [s, sidecar] of (process.sidecars ?? []).entries())
    // Stryker disable next-line ArrayDeclaration
    for (const [m, { claim }] of (sidecar.volumes ?? []).entries())
      if (!volumes.some((volume) => volume.claim === claim))
        refusals.push({
          code: "E_UNKNOWN_SIDECAR_VOLUME",
          path: `${at}/sidecars/${String(s)}/volumes/${String(m)}`,
          message: `sidecar ${sidecar.name} mounts ${claim}, and this Process declares no volume of that claim`,
          hint: "Mount a claim the Process declares in its own `volumes`, or declare the volume on the Process.",
        });
  // A sidecar mounts the Process's own Assets, and no other: those the Process
  // declares, and those a level above it shares down to it.
  const assets = effectiveAssetSources([process, ...above]);
  // Stryker disable next-line ArrayDeclaration
  for (const [s, sidecar] of (process.sidecars ?? []).entries())
    // Stryker disable next-line ArrayDeclaration
    for (const [m, { from }] of (sidecar.assets ?? []).entries())
      if (!assets.has(from))
        refusals.push({
          code: "E_UNKNOWN_SIDECAR_ASSET",
          path: `${at}/sidecars/${String(s)}/assets/${String(m)}`,
          message: `sidecar ${sidecar.name} mounts ${from}, and this Process holds no Asset read from it`,
          hint: "Mount an Asset the Process holds, by its `from`, or declare the Asset on the Process.",
        });
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
      .map((process) => effectiveCutover([process, application, project]))
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

// -- Sign-in (spec/v1/17-sign-in.md#the-client-block).

type Client = NonNullable<Application["client"]>;
type ClientField = Exclude<keyof Client, "signIn" | "exposure" | "roles">;

/** The fields each Sign-in Mode takes, and the ones it requires. */
const CLIENT_FIELDS: Readonly<
  Record<
    Client["signIn"],
    { takes: readonly ClientField[]; requires: readonly ClientField[] }
  >
> = {
  native: {
    takes: [
      "label",
      "description",
      "iconPath",
      "launchPath",
      "redirectPaths",
      "protectedPath",
      "backChannelLogoutPath",
      "credential",
    ],
    requires: ["label", "redirectPaths", "protectedPath", "credential"],
  },
  gated: {
    takes: ["label", "description", "iconPath", "launchPath"],
    requires: ["label"],
  },
  // A token Client takes no field; a name no Client carries would change
  // nothing it is refused for.
  // Stryker disable next-line ArrayDeclaration
  token: { takes: [], requires: [] },
};

/** The audiences each Sign-in Mode's exposure may carry. */
const CLIENT_AUDIENCES: Readonly<Record<Client["signIn"], readonly string[]>> =
  {
    native: ["authenticated"],
    gated: ["authenticated"],
    token: ["authenticated", "internal"],
  };

/** The path the Gate takes back on a gated host, which no route of its own may claim. */
const GATE_PATH = "/.auth";

/**
 * A native Client's protected path must reach a gate member, which the
 * Release Gate asks for it anonymously (E_CLIENT_OPEN): the Process the
 * longest Route of the Client's exposure takes it to, which publishes
 * readiness.
 */
function protectedPathRefusals(
  application: Application,
  exposure: NonNullable<ReturnType<typeof clientExposure>>,
  path: string,
  at: string,
): Refusal[] {
  const route = routeFor(exposure, path);
  if (route === undefined)
    return [
      {
        code: "E_CLIENT_PATH_UNROUTED",
        path: at,
        message: `no route of the exposure ${exposure.name} reaches the protected path ${path}`,
        hint: "Name a path a route of the Client's exposure reaches, or route it to the Process that refuses it.",
      },
    ];
  const process = application.processes.find(
    ({ name }) => name === route.process,
  );
  // A route names a Process of its Application, or E_UNKNOWN_PROCESS refused it.
  if (
    process === undefined ||
    (typeof process.probes === "object" &&
      process.probes.readiness !== undefined)
  )
    return [];
  return [
    {
      code: "E_CLIENT_PATH_UNROUTED",
      path: at,
      message: `the protected path ${path} reaches ${route.process}, which publishes no readiness, so the Release Gate cannot ask it`,
      hint: "Give the Process a readiness probe, or route the protected path to one that has.",
    },
  ];
}

function clientRefusals(application: Application, at: string): Refusal[] {
  const client = application.client;
  if (client === undefined) return [];
  const where = `${at}/client`;
  const refusals: Refusal[] = [];
  const fields = CLIENT_FIELDS[client.signIn];
  for (const field of Object.keys(client) as (keyof Client)[])
    if (
      field !== "signIn" &&
      field !== "exposure" &&
      field !== "roles" &&
      !fields.takes.includes(field)
    )
      refusals.push({
        code: "E_CLIENT_FIELD_FOR_MODE",
        path: `${where}/${field}`,
        message: `a ${client.signIn} Client takes no ${field}`,
        hint: "Remove the field, or choose the Sign-in Mode that takes it.",
      });
  const missing = fields.requires.filter((field) => !(field in client));
  if (missing.length > 0)
    refusals.push({
      code: "E_CLIENT_FIELD_FOR_MODE",
      path: where,
      message: `a ${client.signIn} Client requires ${missing.join(", ")}`,
      hint: "Declare every field the Sign-in Mode requires.",
    });
  const exposure = clientExposure(application, client);
  if (exposure === undefined)
    refusals.push({
      code: "E_CLIENT_EXPOSURE_UNRESOLVED",
      path: client.exposure === undefined ? where : `${where}/exposure`,
      message:
        client.exposure === undefined
          ? `${application.id} declares ${String((application.exposure ?? []).length)} exposures, and the Client names none of them`
          : `${application.id} declares no exposure ${client.exposure}`,
      hint: "Name one exposure of the Application in `exposure`, or declare the one exposure the Client signs people in on.",
    });
  else if (!CLIENT_AUDIENCES[client.signIn].includes(exposure.audience))
    refusals.push({
      code: "E_CLIENT_AUDIENCE",
      path: where,
      message: `a ${client.signIn} Client cannot sign people in on the ${exposure.audience} exposure ${exposure.name}`,
      hint: "A native or gated Client's exposure is authenticated; a token Client's is authenticated or internal.",
    });
  if (exposure !== undefined && client.protectedPath !== undefined)
    refusals.push(
      ...protectedPathRefusals(
        application,
        exposure,
        client.protectedPath,
        `${where}/protectedPath`,
      ),
    );
  const seen = new Set(["user"]);
  if (client.roles !== undefined)
    for (const [index, role] of client.roles.entries()) {
      if (seen.has(role))
        refusals.push({
          code: "E_DUPLICATE_APP_ROLE",
          path: `${where}/roles/${String(index)}`,
          message:
            role === "user"
              ? "every Client has the user role already"
              : `the role ${role} is listed twice`,
          hint: "List each App Role once, and never `user`.",
        });
      seen.add(role);
    }
  if (client.signIn === "gated")
    for (const [e, { routes }] of (application.exposure ?? []).entries())
      for (const [r, { path }] of routes.entries())
        if (path === GATE_PATH || path.startsWith(`${GATE_PATH}/`))
          refusals.push({
            code: "E_GATE_PATH_CLAIMED",
            path: `${at}/exposure/${String(e)}/routes/${String(r)}`,
            message: `${path} is the Gate's own on a gated host`,
            hint: "Move the route out from under /.auth/: the Gate receives its sign-in there.",
          });
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
    ...mixedCutoverRefusals(application, project, at),
    ...clientRefusals(application, at),
  ];
  for (const [index, exposure] of (application.exposure ?? []).entries()) {
    const seen = new Set<string>();
    for (const [
      route,
      { path, match, redirectTo },
    ] of exposure.routes.entries()) {
      // A redirect its own route matches again sends the client back to it.
      if (
        redirectTo !== undefined &&
        (match === "exact" ? redirectTo === path : redirectTo.startsWith(path))
      )
        refusals.push({
          code: "E_REDIRECT_LOOP",
          path: `${at}/exposure/${index}/routes/${route}`,
          message: `the route's ${match} match of ${path} matches ${redirectTo}, the path it redirects to`,
          hint: "Redirect to a path the route does not match: narrow the route to `match: exact`, or redirect elsewhere.",
        });
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
  // One Process's exposures on one address are one Service's ports, and a
  // Service carries a port and a protocol once.
  const dialled = new Set<string>();
  // One entry alone never meets a key already dialled, so a phantom entry
  // where there is none refuses nothing.
  // Stryker disable next-line ArrayDeclaration
  for (const [index, entry] of (application.l4Exposure ?? []).entries()) {
    const key = JSON.stringify([
      entry.process,
      entry.address,
      entry.protocol,
      entry.port,
    ]);
    if (dialled.has(key))
      refusals.push({
        code: "E_DUPLICATE_L4_PORT",
        path: `${at}/l4Exposure/${index}`,
        message: `${entry.process} is already exposed on ${entry.address} at ${entry.protocol} port ${String(entry.port)}`,
        hint: "A client dials one port and protocol on an address once: delete one, or give it another port.",
      });
    dialled.add(key);
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
      ...surfaceLabelRefusals(
        application.id,
        process,
        `${at}/processes/${index}`,
      ),
    );
  return refusals;
}

/**
 * A surface a consumer label cannot name: a consumer's pods carry the
 * Application's id and the surface as a label's name
 * (spec/v1/16-dependencies.md#the-consumer-label).
 */
function surfaceLabelRefusals(
  application: string,
  process: Process,
  at: string,
): Refusal[] {
  const unnamed = Object.keys(process.provides ?? {})
    .map((surface) => consumedOf(application, surface))
    .filter((consumed) => !isLabelName(consumed));
  return unnamed.length === 0
    ? []
    : [
        {
          code: "E_SURFACE_LABEL_INVALID",
          path: at,
          message: `${unnamed.join(", ")} cannot name a label: at most 63 characters of letters, digits, '-', '_' and '.', starting and ending with a letter or digit`,
          hint: "Shorten the Application's id or the surface's name.",
        },
      ];
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

/** Every kv path a grant of the document reads, at any level. */
function heldPaths(document: ProjectIntentDocument): ReadonlySet<string> {
  const grants = [
    ...(document.secrets ?? []),
    ...document.applications.flatMap((application) => [
      ...(application.secrets ?? []),
      ...application.processes.flatMap(({ secrets }) => secrets ?? []),
    ]),
  ];
  return new Set(
    grants.flatMap((grant) =>
      // A database or transit grant names no kv path an `adopt` could match.
      // Stryker disable next-line ArrayDeclaration
      "keys" in grant ? [grant.path] : [],
    ),
  );
}

/**
 * A generated key belongs to its own Project: the Vault policy job writes it
 * nowhere else, and starts it only from a value the Project already reads.
 */
function generatedKeyRefusals(
  grants: readonly Grant[] | undefined,
  project: string,
  held: ReadonlySet<string>,
  at: string,
): Refusal[] {
  const prefix = `secret/data/${namespaceOf(project)}/`;
  // A `.`, `..` or empty segment could climb out of the prefix it starts with.
  const inside = (path: string) =>
    path.startsWith(prefix) &&
    path.split("/").every((segment) => !["", ".", ".."].includes(segment));
  return (grants ?? []).flatMap((grant, g) =>
    "keys" in grant
      ? grant.keys.flatMap((key, k): Refusal[] => {
          if (!isGenerated(key)) return [];
          const adopted = key.generate.adopt?.split("#")[0];
          return [
            ...(inside(grant.path)
              ? []
              : [
                  {
                    code: "E_GENERATED_KEY_OUTSIDE_PROJECT",
                    path: `${at}/secrets/${g}/keys/${k}`,
                    message: `${key.name} is generated under ${grant.path}, outside ${prefix}`,
                    hint: `Move the grant below ${prefix}, or list the key without \`generate\` and write it yourself.`,
                  } satisfies Refusal,
                ]),
            ...(adopted === undefined || held.has(adopted)
              ? []
              : [
                  {
                    code: "E_GENERATED_KEY_ADOPTS_UNGRANTED",
                    path: `${at}/secrets/${g}/keys/${k}/generate`,
                    message: `${key.name} adopts a value from ${adopted}, which no grant of ${project} reads`,
                    hint: `Grant ${project} read on ${adopted}, or leave \`adopt\` out and let the key be generated.`,
                  } satisfies Refusal,
                ]),
          ];
        })
      : [],
  );
}

/**
 * The claims a volume reserves in its project's namespace: its own, and the
 * backup claim a durability that derives a backup adds beside it.
 */
const claimsOf = ({
  claim,
  durability,
}: NonNullable<Process["volumes"]>[number]): readonly string[] =>
  BACKED_UP.has(durability) ? [claim, `${claim}-backup`] : [claim];

/**
 * A project's Processes share one namespace, and a claim is named as written,
 * so every claim a volume reserves is the project's alone: a volume reserving
 * one an earlier volume already holds is refused.
 */
function duplicateClaimRefusals(document: ProjectIntentDocument): Refusal[] {
  const held = new Set<string>();
  return document.applications.flatMap((application, a) =>
    application.processes.flatMap((process, p) =>
      (process.volumes ?? []).flatMap((volume, v) => {
        const claims = claimsOf(volume);
        const taken = claims.filter((claim) => held.has(claim));
        for (const claim of claims) held.add(claim);
        return taken.length === 0
          ? []
          : [
              {
                code: "E_DUPLICATE_CLAIM" as const,
                path: `/applications/${a}/processes/${p}/volumes/${v}`,
                message: `the volume claiming ${volume.claim} reserves a claim an earlier volume of this project already holds`,
                hint: `Rename the claim: a project's Processes share one namespace, and a durability that derives a backup also reserves \`<claim>-backup\`.`,
              },
            ];
      }),
    ),
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

/** An edge's credential delivered to the environment cannot be reloaded, as a grant's cannot. */
function credentialRefusals(
  edges: readonly DependencyEdge[] | undefined,
  at: string,
): Refusal[] {
  // A missing list and an empty one hold no edge alike.
  // Stryker disable next-line ArrayDeclaration
  return (edges ?? []).flatMap((edge, e): Refusal[] => {
    const at_ = `${at}/dependsOn/${e}/credentials`;
    if (
      edge.credentials?.delivery === "file" &&
      (edge.credentials.mountAt === undefined ||
        edge.credentials.fileMode === undefined)
    )
      return [
        {
          code: "schema",
          path: at_,
          message:
            "an edge delivers its credential to a file only with `mountAt` and `fileMode`",
          hint: "Name the directory its `username` and `password` files land in, and their mode.",
        },
      ];
    return edge.credentials?.delivery === "env" &&
      edge.credentials.rotation.tolerates === "reload"
      ? [
          {
            code: "E_ENV_CANNOT_RELOAD",
            path: `${at_}/rotation`,
            message:
              "an environment variable cannot be reloaded without a restart",
            hint: "Tolerate a restart, or let the application read its credential itself.",
          },
        ]
      : [];
  });
}

/** Every rule this document breaks, in the order the document reads. */
export function ruleDiagnostics(
  document: ProjectIntentDocument,
): readonly Diagnostic[] {
  const project = document.project;
  const held = heldPaths(document);
  return [
    ...quantityRefusals(document, ""),
    ...ownerRoleRefusals(document.secrets, project, ""),
    ...generatedKeyRefusals(document.secrets, project, held, ""),
    ...document.applications.flatMap((application, a) => [
      ...ownerRoleRefusals(application.secrets, project, `/applications/${a}`),
      ...generatedKeyRefusals(
        application.secrets,
        project,
        held,
        `/applications/${a}`,
      ),
      ...application.processes.flatMap((process, p) => [
        ...ownerRoleRefusals(
          process.secrets,
          project,
          `/applications/${a}/processes/${p}`,
        ),
        ...generatedKeyRefusals(
          process.secrets,
          project,
          held,
          `/applications/${a}/processes/${p}`,
        ),
      ]),
    ]),
    ...credentialRefusals(document.dependsOn, ""),
    ...document.applications.flatMap((application, a) => [
      ...credentialRefusals(application.dependsOn, `/applications/${a}`),
      ...application.processes.flatMap((process, p) =>
        credentialRefusals(
          process.dependsOn,
          `/applications/${a}/processes/${p}`,
        ),
      ),
    ]),
    ...migrationOwnerRefusals(document),
    ...duplicateClaimRefusals(document),
    ...(document.secrets ?? []).flatMap((grant, index) =>
      grantRefusals(grant, `/secrets/${index}`),
    ),
    ...document.applications.flatMap((application, index) =>
      applicationRefusals(application, document, `/applications/${index}`),
    ),
  ];
}

// ---------------------------------------------------------------------------
// The names a route, a scrape or an L4 exposure writes, which must resolve
// inside the one Application that holds them. A dependency edge names another
// Application, which only the composed union can resolve, so it is not checked
// here.
// ---------------------------------------------------------------------------

interface Written {
  readonly process: string;
  readonly surface: string;
}

/** The refusal of a route or scrape whose names resolve to nothing, if any. */
function linkRefusal(
  written: Written,
  processes: readonly Process[],
  at: string,
): Diagnostic | undefined {
  const process = processes.find(({ name }) => name === written.process);
  if (process === undefined)
    return {
      code: "E_UNKNOWN_PROCESS",
      path: at,
      message: `no Process of this Application is named ${written.process}`,
      hint: "Name one of the Application's own Processes.",
    };
  if (!Object.hasOwn(process.provides ?? {}, written.surface))
    return {
      code: "E_UNKNOWN_SURFACE",
      path: at,
      message: `${process.name} provides no surface named ${written.surface}`,
      hint: "Name a surface the Process declares in its `provides`.",
    };
  return undefined;
}

/** Every route, scrape and L4 exposure that names a Process or a surface its Application lacks. */
export function linkDiagnostics(
  document: ProjectIntentDocument,
): readonly Diagnostic[] {
  return document.applications.flatMap((application, a) => {
    const at = `/applications/${String(a)}`;
    const written = [
      ...(application.exposure ?? []).flatMap((exposure, e) =>
        exposure.routes.map((route, r) => ({
          route,
          path: `${at}/exposure/${String(e)}/routes/${String(r)}`,
        })),
      ),
      ...(application.observability?.scrape === undefined
        ? []
        : [
            {
              route: application.observability.scrape,
              path: `${at}/observability/scrape`,
            },
          ]),
      ...(application.l4Exposure ?? []).map((route, l) => ({
        route,
        path: `${at}/l4Exposure/${String(l)}`,
      })),
    ];
    return written.flatMap(({ route, path }) => {
      const refusal = linkRefusal(route, application.processes, path);
      return refusal === undefined ? [] : [refusal];
    });
  });
}

// ---------------------------------------------------------------------------
// The env files beside the project file.
// ---------------------------------------------------------------------------

/** Whether any of `wider` states the same variable. */
const restates = (wider: readonly unknown[], one: unknown): boolean =>
  wider.some((above) => sameDeclaration(above, one));

/**
 * Every variable a narrower scope restates unchanged from a wider one. The
 * refusal sits on the lower file, which is the one an author deletes a line
 * from, and names the variable, which is the declaration.
 */
function envDuplicates(
  env: readonly ScopedEnv[],
  document: ProjectIntentDocument,
): readonly Diagnostic[] {
  // What a scope names: an Application, a Process, or the project itself.
  const named = (scope: EnvScope): string =>
    scope.level === "project"
      ? document.project
      : scope.level === "application"
        ? scope.id
        : scope.name;
  const of = (level: EnvScope["level"], key?: string) =>
    env.filter(
      ({ scope }) =>
        scope.level === level && (key === undefined || named(scope) === key),
    );
  const refusals: Diagnostic[] = [];
  for (const application of document.applications)
    for (const process of application.processes) {
      const above = [
        ...of("application", application.id),
        ...of("project", document.project),
      ].flatMap(({ file }) => file.entries);
      for (const { path, file } of of("process", process.name))
        for (const entry of file.entries)
          if (restates(above, entry))
            refusals.push(duplicateEnv(path, entry.name));
    }
  // An Application scope against the project header, the same way.
  const project = of("project", document.project).flatMap(
    ({ file }) => file.entries,
  );
  for (const { path, file } of of("application"))
    for (const entry of file.entries)
      if (restates(project, entry))
        refusals.push(duplicateEnv(path, entry.name));
  return refusals;
}

const duplicateEnv = (path: string, name: string): Diagnostic => ({
  code: "E_SHARED_DECLARATION_DUPLICATED",
  path,
  message: `${name} is set again, to the same value, by a scope above this one`,
  hint: "Delete this line, or change it: a narrower scope replaces a wider one, and a restatement does nothing.",
});

/** Every scope directory that names no Application and no Process. */
function unknownScopes(
  env: readonly ScopedEnv[],
  document: ProjectIntentDocument,
): readonly ScopedEnv[] {
  const applications = new Set(document.applications.map(({ id }) => id));
  const processes = new Set(
    document.applications.flatMap(({ processes }) =>
      processes.map(({ name }) => name),
    ),
  );
  return env.filter(
    ({ scope }) =>
      (scope.level === "application" && !applications.has(scope.id)) ||
      (scope.level === "process" && !processes.has(scope.name)),
  );
}

/** Every scope directory that names nothing the project file declares. */
const unknownScopeDiagnostics = (
  env: readonly ScopedEnv[],
  document: ProjectIntentDocument,
): readonly Diagnostic[] =>
  unknownScopes(env, document).map(({ path }) => ({
    code: "E_UNKNOWN_ENV_SCOPE",
    path,
    message: "this scope directory names nothing the project file declares",
    hint: "A directory is how a variable reaches a level: name an Application or a Process the project file declares.",
  }));

/** Every refusal a project file and the env files beside it earn together. */
export const projectDiagnostics = (
  document: ProjectIntentDocument,
  env: readonly ScopedEnv[],
): readonly Diagnostic[] => [
  ...ruleDiagnostics(document),
  ...linkDiagnostics(document),
  ...envDuplicates(env, document),
  ...unknownScopeDiagnostics(env, document),
];
