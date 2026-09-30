// An Application's exposure to its resolved routes
// (spec/v1/10-project-intent.md#exposure): the tier its audience reaches, the
// middleware chain the tier, the audience and the content profile derive, and
// the precedence the model decides rather than the proxy.
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { ApplicationDocument } from "../model/project-intent.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type {
  ResolvedExposure,
  ResolvedRoute,
} from "../model/resolved-deployment.ts";
import { peersOf } from "./policy.ts";

type Exposure = NonNullable<ApplicationDocument["exposure"]>[number];
type Route = Exposure["routes"][number];
type Tier = PlatformIntentDocument["tiers"][number];
type Middleware = NonNullable<ResolvedRoute["middleware"]>[number];

/**
 * Where a route sorts: every `exact` before any `prefix`, a longer prefix
 * before a shorter one. Two routes that no rule orders share a rank.
 */
const rankOf = ({ match, path }: Route): number =>
  match === "exact" ? -Infinity : -path.length;

/** A route's precedence: one more than the number of distinct ranks before its own. */
function precedenceAmong(routes: readonly Route[]): (route: Route) => number {
  const ranks = [...new Set(routes.map(rankOf))].sort((a, b) => a - b);
  return (route) => ranks.indexOf(rankOf(route)) + 1;
}

function middlewareOf(
  exposure: Exposure,
  route: Route,
  platform: PlatformIntentDocument,
): Middleware[] {
  const audience = route.audience ?? exposure.audience;
  // The route reaches the tier carrying its own audience, which may not be
  // the exposure's: that tier names the endpoint an authenticated route asks.
  const tier = tierFor(audience, platform);
  return [
    // A tier that carries `authenticated` names its endpoint, or
    // E_NO_FORWARD_AUTH_ENDPOINT refused the Platform document.
    ...(audience === "authenticated"
      ? [
          {
            kind: "forward-auth" as const,
            endpoint: tier.forwardAuth as string,
          },
        ]
      : []),
    {
      kind: "security-headers",
      ...(exposure.contentPolicy === undefined
        ? {}
        : { contentPolicy: exposure.contentPolicy }),
    },
    ...(route.redirectTo === undefined
      ? []
      : [{ kind: "redirect" as const, redirectTo: route.redirectTo }]),
  ];
}

/** A tier carries every audience an exposure or a route asks for, or E_NO_TIER_FOR_AUDIENCE refused it. */
const tierFor = (
  audience: Exposure["audience"],
  platform: PlatformIntentDocument,
): Tier =>
  platform.tiers.find(({ audiences }) => audiences.includes(audience)) as Tier;

function resolveOne(
  exposure: Exposure,
  platform: PlatformIntentDocument,
  union: readonly EffectiveProject[],
): ResolvedExposure {
  const tier = tierFor(exposure.audience, platform);
  // The tier's proxy is declared, or E_UNKNOWN_TIER_PROXY refused the set.
  const [proxy] = peersOf(tier.traefik, union);
  const precedence = precedenceAmong(exposure.routes);
  return {
    name: exposure.name,
    host: exposure.host,
    tier: tier.name,
    listener: tier.listener,
    certificates: tier.certificates,
    proxy: {
      application: tier.traefik,
      namespace: (proxy as { namespace: string }).namespace,
    },
    routes: exposure.routes.map((route) => ({
      path: route.path,
      match: route.match,
      process: route.process,
      surface: route.surface,
      audience: route.audience ?? exposure.audience,
      precedence: precedence(route),
      middleware: middlewareOf(exposure, route, platform),
    })),
  };
}

export const resolveExposure = (
  exposures: readonly Exposure[],
  platform: PlatformIntentDocument,
  union: readonly EffectiveProject[],
): ResolvedExposure[] =>
  exposures.map((exposure) => resolveOne(exposure, platform, union));
