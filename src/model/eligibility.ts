// The eligible node set (spec/v1/20-resolved-deployment.md#layer-2-does-not-assign-a-node):
// every dimension a Process declared, matched against the facts the node
// contract publishes. Eligibility, not bin-packing: each Process is compared
// against allocatable alone. Shared by the check that refuses an empty set and
// the resolution that records the set.
import type { EffectiveProcess } from "./effective-intent.ts";
import type { NodeContractDocument } from "./node-contract.ts";
import { mebibytes, millicores } from "./quantities.ts";

type Node = NodeContractDocument["nodes"][number];

/** The copies a node must fit: a continuous Process runs its new version beside its old one. */
const copies = (process: EffectiveProcess): number =>
  process.cutover === "continuous" ? 2 : 1;

/** What one copy of the Process asks for, its sidecars included. */
function request(process: EffectiveProcess): {
  readonly memory: number;
  readonly cpu: number;
} {
  const containers = [process.placement, ...(process.sidecars ?? [])];
  return {
    memory: containers.reduce((sum, { memory }) => sum + mebibytes(memory), 0),
    cpu: containers.reduce((sum, { cpu }) => sum + millicores(cpu), 0),
  };
}

function eligible(process: EffectiveProcess, node: Node): boolean {
  const { arch, site, capabilities, gpu, disk } = process.placement;
  const { memory, cpu } = request(process);
  const room = copies(process);
  return (
    mebibytes(node.allocatable.memory) >= memory * room &&
    millicores(node.allocatable.cpu) >= cpu * room &&
    (arch === undefined || arch.includes(node.arch)) &&
    (site === undefined || site === node.site) &&
    (capabilities === undefined ||
      capabilities.every(
        (wanted) => node.capabilities?.includes(wanted) === true,
      )) &&
    (gpu === undefined ||
      node.gpus?.some(
        (card) =>
          card.class === gpu.class && card.memory_mib >= mebibytes(gpu.memory),
      ) === true) &&
    (disk === undefined ||
      node.disks?.some(({ media }) =>
        (disk.media as readonly string[]).includes(media),
      ) === true)
  );
}

/** The nodes a Process may land on, in the node contract's order. */
export const eligibleNodes = (
  process: EffectiveProcess,
  contract: NodeContractDocument,
): string[] =>
  contract.nodes
    .filter((node) => eligible(process, node))
    .map(({ name }) => name);
