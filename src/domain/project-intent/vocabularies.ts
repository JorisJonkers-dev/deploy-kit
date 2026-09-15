// The closed vocabularies of spec/v1/10-project-intent.md#the-closed-vocabularies.
// Each is declared here once; the wire schema enumerates from these lists.

export const LIFECYCLES = ["application", "job"] as const;
export const RUNTIMES = ["jvm", "python", "node", "static", "none"] as const;
export const ENGINES = ["postgres", "rabbitmq", "valkey", "files"] as const;
export const CUTOVERS = ["rolling", "recreate"] as const;
export const DURABILITY_CLASSES = [
  "reconstructible",
  "recoverable",
  "irreplaceable",
] as const;
export const ARCHITECTURES = ["amd64", "arm64"] as const;
export const MEDIA = ["nvme", "ssd", "hdd"] as const;
export const ALERT_CLASSES = ["business-hours", "urgent", "page"] as const;
export const AUDIENCES = [
  "anonymous",
  "authenticated",
  "internal",
  "lan",
] as const;
export const CONTENT_POLICIES = ["strict", "admin", "workflow"] as const;
export const MATCHES = ["prefix", "exact"] as const;
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
] as const;
export const DELIVERIES = ["env", "file", "self"] as const;
export const TOLERANCES = ["restart", "reload"] as const;

export type Lifecycle = (typeof LIFECYCLES)[number];
export type Runtime = (typeof RUNTIMES)[number];
export type Engine = (typeof ENGINES)[number];
export type Cutover = (typeof CUTOVERS)[number];
export type DurabilityClass = (typeof DURABILITY_CLASSES)[number];
export type Arch = (typeof ARCHITECTURES)[number];
export type Medium = (typeof MEDIA)[number];
export type AlertClass = (typeof ALERT_CLASSES)[number];
export type Audience = (typeof AUDIENCES)[number];
export type ContentPolicy = (typeof CONTENT_POLICIES)[number];
export type Match = (typeof MATCHES)[number];
export type DatabaseEngine = (typeof DATABASE_ENGINES)[number];
export type TransitEngine = (typeof TRANSIT_ENGINES)[number];
export type AccessTier = (typeof ACCESS_TIERS)[number];
export type TransitOperation = (typeof TRANSIT_OPERATIONS)[number];
export type Delivery = (typeof DELIVERIES)[number];
export type Tolerance = (typeof TOLERANCES)[number];
