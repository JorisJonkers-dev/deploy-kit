// The rules the pinned inputs answer before resolution reads them
// (spec/v1/20-resolved-deployment.md#pinned-inputs): the node contract read is
// the one the Platform document pins, every image alias is locked, no image a
// pod runs as its own user runs as root, and every Process has somewhere to
// land. After these, resolution is total.
import {
  boundToOf,
  engineOf,
  movePolicyOf,
  moveTriggers,
  reversibleOf,
  type Placed,
} from "../model/move.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";
import {
  GPU_AGENT_VENDOR,
  NODE_AGENTS,
  nodeAgentsOf,
} from "../model/node-agents.ts";
import { exposuresOf } from "../model/tier-proxy.ts";
import type { Diagnostic, RefusalCode } from "../model/diagnostic.ts";
import {
  eligibleNodes,
  estateJobNodes,
  gpuVendors,
} from "../model/eligibility.ts";
import type {
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import {
  ROOT_IMAGE_HINT,
  rootImageMessage,
  runsAsRoot,
  type LockedImage,
} from "../model/images-lock.ts";
import { l4ExposuresOf, l4HoldOf, type L4Hold } from "../model/l4-addresses.ts";
import { migrationImage } from "../model/migration-proof.ts";
import type { NodeContractDocument } from "../model/node-contract.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { PinnedSet } from "../model/resolution.ts";

interface Located {
  readonly document: string;
  readonly effective: EffectiveProject;
}

function contractRefusals(
  set: PinnedSet,
  contractDigest: string,
  platform: string,
): Diagnostic[] {
  return set.platform.metadata.nodeContract === contractDigest
    ? []
    : [
        {
          code: "E_NODE_CONTRACT_MISMATCH",
          document: platform,
          path: "/metadata/nodeContract",
          message: `the node contract read is ${contractDigest}, not the one this document pins`,
          hint: "Pin the digest of the node contract the render reads, or read the one pinned.",
        },
      ];
}

/** Why no node can hold a Process, naming where its L4 Addresses hold it. */
function unplaceable(
  name: string,
  { sites, nodes }: L4Hold,
): { message: string; hint: string } {
  if (nodes.length > 0)
    return {
      message: `no node of ${String(nodes)}, the node of each node address ${name} is exposed on, can hold it`,
      hint: "Relax a placement dimension, or expose the Process on the address of a node that can hold it.",
    };
  if (sites.length > 0)
    return {
      message: `no node in the node contract on ${String(sites)}, the site of each pool ${name} is exposed on, can hold it`,
      hint: "Relax a placement dimension, or expose the Process on a pool of the site it is placed on.",
    };
  return {
    message: `no node in the node contract can hold ${name}`,
    hint: "Relax a placement dimension, or lower what the Process asks for.",
  };
}
/**
 * A Process that requires a GPU requests one vendor's resource
 * (spec/v1/14-platform-intent.md#gpus): its cards share one vendor, and the
 * Platform names that vendor's resource and runtime class.
 */
function gpuRefusals(
  set: PinnedSet,
  process: EffectiveProcess,
  held: L4Hold,
  path: string,
  document: string,
): Diagnostic[] {
  if (process.placement.gpu === undefined) return [];
  const vendors = gpuVendors(process, set.nodeContract, set.platform, held);
  if (vendors.length > 1)
    return [
      {
        code: "E_GPU_VENDOR_AMBIGUOUS",
        document,
        path,
        message: `${process.name} may land on cards of ${vendors.join(", ")}, and one request names one vendor's resource`,
        hint: "Lock the `gpu` to one `vendor`, or to models of one vendor.",
      },
    ];
  const [vendor] = vendors as [string];
  return Object.hasOwn(set.platform.gpus ?? {}, vendor)
    ? []
    : [
        {
          code: "E_NO_GPU_POLICY",
          document,
          path,
          message: `the platform names no resource or runtime class for ${vendor} cards`,
          hint: "Add the vendor to the Platform document's `gpus`.",
        },
      ];
}

/**
 * The image at `path` runs as root where the lock holds it with uid 0: the
 * posture renders that uid beside `runAsNonRoot`, and the kubelet refuses the
 * pod (spec/v1/10-project-intent.md#the-uid-is-a-pinned-input-and-the-volume-needs-a-group).
 */
function rootRefusals(
  set: PinnedSet,
  image: string,
  path: string,
  document: string,
): Diagnostic[] {
  const locked = set.imagesLock.images[image];
  return locked === undefined || !runsAsRoot(locked)
    ? []
    : [
        {
          code: "E_IMAGE_RUNS_AS_ROOT",
          document,
          path,
          message: rootImageMessage(image, locked),
          hint: ROOT_IMAGE_HINT,
        },
      ];
}

/** A version a Move can read its breaking component off. */
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * A Process whose engine moves runs an image the lock records as
 * `major.minor.patch`: the Move reads the component `breaksOn` names off it
 * (spec/v1/20-resolved-deployment.md#the-images-lock).
 */
function versionRefusals(
  set: PinnedSet,
  process: { readonly engine?: string; readonly image: string },
  path: string,
  document: string,
): Diagnostic[] {
  const engines = set.platform.engines as Readonly<
    Record<string, { readonly move?: unknown } | undefined>
  >;
  const locked = set.imagesLock.images[process.image];
  // No engine names no entry, as an absent key does: the guard says so.
  // Stryker disable next-line ConditionalExpression
  return process.engine === undefined ||
    // E_NO_ENGINE_POLICY refused an engine the platform has no entry for.
    (engines[process.engine] as { readonly move?: unknown }).move ===
      undefined ||
    locked === undefined ||
    SEMVER.test(locked.version)
    ? []
    : [
        {
          code: "E_ENGINE_VERSION_MISSING",
          document,
          path,
          message: `${process.image} records the version ${locked.version}, and a Move of ${process.engine} reads major.minor.patch off it`,
          hint: "Lock the image from a release tagged major.minor.patch, so the lock records that version.",
        },
      ];
}

/**
 * The Move a Process derives, refused where the set cannot carry it
 * (spec/v1/20-resolved-deployment.md#the-move): an engine with no method, a
 * platform with no move policy, a second Move while one is open, and an
 * irreversible Move nobody acknowledged; and an acknowledgement nothing needs.
 */
function moveRefusals(
  set: PinnedSet,
  process: EffectiveProcess,
  placement: Placed,
  where: { readonly project: string; readonly application: string },
  at: string,
  document: string,
): Diagnostic[] {
  const refusal = (
    code: RefusalCode,
    path: string,
    message: string,
    hint: string,
  ): Diagnostic => ({ code, document, path, message, hint });
  // An unlocked image derives no Move: E_UNLOCKED_IMAGE refuses it.
  if (!Object.hasOwn(set.imagesLock.images, process.image)) return [];
  const locked = set.imagesLock.images[process.image] as LockedImage;
  const derived = moveTriggers(process, placement, {
    platform: set.platform,
    lock: set.imagesLock,
    clusterState: set.clusterState,
    ...where,
  });
  const engine = engineOf(set.platform, process);
  const irreversible =
    derived !== undefined &&
    derived.triggers.length > 0 &&
    engine?.move !== undefined &&
    !reversibleOf(engine.move.reverse, derived.active.version, locked.version);
  const unused =
    process.rollback === "forward-only" && !irreversible
      ? [
          refusal(
            "E_FORWARD_ONLY_UNUSED",
            `${at}/rollback`,
            `${process.name} acknowledges a Move that cannot be rolled back, and this release derives none`,
            "Remove `rollback: forward-only`: it acknowledges the one Move derived in its release, and no other.",
          ),
        ]
      : [];
  if (derived === undefined || derived.triggers.length === 0) return unused;
  const why = derived.triggers.join(" and ");
  if (engine !== undefined && engine.move === undefined)
    return [
      refusal(
        "E_MOVE_UNSUPPORTED",
        at,
        `${process.name} changes its ${why} in a way its data cannot follow in place, and engine ${process.engine as string} names no move method`,
        "Name a `move` method for the engine in the Platform document, or keep the Process where its data is.",
      ),
    ];
  if (movePolicyOf(set.platform) === undefined)
    return [
      refusal(
        "E_NO_MOVE_POLICY",
        at,
        `${process.name} derives a Move of its ${why}, and the platform names no move policy to bound it`,
        "Add `delivery.move` with its `timeout` and `retention` to the Platform document.",
      ),
    ];
  const { active } = derived;
  if (
    active.target !== undefined &&
    (active.target.version !== locked.version ||
      active.target.namespace !== namespaceOf(where.project))
  )
    return [
      refusal(
        "E_MOVE_OPEN",
        at,
        `${process.name} changes again while its Move to ${active.target.version} in ${active.target.namespace} is open`,
        "Let the open Move finish and its source retire before changing what it is moving.",
      ),
    ];
  return irreversible && process.rollback !== "forward-only"
    ? [
        refusal(
          "E_MOVE_IRREVERSIBLE",
          at,
          `${process.name} moves from ${active.version} to ${locked.version}, and its method cannot replicate back, so a rollback would lose what was written after the fence`,
          "Write `rollback: forward-only` on the Process to accept it for this release, or move to a version the method can reverse.",
        ),
      ]
    : [];
}

function processRefusals(
  set: PinnedSet,
  { document, effective }: Located,
): Diagnostic[] {
  return effective.applications.flatMap((application, a) =>
    application.processes.flatMap((process, p): Diagnostic[] => {
      const at = `/applications/${String(a)}/processes/${String(p)}`;
      // The L4 Addresses the Process is exposed on hold it to the sites of
      // their pools and to their own nodes.
      const held = l4HoldOf(
        l4ExposuresOf(
          {
            l4Exposure: exposuresOf(
              set.platform,
              effective.project,
              application,
            ),
          },
          process.name,
        ),
        set.platform,
      );
      const images = [
        { image: process.image, path: `${at}/image` },
        ...(process.sidecars ?? []).map(({ image }, s) => ({
          image,
          path: `${at}/sidecars/${String(s)}/image`,
        })),
        // A template's pods run its image, under the same posture.
        // Stryker disable next-line ArrayDeclaration
        ...(process.spawns ?? []).map(({ image }, t) => ({
          image,
          path: `${at}/spawns/${String(t)}/image`,
        })),
      ];
      return [
        ...images
          .filter(({ image }) => !Object.hasOwn(set.imagesLock.images, image))
          .map(({ image, path }): Diagnostic => ({
            code: "E_UNLOCKED_IMAGE",
            document,
            path,
            message: `the images lock holds no entry for ${image}`,
            hint: "Lock the alias, or name one the images lock holds.",
          })),
        ...rootRefusals(set, process.image, `${at}/image`, document),
        ...versionRefusals(set, process, `${at}/image`, document),
        ...(eligibleNodes(process, set.nodeContract, set.platform, held)
          .length === 0
          ? [
              {
                code: "E_PLACEMENT_UNSATISFIABLE" as const,
                document,
                path: `${at}/placement`,
                ...unplaceable(process.name, held),
              },
            ]
          : gpuRefusals(set, process, held, `${at}/placement/gpu`, document)),
        ...spreadRefusals(set, process, held, `${at}/replicas`, document),
        ...moveRefusals(
          set,
          process,
          {
            eligibleNodes: eligibleNodes(
              process,
              set.nodeContract,
              set.platform,
              held,
            ),
            boundTo: boundToOf(set.clusterState, process),
          },
          { project: effective.project, application: application.id },
          at,
          document,
        ),
      ];
    }),
  );
}

/**
 * Replicas spread across nodes need a node each
 * (spec/v1/10-project-intent.md#replicas-and-the-disruption-budget): fewer eligible nodes than the count
 * leave a replica that never schedules. None eligible is the placement's own
 * refusal.
 */
function spreadRefusals(
  set: PinnedSet,
  process: EffectiveProcess,
  held: L4Hold,
  path: string,
  document: string,
): Diagnostic[] {
  const { replicas } = process;
  if (replicas?.across === undefined) return [];
  const nodes = eligibleNodes(
    process,
    set.nodeContract,
    set.platform,
    held,
  ).length;
  return nodes === 0 || nodes >= replicas.count
    ? []
    : [
        {
          code: "E_PLACEMENT_UNSATISFIABLE",
          document,
          path,
          message: `${process.name} keeps ${String(replicas.count)} replicas on different nodes, and ${String(nodes)} can hold it`,
          hint: "Lower the count, relax a placement dimension, or drop `across`.",
        },
      ];
}

/** Every backup, catalog and move method the platform names is an image the lock holds. */
const methodRefusals = (set: PinnedSet, platform: string): Diagnostic[] =>
  Object.entries(set.platform.engines).flatMap(([engine, method]) =>
    (["backup", "catalog", "move"] as const).flatMap((kind): Diagnostic[] => {
      const image = kind === "move" ? method.move?.image : method[kind];
      return image === undefined || Object.hasOwn(set.imagesLock.images, image)
        ? []
        : [
            {
              code: "E_UNLOCKED_IMAGE",
              document: platform,
              path: `/engines/${engine}/${kind === "move" ? "move/image" : kind}`,
              message: `the images lock holds no entry for ${image}`,
              hint: "Lock the alias, or name one the images lock holds.",
            },
          ];
    }),
  );

/** The VPN, where the platform runs one, is an image the lock holds. */
const vpnRefusals = (set: PinnedSet, platform: string): Diagnostic[] => {
  const image = set.platform.vpn?.image;
  return image === undefined || Object.hasOwn(set.imagesLock.images, image)
    ? []
    : [
        {
          code: "E_UNLOCKED_IMAGE",
          document: platform,
          path: "/vpn/image",
          message: `the images lock holds no entry for ${image}`,
          hint: "Lock the alias, or name one the images lock holds.",
        },
      ];
};

/** The seeder, where the platform names one, is an image the lock holds. */
const seederRefusals = (set: PinnedSet, platform: string): Diagnostic[] => {
  const image = set.platform.seeder?.image;
  return image === undefined || Object.hasOwn(set.imagesLock.images, image)
    ? []
    : [
        {
          code: "E_UNLOCKED_IMAGE",
          document: platform,
          path: "/seeder/image",
          message: `the images lock holds no entry for ${image}`,
          hint: "Lock the alias, or name one the images lock holds.",
        },
      ];
};

/**
 * Each Node Agent the node contract and the pools derive has its catalog entry,
 * and the GPU agents a runtime class (spec/v1/14-platform-intent.md#node-agents):
 * what the Platform document and the node contract alone decide, so `validate`
 * runs it wherever its set holds both.
 */
export const nodeAgentPolicyRefusals = (
  document: Pick<PlatformIntentDocument, "l4Addresses" | "nodeAgents" | "gpus">,
  contract: NodeContractDocument,
  platform: string,
): Diagnostic[] => {
  const catalog = document.nodeAgents ?? {};
  const derived = nodeAgentsOf(document, contract);
  const missing = derived
    .filter(({ agent }) => catalog[agent] === undefined)
    .map(({ agent, nodes }): Diagnostic => ({
      code: "E_NO_NODE_AGENT_POLICY",
      document: platform,
      path: `/nodeAgents/${agent}`,
      message: `${agent} runs on ${String(nodes)}, and the catalog names no image for it`,
      hint: `Declare \`nodeAgents.${agent}\` in the Platform document: its image, memory and cpu.`,
    }));
  // The GPU agents run under the runtime class the platform names for their
  // cards' vendor, so a vendor it names nothing for leaves them blind.
  const gpuAgents = derived.some(({ agent }) => agent === "gpu-device");
  const unnamed: Diagnostic[] =
    gpuAgents && document.gpus?.[GPU_AGENT_VENDOR] === undefined
      ? [
          {
            code: "E_NO_GPU_POLICY",
            document: platform,
            path: "/gpus",
            message: `the GPU agents run on ${GPU_AGENT_VENDOR} cards, and the platform names no runtime class for them`,
            hint: "Add the vendor to the Platform document's `gpus`.",
          },
        ]
      : [];
  return [...missing, ...unnamed];
};

/**
 * The Node Agents' policy refusals, and every image the catalog names is one
 * the lock holds.
 */
const nodeAgentRefusals = (set: PinnedSet, platform: string): Diagnostic[] => {
  const catalog = set.platform.nodeAgents ?? {};
  const images = NODE_AGENTS.flatMap((agent) => {
    const entry = catalog[agent];
    if (entry === undefined) return [];
    return [
      { path: `/nodeAgents/${agent}/image`, image: entry.image },
      ...("controller" in entry
        ? [
            {
              path: `/nodeAgents/${agent}/controller/image`,
              image: entry.controller.image,
            },
          ]
        : []),
    ];
  });
  return [
    ...nodeAgentPolicyRefusals(set.platform, set.nodeContract, platform),
    ...images
      .filter(({ image }) => !Object.hasOwn(set.imagesLock.images, image))
      .map(({ path, image }): Diagnostic => ({
        code: "E_UNLOCKED_IMAGE",
        document: platform,
        path,
        message: `the images lock holds no entry for ${image}`,
        hint: "Lock the alias, or name one the images lock holds.",
      })),
  ];
};

/**
 * The Vault policy job, where the platform names one, runs an image the lock
 * holds, on some node the contract offers it.
 */
const policyJobRefusals = (set: PinnedSet, platform: string): Diagnostic[] => {
  const job = set.platform.policyJob;
  if (job === undefined) return [];
  return [
    ...(Object.hasOwn(set.imagesLock.images, job.image)
      ? []
      : [
          {
            code: "E_UNLOCKED_IMAGE" as const,
            document: platform,
            path: "/policyJob/image",
            message: `the images lock holds no entry for ${job.image}`,
            hint: "Lock the alias, or name one the images lock holds.",
          },
        ]),
    ...(estateJobNodes(job, set.nodeContract).length === 0
      ? [
          {
            code: "E_PLACEMENT_UNSATISFIABLE" as const,
            document: platform,
            path: "/policyJob",
            message:
              "no node in the node contract without an sdcard medium can hold the Vault policy job",
            hint: "Lower what the job asks for, or give the contract a node that boots from no SD card.",
          },
        ]
      : []),
  ];
};

/** Every Application that moves its schema with a changelog has its migration image locked. */
const migrationRefusals = (set: PinnedSet, { document, effective }: Located) =>
  effective.applications.flatMap((application, a): Diagnostic[] => {
    const image = migrationImage(application.id);
    if (typeof application.migration !== "object") return [];
    const path = `/applications/${String(a)}/migration`;
    return !Object.hasOwn(set.imagesLock.images, image)
      ? [
          {
            code: "E_UNLOCKED_IMAGE",
            document,
            path,
            message: `the images lock holds no entry for ${image}`,
            hint: "Lock the migration image the Application's CI builds from the platform's runner.",
          },
        ]
      : rootRefusals(set, image, path, document);
  });

/** Every rule the pinned inputs break, before resolution reads them. */
export const pinnedDiagnostics = (
  set: PinnedSet,
  located: readonly Located[],
  contractDigest: string,
  platform: string,
): Diagnostic[] => [
  ...contractRefusals(set, contractDigest, platform),
  ...methodRefusals(set, platform),
  ...vpnRefusals(set, platform),
  ...seederRefusals(set, platform),
  ...nodeAgentRefusals(set, platform),
  ...policyJobRefusals(set, platform),
  ...located.flatMap((project) => processRefusals(set, project)),
  ...located.flatMap((project) => migrationRefusals(set, project)),
];
