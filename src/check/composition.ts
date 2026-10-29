// The rules a Platform document and the project files beside it answer
// together: each reference one makes into the other resolves, and each policy
// one asks for the other offers (spec/v1/14-platform-intent.md). A refusal
// names the document it points into, because the object at fault can sit in
// either.
import {
  exposuresOf,
  LISTENER_PORTS,
  proxyProcessOf,
  tierExposuresOf,
} from "../model/tier-proxy.ts";
import { catalogSurfaceOf, dumpedSurfaceOf } from "../model/backup.ts";
import type { Diagnostic } from "../model/diagnostic.ts";
import {
  holds,
  OTLP_SURFACE,
  type PlatformIntentDocument,
} from "../model/platform-intent.ts";
import {
  collectorEndpoint,
  forwardAuthEndpoint,
  gateEndpoint,
  reporterEndpoint,
  secretStoreAddress,
} from "../model/runtime-profiles.ts";
import { addressesIn, l4AddressOf } from "../model/l4-addresses.ts";
import { serves } from "../model/vocabularies.ts";
import { libraryOf } from "../model/libraries.ts";
import {
  writablePathOf,
  type Asset,
  type L4Exposure,
  type LibraryMount,
  type ProjectIntentDocument,
} from "../model/project-intent.ts";
import {
  assetIdentity,
  below,
  effectiveCutover,
  ownsBuckets,
  ownsDatabases,
} from "../model/project-intent-queries.ts";

export interface Named<T> {
  readonly name: string;
  readonly document: T;
}

type Application = ProjectIntentDocument["applications"][number];
type Grant = NonNullable<Application["secrets"]>[number];
type Exposure = NonNullable<Application["exposure"]>[number];

type Process = Application["processes"][number];

/**
 * The Assets a Process seeds, each where it is written: every level's Assets,
 * lowest first, the lower one holding a path two levels name
 * (spec/v1/10-project-intent.md#sharing-merges-and-a-duplicate-is-refused).
 */
function seededOf(
  levels: readonly (readonly [readonly Asset[] | undefined, string])[],
): { readonly seedAt: string; readonly at: string }[] {
  const held = new Set<string>();
  return levels.flatMap(([assets, at]) =>
    // A level with no Asset and one with an empty list seed nothing alike.
    // Stryker disable next-line ArrayDeclaration
    (assets ?? []).flatMap((asset, i) => {
      const path = assetIdentity(asset);
      if (held.has(path)) return [];
      held.add(path);
      return "seedAt" in asset
        ? [{ seedAt: asset.seedAt, at: `${at}/assets/${String(i)}/seedAt` }]
        : [];
    }),
  );
}

/**
 * A seeded Asset runs the platform's seeder, and lands on one of its Process's
 * own volumes or writable paths, whichever level declares the path
 * (spec/v1/10-project-intent.md#seeded-assets).
 */
function seedRefusals(
  process: Process,
  seeded: readonly { readonly seedAt: string; readonly at: string }[],
  writable: readonly (
    readonly (string | { readonly path: string })[] | undefined
  )[],
  platform: PlatformIntentDocument,
): Omit<Diagnostic, "document">[] {
  const volumes = [
    // A Process with no volume and one with an empty list hold no path alike.
    // Stryker disable next-line ArrayDeclaration
    ...(process.volumes ?? []).map(({ mountAt }) => mountAt),
    // Stryker disable next-line ArrayDeclaration
    ...writable.flatMap((paths) => (paths ?? []).map(writablePathOf)),
  ];
  return [
    ...(seeded.length > 0 && platform.seeder === undefined
      ? [
          {
            code: "E_NO_SEEDER" as const,
            path: (seeded[0] as (typeof seeded)[number]).at,
            message: `${process.name} seeds an Asset, and the platform names no seeder`,
            hint: "Name the seeder in the Platform document's `seeder`, or mount the Asset with `mountAt`.",
          },
        ]
      : []),
    ...seeded
      .filter(({ seedAt }) => !volumes.some((volume) => below(seedAt, volume)))
      .map(({ seedAt, at }) => ({
        code: "E_SEED_OUTSIDE_VOLUME" as const,
        path: at,
        message: `${process.name} seeds ${seedAt}, which is a file below none of its volumes or writable paths`,
        hint: "Seed the Asset at a path below one of the Process's volumes or writable paths, or mount it with `mountAt`.",
      })),
  ];
}

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

/**
 * An L4 Address is the platform's to declare
 * (spec/v1/14-platform-intent.md#l4-addresses): an exposure names one the
 * Platform document declares.
 */
const l4AddressRefusals = (
  application: Application,
  at: string,
  platform: PlatformIntentDocument,
): Omit<Diagnostic, "document">[] =>
  // A missing list and an empty one name no address alike.
  // Stryker disable next-line ArrayDeclaration
  (application.l4Exposure ?? []).flatMap(({ address }, index) =>
    l4AddressOf(platform, address) === undefined
      ? [
          {
            code: "E_UNKNOWN_L4_ADDRESS" as const,
            path: `${at}/l4Exposure/${String(index)}`,
            message: `the platform declares no L4 Address ${address}`,
            hint: "Declare the address in the Platform document's `l4Addresses`, or expose on one it declares.",
          },
        ]
      : [],
  );

/**
 * A node's own address is a host port on one node
 * (spec/v1/10-project-intent.md#l4-exposure), and a host port holds one copy:
 * a second replica, or the second revision a blue/green switch starts beside
 * the old one, could never bind it.
 */
const nodeAddressRefusals = (
  project: ProjectIntentDocument,
  application: Application,
  a: number,
  platform: PlatformIntentDocument,
): Omit<Diagnostic, "document">[] => {
  const onNode = new Set(
    exposuresOf(platform, project.project, application)
      .filter(({ address }) => l4AddressOf(platform, address)?.kind === "node")
      .map(({ process }) => process),
  );
  // The delivery machinery cuts over rolling, never a pod more, which a host
  // port honours; a continuous cutover anywhere else switches blue/green.
  const machinery =
    platform.delivery?.machinery.includes(
      `${project.project}/${application.id}`,
    ) === true;
  return application.processes.flatMap((process, p) => {
    if (!onNode.has(process.name)) return [];
    const at = `/applications/${String(a)}/processes/${String(p)}`;
    return [
      ...(process.replicas === undefined
        ? []
        : [
            {
              code: "E_NODE_ADDRESS_REPLICATED" as const,
              path: `${at}/replicas`,
              message: `${process.name} is exposed on a node's own address, where a host port holds one copy, so its replicas could never all start`,
              hint: "Drop `replicas`, or expose the Process on a pool.",
            },
          ]),
      ...(serves(process.lifecycle) &&
      !machinery &&
      effectiveCutover([process, application, project]) === "continuous"
        ? [
            {
              code: "E_CUTOVER_UNHONOURABLE" as const,
              path: at,
              message: `${process.name} is exposed on a node's own address, whose host port the second copy a continuous cutover starts beside the old one cannot bind`,
              hint: "Declare `cutover: interrupted`, which is what a host port can honour.",
            },
          ]
        : []),
    ];
  });
};

/**
 * A node listens on a port and a protocol once, so two Processes, or one on
 * two of a node's addresses, never dial the same one there
 * (spec/v1/10-project-intent.md#l4-exposure). Every entry that shares it is
 * refused; one Process's repeat on one address is E_DUPLICATE_L4_PORT's.
 */
function nodePortRefusals(
  platform: Named<PlatformIntentDocument>,
  projects: readonly Named<ProjectIntentDocument>[],
): Diagnostic[] {
  const onNode = (
    entry: L4Exposure,
    document: string,
    path: string,
    owner: string,
  ) => {
    const address = l4AddressOf(platform.document, entry.address);
    return address?.kind === "node"
      ? [
          {
            document,
            path,
            key: JSON.stringify([address.node, entry.protocol, entry.port]),
            owner: JSON.stringify([owner, entry.process, entry.address]),
            entry,
            node: address.node,
          },
        ]
      : // A pool's entry shares no node's port: anything here keys nothing
        // and owns nothing, so no refusal reads it.
        // Stryker disable next-line ArrayDeclaration
        [];
  };
  const authored = projects.flatMap(({ name, document }) =>
    document.applications.flatMap((application, a) =>
      // Stryker disable next-line ArrayDeclaration
      (application.l4Exposure ?? []).flatMap((entry, e) =>
        onNode(
          entry,
          name,
          `/applications/${String(a)}/l4Exposure/${String(e)}`,
          `${name}/${String(a)}`,
        ),
      ),
    ),
  );
  // A tier's ports are the tier's, refused where the tier names its address.
  const derived = platform.document.tiers.flatMap((tier, t) =>
    projects.flatMap(({ document }) =>
      document.applications
        .filter(({ id }) => holds(tier.traefik, document.project, id))
        .flatMap((application) =>
          tierExposuresOf(
            { tiers: [tier] },
            document.project,
            application,
          ).flatMap((entry) =>
            onNode(
              entry,
              platform.name,
              `/tiers/${String(t)}/address`,
              `${platform.name}/${String(t)}`,
            ),
          ),
        ),
    ),
  );
  const entries = [...authored, ...derived];
  const owners = new Map<string, Set<string>>();
  for (const { key, owner } of entries)
    owners.set(key, (owners.get(key) ?? new Set()).add(owner));
  return entries
    .filter(({ key }) => (owners.get(key) as Set<string>).size > 1)
    .map(({ document, path, entry, node }) => ({
      code: "E_NODE_PORT_TAKEN",
      document,
      path,
      message: `${entry.protocol} port ${String(entry.port)} on ${node} is dialled by more than one exposure`,
      hint: "A node listens on a port and a protocol once: give one exposure another port, or expose it on another address.",
    }));
}

/**
 * A tier's proxy is reached on the ports its listener derives, so a Process of
 * it provides the surfaces those ports reach
 * (spec/v1/14-platform-intent.md#tiers); and an acme tier's proxy holds the
 * ACME state on one claim, so it runs one copy, or two would issue the same
 * names against the same allowance.
 */
function proxyRefusals(
  platform: Named<PlatformIntentDocument>,
  projects: readonly Named<ProjectIntentDocument>[],
): Diagnostic[] {
  return platform.document.tiers.flatMap((tier, t) =>
    projects.flatMap(({ name, document }) =>
      document.applications.flatMap((application, a): Diagnostic[] => {
        if (!holds(tier.traefik, document.project, application.id)) return [];
        const unanswered =
          tier.address !== undefined &&
          proxyProcessOf(application, tier.listener) === undefined;
        return [
          ...(unanswered
            ? [
                {
                  code: "E_TIER_SURFACE_MISSING" as const,
                  document: platform.name,
                  path: `/tiers/${String(t)}`,
                  message: `no Process of ${tier.traefik} provides ${LISTENER_PORTS[
                    tier.listener
                  ]
                    .map(({ surface }) => surface)
                    .join(
                      " and ",
                    )}, which tier ${tier.name}'s ${tier.listener} listener reaches`,
                  hint: "Provide the surfaces on the proxy's Process, or name a proxy that provides them.",
                },
              ]
            : []),
          ...(tier.certificates === "acme"
            ? application.processes.flatMap((process, p) =>
                process.replicas === undefined
                  ? []
                  : [
                      {
                        code: "E_ACME_PROXY_REPLICATED" as const,
                        document: name,
                        path: `/applications/${String(a)}/processes/${String(p)}/replicas`,
                        message: `${process.name} proxies tier ${tier.name}, which issues its certificates through acme, so a second copy would issue the same names`,
                        hint: "Drop `replicas`: an acme tier's proxy runs one copy.",
                      },
                    ],
              )
            : []),
        ];
      }),
    ),
  );
}

/**
 * A pool gives each Service exposed on it one address of its range, so it
 * holds as many Processes as its range holds addresses: one more would wait
 * for an address that never comes.
 */
function exhaustedRefusals(
  platform: Named<PlatformIntentDocument>,
  projects: readonly Named<ProjectIntentDocument>[],
): Diagnostic[] {
  const exposed = new Map<string, Set<string>>();
  for (const { document } of projects)
    for (const application of document.applications)
      for (const { address, process } of exposuresOf(
        platform.document,
        document.project,
        application,
      ))
        exposed.set(
          address,
          (exposed.get(address) ?? new Set()).add(
            `${document.project}/${process}`,
          ),
        );
  return Object.entries(platform.document.l4Addresses ?? {}).flatMap(
    ([name, address]): Diagnostic[] => {
      // A node's own address takes no address of a range: its ports are
      // counted by E_NODE_PORT_TAKEN instead.
      if (address.kind === "node") return [];
      const { range } = address;
      const processes = exposed.get(name)?.size ?? 0;
      return processes > addressesIn(range)
        ? [
            {
              code: "E_L4_ADDRESS_EXHAUSTED",
              document: platform.name,
              path: `/l4Addresses/${name}`,
              message: `${String(processes)} Processes are exposed on ${name}, whose range ${range} holds ${String(addressesIn(range))}`,
              hint: "Widen the pool's range, or expose fewer Processes on it.",
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
  /** The surfaces a Process whose engine owns buckets provides, by its Application. */
  readonly buckets: ReadonlyMap<string, ReadonlySet<string>>;
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

/**
 * `credentials` on an edge whose provider was read and owns no database, and
 * `buckets` on one whose provider was read and owns no buckets.
 */
function credentialsRefusals(
  edges: readonly Edge[] | undefined,
  at: string,
  estate: Estate,
): Omit<Diagnostic, "document">[] {
  // Stryker disable next-line ArrayDeclaration: an element that is no edge has
  // no `credentials`, so a non-empty fallback refuses nothing either.
  return (edges ?? []).flatMap((edge, e) => [
    ...(edge.credentials !== undefined &&
    estate.declared.has(edge.application) &&
    !derivesDatabase(edge, estate)
      ? [
          {
            code: "E_CREDENTIALS_WITHOUT_DATABASE" as const,
            path: `${at}/dependsOn/${e}/credentials`,
            message: `${edge.application} owns no database, so this edge derives no credential to rotate`,
            hint: "Delete `credentials`: it only shapes the credential an edge to a database derives.",
          },
        ]
      : []),
    ...(edge.buckets !== undefined &&
    estate.declared.has(edge.application) &&
    // Every declared Application has its entry, an empty set where it owns no buckets.
    !(estate.buckets.get(edge.application) as ReadonlySet<string>).has(
      edge.surface,
    )
      ? [
          {
            code: "E_BUCKETS_WITHOUT_OBJECT_STORE" as const,
            path: `${at}/dependsOn/${e}/buckets`,
            message: `${edge.application} serves no object store on ${edge.surface}, so this edge derives no bucket`,
            hint: "Delete `buckets`, or name the surface of a Process whose engine is `s3`.",
          },
        ]
      : []),
  ]);
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

/**
 * One Traefik filters on one ingress class
 * (spec/v1/30-deliverables.md#the-edge-proxy): two tiers that name one proxy
 * with two classes leave the second tier's routes admitted by no proxy.
 */
function unfiltered(platform: Named<PlatformIntentDocument>): Diagnostic[] {
  const filters = new Map<string, string>();
  return platform.document.tiers.flatMap(
    ({ traefik, ingressClass }, index): Diagnostic[] => {
      if (ingressClass === undefined) return [];
      const filtered = filters.get(traefik);
      if (filtered === undefined) {
        filters.set(traefik, ingressClass);
        return [];
      }
      return filtered === ingressClass
        ? []
        : [
            {
              code: "E_TIER_CLASS_UNFILTERED",
              document: platform.name,
              path: `/tiers/${String(index)}/ingressClass`,
              message: `the proxy ${traefik} admits routes of ${filtered}, so no proxy admits this tier's ${ingressClass}`,
              hint: "Give the tier the class its proxy admits, or its own proxy.",
            },
          ];
    },
  );
}

/**
 * The monitoring stack is three declared Applications by role, and only they
 * carry alert rules (spec/v1/14-platform-intent.md#monitoring): a rule
 * anywhere else would be a second home for alerting.
 */
function monitoringRefusals(
  platform: Named<PlatformIntentDocument>,
  projects: readonly Named<ProjectIntentDocument>[],
  holders: ReadonlySet<string>,
): Diagnostic[] {
  const { monitoring } = platform.document;
  // The roles, each by name; no block names none.
  const roles = new Map<string, string>(
    monitoring === undefined
      ? undefined
      : (["grafana", "prometheus", "alertmanager"] as const).map((role) => [
          role,
          monitoring[role],
        ]),
  );
  // A set that holds no file of a role's Project, such as one Project's own
  // check, cannot tell; the composition, which holds every Project, does.
  const composed = new Set(projects.map(({ document }) => document.project));
  const unknown = [...roles].flatMap(([role, name]): Diagnostic[] =>
    holders.has(name) || !composed.has(name.slice(0, name.indexOf("/")))
      ? []
      : [
          {
            code: "E_UNKNOWN_MONITORING_APPLICATION",
            document: platform.name,
            path: `/monitoring/${role}`,
            message: `no project file declares the Application ${name} the monitoring stack's ${role} names`,
            hint: "Name it as `<project>/<application>`, an Application its Project declares.",
          },
        ],
  );
  const stack = new Set(roles.values());
  const outside = projects.flatMap(({ name, document }) =>
    document.applications.flatMap((application, a): Diagnostic[] =>
      application.alertRules === undefined ||
      stack.has(`${document.project}/${application.id}`)
        ? []
        : [
            {
              code: "E_ALERT_RULES_OUTSIDE_MONITORING",
              document: name,
              path: `/applications/${String(a)}/alertRules`,
              message: `${application.id} carries alert rules and is not the monitoring stack`,
              hint: "Carry alert rules on an Application `monitoring` names, or name this one there.",
            },
          ],
    ),
  );
  return [...unknown, ...outside];
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

  // A route the tier's proxy admits carries the tier's ingress class, so an
  // exposure on a tier that names none would be admitted by no proxy.
  const unclassed = (audience: string, path: string): void => {
    const tier = platform.tiers.find(({ audiences }) =>
      (audiences as readonly string[]).includes(audience),
    );
    if (tier !== undefined && tier.ingressClass === undefined)
      refusals.push({
        code: "E_TIER_WITHOUT_INGRESS_CLASS",
        path,
        message: `the tier ${tier.name} names no ingress class, so no proxy would admit this exposure's routes`,
        hint: "Name the ingress class the tier's Traefik admits in its `ingressClass`.",
      });
  };

  // An exposure the DNS provider does not proxy points its record at the
  // tier's direct address, so a tier that names none leaves it nowhere to
  // point.
  const undirected = (exposure: Exposure, path: string): void => {
    if (exposure.proxied !== false) return;
    const tier = platform.tiers.find(({ audiences }) =>
      (audiences as readonly string[]).includes(exposure.audience),
    );
    if (tier !== undefined && tier.dns?.direct === undefined)
      refusals.push({
        code: "E_NO_DIRECT_TARGET",
        path: `${path}/proxied`,
        message: `the tier ${tier.name} names no direct address, so this exposure's record would point nowhere`,
        hint: "Name the address the tier's edge is dialled at in its `dns.direct`, or let the exposure be proxied.",
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
      unclassed(exposure.audience, `${at}/exposure/${e}`);
      undirected(exposure, `${at}/exposure/${e}`);
      for (const [r, route] of exposure.routes.entries())
        if (route.audience !== undefined)
          noTier(route.audience, `${at}/exposure/${e}/routes/${r}`);
    }
    refusals.push(...grantRefusals(application.secrets ?? [], at, platform));
    refusals.push(...l4AddressRefusals(application, at, platform));
    refusals.push(...nodeAddressRefusals(project, application, a, platform));
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
      refusals.push(
        ...seedRefusals(
          process,
          seededOf([
            [process.assets, processAt],
            [application.assets, at],
            [project.assets, ""],
          ]),
          [
            process.writablePaths,
            application.writablePaths,
            project.writablePaths,
          ],
          platform,
        ),
      );
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
      // A catalog applied over a surface the Process does not provide reaches
      // nothing, as a backup would.
      const catalogued = catalogSurfaceOf(process, platform);
      if (
        catalogued !== undefined &&
        process.provides?.[catalogued] === undefined
      )
        refusals.push({
          code: "E_CATALOG_SURFACE_NOT_PROVIDED",
          path: processAt,
          message: `the catalog of engine ${process.engine as string} is applied over the surface ${catalogued}, which ${process.name} does not provide`,
          hint: "Provide the surface the Platform document's `engines` names as `catalogSurface` for this engine, under that name.",
        });
      // Kubernetes API access is the platform's to admit: a Process that
      // declares it in an Application the Platform document does not name
      // would hold a grant nobody with authority over the cluster gave. The
      // platform admits by id, so an id two Applications carry admits
      // neither: a second project naming its own Application `flagger` is
      // not the one the platform meant, and nothing here can tell which is.
      const named = `${project.project}/${application.id}`;
      const repeated = estate.repeated.has(application.id);
      const cluster =
        platform.apiAccess?.holders.includes(named) === true && !repeated;
      const local =
        platform.apiAccess?.namespaceHolders?.includes(named) === true &&
        !repeated;
      // Admitted to its namespace alone, a rule that reaches the cluster is
      // one the platform did not give.
      if (process.api !== undefined && !cluster && local)
        // Stryker disable next-line ArrayDeclaration: no rules and an empty
        // list reach the cluster for nothing alike.
        for (const [r, rule] of (process.api.rules ?? []).entries())
          if (rule.scope !== "namespace")
            refusals.push({
              code: "E_PROCESS_RBAC_GRANT",
              path: `${processAt}/api/rules/${String(r)}`,
              message: `${process.name} asks the whole cluster for ${rule.objects.join(", ")}, and the platform admits the Application ${application.id} only to its own namespace`,
              hint: "Scope the rule `namespace`, or name the Application in the Platform document's `apiAccess.holders` instead of `namespaceHolders`.",
            });
      // A spawn template derives API access to create its pods in its own
      // namespace, so it is admitted the same way, at either scope.
      const asks =
        process.api !== undefined
          ? "api"
          : process.spawns !== undefined
            ? "spawns"
            : undefined;
      if (asks !== undefined && !cluster && !local)
        refusals.push({
          code: "E_PROCESS_RBAC_GRANT",
          path: `${processAt}/${asks}`,
          message: repeated
            ? `${process.name} declares Kubernetes API access, and more than one Application carries the id ${application.id}, so the platform admits none of them`
            : `${process.name} declares Kubernetes API access, and the platform does not admit the Application ${application.id} to hold any`,
          hint:
            "Name the Application in the Platform document's `apiAccess.holders` as `<project>/<application>`, under an id no other Application carries, or drop `" +
            asks +
            "`.",
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
    buckets: new Map(
      projects.flatMap(({ document }) =>
        document.applications.map(({ id, processes }) => [
          id,
          new Set(
            processes
              .filter(ownsBuckets)
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
    [
      ["holders", platform.document.apiAccess?.holders ?? []],
      // Stryker disable next-line ArrayDeclaration: no list and an empty one
      // admit no one alike.
      ["namespaceHolders", platform.document.apiAccess?.namespaceHolders ?? []],
    ] as const
  ).flatMap(([list, names]) =>
    names.flatMap((name) =>
      holders.has(name)
        ? []
        : [
            {
              code: "E_UNKNOWN_API_HOLDER" as const,
              document: platform.name,
              path: "/apiAccess",
              message: `no project file declares the Application ${name} the platform admits to hold Kubernetes API access`,
              hint: `Name it as \`<project>/<application>\`, an Application its Project declares, or drop it from \`apiAccess.${list}\`.`,
            },
          ],
    ),
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
  // A critical Application is one a project file declares; a set that holds
  // no file of its Project, such as one Project's own check, cannot tell.
  const composedProjects = new Set(
    projects.map(({ document }) => document.project),
  );
  const critical: Diagnostic[] =
    // A missing list and an empty one name no Application alike.
    // Stryker disable next-line ArrayDeclaration
    (platform.document.priority?.criticalApplications ?? []).flatMap(
      (name, index): Diagnostic[] =>
        holders.has(name) ||
        !composedProjects.has(name.slice(0, name.indexOf("/")))
          ? []
          : [
              {
                code: "E_UNKNOWN_CRITICAL_APPLICATION",
                document: platform.name,
                path: `/priority/criticalApplications/${String(index)}`,
                message: `no project file declares the Application ${name} the platform names critical`,
                hint: "Name it as `<project>/<application>`, an Application its Project declares.",
              },
            ],
    );
  // A tier's forward-auth names an Application whose Process provides the
  // surface it names: the edge asks it there. A set that holds no file of the
  // provider's Project, such as one Project's own check, cannot tell, and the
  // composition, which holds every Project, does.
  const composed = new Set(projects.map(({ document }) => document.project));
  const forwardAuth: Diagnostic[] = platform.document.tiers.flatMap(
    (tier, index): Diagnostic[] =>
      tier.forwardAuth === undefined ||
      !composed.has(
        tier.forwardAuth.provider.slice(
          0,
          tier.forwardAuth.provider.indexOf("/"),
        ),
      ) ||
      forwardAuthEndpoint(
        platform.document,
        projects.map(({ document }) => document),
        tier.forwardAuth,
      ) !== undefined
        ? []
        : [
            {
              code: "E_UNKNOWN_FORWARD_AUTH_PROVIDER",
              document: platform.name,
              path: `/tiers/${String(index)}/forwardAuth`,
              message: `no project file declares an Application ${tier.forwardAuth.provider} whose Process provides a \`${tier.forwardAuth.surface}\` surface`,
              hint: "Name the provider as `<project>/<application>`, an Application its Project declares with that surface on one of its Processes.",
            },
          ],
  );
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
  // Every Project the mesh enrols is one a project file declares
  // (spec/v1/14-platform-intent.md#the-mesh).
  const declaredProjects = new Set(
    projects.map(({ document }) => document.project),
  );
  const enrolled: Diagnostic[] = (
    platform.document.mesh?.enrolled ?? []
  ).flatMap((project, index) =>
    declaredProjects.has(project)
      ? []
      : [
          {
            code: "E_UNKNOWN_ENROLLED_PROJECT" as const,
            document: platform.name,
            path: `/mesh/enrolled/${String(index)}`,
            message: `no project file declares the Project ${project} the mesh enrols`,
            hint: "Name a Project a project file declares in `mesh.enrolled`, or remove it from the list.",
          },
        ],
  );
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
    ...unfiltered(platform),
    ...machinery,
    ...apiHolders,
    ...telemetry,
    ...critical,
    ...forwardAuth,
    ...stack,
    ...monitoringRefusals(platform, projects, holders),
    ...release,
    ...reporting,
    ...secrets,
    ...issuing,
    ...enrolled,
    ...serving,
    ...exhaustedRefusals(platform, projects),
    ...nodePortRefusals(platform, projects),
    ...proxyRefusals(platform, projects),
    ...projects.flatMap(({ name, document }) =>
      projectRefusals(document, platform.document, estate).map((refusal) => ({
        ...refusal,
        document: name,
      })),
    ),
  ];
}
