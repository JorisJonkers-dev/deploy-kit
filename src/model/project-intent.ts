// The authoring shape of a Project Intent document, schemaVersion 1, as
// spec/v1/10-project-intent.md defines it. Every class carries the id the
// descriptor and the generated JSON Schema name it by, and a union in the
// language is a union here.
import { z } from "zod";
import {
  ACCESS_TIERS,
  API_SCOPES,
  API_VERBS,
  EGRESS_TARGETS,
  ARCHITECTURES,
  AUDIENCES,
  CONTENT_POLICIES,
  CLIENT_CREDENTIALS,
  CUTOVERS,
  DATABASE_ENGINES,
  DELIVERIES,
  DURABILITY_CLASSES,
  ENGINES,
  KEY_ENCODINGS,
  L4_PROTOCOLS,
  LIBRARY_ACCESS,
  SPREADS,
  LIFECYCLES,
  MATCHES,
  MEDIA,
  PLACEHOLDER_KINDS,
  RUNTIMES,
  SIGN_IN_MODES,
  TOLERANCES,
  TRANSIT_ENGINES,
  TRANSIT_OPERATIONS,
} from "./vocabularies.ts";

// Every closed vocabulary is named, because the descriptor and the generated
// JSON Schema name it.
const accessTier = z.enum(ACCESS_TIERS).meta({ id: "AccessTier" });
const databaseEngine = z.enum(DATABASE_ENGINES).meta({ id: "DatabaseEngine" });
const transitEngine = z.enum(TRANSIT_ENGINES).meta({ id: "TransitEngine" });
const arch = z.enum(ARCHITECTURES).meta({ id: "Arch" });
const audience = z.enum(AUDIENCES).meta({ id: "Audience" });
const contentPolicy = z.enum(CONTENT_POLICIES).meta({ id: "ContentPolicy" });
const cutover = z.enum(CUTOVERS).meta({ id: "Cutover" });
const delivery = z.enum(DELIVERIES).meta({ id: "Delivery" });
const durabilityClass = z
  .enum(DURABILITY_CLASSES)
  .meta({ id: "DurabilityClass" });
const engine = z.enum(ENGINES).meta({ id: "Engine" });
const lifecycle = z.enum(LIFECYCLES).meta({ id: "Lifecycle" });
const match = z.enum(MATCHES).meta({ id: "Match" });
const media = z.enum(MEDIA).meta({ id: "Media" });
const runtime = z.enum(RUNTIMES).meta({ id: "Runtime" });
const tolerance = z.enum(TOLERANCES).meta({ id: "Tolerance" });
const transitOp = z.enum(TRANSIT_OPERATIONS).meta({ id: "TransitOp" });
const apiVerb = z.enum(API_VERBS).meta({ id: "ApiVerb" });

const placeholderKind = z
  .enum(PLACEHOLDER_KINDS)
  .meta({ id: "PlaceholderKind" });

const text = z.string().min(1);

// A name that links to a model element when the document is read. The meta is
// what the descriptor records the reference by; the authored value stays the name.
const processReference = text.meta({ reference: "Process" });
const surfaceReference = text.meta({ reference: "Surface" });
const port = z.int().min(1).max(65535);
// A path something requests: `/`, or segments of URL path characters, each
// opened by one slash. The edge writes it into a rule, the kubelet asks it and
// the Release Gate requests it (spec/v1/55-delivery.md#the-release-gate), so
// it holds no whitespace, quote, backtick, backslash, query or fragment, and
// never opens with two slashes, which a client reads as another host.
const requestPath = z
  .string()
  .regex(/^\/$|^(\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)+\/?$/);
// A DNS name, lower case, of two labels or more, its last one opening with a
// letter: a name, never an address. A name the cluster itself resolves (under
// `svc`, `local`, `internal` or `localhost`) is refused as well, because no
// edge serves one. That refusal is a first filter and not the boundary: the
// address a name resolves to is not in the name, so whoever requests through
// a host still checks the address it connects to
// (spec/v1/55-delivery.md#the-release-gate).
const hostname = z
  .string()
  .regex(
    /^(?!.*\.(svc|local|internal|localhost)$)(?!.*\.svc\.)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/,
  );

const httpProbe = z
  .strictObject({ path: requestPath, port })
  .meta({ id: "HttpProbe" });
const tcpProbe = z.strictObject({ tcp: port }).meta({ id: "TcpProbe" });
const probe = z.union([httpProbe, tcpProbe]);

const probes = z
  .strictObject({
    readiness: probe.exactOptional(),
    liveness: probe.exactOptional(),
  })
  .meta({ id: "Probes" });
const noProbes = z.literal("none").meta({ id: "NoProbes" });

const rotation = z
  .strictObject({
    tolerates: tolerance,
    maxAge: text.exactOptional(),
  })
  .meta({ id: "Rotation" });

const grantDelivery = {
  delivery: delivery,
  mountAt: text.exactOptional(),
  fileMode: text.exactOptional(),
  rotation,
};

// A key in a kv document, `secret/data/<path>#<key>`: no segment empty or
// opening with a dot, so the location cannot climb out of the mount.
const kvLocation = z
  .string()
  .regex(/^secret\/data(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+#[A-Za-z0-9._-]+$/);

/**
 * A generated key's length and encoding, 32 bytes, hex, when unsaid, and the
 * old location whose value it starts from, if any.
 */
const generate = z
  .strictObject({
    bytes: z.int().min(16).max(512).exactOptional(),
    encoding: z.enum(KEY_ENCODINGS).meta({ id: "KeyEncoding" }).exactOptional(),
    adopt: kvLocation.exactOptional(),
  })
  .meta({ id: "Generate" });

/** A key of a kv grant: its name, or its name and how the Vault policy job generates it. */
const kvKey = z.union([
  text,
  z.strictObject({ name: text, generate }).meta({ id: "GeneratedKey" }),
]);

const kvGrant = z
  .strictObject({
    path: text,
    keys: z.array(kvKey).min(1),
    access: accessTier,
    ...grantDelivery,
  })
  .meta({ id: "KvGrant" });

const databaseGrant = z
  .strictObject({
    engine: databaseEngine,
    role: text,
    ...grantDelivery,
  })
  .meta({ id: "DatabaseGrant" });

const transitGrant = z
  .strictObject({
    engine: transitEngine,
    key: text,
    operations: z.array(transitOp).min(1),
    ...grantDelivery,
  })
  .meta({ id: "TransitGrant" });

const grant = z.union([kvGrant, databaseGrant, transitGrant]);

const diskRequest = z
  .strictObject({ media: z.array(media).min(1) })
  .meta({ id: "DiskRequest" });

// One card on the node matches every term the request declares; `vendor` and
// `model` are sets of acceptable values (spec/v1/10-project-intent.md#placement).
const gpuRequest = z
  .strictObject({
    class: text.exactOptional(),
    memory: text.exactOptional(),
    vendor: z.array(text).min(1).exactOptional(),
    model: z.array(text).min(1).exactOptional(),
  })
  .meta({ id: "GpuRequest" });

// `memory` and `cpu` are optional in the shape: a block above a Process carries
// dimensions only, and E_PLACEMENT_INCOMPLETE refuses a merge without them.
const placement = z
  .strictObject({
    memory: text.exactOptional(),
    cpu: text.exactOptional(),
    arch: z.array(arch).min(1).exactOptional(),
    site: text.exactOptional(),
    disk: diskRequest.exactOptional(),
    gpu: gpuRequest.exactOptional(),
    capabilities: z.array(text).min(1).exactOptional(),
  })
  .meta({ id: "Placement" });

const sidecar = z
  .strictObject({ name: text, image: text, memory: text, cpu: text })
  .meta({ id: "Sidecar" });

// How the credential an edge to a database derives is rotated, where the
// platform's default (a reload) is more than the application can honour
// (spec/v1/10-project-intent.md#migration).
const credentials = z
  .strictObject({
    delivery: delivery.exactOptional(),
    // Delivered to a file: the directory its `username` and `password` land
    // in, and their mode, both required then (ruleDiagnostics).
    mountAt: text.exactOptional(),
    fileMode: text.exactOptional(),
    rotation: rotation,
  })
  .meta({ id: "Credentials" });

// A bucket an edge to an object store derives, as `<project>-<name>`
// (spec/v1/16-dependencies.md#the-bucket-catalog): what the two make together
// is a valid S3 bucket name.
export const BUCKET_NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

const dependencyEdge = z
  .strictObject({
    application: text,
    surface: text,
    required: z.boolean().exactOptional(),
    credentials: credentials.exactOptional(),
    buckets: z.array(z.string().regex(BUCKET_NAME)).min(1).exactOptional(),
  })
  .meta({ id: "DependencyEdge" });

// How an Application's schema moves (spec/v1/10-project-intent.md#migration):
// by the platform's runner over a Liquibase changelog, by the image itself, or
// not at all.
const managedMigration = z
  .strictObject({ changelog: text })
  .meta({ id: "ManagedMigration" });
const selfMigration = z.literal("self").meta({ id: "SelfMigration" });
const noMigration = z.literal("none").meta({ id: "NoMigration" });
const migration = z.union([selfMigration, noMigration, managedMigration]);

const asset = z
  .strictObject({ from: text, mountAt: text })
  .meta({ id: "Asset" });

const volume = z
  .strictObject({
    claim: text,
    mountAt: text,
    size: text,
    durability: durabilityClass,
  })
  .meta({ id: "Volume" });

// A library the Platform document grants, mounted by name
// (spec/v1/10-project-intent.md#libraries): `subPath` is a directory inside it,
// relative and with no `.` or `..` segment.
export const LIBRARY_SUB_PATH =
  /^(?!\.\.?(?:\/|$))[^/]+(\/(?!\.\.?(?:\/|$))[^/]+)*$/;

const libraryMount = z
  .strictObject({
    // A name, as an edge's application is: it reaches the Platform document,
    // and is checked when the two are read together.
    library: text,
    mountAt: text,
    subPath: z.string().regex(LIBRARY_SUB_PATH).exactOptional(),
    access: z.enum(LIBRARY_ACCESS).meta({ id: "LibraryAccess" }),
  })
  .meta({ id: "LibraryMount" });

const capacity = z
  .strictObject({
    count: z.int().min(2),
    reason: text,
    // Where no two replicas may share a node: required anti-affinity on the
    // hostname. Without it two replicas on one node stay legal.
    across: z.enum(SPREADS).meta({ id: "Spread" }).exactOptional(),
  })
  .meta({ id: "Capacity" });

// The Kubernetes API access a Process needs (spec/v1/10-project-intent.md#kubernetes-api-access):
// what it may ask of which objects, and why. `core` names the API's core
// group, which Kubernetes itself leaves unnamed. The fields are the model's own
// words: `objects` is what Kubernetes RBAC spells `resources`, a field name
// layer 2 may not carry (docs/adr/model/0011-authored-values-name-model-concepts.md).
const apiRule = z
  .strictObject({
    group: text,
    objects: z.array(text).min(1),
    verbs: z.array(apiVerb).min(1),
    // The Process's own namespace, rendered as a Role, or the cluster, a
    // ClusterRole. Absent means the cluster, as every rule meant before scopes.
    scope: z.enum(API_SCOPES).meta({ id: "ApiScope" }).exactOptional(),
  })
  .meta({ id: "ApiRule" });

const apiAccess = z
  .strictObject({ reason: text, rules: z.array(apiRule).min(1) })
  .meta({ id: "ApiAccess" });

// Where a Process reaches beyond its edges (spec/v1/16-dependencies.md#internet-egress):
// a closed vocabulary with a reason, and no destination an author writes.
const egress = z
  .strictObject({
    to: z.enum(EGRESS_TARGETS).meta({ id: "EgressTarget" }),
    reason: text,
  })
  .meta({ id: "Egress" });

// A Process whose traffic leaves through the platform's VPN
// (spec/v1/10-project-intent.md#vpn-attachment), and whether it receives the
// port the provider forwards to it.
const vpnAttachment = z
  .strictObject({ forwardedPort: z.boolean() })
  .meta({ id: "VpnAttachment" });

// When a scheduled Process runs (spec/v1/10-project-intent.md#scheduled-processes):
// five cron fields, minute to weekday, one space apart. A macro or a time zone
// is not a field, so neither is read.
const schedule = z.string().regex(/^[0-9A-Za-z*/,?-]+( [0-9A-Za-z*/,?-]+){4}$/);

// Spread into each of the three levels rather than nested under a key: the level
// a family is written at is not itself a field an author writes.
const sharedIntent = {
  secrets: z.array(grant).min(1).exactOptional(),
  dependsOn: z.array(dependencyEdge).min(1).exactOptional(),
  assets: z.array(asset).min(1).exactOptional(),
  writablePaths: z.array(text).min(1).exactOptional(),
  placement: placement.exactOptional(),
  startupBudget: text.exactOptional(),
  cutover: cutover.exactOptional(),
};

// A Process that stops running and keeps everything it owns
// (spec/v1/10-project-intent.md#parked-processes), with the reason it does.
const parked = z.strictObject({ reason: text }).meta({ id: "Parked" });

const process = z
  .strictObject({
    name: text,
    lifecycle: lifecycle,
    schedule: schedule.exactOptional(),
    parked: parked.exactOptional(),
    image: text,
    runtime: runtime,
    engine: engine.exactOptional(),
    provides: z.record(text, port).meta({ entry: "Surface" }).exactOptional(),
    sidecars: z.array(sidecar).min(1).exactOptional(),
    probes: z.union([noProbes, probes]).exactOptional(),
    volumes: z.array(volume).min(1).exactOptional(),
    libraries: z.array(libraryMount).min(1).exactOptional(),
    replicas: capacity.exactOptional(),
    api: apiAccess.exactOptional(),
    egress: egress.exactOptional(),
    vpn: vpnAttachment.exactOptional(),
    ...sharedIntent,
  })
  .meta({ id: "Process" });

/** A rate limit's period: whole seconds, minutes or hours. */
const ratePeriod = z.string().regex(/^[1-9]\d*(s|m|h)$/);

// How many requests one client may send a route over a period; the burst and
// who counts as a client derive (docs/adr/model/0110-a-route-may-bound-its-request-rate.md).
const rateLimit = z
  .strictObject({ requests: z.int().min(1), per: ratePeriod })
  .meta({ id: "RateLimit" });

const route = z
  .strictObject({
    path: requestPath,
    match: match,
    process: processReference,
    surface: surfaceReference,
    audience: audience.exactOptional(),
    redirectTo: text.exactOptional(),
    rateLimit: rateLimit.exactOptional(),
  })
  .meta({ id: "Route" });

const exposure = z
  .strictObject({
    name: text,
    host: hostname,
    audience: audience,
    contentPolicy: contentPolicy.exactOptional(),
    routes: z.array(route).min(1),
  })
  .meta({ id: "Exposure" });

// How an Application signs people in (spec/v1/17-sign-in.md#the-client-block).
// Every path is a path on the host of the exposure the Client names; which
// field a mode takes is a rule with its own code, not the schema's. The
// bounds are the Client kind's own, so a render never writes an object the
// API server refuses.
const appRole = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);
const client = z
  .strictObject({
    signIn: z.enum(SIGN_IN_MODES).meta({ id: "SignInMode" }),
    exposure: text.exactOptional(),
    label: text.max(100).exactOptional(),
    description: text.max(200).exactOptional(),
    iconPath: requestPath.exactOptional(),
    launchPath: requestPath.exactOptional(),
    redirectPaths: z.array(requestPath).min(1).max(16).exactOptional(),
    protectedPath: requestPath.exactOptional(),
    credential: z
      .enum(CLIENT_CREDENTIALS)
      .meta({ id: "ClientCredential" })
      .exactOptional(),
    roles: z.array(appRole).min(1).max(63).exactOptional(),
  })
  .meta({ id: "Client" });
// A raw surface reached from off the cluster
// (spec/v1/10-project-intent.md#l4-exposure): the port a client dials, its
// protocol, and the L4 Address the Platform declares, by name. The port the
// container listens on stays the surface's, declared once in `provides`.
const l4Exposure = z
  .strictObject({
    // A name, as a library mount's is: it reaches the Platform document, and
    // is checked when the two are read together.
    address: text,
    port,
    protocol: z.enum(L4_PROTOCOLS).meta({ id: "L4Protocol" }),
    process: processReference,
    surface: surfaceReference,
  })
  .meta({ id: "L4Exposure" });

const scrape = z
  .strictObject({
    process: processReference,
    surface: surfaceReference,
    path: text,
  })
  .meta({ id: "Scrape" });

// What an Application exposes for scraping: the one signal the block holds.
const observability = z.strictObject({ scrape }).meta({ id: "Observability" });

// A dashboard the Application ships (spec/v1/10-project-intent.md#dashboards):
// a Grafana dashboard's JSON beside the project file, vendored, never fetched.
const dashboard = z.strictObject({ from: text }).meta({ id: "Dashboard" });
// A rule-group file the monitoring stack's Application carries
// (spec/v1/10-project-intent.md#alert-rules), beside the project file.
const alertRules = z.strictObject({ from: text }).meta({ id: "AlertRules" });

const application = z
  .strictObject({
    id: text,
    observability: observability.exactOptional(),
    dashboards: z.array(dashboard).min(1).exactOptional(),
    alertRules: z.array(alertRules).min(1).exactOptional(),
    exposure: z.array(exposure).min(1).exactOptional(),
    l4Exposure: z.array(l4Exposure).min(1).exactOptional(),
    migration: migration.exactOptional(),
    client: client.exactOptional(),
    ...sharedIntent,
    processes: z.array(process).min(1),
  })
  .meta({ id: "Application" });

export const projectIntent = z
  .strictObject({
    apiVersion: z.literal("intent.jorisjonkers.dev/v1"),
    kind: z.literal("Project"),
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    project: text,
    owner: text,
    ...sharedIntent,
    applications: z.array(application).min(1),
  })
  .meta({ id: "Project" });

export type ProjectIntentDocument = z.output<typeof projectIntent>;
export type ApplicationDocument = ProjectIntentDocument["applications"][number];
export type ProcessDocument = ApplicationDocument["processes"][number];
export type Grant = NonNullable<ProcessDocument["secrets"]>[number];
export type KvKey = Extract<Grant, { readonly path: string }>["keys"][number];
export type DependencyEdge = NonNullable<ProcessDocument["dependsOn"]>[number];
export type Asset = NonNullable<ProcessDocument["assets"]>[number];
export type Placement = NonNullable<ProcessDocument["placement"]>;
export type LibraryMount = NonNullable<ProcessDocument["libraries"]>[number];
export type Exposure = NonNullable<ApplicationDocument["exposure"]>[number];
export type Client = NonNullable<ApplicationDocument["client"]>;
export type L4Exposure = NonNullable<ApplicationDocument["l4Exposure"]>[number];

/** The eight families of spec/v1/10-project-intent.md#shared-intent that the
 * project file carries; the eighth, `env`, is the env files beside it. */
export type SharedIntentKey = keyof typeof sharedIntent;
export const SHARED_INTENT_KEYS = Object.keys(
  sharedIntent,
) as readonly SharedIntentKey[];

/** What one level of a project file declares of the shared families. */
export type SharedIntent = Pick<ProcessDocument, SharedIntentKey>;

// The other authored artefact. It is dotenv rather than YAML, so its shape is
// declared for the descriptor and for nothing else: what a file may hold is
// spec/v1/10-project-intent.md#the-dotenv-subset-that-is-read, enforced by the
// reader, and what it does hold is the committed env oracle.
const envLiteral = z.strictObject({ text: z.string() }).meta({
  id: "EnvLiteral",
});

// A placeholder, and the literal text after it: a path after a host, never
// after a secret (spec/v1/10-project-intent.md#the-dotenv-subset-that-is-read).
const placeholder = z
  .strictObject({
    kind: placeholderKind,
    source: text,
    suffix: text.exactOptional(),
  })
  .meta({ id: "Placeholder" });

const envVariable = z
  .strictObject({ name: text, value: z.union([envLiteral, placeholder]) })
  .meta({ id: "EnvVariable" });

export const envFile = z
  .strictObject({
    // A file that carries only comments holds no entry, and is still a file.
    entries: z.array(envVariable).exactOptional(),
  })
  .meta({ id: "EnvFile" });

export type EnvVariable = z.output<typeof envVariable>;
/** A file as the reader holds it: one carrying only comments holds no entry,
 * and still has the list. */
export type EnvFile = Omit<z.output<typeof envFile>, "entries"> & {
  readonly entries: readonly EnvVariable[];
};
export type EnvValue = EnvVariable["value"];
