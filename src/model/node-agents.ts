// The Node Agents (spec/v1/14-platform-intent.md#node-agents): the
// host-privileged agents a node runs, derived from node facts and pools and
// never authored. The catalog is closed: each entry's privileges are fixed
// here, and the Platform document pins only its image and what it requests.
import type { NodeContractDocument } from "./node-contract.ts";
import type { PlatformIntentDocument } from "./platform-intent.ts";

/** The Project the Node Agents are, which no project file declares. */
export const NODE_PROJECT = "node";

/** The catalog, in the order the agents are derived and rendered. */
export const NODE_AGENTS = [
  "gpu-device",
  "gpu-metrics",
  "node-metrics",
  "l4-speaker",
] as const;

export type NodeAgent = (typeof NODE_AGENTS)[number];

/**
 * The time-sliced shares `gpu-device` advertises per GPU: a `gpu` requirement
 * is granted one, with no memory or fault isolation, and `gpu-metrics` holds
 * one on every GPU node.
 */
export const GPU_SHARES = 4;

/** The vendor whose cards `gpu-device` and `gpu-metrics` serve. */
export const GPU_AGENT_VENDOR = "nvidia";

/** A pool the speaker announces, and the nodes of its site that may. */
export interface SpokenPool {
  readonly name: string;
  readonly range: string;
  readonly nodes: readonly string[];
}

/** An agent the facts derive, and the nodes it runs on. */
export interface DerivedAgent {
  readonly agent: NodeAgent;
  readonly nodes: readonly string[];
  /** The pools `l4-speaker` announces, in the Platform document's order. */
  readonly pools?: readonly SpokenPool[];
}

/** One container an agent runs: its pinned image, the user it runs as, and its request. */
export interface AgentImage {
  readonly image: string;
  readonly uid: number;
  readonly gid: number;
  readonly memory: string;
  readonly cpu: string;
}

export interface ResolvedNodeAgent extends DerivedAgent, AgentImage {
  /** The speaker's controller, which runs once. */
  readonly controller?: AgentImage;
  /** The pools the speaker announces. */
  readonly pools?: readonly SpokenPool[];
  /** The runtime class the Platform names for the GPU agents' cards. */
  readonly runtimeClass?: string;
}

type Node = NodeContractDocument["nodes"][number];

/**
 * Every agent the node contract and the Platform document derive, each with
 * the nodes it runs on in the node contract's order; an agent no node needs is
 * not derived.
 */
export function nodeAgentsOf(
  platform: Pick<PlatformIntentDocument, "l4Addresses">,
  contract: NodeContractDocument,
): DerivedAgent[] {
  const named = (nodes: readonly Node[]): string[] =>
    nodes.map(({ name }) => name);
  const gpuNodes = named(
    contract.nodes.filter(({ gpus }) =>
      // A node with no cards and one with an empty list carry no GPU alike.
      // Stryker disable next-line ArrayDeclaration
      (gpus ?? []).some(({ vendor }) => vendor === GPU_AGENT_VENDOR),
    ),
  );
  // Each pool, announced on its site's segment, in the order the Platform
  // document declares them; a node's own address needs no announcing.
  const pools = Object.entries(platform.l4Addresses ?? {}).flatMap(
    ([name, address]) =>
      address.kind === "pool"
        ? [
            {
              name,
              range: address.range,
              nodes: named(
                contract.nodes.filter(({ site }) => site === address.site),
              ),
            },
          ]
        : [],
  );
  const speakers = new Set(pools.flatMap(({ nodes }) => nodes));
  const derived: DerivedAgent[] = [
    { agent: "gpu-device", nodes: gpuNodes },
    { agent: "gpu-metrics", nodes: gpuNodes },
    { agent: "node-metrics", nodes: named(contract.nodes) },
    {
      agent: "l4-speaker",
      nodes: named(contract.nodes.filter(({ name }) => speakers.has(name))),
      pools,
    },
  ];
  return derived.filter(({ nodes }) => nodes.length > 0);
}
