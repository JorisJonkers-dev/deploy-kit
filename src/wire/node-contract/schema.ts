// The node contract, schemaVersion 1, as spec/v1/60-setup.md#node-facts
// defines it: the generated document that publishes what each node can hold.
//
// It is generated from one authored file per node and pinned with the Platform
// Intent, which names it by digest
// (docs/adr/model/0056-node-facts-single-source.md). It is the other half of
// every placement comparison: a Process declares hard dimensions and layer 2
// matches them against exactly these facts, never against a live cluster
// (docs/adr/model/0061-placement-is-hard-dimensions.md).
//
// `memory_mib` and `usable_gib` carry the spelling the specification uses for
// them, in chapter 60's published-facts table and in the chapters that match
// against them.
import { z } from "zod";
import { ARCHITECTURES } from "../../domain/project-intent/vocabularies.ts";
import { NODE_MEDIA } from "../../domain/node-contract/vocabularies.ts";

const text = z.string().min(1);
const count = z.int().min(1);
/** A Kubernetes quantity, the way a Process declares one. */
const quantity = z.string().regex(/^\d+(m|Mi|Gi|Ti)?$/);

const arch = z.enum(ARCHITECTURES).meta({ id: "Arch" });
const nodeMedium = z.enum(NODE_MEDIA).meta({ id: "NodeMedium" });

/**
 * What is left after the reserve the node's own file declares. It is an
 * eligibility bound and not a budget: the contract records what a node has,
 * never what already runs on it, so nothing here bin-packs.
 */
const allocatable = z
  .strictObject({ cpu: quantity, memory: quantity })
  .meta({ id: "Allocatable" });

/**
 * One entry per card. `class` and `memory_mib` are what a Process selects on,
 * because a vendor string cannot separate a 2048MiB Maxwell card from a T1000
 * and the fastest card in the estate is not an nvidia one at all.
 */
const gpu = z
  .strictObject({
    vendor: text,
    model: text,
    class: text,
    memory_mib: count,
  })
  .meta({ id: "Gpu" });

const disk = z
  .strictObject({ media: nodeMedium, usable_gib: count })
  .meta({ id: "Disk" });

const node = z
  .strictObject({
    name: text,
    site: text,
    arch,
    allocatable,
    // A capability every node carries excludes nothing and teaches authors
    // that filters do nothing, so it leaves the vocabulary instead.
    capabilities: z.array(text).exactOptional(),
    gpus: z.array(gpu).exactOptional(),
    disks: z.array(disk).exactOptional(),
  })
  .meta({ id: "Node" });

export const nodeContract = z
  .strictObject({
    apiVersion: z.literal("contract.jorisjonkers.dev/v1"),
    kind: z.literal("NodeContract"),
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    cluster: text,
    // The selector key comes from here rather than from the platform's name,
    // so retiring a prefix goes through the generated contract.
    labelPrefix: text,
    nodes: z.array(node).min(1),
  })
  .meta({ id: "NodeContract" });

export type NodeContractDocument = z.output<typeof nodeContract>;
