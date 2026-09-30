// What makes a Resolved Deployment reproducible
// (spec/v1/20-resolved-deployment.md#pinned-inputs): one digest per pinned
// input, each the digest of its canonical form, and the render hash over them
// and the schema package's integrity. It moves when an input moves, and only then.
import type { Hasher } from "../model/hasher.ts";
import type { InputDigest } from "../model/resolution.ts";
import type { ResolvedApplicationDocument } from "../model/resolved-deployment.ts";

export type Provenance = ResolvedApplicationDocument["provenance"];

export function provenanceOf(
  inputDigests: readonly InputDigest[],
  schemaPackageIntegrity: string,
  hash: Hasher,
): Provenance {
  const recorded = [...inputDigests];
  return {
    renderHash: hash({ schemaPackageIntegrity, inputDigests: recorded }),
    schemaPackageIntegrity,
    inputDigests: recorded,
  };
}
