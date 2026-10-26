// The Reconcile Units and what each is named for
// (spec/v1/20-resolved-deployment.md#the-reconcile-unit): a project's own, the
// one that provisions every grant's credentials, and one per tier for the
// routes that tier's proxy serves. A project's unit opens with `apps-` and an
// estate-scoped one with `estate-`, so no project's name can be an estate
// unit's.

/** The unit of a project's Applications. */
export const unitOf = (project: string): string => `apps-${project}`;

/** The unit that applies the catalog of a datastore the old path still runs, while one does. */
export const SECRETS_UNIT = "estate-vso-secrets";

/** The unit that applies the Human Grants' bindings, where the platform declares any. */
export const HUMAN_GRANTS_UNIT = "estate-human-grants";
export const PRIORITY_CLASSES_UNIT = "estate-priority-classes";
/** The unit of the Stable Addresses (spec/v1/16-dependencies.md#the-stable-address). */
export const STABLE_ADDRESSES_UNIT = "estate-stable-addresses";
