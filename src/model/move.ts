// The Move (spec/v1/20-resolved-deployment.md#the-move): what derives one when
// a Process is compared with the active Instance ClusterState records, whether
// it can be rolled back, and when its source retires. Nobody declares a Move.
import type { ClusterStateDocument } from "./cluster-state.ts";
import { seconds } from "./durations.ts";
import type { EffectiveProcess, EffectiveProject } from "./effective-intent.ts";
import type { ImagesLockDocument, LockedImage } from "./images-lock.ts";
import type { PlatformIntentDocument } from "./platform-intent.ts";
import { namespaceOf } from "./runtime-profiles.ts";
import type { MOVE_BREAKS, MOVE_REVERSE } from "./vocabularies.ts";

type Instance = NonNullable<ClusterStateDocument["instances"]>[number];
type EnginePolicy =
  PlatformIntentDocument["engines"][keyof PlatformIntentDocument["engines"]];

/** What derived a Move: the version, the namespace, or the bound volume's node. */
export type MoveTrigger = "version" | "namespace" | "binding";

/** The Process as it now resolves, as far as a Move reads it. */
export interface MoveFacts {
  readonly version: string;
  readonly namespace: string;
  readonly eligibleNodes: readonly string[];
  readonly boundTo?: string | undefined;
}

/** A version's components, `major.minor.patch`. */
const componentsOf = (version: string): readonly string[] => version.split(".");

/**
 * Every change the data cannot follow in place: a version change in the
 * component the engine's method breaks on, where it names one; a namespace
 * other than the active Instance's; or an eligible node set that excludes the
 * node holding the bound volume.
 */
export function moveTriggersOf(
  now: MoveFacts,
  active: Instance,
  breaksOn: (typeof MOVE_BREAKS)[number] | undefined,
): MoveTrigger[] {
  const [major, minor] = componentsOf(now.version);
  const [activeMajor, activeMinor] = componentsOf(active.version);
  const version =
    breaksOn !== undefined &&
    (major !== activeMajor || (breaksOn === "minor" && minor !== activeMinor));
  return [
    ...(version ? (["version"] as const) : []),
    ...(now.namespace === active.namespace ? [] : (["namespace"] as const)),
    ...(now.boundTo === undefined || now.eligibleNodes.includes(now.boundTo)
      ? []
      : (["binding"] as const)),
  ];
}

/**
 * Whether the method can replicate from the new Instance back to the old one,
 * which a lossless rollback needs.
 */
export function reversibleOf(
  reverse: (typeof MOVE_REVERSE)[number],
  from: string,
  to: string,
): boolean {
  if (reverse === "same-major")
    return componentsOf(from)[0] === componentsOf(to)[0];
  return reverse === "always";
}

/**
 * Whether the source has retired: ClusterState records the flip as held for
 * longer than the retention, as of when it was captured.
 */
export function retiredOf(
  instance: Instance,
  retention: string,
  capturedAt: string,
): boolean {
  // A flip never recorded would parse as no time, which holds for no
  // retention: the guard says so rather than leaning on it.
  // Stryker disable next-line ConditionalExpression
  if (instance.flippedAt === undefined) return false;
  const held = (Date.parse(capturedAt) - Date.parse(instance.flippedAt)) / 1000;
  return held > seconds(retention);
}

/** What deriving a Move reads beside the Process. */
export interface MoveContext {
  readonly platform: PlatformIntentDocument;
  readonly lock: ImagesLockDocument;
  readonly clusterState: ClusterStateDocument;
  readonly union: readonly EffectiveProject[];
  readonly project: string;
  readonly application: string;
}

/** Where a Process may run, and the node its bound volume is on. */
export interface Placed {
  readonly eligibleNodes: readonly string[];
  readonly boundTo?: string | undefined;
}

/** The platform's bounds on a Move, where it names them. */
export const movePolicyOf = (
  platform: PlatformIntentDocument,
): NonNullable<PlatformIntentDocument["delivery"]>["move"] =>
  platform.delivery?.move;

/** The node ClusterState records a claim of the Process as bound to, where it records one. */
export function boundToOf(
  clusterState: ClusterStateDocument,
  process: Pick<EffectiveProcess, "volumes">,
): string | undefined {
  // A Process with no volume and one with an empty list hold no claim alike.
  // Stryker disable next-line ArrayDeclaration
  const claims = new Set((process.volumes ?? []).map(({ claim }) => claim));
  return clusterState.bindings.find(({ claim }) => claims.has(claim))?.node;
}

/** The active Instance ClusterState records for a Process, where it records one. */
export const activeInstanceOf = (
  clusterState: ClusterStateDocument,
  application: string,
  process: string,
): Instance | undefined =>
  clusterState.instances?.find(
    (instance) =>
      instance.application === application && instance.instance === process,
  );

/** The engine policy a Process's engine names, where it has one. */
export const engineOf = (
  platform: PlatformIntentDocument,
  process: Pick<EffectiveProcess, "engine">,
): EnginePolicy | undefined =>
  // No engine names no entry, as no key does: the guard says so.
  // Stryker disable next-line ConditionalExpression
  process.engine === undefined
    ? undefined
    : (platform.engines as Readonly<Record<string, EnginePolicy>>)[
        process.engine
      ];

/**
 * Where the Instance that serves a Process runs, where ClusterState records
 * one: the target of a Move whose flip has held, and otherwise the active
 * Instance, under its own name or the Process's.
 */
export function servingOf(
  clusterState: ClusterStateDocument,
  application: string,
  process: string,
): { readonly name: string; readonly namespace: string } | undefined {
  const active = activeInstanceOf(clusterState, application, process);
  if (active === undefined) return undefined;
  const { target } = active;
  return active.flippedAt !== undefined && target !== undefined
    ? { name: target.name, namespace: target.namespace }
    : { name: active.name ?? process, namespace: active.namespace };
}

/**
 * What derives a Move for `process` against its active Instance, before
 * anything decides whether the set may carry one: none where ClusterState
 * records no Instance, or where the open Move's source has retired.
 */
export function moveTriggers(
  process: Pick<EffectiveProcess, "name" | "image" | "engine">,
  placement: Placed,
  context: Omit<MoveContext, "union">,
): { readonly active: Instance; readonly triggers: MoveTrigger[] } | undefined {
  const active = activeInstanceOf(
    context.clusterState,
    context.application,
    process.name,
  );
  if (active === undefined) return undefined;
  const retention = movePolicyOf(context.platform)?.retention;
  if (
    retention !== undefined &&
    retiredOf(active, retention, context.clusterState.capturedAt)
  )
    return undefined;
  // Every alias is locked, or E_UNLOCKED_IMAGE refused the set.
  const image = context.lock.images[process.image] as LockedImage;
  const triggers = moveTriggersOf(
    {
      version: image.version,
      namespace: namespaceOf(context.project),
      eligibleNodes: placement.eligibleNodes,
      boundTo: placement.boundTo,
    },
    active,
    engineOf(context.platform, process)?.move?.breaksOn,
  );
  return { active, triggers };
}
