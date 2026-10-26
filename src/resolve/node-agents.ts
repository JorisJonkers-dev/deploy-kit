// The Node Agents, resolved (spec/v1/14-platform-intent.md#node-agents): each
// agent the facts derive, with the image the lock pins for it and what each
// copy requests, as the catalog entry names them.
import type { ImagesLockDocument, LockedImage } from "../model/images-lock.ts";
import {
  GPU_AGENT_VENDOR,
  nodeAgentsOf,
  type AgentImage,
  type ResolvedNodeAgent,
} from "../model/node-agents.ts";
import type { NodeContractDocument } from "../model/node-contract.ts";
import type {
  NodeAgentPolicy,
  PlatformIntentDocument,
} from "../model/platform-intent.ts";

const pinnedOf = (
  { image, memory, cpu }: NodeAgentPolicy,
  lock: ImagesLockDocument,
): AgentImage => {
  // Every alias is locked, or E_UNLOCKED_IMAGE refused the set.
  const locked = lock.images[image] as LockedImage;
  return {
    image: `${locked.repository}@${locked.digest}`,
    uid: locked.uid,
    gid: locked.gid,
    memory,
    cpu,
  };
};

export function resolveNodeAgents(
  platform: PlatformIntentDocument,
  contract: NodeContractDocument,
  lock: ImagesLockDocument,
): ResolvedNodeAgent[] {
  return nodeAgentsOf(platform, contract).map((derived) => {
    // Every derived agent has its entry, or E_NO_NODE_AGENT_POLICY refused
    // the set.
    const entry = platform.nodeAgents?.[derived.agent] as NodeAgentPolicy & {
      readonly controller?: NodeAgentPolicy;
    };
    return {
      ...derived,
      ...pinnedOf(entry, lock),
      ...(entry.controller === undefined
        ? {}
        : { controller: pinnedOf(entry.controller, lock) }),
      // A GPU agent's vendor has its policy, or E_NO_GPU_POLICY refused the
      // set.
      ...(derived.agent.startsWith("gpu-")
        ? {
            runtimeClass: (
              (
                platform.gpus as Readonly<
                  Record<string, { readonly runtimeClass: string }>
                >
              )[GPU_AGENT_VENDOR] as { readonly runtimeClass: string }
            ).runtimeClass,
          }
        : {}),
    };
  });
}
