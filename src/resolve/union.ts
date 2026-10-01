// The composed union to every project's projections
// (spec/v1/20-resolved-deployment.md): each Application's element, published
// with the provenance every render from these inputs shares, and each
// project's resolved dependency edges, the part of resolution both
// implementations meet at (docs/architecture.md#the-parity-contract).
import type { Hasher } from "../model/hasher.ts";
import type {
  InputDigest,
  PinnedSet,
  ResolvedProject,
} from "../model/resolution.ts";
import {
  collectorEndpoint,
  gateEndpoint,
  secretStoreEndpoint,
} from "../model/runtime-profiles.ts";
import { resolveApplication } from "./application.ts";
import { provenanceOf } from "./provenance.ts";

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
  const gate = gateEndpoint(set.platform, set.projects);
  const store = secretStoreEndpoint(set.platform, set.projects);
  return set.projects.map(({ project, applications }) => {
    const elements = applications.map((application) =>
      resolveApplication(application, {
        platform: set.platform,
        contract: set.nodeContract,
        lock: set.imagesLock,
        clusterState: set.clusterState,
        project,
        union: set.projects,
        projectOf,
        hash,
        collector,
        gate,
        store,
        proof: set.proofs.get(project),
        // Every project of the set is read with its Asset files, if none.
        assets: set.assets.get(project) as ReadonlyMap<string, string>,
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
