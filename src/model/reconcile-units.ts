// The Reconcile Units and what each is named for
// (spec/v1/20-resolved-deployment.md#the-reconcile-unit): a project's own, the
// one that provisions every grant's credentials, and one per tier for the
// routes that tier's proxy serves. A project's unit opens with `apps-` and an
// estate-scoped one with `estate-`, so no project's name can be an estate
// unit's.

/** The unit of a project's Applications. */
export const unitOf = (project: string): string => `apps-${project}`;

/** The unit that materialises every grant's credentials before a Process may hold one. */
export const SECRETS_UNIT = "estate-vso-secrets";

/** The unit that applies the routes one tier's proxy serves. */
export const edgeUnitOf = (tier: string): string => `estate-edge-${tier}`;
