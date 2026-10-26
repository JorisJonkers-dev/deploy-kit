// The Move a Process derives (spec/v1/20-resolved-deployment.md#the-move): the
// Process as it now resolves, compared with the active Instance the pinned
// ClusterState records. Where the comparison derives a Move the set may not
// carry (an engine with no method, a platform with no move policy, a second
// Move while one is open), the check refused the set before resolution ran.
import type { EffectiveProcess } from "../model/effective-intent.ts";
import { versionOf, type LockedImage } from "../model/images-lock.ts";
import {
  engineOf,
  movePolicyOf,
  moveTriggers,
  reversibleOf,
  type MoveContext,
} from "../model/move.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";
import { resolveStableAddresses } from "./stable-addresses.ts";

type ResolvedMove = NonNullable<ResolvedProcess["move"]>;
type MovePolicy = NonNullable<
  NonNullable<MoveContext["platform"]["delivery"]>["move"]
>;

/** The Move `process` derives, where it derives one the set may carry. */
export function resolveMove(
  process: EffectiveProcess,
  placement: ResolvedProcess["placement"],
  context: MoveContext,
): ResolvedMove | undefined {
  const derived = moveTriggers(process, placement, context);
  if (derived === undefined || derived.triggers.length === 0) return undefined;
  // A Move with no bounds, or of an engine with no method, was refused before
  // resolution ran: E_NO_MOVE_POLICY, E_MOVE_UNSUPPORTED.
  const bounds = movePolicyOf(context.platform) as MovePolicy;
  const engine = engineOf(context.platform, process);
  const { active, triggers } = derived;
  const image = context.lock.images[process.image] as LockedImage;
  const method =
    engine?.move === undefined
      ? undefined
      : (context.lock.images[engine.move.image] as LockedImage);
  // The Stable Addresses of this Process's surfaces that an edge names.
  const surfaces = new Set(Object.keys(process.provides ?? {}));
  const flips = resolveStableAddresses(context.union, context.platform)
    .map(({ name }) => name)
    .filter((name) =>
      [...surfaces].some(
        (surface) => name === `${context.application}-${surface}`,
      ),
    );
  return {
    triggers,
    source: {
      version: active.version,
      namespace: active.namespace,
      node: active.node,
    },
    target: {
      image: `${image.repository}@${image.digest}`,
      version: image.version,
      namespace: namespaceOf(context.project),
      nodes: [...placement.eligibleNodes],
    },
    ...(method === undefined
      ? {}
      : {
          method: {
            image: `${method.repository}@${method.digest}`,
            ...versionOf("imageVersion", method),
          },
        }),
    identity: `${process.name}-move`,
    flips,
    // A Move with no data to carry loses nothing on a rollback.
    reversible:
      engine?.move === undefined
        ? true
        : reversibleOf(engine.move.reverse, active.version, image.version),
    bounds: { timeout: bounds.timeout, retention: bounds.retention },
    ...(active.phase === undefined ? {} : { phase: active.phase }),
  };
}
