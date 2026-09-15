// The closed vocabularies of spec/v1/10-project-intent.md#the-closed-vocabularies.
// Each is declared here once; the wire schema enumerates from these lists.

export const LIFECYCLES = ["application", "job"] as const;
export const RUNTIMES = ["jvm", "python", "node", "static", "none"] as const;
export const CUTOVERS = ["rolling", "recreate"] as const;
export const ALERT_CLASSES = ["business-hours", "urgent", "page"] as const;
export const AUDIENCES = [
  "anonymous",
  "authenticated",
  "internal",
  "lan",
] as const;
export const CONTENT_POLICIES = ["strict", "admin", "workflow"] as const;
export const MATCHES = ["prefix", "exact"] as const;

export type Lifecycle = (typeof LIFECYCLES)[number];
export type Runtime = (typeof RUNTIMES)[number];
export type Cutover = (typeof CUTOVERS)[number];
export type AlertClass = (typeof ALERT_CLASSES)[number];
export type Audience = (typeof AUDIENCES)[number];
export type ContentPolicy = (typeof CONTENT_POLICIES)[number];
export type Match = (typeof MATCHES)[number];
