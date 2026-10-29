// The eligible node set (spec/v1/20-resolved-deployment.md#layer-2-does-not-assign-a-node):
// every dimension a Process declared, matched against the facts the node
// contract publishes. Eligibility, not bin-packing: each Process is compared
// against allocatable alone. Shared by the check that refuses an empty set and
// the resolution that records the set. A library the Process mounts holds it to
// the library's node (spec/v1/10-project-intent.md#libraries), and an L4
// Address it is exposed on to the pool's site or the node's own node
// (spec/v1/10-project-intent.md#l4-exposure).
import { HELD_NOWHERE, type L4Hold } from "./l4-addresses.ts";
import type { EffectiveProcess } from "./effective-intent.ts";
import { libraryOf } from "./libraries.ts";
import type { NodeContractDocument } from "./node-contract.ts";
import type { PlatformIntentDocument } from "./platform-intent.ts";
import { mebibytes, millicores } from "./quantities.ts";
import { memoryPathsOf, seedsAssets } from "./project-intent.ts";

type Node = NodeContractDocument["nodes"][number];

/** The copies a node must fit: a continuous Process runs its new version beside its old one. */
const copies = (process: EffectiveProcess): number =>
  process.cutover === "continuous" ? 2 : 1;

/**
 * What one copy of the Process asks for, its sidecars included, the VPN
 * container beside it where it attaches to one, and the step that seeds its
 * Assets where it seeds one.
 */
function request(
  process: EffectiveProcess,
  platform: Pick<PlatformIntentDocument, "vpn" | "seeder">,
): {
  readonly memory: number;
  readonly cpu: number;
} {
  const containers = [
    process.placement,
    ...(process.sidecars ?? []),
    // E_NO_VPN_POLICY refused an attachment the platform runs no VPN for.
    ...(process.vpn === undefined
      ? []
      : [platform.vpn as NonNullable<PlatformIntentDocument["vpn"]>]),
    // E_NO_SEEDER refused a seeded Asset the platform names no seeder for.
    ...(seedsAssets(process.assets)
      ? [platform.seeder as NonNullable<PlatformIntentDocument["seeder"]>]
      : []),
  ];
  return {
    memory:
      containers.reduce((sum, { memory }) => sum + mebibytes(memory), 0) +
      memoryPathsOf(process.writablePaths, mebibytes),
    cpu: containers.reduce((sum, { cpu }) => sum + millicores(cpu), 0),
  };
}

type Card = NonNullable<Node["gpus"]>[number];

type GpuRequest = NonNullable<EffectiveProcess["placement"]["gpu"]>;

/** The node's cards that match every term a `gpu` declares. */
const matchingCards = (gpu: GpuRequest, node: Node): Card[] =>
  (node.gpus ?? []).filter(
    (card) =>
      (gpu.class === undefined || card.class === gpu.class) &&
      (gpu.memory === undefined || card.memory_mib >= mebibytes(gpu.memory)) &&
      (gpu.vendor === undefined || gpu.vendor.includes(card.vendor)) &&
      (gpu.model === undefined || gpu.model.includes(card.model)),
  );

function eligible(
  process: EffectiveProcess,
  node: Node,
  platform: Pick<PlatformIntentDocument, "libraries" | "vpn" | "seeder">,
  held: L4Hold,
): boolean {
  const { arch, site, capabilities, gpu, disk } = process.placement;
  const { memory, cpu } = request(process, platform);
  const room = copies(process);
  return (
    // A missing list and an empty one hold the Process to no node alike.
    // Stryker disable next-line ArrayDeclaration
    (process.libraries ?? []).every(
      ({ library }) => libraryOf(platform, library)?.node === node.name,
    ) &&
    held.sites.every((pinned) => pinned === node.site) &&
    held.nodes.every((pinned) => pinned === node.name) &&
    mebibytes(node.allocatable.memory) >= memory * room &&
    millicores(node.allocatable.cpu) >= cpu * room &&
    (arch === undefined || arch.includes(node.arch)) &&
    (site === undefined || site === node.site) &&
    (capabilities === undefined ||
      capabilities.every(
        (wanted) => node.capabilities?.includes(wanted) === true,
      )) &&
    (gpu === undefined || matchingCards(gpu, node).length > 0) &&
    (disk === undefined ||
      node.disks?.some(({ media }) =>
        (disk.media as readonly string[]).includes(media),
      ) === true)
  );
}

/**
 * The nodes a Process may land on, in the node contract's order. `held` is
 * where its L4 exposures hold it, beside what it declares itself.
 */
export const eligibleNodes = (
  process: EffectiveProcess,
  contract: NodeContractDocument,
  platform: Pick<PlatformIntentDocument, "libraries" | "vpn" | "seeder">,
  held: L4Hold = HELD_NOWHERE,
): string[] =>
  contract.nodes
    .filter((node) => eligible(process, node, platform, held))
    .map(({ name }) => name);

/**
 * The vendors of the cards a Process that requires a GPU may land on, once
 * each, in the node contract's order (spec/v1/14-platform-intent.md#gpus):
 * the derived request names one vendor's resource, so it needs exactly one.
 */
export const gpuVendors = (
  process: EffectiveProcess,
  contract: NodeContractDocument,
  platform: Pick<PlatformIntentDocument, "libraries" | "vpn" | "seeder">,
  held: L4Hold,
): string[] => [
  ...new Set(
    contract.nodes
      .filter((node) => eligible(process, node, platform, held))
      .flatMap((node) =>
        matchingCards(process.placement.gpu as GpuRequest, node).map(
          ({ vendor }) => vendor,
        ),
      ),
  ),
];

/**
 * The nodes a derived estate Job may land on
 * (spec/v1/14-platform-intent.md#the-vault-policy-job): every node that fits
 * what its one container asks for and holds no `sdcard` medium. Every Reconcile
 * Unit that holds a grant waits on the Job, so it never waits on the slowest
 * disk the estate has.
 */
export const estateJobNodes = (
  request: { readonly memory: string; readonly cpu: string },
  contract: NodeContractDocument,
): string[] =>
  contract.nodes
    .filter(
      (node) =>
        mebibytes(node.allocatable.memory) >= mebibytes(request.memory) &&
        millicores(node.allocatable.cpu) >= millicores(request.cpu) &&
        node.disks?.some(({ media }) => media === "sdcard") !== true,
    )
    .map(({ name }) => name);
