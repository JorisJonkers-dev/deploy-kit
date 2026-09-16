// The closed vocabularies layer 2 adds, each declared here once. Layer 2
// records decisions in model words, so none of these names a Kubernetes or
// Traefik concept (docs/adr/model/0097-authored-values-name-model-concepts.md,
// normative in spec/v1/20-resolved-deployment.md#the-model).

/** Which pinned input a recorded digest is the digest of. */
export const PINNED_INPUTS = [
  "intent-fragment",
  "platform-intent",
  "node-contract",
  "images-lock",
  "cluster-state",
] as const;

/** A step of the middleware chain a route derives. */
export const MIDDLEWARE_KINDS = [
  "forward-auth",
  "security-headers",
  "redirect",
] as const;

/** Whose directory a path assignment belongs to. */
export const PATH_SCOPES = ["estate", "project", "application"] as const;

/** The registered Adapters, one per subsystem (spec/v1/30-deliverables.md#adapters). */
export const ADAPTERS = [
  "kubernetes",
  "networking",
  "prometheus",
  "traefik",
  "vault-policy",
  "vso",
] as const;

export type PinnedInput = (typeof PINNED_INPUTS)[number];
export type MiddlewareKind = (typeof MIDDLEWARE_KINDS)[number];
export type PathScope = (typeof PATH_SCOPES)[number];
export type AdapterName = (typeof ADAPTERS)[number];
