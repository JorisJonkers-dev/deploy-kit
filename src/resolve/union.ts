// The composed union to every project's projections
// (spec/v1/20-resolved-deployment.md): each Application's element, published
// with the provenance every render from these inputs shares, and each
// project's resolved dependency edges, the part of resolution both
// implementations meet at (docs/architecture.md#the-parity-contract).
import type { Hasher } from "../model/hasher.ts";
import type { InputDigest, PinnedSet } from "../model/resolution.ts";
import type { ResolvedApplicationDocument } from "../model/resolved-deployment.ts";
import { collectorEndpoint } from "../model/runtime-profiles.ts";
import { resolveApplication } from "./application.ts";
import { provenanceOf } from "./provenance.ts";

/** A project's resolved dependency edges, one entry per Application. */
export interface DependenciesDocument {
  readonly applications: readonly {
    readonly id: string;
    readonly edges: readonly Record<string, unknown>[];
  }[];
}

export interface ResolvedProject {
  readonly project: string;
  readonly applications: readonly ResolvedApplicationDocument[];
  readonly dependencies: DependenciesDocument;
}

export function resolveUnion(
  set: PinnedSet,
  digests: readonly InputDigest[],
  schemaPackageIntegrity: string,
  hash: Hasher,
): ResolvedProject[] {
  const provenance = provenanceOf(digests, schemaPackageIntegrity, hash);
  const projectOf = new Map(
    set.projects.flatMap(({ project, applications }) =>
      applications.map(({ id }): [string, string] => [id, project]),
    ),
  );
  const collector = collectorEndpoint(set.platform, set.projects);
  return set.projects.map(({ project, applications }) => {
    const elements = applications.map((application) =>
      resolveApplication(application, {
        platform: set.platform,
        contract: set.nodeContract,
        lock: set.imagesLock,
        project,
        union: set.projects,
        projectOf,
        hash,
        collector,
      }),
    );
    return {
      project,
      applications: elements.map((element) => ({
        apiVersion: "resolved.jorisjonkers.dev/v1" as const,
        kind: "ResolvedApplication" as const,
        provenance,
        ...element,
      })),
      dependencies: {
        applications: elements.map(({ id, processes }) => ({
          id,
          edges: processes.flatMap(({ name, dependencies }) =>
            (dependencies ?? []).map((edge) => ({ consumer: name, ...edge })),
          ),
        })),
      },
    };
  });
}
