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
import { DNS_PORT, storeOf } from "./policy.ts";
import { resolveStableAddresses } from "./stable-addresses.ts";

type ResolvedMove = NonNullable<ResolvedProcess["move"]>;
type EnginePolicy = NonNullable<ReturnType<typeof engineOf>>;
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
  const namespace = namespaceOf(context.project);
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
      instance: active.name ?? process.name,
      version: active.version,
      namespace: active.namespace,
      node: active.node,
    },
    target: {
      // A target in a namespace of its own keeps the Process's name; one
      // beside its source is named by the release, until the gate records it.
      ...(active.target?.name !== undefined
        ? { instance: active.target.name }
        : namespace === active.namespace
          ? {}
          : { instance: process.name }),
      image: `${image.repository}@${image.digest}`,
      version: image.version,
      namespace,
      nodes: [...placement.eligibleNodes],
    },
    ...(method === undefined
      ? {}
      : {
          method: methodOf(process, method, active.namespace, context),
        }),
    identity: `${process.name}-move`,
    flips,
    // A Move with no data to carry loses nothing on a rollback.
    reversible:
      engine?.move === undefined
        ? true
        : reversibleOf(engine.move.reverse, active.version, image.version),
    bounds: {
      timeout: bounds.timeout,
      retention: bounds.retention,
      memory: bounds.memory,
      cpu: bounds.cpu,
    },
    ...(context.platform.apiAccess === undefined
      ? {}
      : { server: context.platform.apiAccess.server }),
    ...(active.phase === undefined ? {} : { phase: active.phase }),
  };
}

/**
 * The method that carries the data, and what its Jobs hold and reach: the
 * credential the platform's operator writes, which only the move identity
 * reads, and both Instances on the engine's surface, the store and the
 * cluster's DNS.
 */
function methodOf(
  process: EffectiveProcess,
  method: LockedImage,
  from: string,
  context: MoveContext,
): NonNullable<ResolvedMove["method"]> {
  const namespace = namespaceOf(context.project);
  // The method syncs over the engine's surface, which an engine that moves
  // names and its Process provides.
  const engine = engineOf(context.platform, process) as EnginePolicy;
  const port = (process.provides as Readonly<Record<string, number>>)[
    engine.surface as string
  ] as number;
  return {
    image: `${method.repository}@${method.digest}`,
    ...versionOf("imageVersion", method),
    uid: method.uid,
    gid: method.gid,
    port,
    credential: {
      path: `secret/data/${context.project}/${process.name}/move`,
      access: "read",
      delivery: "self",
    },
    egress: [
      ...[...new Set([from, namespace])].map((where) => ({
        rule: "datastore" as const,
        namespace: where,
        process: process.name,
        port,
      })),
      storeOf(context),
      {
        rule: "cluster-dns" as const,
        namespace: context.platform.substrate.clusterDns,
        port: DNS_PORT,
      },
    ],
  };
}
