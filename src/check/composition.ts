// The rules a Platform document and the project files beside it answer
// together: each reference one makes into the other resolves, and each policy
// one asks for the other offers (spec/v1/14-platform-intent.md). A refusal
// names the document it points into, because the object at fault can sit in
// either.
import { dumpedSurfaceOf } from "../model/backup.ts";
import type { Diagnostic } from "../model/diagnostic.ts";
import {
  holds,
  OTLP_SURFACE,
  type PlatformIntentDocument,
} from "../model/platform-intent.ts";
import {
  collectorEndpoint,
  gateEndpoint,
  reporterEndpoint,
  secretStoreAddress,
} from "../model/runtime-profiles.ts";
import { libraryOf } from "../model/libraries.ts";
import type {
  LibraryMount,
  ProjectIntentDocument,
} from "../model/project-intent.ts";
import {
  effectiveCutover,
  ownsDatabases,
} from "../model/project-intent-queries.ts";

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

/**
 * A library is the platform's to declare and to grant
 * (spec/v1/14-platform-intent.md#libraries): a mount names one the Platform
 * document declares, granted to the Process's project for what it mounts it for.
 */
function libraryRefusals(
  mounts: readonly LibraryMount[],
  at: string,
  project: ProjectIntentDocument,
  platform: PlatformIntentDocument,
): Omit<Diagnostic, "document">[] {
  return mounts.flatMap(
    ({ library, access }, index): Omit<Diagnostic, "document">[] => {
      const path = `${at}/libraries/${String(index)}`;
      const declared = libraryOf(platform, library);
      if (declared === undefined)
        return [
          {
            code: "E_UNKNOWN_LIBRARY" as const,
            path,
            message: `the platform declares no library ${library}`,
            hint: "Declare the library in the Platform document's `libraries`, or mount one it declares.",
          },
        ];
      const granted = Object.hasOwn(declared.grants, project.project)
        ? declared.grants[project.project]
        : undefined;
      return granted === undefined || (access === "write" && granted === "read")
        ? [
            {
              code: "E_LIBRARY_NOT_GRANTED" as const,
              path,
              message:
                granted === undefined
                  ? `the library ${library} grants the project ${project.project} nothing`
                  : `the library ${library} grants the project ${project.project} read, and the Process mounts it write`,
              hint: "Grant the project the library in the Platform document, or mount it for what it is granted.",
            },
          ]
        : [];
    },
  );
}

/** What every project file read together says about who provides what. */
interface Estate {
  /** Every Application some project file declares. */
  readonly declared: ReadonlySet<string>;
  /** Every id more than one Application carries, so that the id names no one of them. */
  readonly repeated: ReadonlySet<string>;
  /**
   * The surfaces a Process whose engine owns databases provides, by its
   * Application: an edge to one of them derives a database, and an edge to
   * another surface of the same Application, an exporter's, derives none.
   */
  readonly databases: ReadonlyMap<string, ReadonlySet<string>>;
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

/** Whether an edge reaches a surface of a Process that owns databases. */
const derivesDatabase = (edge: Edge, estate: Estate): boolean =>
  estate.databases.get(edge.application)?.has(edge.surface) === true;

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
    !derivesDatabase(edge, estate)
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
    const consumes = edges.some((edge) => derivesDatabase(edge, estate));
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

/**
 * The Release Gate starts a migration, and it holds only an Application a
 * Process of which switches blue/green (spec/v1/10-project-intent.md#migration):
 * a changelog on any other would render Jobs nothing ever starts.
 */
function ungatedRefusals(
  project: ProjectIntentDocument,
  platform: PlatformIntentDocument,
): Omit<Diagnostic, "document">[] {
  // A platform with no delivery policy names no machinery.
  // Stryker disable next-line ArrayDeclaration
  const machinery = new Set(platform.delivery?.machinery ?? []);
  return project.applications.flatMap((application, a) =>
    typeof application.migration === "object" &&
    (machinery.has(`${project.project}/${application.id}`) ||
      !application.processes.some(
        (process) =>
          process.lifecycle === "application" &&
          effectiveCutover([process, application, project]) === "continuous",
      ))
      ? [
          {
            code: "E_MIGRATION_UNGATED",
            path: `/applications/${a}/migration`,
            message:
              "no Process of this Application switches blue/green, so nothing starts its migration",
            hint: "Give a Process a `continuous` cutover, or let the image migrate with `migration: self`.",
          },
        ]
      : [],
  );
}

/** While the handover lasts, every Project is on one path the ledger names. */
function handoverRefusals(
  project: ProjectIntentDocument,
  platform: PlatformIntentDocument,
): Omit<Diagnostic, "document">[] {
  const { handover } = platform;
  if (handover === undefined) return [];
  const onPath =
    handover.legacy?.includes(project.project) === true ||
    handover.estate?.includes(project.project) === true;
  return onPath
    ? []
    : [
        {
          code: "E_HANDOVER_UNLISTED",
          path: "",
          message: `the handover ledger puts project ${project.project} on no delivery path`,
          hint: "Name the Project in the Platform document's `handover.legacy` or `handover.estate`.",
        },
      ];
}

/** A continuous Application is gated, and the gate analyses at the platform's cadence. */
function deliveryRefusals(
  project: ProjectIntentDocument,
  platform: PlatformIntentDocument,
): Omit<Diagnostic, "document">[] {
  if (platform.delivery !== undefined) return [];
  return project.applications.flatMap((application, a) =>
    application.processes.some(
      (process) =>
        process.lifecycle === "application" &&
        effectiveCutover([process, application, project]) === "continuous",
    )
      ? [
          {
            code: "E_NO_DELIVERY_POLICY",
            path: `/applications/${a}`,
            message:
              "the platform offers no analysis cadence for this continuous Application's switch",
            hint: "Declare the Platform document's `delivery` policy: its machinery and analysis cadence.",
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
  refusals.push(...ungatedRefusals(project, platform));
  refusals.push(...deliveryRefusals(project, platform));
  refusals.push(...handoverRefusals(project, platform));
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
      if (process.vpn !== undefined && platform.vpn === undefined)
        refusals.push({
          code: "E_NO_VPN_POLICY",
          path: `${processAt}/vpn`,
          message: `${process.name} attaches to a VPN, and the platform runs none`,
          hint: "Declare the VPN in the Platform document's `vpn`, or drop the attachment.",
        });
      // Where the engine's method dumps over the network, the Process is what
      // it connects to: a surface the Process does not provide is a backup
      // that reaches nothing, behind a policy that admits nothing.
      const dumped = dumpedSurfaceOf(process, platform);
      if (dumped !== undefined && process.provides?.[dumped] === undefined)
        refusals.push({
          code: "E_BACKUP_SURFACE_NOT_PROVIDED",
          path: processAt,
          message: `the backup of engine ${process.engine as string} dumps the surface ${dumped}, which ${process.name} does not provide`,
          hint: "Provide the surface the Platform document's `engines` names for this engine, under that name.",
        });
      // Kubernetes API access is the platform's to admit: a Process that
      // declares it in an Application the Platform document does not name
      // would hold a grant nobody with authority over the cluster gave. The
      // platform admits by id, so an id two Applications carry admits
      // neither: a second project naming its own Application `flagger` is
      // not the one the platform meant, and nothing here can tell which is.
      if (
        process.api !== undefined &&
        (platform.apiAccess?.holders.includes(
          `${project.project}/${application.id}`,
        ) !== true ||
          estate.repeated.has(application.id))
      )
        refusals.push({
          code: "E_PROCESS_RBAC_GRANT",
          path: `${processAt}/api`,
          message: estate.repeated.has(application.id)
            ? `${process.name} declares Kubernetes API access, and more than one Application carries the id ${application.id}, so the platform admits none of them`
            : `${process.name} declares Kubernetes API access, and the platform does not admit the Application ${application.id} to hold any`,
          hint: "Name the Application in the Platform document's `apiAccess.holders` as `<project>/<application>`, under an id no other Application carries, or drop `api`.",
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
        ...libraryRefusals(
          process.libraries ?? [],
          processAt,
          project,
          platform,
        ),
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
  // A privileged role links to the Application its Project declares, never
  // to one another project file declares under the same id.
  const holders = new Set(
    projects.flatMap(({ document }) =>
      document.applications.map(({ id }) => `${document.project}/${id}`),
    ),
  );
  const ids = projects.flatMap(({ document }) =>
    document.applications.map(({ id }) => id),
  );
  const estate: Estate = {
    declared,
    repeated: new Set(ids.filter((id, at) => ids.indexOf(id) !== at)),
    databases: new Map(
      projects.flatMap(({ document }) =>
        document.applications.map(({ id, processes }) => [
          id,
          new Set(
            processes
              .filter(ownsDatabases)
              .flatMap(({ provides }) => Object.keys(provides ?? {})),
          ),
        ]),
      ),
    ),
  };
  const proxies: Diagnostic[] = platform.document.tiers.flatMap(
    (tier, index) =>
      holders.has(tier.traefik)
        ? []
        : [
            {
              code: "E_UNKNOWN_TIER_PROXY",
              document: platform.name,
              path: `/tiers/${index}`,
              message: `no project file declares the Application ${tier.traefik} this tier's proxy names`,
              hint: "Name the proxy as `<project>/<application>`, an Application its Project declares.",
            },
          ],
  );
  // The machinery names Applications a project file declares, as a proxy does.
  const machinery: Diagnostic[] = (
    platform.document.delivery?.machinery ?? []
  ).flatMap((name) =>
    holders.has(name)
      ? []
      : [
          {
            code: "E_UNKNOWN_MACHINERY",
            document: platform.name,
            path: "/delivery",
            message: `no project file declares the Application ${name} the delivery machinery names`,
            hint: "Name it as `<project>/<application>`, an Application its Project declares, or drop it from `delivery.machinery`.",
          },
        ],
  );
  // A holder of API access names an Application a project file declares, as
  // the machinery does.
  const apiHolders: Diagnostic[] = (
    platform.document.apiAccess?.holders ?? []
  ).flatMap((name) =>
    holders.has(name)
      ? []
      : [
          {
            code: "E_UNKNOWN_API_HOLDER",
            document: platform.name,
            path: "/apiAccess",
            message: `no project file declares the Application ${name} the platform admits to hold Kubernetes API access`,
            hint: "Name it as `<project>/<application>`, an Application its Project declares, or drop it from `apiAccess.holders`.",
          },
        ],
  );
  // The collector names an Application a project file declares, and the
  // endpoint every exporting profile is handed is its `otlp` surface.
  const collector = platform.document.telemetry?.collector;
  const collects =
    collectorEndpoint(
      platform.document,
      projects.map(({ document }) => document),
    ) !== undefined;
  const telemetry: Diagnostic[] =
    collector === undefined || collects
      ? []
      : [
          {
            code: "E_UNKNOWN_TELEMETRY_COLLECTOR",
            document: platform.name,
            path: "/telemetry",
            message: `no project file declares an Application ${collector} whose Process provides an \`${OTLP_SURFACE}\` surface`,
            hint: "Name the collector as `<project>/<application>`, an Application its Project declares with an `otlp` surface on one of its Processes.",
          },
        ];
  // The metrics stack is an Application a project file declares, as a proxy is.
  const metrics = platform.document.telemetry?.metrics;
  const stack: Diagnostic[] =
    metrics === undefined || holders.has(metrics)
      ? []
      : [
          {
            code: "E_UNKNOWN_METRICS_STACK",
            document: platform.name,
            path: "/telemetry",
            message: `no project file declares the Application ${metrics} the metrics stack names`,
            hint: "Name the metrics stack as `<project>/<application>`, an Application its Project declares.",
          },
        ];
  // The gate answers every Canary on its `http` surface.
  const gate = platform.document.delivery?.gate;
  const answers =
    gateEndpoint(
      platform.document,
      projects.map(({ document }) => document),
    ) !== undefined;
  const release: Diagnostic[] =
    gate === undefined || answers
      ? []
      : [
          {
            code: "E_UNKNOWN_RELEASE_GATE",
            document: platform.name,
            path: "/delivery",
            message: `no project file declares an Application ${gate} whose Process provides an \`http\` surface`,
            hint: "Name the Release Gate as `<project>/<application>`, an Application its Project declares with an `http` surface on one of its Processes.",
          },
        ];
  // The Reporter receives Flux's events on its `http` surface.
  const reporter = platform.document.delivery?.reporter;
  const receives =
    reporterEndpoint(
      platform.document,
      projects.map(({ document }) => document),
    ) !== undefined;
  const reporting: Diagnostic[] =
    reporter === undefined || receives
      ? []
      : [
          {
            code: "E_UNKNOWN_REPORTER",
            document: platform.name,
            path: "/delivery",
            message: `the project file that declares the Release Gate declares no Application ${reporter} whose Process provides an \`http\` surface`,
            hint: "Name the Reporter as `<project>/<application>` in the Release Gate's Project, an Application with an `http` surface on one of its Processes, or drop `delivery.reporter`.",
          },
        ];
  // The Secret Store answers every grant on its `http` surface.
  const store = platform.document.secretStore;
  const serves =
    secretStoreAddress(
      platform.document,
      projects.map(({ document }) => document),
    ) !== undefined;
  const secrets: Diagnostic[] =
    store === undefined || serves
      ? []
      : [
          {
            code: "E_UNKNOWN_SECRET_STORE",
            document: platform.name,
            path: "/secretStore",
            message: `no project file declares an Application ${store} whose Process provides an \`http\` surface`,
            hint: "Name the Secret Store as `<project>/<application>`, an Application its Project declares with an `http` surface on one of its Processes.",
          },
        ];
  // The sign-in provider is an Application its Project declares
  // (spec/v1/14-platform-intent.md#sign-in).
  const provider = platform.document.signIn?.provider;
  const issuing: Diagnostic[] =
    provider === undefined ||
    projects.some(({ document }) =>
      document.applications.some(({ id }) =>
        holds(provider, document.project, id),
      ),
    )
      ? []
      : [
          {
            code: "E_UNKNOWN_SIGN_IN_PROVIDER",
            document: platform.name,
            path: "/signIn",
            message: `no project file declares the sign-in provider ${provider}`,
            hint: "Name the Identity Provider as `<project>/<application>`, an Application its Project declares.",
          },
        ];
  // A stated location stands for an Application the old path still runs, and
  // an instance for its one Process.
  const legacy = new Set(platform.document.handover?.legacy);
  const serving: Diagnostic[] =
    platform.document.handover?.serving?.flatMap((location, index) =>
      projects.flatMap(({ document }) =>
        document.applications
          .filter(({ id }) => id === location.application)
          .flatMap(({ processes }) =>
            !legacy.has(document.project)
              ? [
                  {
                    code: "E_HANDOVER_SERVING" as const,
                    document: platform.name,
                    path: `/handover/serving/${String(index)}`,
                    message: `the handover ledger states where ${location.application} serves, but its project ${document.project} is not legacy`,
                    hint: "Remove the location in the change that moves the Project to `estate`.",
                  },
                ]
              : location.instance !== undefined && processes.length > 1
                ? [
                    {
                      code: "E_HANDOVER_SERVING" as const,
                      document: platform.name,
                      path: `/handover/serving/${String(index)}`,
                      message: `the handover ledger states one instance for ${location.application}, which runs ${String(processes.length)} Processes`,
                      hint: "State only the namespace, or split the Application.",
                    },
                  ]
                : [],
          ),
      ),
    ) ?? [];
  return [
    ...proxies,
    ...machinery,
    ...apiHolders,
    ...telemetry,
    ...stack,
    ...release,
    ...reporting,
    ...secrets,
    ...issuing,
    ...serving,
    ...projects.flatMap(({ name, document }) =>
      projectRefusals(document, platform.document, estate).map((refusal) => ({
        ...refusal,
        document: name,
      })),
    ),
  ];
}
