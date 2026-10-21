// The pinned inputs beside the authored documents, each read into its model
// (spec/v1/20-resolved-deployment.md#pinned-inputs): the node contract, the
// images lock and the ClusterState snapshot. A schema failure is a refusal of
// the input, located where the schema found it.
import { z } from "zod";
import {
  clusterState,
  type ClusterStateDocument,
} from "../model/cluster-state.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import { imagesLock, type ImagesLockDocument } from "../model/images-lock.ts";
import {
  migrationProof,
  type MigrationProofDocument,
} from "../model/migration-proof.ts";
import {
  nodeContract,
  type NodeContractDocument,
} from "../model/node-contract.ts";
import { schemaDiagnostics } from "./schema-diagnostics.ts";

const CHAPTER = "spec/v1/20-resolved-deployment.md";

function readWith<S extends z.ZodType>(
  schema: S,
  value: unknown,
): Result<z.output<S>> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, diagnostics: schemaDiagnostics(parsed.error, CHAPTER) };
}

export const readNodeContract = (
  value: unknown,
): Result<NodeContractDocument> => readWith(nodeContract, value);

/**
 * The alias whose entry `issue` finds without a `version` field at all. Only
 * an entry under `images` has a field of that name below the document's own.
 */
function unversioned(
  value: unknown,
  { path: [, alias, key] }: z.core.$ZodIssue,
): string | undefined {
  if (key !== "version") return undefined;
  const entry = (value as { images: Record<string, object> }).images[
    alias as string
  ] as object;
  return Object.hasOwn(entry, "version") ? undefined : (alias as string);
}

/**
 * The images lock, where an entry that records no version is refused at its
 * alias by the code that says so, and every other failure is the schema's
 * (spec/v1/20-resolved-deployment.md#the-images-lock).
 */
export function readImagesLock(value: unknown): Result<ImagesLockDocument> {
  const parsed = imagesLock.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const missing: Diagnostic[] = [];
  const rest: z.core.$ZodIssue[] = [];
  for (const issue of parsed.error.issues) {
    const alias = unversioned(value, issue);
    if (alias === undefined) rest.push(issue);
    else
      missing.push({
        code: "E_IMAGE_VERSION_MISSING",
        path: `/images/${alias}`,
        message: `the images lock records no version for ${alias}`,
        hint: "Record the version of the software in the image, as its org.opencontainers.image.version label names it.",
      });
  }
  return {
    ok: false,
    diagnostics: [
      ...missing,
      ...schemaDiagnostics(new z.ZodError(rest), CHAPTER),
    ],
  };
}

export const readClusterState = (
  value: unknown,
): Result<ClusterStateDocument> => readWith(clusterState, value);

export const readMigrationProof = (
  value: unknown,
): Result<MigrationProofDocument> => readWith(migrationProof, value);
