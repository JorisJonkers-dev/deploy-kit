// The closed vocabularies of spec/v1/10-project-intent.md#the-closed-vocabularies.
// Each is declared here once; the wire schema enumerates from these lists.

export const LIFECYCLES = [
  "application",
  "job",
  "prepare",
  "scheduled",
] as const;
export const RUNTIMES = ["jvm", "python", "node", "static", "none"] as const;
export const ENGINES = [
  "postgres",
  "rabbitmq",
  "valkey",
  "mongo",
  "files",
] as const;
export const CUTOVERS = ["continuous", "interrupted"] as const;
export const DURABILITY_CLASSES = [
  "reconstructible",
  "recoverable",
  "irreplaceable",
] as const;
export const ARCHITECTURES = ["amd64", "arm64"] as const;
export const MEDIA = ["nvme", "ssd", "hdd"] as const;
export const AUDIENCES = [
  "anonymous",
  "authenticated",
  "internal",
  "lan",
] as const;
export const CONTENT_POLICIES = ["strict", "admin", "workflow"] as const;
export const MATCHES = ["prefix", "exact"] as const;
/** The languages an Application's identity file is generated in (spec/v1/17-sign-in.md#generated-app-roles). */
export const IDENTITY_LANGUAGES = [
  "go",
  "kotlin",
  "typescript",
  "python",
  "rust",
] as const;
export const DATABASE_ENGINES = ["database"] as const;
export const TRANSIT_ENGINES = ["transit"] as const;
export const ACCESS_TIERS = [
  "read",
  "self-renew",
  "self-roll",
  "custody",
] as const;
export const TRANSIT_OPERATIONS = [
  "sign",
  "verify",
  "encrypt",
  "decrypt",
  "rotate",
  "read",
] as const;
/** What a Process that holds Kubernetes API access may ask of a resource. */
export const API_VERBS = [
  "get",
  "list",
  "watch",
  "create",
  "update",
  "patch",
  "delete",
] as const;
export const DELIVERIES = ["env", "file", "self"] as const;
/** Where a Process may egress beyond what its edges derive: public IPv4 only. */
export const EGRESS_TARGETS = ["internet"] as const;
/** How a generated key's random bytes are written: `base64url` without padding. */
export const KEY_ENCODINGS = ["hex", "base64", "base64url"] as const;
export const TOLERANCES = ["restart", "reload"] as const;
/** What a library grants a project, and what a Process mounts it for. */
export const LIBRARY_ACCESS = ["read", "write"] as const;

/** What a Process's replicas are kept apart across (spec/v1/10-project-intent.md#replicas-and-the-disruption-budget). */
export const SPREADS = ["node"] as const;
/** The transport an L4 exposure carries: a raw surface, never HTTP's routing. */
export const L4_PROTOCOLS = ["tcp", "udp"] as const;
export const PLACEHOLDER_KINDS = [
  "secret",
  "dependency",
  "exposure",
  "identity",
  "client",
] as const;
/** How an Application signs people in (spec/v1/17-sign-in.md#sign-in-mode). */
export const SIGN_IN_MODES = ["native", "gated", "token"] as const;
/** Whether a native Client holds a secret or is a public client. */
export const CLIENT_CREDENTIALS = ["secret", "pkce"] as const;

export type Lifecycle = (typeof LIFECYCLES)[number];

/**
 * The lifecycles whose Process runs to completion and serves nothing
 * (spec/v1/10-project-intent.md#process): it listens on nothing, has no
 * readiness, runs one copy and cuts over nothing, so no shared `cutover`
 * reaches it. Each has its own refusal for what only a serving Process has.
 */
export const RUNS_TO_COMPLETION = {
  prepare: "E_PREPARE_PROCESS_SERVES",
  scheduled: "E_SCHEDULED_PROCESS_SERVES",
} as const satisfies Partial<Record<Lifecycle, string>>;

/** Whether a Process of this lifecycle serves, and so answers the cutover question. */
export const serves = (lifecycle: Lifecycle): boolean =>
  !(lifecycle in RUNS_TO_COMPLETION);
export type Runtime = (typeof RUNTIMES)[number];
export type Engine = (typeof ENGINES)[number];
export type Cutover = (typeof CUTOVERS)[number];
export type PlaceholderKind = (typeof PLACEHOLDER_KINDS)[number];
export type SignInMode = (typeof SIGN_IN_MODES)[number];
export type DurabilityClass = (typeof DURABILITY_CLASSES)[number];
export type Arch = (typeof ARCHITECTURES)[number];
export type Medium = (typeof MEDIA)[number];
export type Audience = (typeof AUDIENCES)[number];
export type ContentPolicy = (typeof CONTENT_POLICIES)[number];
export type Match = (typeof MATCHES)[number];
export type DatabaseEngine = (typeof DATABASE_ENGINES)[number];
export type TransitEngine = (typeof TRANSIT_ENGINES)[number];
export type AccessTier = (typeof ACCESS_TIERS)[number];
export type TransitOperation = (typeof TRANSIT_OPERATIONS)[number];
export type ApiVerb = (typeof API_VERBS)[number];
export type Delivery = (typeof DELIVERIES)[number];
export type Tolerance = (typeof TOLERANCES)[number];
export type LibraryAccess = (typeof LIBRARY_ACCESS)[number];
export type L4Protocol = (typeof L4_PROTOCOLS)[number];
