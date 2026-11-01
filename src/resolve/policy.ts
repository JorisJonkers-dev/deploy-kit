// The peers a Process's policy admits beyond its own edges
// (spec/v1/16-dependencies.md#the-derived-allow-set, #the-baseline): the proxy
// of every tier a route reaches it through, the metrics stack at its scrape
// surface, every pod carrying the consumer label of one of its surfaces, and
// the cluster's DNS. Each peer names the rule that admits it.
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import {
  FLUX_NOTIFIER,
  fluxNamespaceOf,
  REPORTER_SURFACE,
  holds,
  type PlatformIntentDocument,
} from "../model/platform-intent.ts";
import type {
  EgressPeer,
  ResolvedProcess,
} from "../model/resolved-deployment.ts";
import { consumedOf } from "../model/consumer-label.ts";
import {
  backupIdentityOf,
  homeOf,
  namespaceOf,
} from "../model/runtime-profiles.ts";
import { dumpedSurfaceOf } from "../model/backup.ts";

type Ingress = NonNullable<ResolvedProcess["ingress"]>[number];
type Egress = EgressPeer;
type GateMembers = Extract<
  NonNullable<ResolvedProcess["egress"]>[number],
  { rule: "gate-members" }
>;

/** The DNS port every egress policy admits (spec/v1/16-dependencies.md#the-baseline). */
export const DNS_PORT = 53;

export interface PolicyContext {
  readonly platform: PlatformIntentDocument;
  readonly union: readonly EffectiveProject[];
  /** The project the Process is declared in. */
  readonly project: string;
}

/** Every Process of `application`, each as a peer in its own namespace. */
export const peersOf = (
  application: string | undefined,
  union: readonly EffectiveProject[],
): { readonly namespace: string; readonly process: string }[] =>
  union.flatMap(({ project, applications }) =>
    applications
      .filter(({ id }) => holds(application, project, id))
      .flatMap(({ processes }) =>
        processes.map(({ name }) => homeOf(project, name)),
      ),
  );

/** A peer once per rule, namespace, process and port, in the order derived. */
function distinct<Peer extends Ingress | Egress>(
  peers: readonly Peer[],
): Peer[] {
  const held = new Set<string>();
  return peers.filter((peer) => {
    const key = JSON.stringify(peer);
    if (held.has(key)) return false;
    held.add(key);
    return true;
  });
}

export function ingressOf(
  process: EffectiveProcess,
  application: EffectiveApplication,
  context: PolicyContext,
): Ingress[] {
  const port = (surface: string): number =>
    // A route, a scrape and an edge name a surface the Process provides, or
    // E_UNKNOWN_SURFACE refused them.
    process.provides?.[surface] as number;
  const routes = (application.exposure ?? []).flatMap((exposure) =>
    exposure.routes
      .filter((route) => route.process === process.name)
      .flatMap((route) => {
        const audience = route.audience ?? exposure.audience;
        // A tier carries the audience, or E_NO_TIER_FOR_AUDIENCE refused it.
        const tier = context.platform.tiers.find(({ audiences }) =>
          audiences.includes(audience),
        ) as PlatformIntentDocument["tiers"][number];
        return peersOf(tier.traefik, context.union).map((peer): Ingress => ({
          rule: "tier-proxy",
          ...peer,
          port: port(route.surface),
        }));
      }),
  );
  const scrape = application.observability?.scrape;
  const metrics =
    scrape?.process === process.name
      ? peersOf(context.platform.telemetry?.metrics, context.union).map(
          (peer): Ingress => ({
            rule: "metrics-stack",
            ...peer,
            port: port(scrape.surface),
          }),
        )
      : [];
  // Every surface admits the pods that carry its consumer label, whoever
  // declares them: the policy reads the Process's own surfaces, never the
  // union's edges, so a consumer added or removed leaves it as it is.
  const consumers = Object.entries(process.provides ?? {}).map(
    ([surface, number]): Ingress => ({
      rule: "consumer",
      consumes: consumedOf(application.id, surface),
      port: number,
    }),
  );
  // Its own backups, where it has any and the engine's method dumps over the
  // network: the backup identity reaches the surface the platform names for
  // the engine, which the Process provides (E_BACKUP_SURFACE_NOT_PROVIDED).
  const dumped = dumpedSurfaceOf(process, context.platform);
  const backups: Ingress[] =
    dumped === undefined
      ? []
      : [
          {
            rule: "backup",
            namespace: namespaceOf(context.project),
            process: backupIdentityOf(process.name),
            port: port(dumped),
          },
        ];
  // Flux's events about every Project's unit
  // (spec/v1/55-delivery.md#rollouts): its notification controller reaches
  // the Reporter where the Provider sends them, the first Process of the
  // Reporter that provides the surface.
  // The Application the platform names is the one declared beside the
  // Release Gate, or E_UNKNOWN_REPORTER refused the set, and no other carries
  // its id, or E_DUPLICATE_APPLICATION_ID did.
  const receiver = holds(
    context.platform.delivery?.reporter,
    context.project,
    application.id,
  )
    ? application.processes.find(
        ({ provides }) => provides?.[REPORTER_SURFACE] !== undefined,
      )
    : undefined;
  const events: Ingress[] =
    receiver?.name === process.name
      ? [
          {
            rule: "flux-events",
            namespace: fluxNamespaceOf(context.platform),
            process: FLUX_NOTIFIER,
            port: port(REPORTER_SURFACE),
          },
        ]
      : [];
  return distinct([...routes, ...metrics, ...consumers, ...backups, ...events]);
}

/**
 * The Release Gate's own requests to a gate member's new copy
 * (spec/v1/16-dependencies.md#the-member-label): every Process of the gate the
 * platform names, on the port of the member's first surface, which its Canary
 * service targets.
 */
export function gateIngressOf(
  resolved: Pick<ResolvedProcess, "surfaces">,
  member: boolean,
  context: PolicyContext,
): Ingress[] {
  if (!member) return [];
  // A member serves on its first surface, or E_RELEASE_UNIT_NO_READINESS and
  // the surface checks refused it.
  const [served] = resolved.surfaces as [
    NonNullable<ResolvedProcess["surfaces"]>[number],
  ];
  // A member switches under a delivery policy, or E_NO_DELIVERY_POLICY
  // refused it.
  const { gate } = context.platform.delivery as NonNullable<
    PlatformIntentDocument["delivery"]
  >;
  return peersOf(gate, context.union).map((peer) => ({
    rule: "release-gate",
    ...peer,
    port: served.port,
  }));
}

/** Every gate member's pods, for each Process of the Release Gate the platform names. */
export const gateEgressOf = (
  application: Pick<EffectiveApplication, "id">,
  context: PolicyContext,
): GateMembers[] =>
  holds(context.platform.delivery?.gate, context.project, application.id)
    ? [{ rule: "gate-members" }]
    : [];

/** The surface the Secret Store answers every grant on. */
const STORE_SURFACE = "http";

/** The Secret Store's Process that answers on its `http` surface, as an egress peer. */
export function storeOf(
  context: Pick<PolicyContext, "platform" | "union">,
): Egress {
  const store = context.union
    .flatMap(({ project, applications }) =>
      applications
        .filter(({ id }) => holds(context.platform.secretStore, project, id))
        .flatMap(({ processes }) =>
          processes.flatMap(({ name, provides }) =>
            provides?.[STORE_SURFACE] === undefined
              ? []
              : [
                  {
                    rule: "secret-store" as const,
                    ...homeOf(project, name),
                    port: provides[STORE_SURFACE],
                  },
                ],
          ),
        ),
    )
    .at(0);
  // A grant under a platform that names no Secret Store stops resolution at
  // the Application's endpoint for it, so a store is found here.
  return store as Egress;
}

/**
 * The baseline every egress policy carries, the cluster's DNS, and the Secret
 * Store for a Process that holds a grant, its own or one its Application's
 * Client derives (spec/v1/17-sign-in.md#credentials-and-placeholders).
 */
export const egressOf = (
  process: EffectiveProcess,
  context: PolicyContext,
  derived: boolean,
): Egress[] => [
  {
    rule: "cluster-dns",
    namespace: context.platform.substrate.clusterDns,
    port: DNS_PORT,
  },
  // A missing list and an empty one hold no grant alike.
  // Stryker disable next-line ArrayDeclaration
  ...((process.secrets ?? []).length === 0 && !derived
    ? []
    : [storeOf(context)]),
];

/**
 * What the metrics stack scrapes (spec/v1/16-dependencies.md#the-derived-allow-set):
 * the Process every Application of the set names in its `scrape`, where it
 * runs, on its scrape surface's port, and Flux's controllers on the port the
 * bootstrap set records. Every Process of the metrics stack, and no other.
 */
export function scrapeEgressOf(
  application: Pick<EffectiveApplication, "id">,
  context: PolicyContext,
): Egress[] {
  const { platform } = context;
  if (!holds(platform.telemetry?.metrics, context.project, application.id))
    return [];
  const targets = context.union.flatMap(({ project, applications }) =>
    applications.flatMap(({ observability, processes }): Egress[] => {
      const scrape = observability?.scrape;
      if (scrape === undefined) return [];
      // A scrape names a surface its Process provides, or E_UNKNOWN_PROCESS
      // and E_UNKNOWN_SURFACE refused it.
      const target = processes.find(
        ({ name }) => name === scrape.process,
      ) as EffectiveProcess;
      return [
        {
          rule: "scrape-target",
          ...homeOf(project, scrape.process),
          port: target.provides?.[scrape.surface] as number,
        },
      ];
    }),
  );
  const flux = platform.bootstrap.flux.metrics;
  // In one order whatever order the union arrived in, so a composition is the
  // same however its fragments were pulled.
  const ordered = targets.toSorted((left, right) =>
    JSON.stringify([left.namespace, left.process, left.port]).localeCompare(
      JSON.stringify([right.namespace, right.process, right.port]),
    ),
  );
  return distinct([
    ...ordered,
    ...(flux === undefined
      ? []
      : [
          {
            rule: "flux-metrics" as const,
            namespace: fluxNamespaceOf(platform),
            port: flux.port,
          },
        ]),
  ]);
}
