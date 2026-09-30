// Path allocation (spec/v1/30-deliverables.md#path-allocation): where each
// scope's Deliverables land under the gitops root. A Project's share lives
// under `apps/<project>`, and an estate-scoped Deliverable under the edge's
// own directory.

export const projectDirectory = (project: string): string => `apps/${project}`;

export const applicationDirectory = (
  project: string,
  application: string,
): string => `${projectDirectory(project)}/${application}`;

export const tierDirectory = (tier: string): string => `apps/edge/${tier}`;
