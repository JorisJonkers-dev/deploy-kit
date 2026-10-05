// The Reconcile Units and what each is named for
// (spec/v1/20-resolved-deployment.md#the-reconcile-unit): a project's own, the
// one that provisions every grant's credentials, and one per tier for the
// routes that tier's proxy serves.

/** The unit of a project's Applications. */
export const unitOf = (project: string): string => `apps-${project}`;

/** The unit that materialises every grant's credentials before a Process may hold one. */
export const SECRETS_UNIT = "apps-vso-secrets";

/** The unit that applies the routes one tier's proxy serves. */
export const edgeUnitOf = (tier: string): string => `apps-edge-${tier}`;
