// The peers a Process's policy admits beyond its own edges
// (spec/v1/16-dependencies.md#the-derived-allow-set, #the-baseline): the proxy
// of every tier a route reaches it through, the metrics stack at its scrape
// surface, every consumer the union's edges bring to one of its surfaces, and
// the cluster's DNS. Each peer names the rule that admits it.
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";

type Ingress = NonNullable<ResolvedProcess["ingress"]>[number];
type Egress = NonNullable<ResolvedProcess["egress"]>[number];

/** The DNS port every egress policy admits (spec/v1/16-dependencies.md#the-baseline). */
const DNS_PORT = 53;

export interface PolicyContext {
  readonly platform: PlatformIntentDocument;
  readonly union: readonly EffectiveProject[];
}

/** Every Process of `application`, each as a peer in its own namespace. */
export const peersOf = (
  application: string | undefined,
  union: readonly EffectiveProject[],
): { readonly namespace: string; readonly process: string }[] =>
  union.flatMap(({ project, applications }) =>
    applications
      .filter(({ id }) => id === application)
      .flatMap(({ processes }) =>
        processes.map(({ name }) => ({
          namespace: namespaceOf(project),
          process: name,
        })),
      ),
  );

/** A peer once per rule, namespace, process and port, in the order derived. */
function distinct(peers: readonly Ingress[]): Ingress[] {
  const held = new Set<string>();
  return peers.filter((peer) => {
    const key = JSON.stringify([
      peer.rule,
      peer.namespace,
      peer.process,
      peer.port,
    ]);
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
  const consumers = context.union.flatMap(({ project, applications }) =>
    applications.flatMap(({ processes }) =>
      processes.flatMap((consumer) =>
        // A missing list and an empty one admit the same nothing.
        // Stryker disable next-line ArrayDeclaration
        (consumer.dependsOn ?? [])
          .filter(
            (edge) =>
              edge.application === application.id &&
              process.provides?.[edge.surface] !== undefined,
          )
          .map((edge): Ingress => ({
            rule: "consumer",
            namespace: namespaceOf(project),
            process: consumer.name,
            port: port(edge.surface),
          })),
      ),
    ),
  );
  return distinct([...routes, ...metrics, ...consumers]);
}

/** The surface the Secret Store answers every grant on. */
const STORE_SURFACE = "http";

/** The Secret Store's Process that answers on its `http` surface, as an egress peer. */
function storeOf(context: PolicyContext): Egress {
  const store = context.union
    .flatMap(({ project, applications }) =>
      applications
        .filter(({ id }) => id === context.platform.secretStore)
        .flatMap(({ processes }) =>
          processes.flatMap(({ name, provides }) =>
            provides?.[STORE_SURFACE] === undefined
              ? []
              : [
                  {
                    rule: "secret-store" as const,
                    namespace: namespaceOf(project),
                    process: name,
                    port: provides[STORE_SURFACE],
                  },
                ],
          ),
        ),
    )
    .at(0);
  if (store === undefined)
    throw new Error(
      "a grant under a platform that names no Secret Store is not checked yet",
    );
  return store;
}

/**
 * The baseline every egress policy carries, the cluster's DNS, and the Secret
 * Store for a Process that holds a grant.
 */
export const egressOf = (
  process: EffectiveProcess,
  context: PolicyContext,
): Egress[] => [
  {
    rule: "cluster-dns",
    namespace: context.platform.substrate.clusterDns,
    port: DNS_PORT,
  },
  // A missing list and an empty one hold no grant alike.
  // Stryker disable next-line ArrayDeclaration
  ...((process.secrets ?? []).length === 0 ? [] : [storeOf(context)]),
];
