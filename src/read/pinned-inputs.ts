// The pinned inputs beside the authored documents, each read into its model
// (spec/v1/20-resolved-deployment.md#pinned-inputs): the node contract, the
// images lock and the ClusterState snapshot. A schema failure is a refusal of
// the input, located where the schema found it.
import type { z } from "zod";
import {
  clusterState,
  type ClusterStateDocument,
} from "../model/cluster-state.ts";
import type { Result } from "../model/diagnostic.ts";
import { imagesLock, type ImagesLockDocument } from "../model/images-lock.ts";
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

export const readImagesLock = (value: unknown): Result<ImagesLockDocument> =>
  readWith(imagesLock, value);

export const readClusterState = (
  value: unknown,
): Result<ClusterStateDocument> => readWith(clusterState, value);
