// Path allocation (spec/v1/30-deliverables.md#path-allocation): where each
// scope's Deliverables land under the gitops root. A Project's share lives
// under `apps/<project>`, and an estate-scoped Deliverable under `estate/`,
// which is no Project's: a Project may be named anything, `edge` included,
// and never shares a directory with what belongs to the estate.

/** The root of everything estate-scoped: the `_estate` artifact's tree. */
export const ESTATE_DIRECTORY = "estate";

/**
 * Where the estate-scoped policy job and its documents land, while a
 * datastore the old path runs has a catalog the estate path applies.
 */
export const SECRETS_DIRECTORY = `${ESTATE_DIRECTORY}/vso-secrets`;

/** Where the Human Grants' bindings land: the platform's, and no Project's. */
export const HUMAN_GRANTS_DIRECTORY = `${ESTATE_DIRECTORY}/human-grants`;
/** Where the Stable Addresses live (spec/v1/16-dependencies.md#the-stable-address). */
export const STABLE_ADDRESSES_DIRECTORY = `${ESTATE_DIRECTORY}/stable-addresses`;
export const PRIORITY_CLASSES_DIRECTORY = `${ESTATE_DIRECTORY}/priority-classes`;

export const projectDirectory = (project: string): string => `apps/${project}`;

/** Where a Project's own Vault policy job and the documents it writes land. */
export const policyJobDirectory = (project: string): string =>
  `${projectDirectory(project)}/vault-policy`;

export const applicationDirectory = (
  project: string,
  application: string,
): string => `${projectDirectory(project)}/${application}`;
