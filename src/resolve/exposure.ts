// An Application's exposure to its resolved routes
// (spec/v1/10-project-intent.md#exposure): the tier its audience reaches, the
// middleware chain the tier, the audience, the Client and the content profile
// derive, the Gate's own route a gated Client adds
// (spec/v1/17-sign-in.md#what-the-edge-derives), and the precedence the model
// decides rather than the proxy.
import type {
  EffectiveApplication,
  EffectiveProject,
} from "../model/effective-intent.ts";
import type { ApplicationDocument } from "../model/project-intent.ts";
import {
  applicationOf,
  type ForwardAuth,
  type PlatformIntentDocument,
} from "../model/platform-intent.ts";
import { forwardAuthEndpoint } from "../model/runtime-profiles.ts";
import type {
  ResolvedExposure,
  ResolvedRoute,
} from "../model/resolved-deployment.ts";
import { peersOf } from "./policy.ts";
import { asksTheGate, gateAddressOf, gatedBy } from "./client.ts";

type Exposure = NonNullable<ApplicationDocument["exposure"]>[number];
type Route = Exposure["routes"][number];
type Tier = PlatformIntentDocument["tiers"][number];
type Middleware = NonNullable<ResolvedRoute["middleware"]>[number];

/** Where the Gate takes a gated host's sign-in back, which no route of its own may claim. */
const GATE_ROUTE = { path: "/.auth/", match: "prefix" } as const;

/**
 * Where a route sorts: every `exact` before any `prefix`, a longer prefix
 * before a shorter one. Two routes that no rule orders share a rank.
 */
const rankOf = ({ match, path }: Pick<Route, "match" | "path">): number =>
  match === "exact" ? -Infinity : -path.length;

/** A route's precedence: one more than the number of distinct ranks before its own. */
function precedenceAmong(
  routes: readonly Pick<Route, "match" | "path">[],
): (route: Pick<Route, "match" | "path">) => number {
  const ranks = [...new Set(routes.map(rankOf))].sort((a, b) => a - b);
  return (route) => ranks.indexOf(rankOf(route)) + 1;
}

/** The security-headers baseline, with the content profile the exposure names. */
const baselineOf = (exposure: Exposure): Middleware => ({
  kind: "security-headers",
  ...(exposure.contentPolicy === undefined
    ? {}
    : { contentPolicy: exposure.contentPolicy }),
});

/**
 * The forward-auth step of an authenticated route: the endpoint its tier's
 * provider answers at, where the set holds the provider's Project, or the step
 * alone where it does not (a tier carrying `authenticated` names a provider, or
 * E_NO_FORWARD_AUTH_ENDPOINT refused the Platform document).
 */
function forwardAuthStep(
  platform: PlatformIntentDocument,
  union: readonly EffectiveProject[],
  forwardAuth: ForwardAuth,
): Middleware {
  const endpoint = forwardAuthEndpoint(platform, union, forwardAuth);
  return {
    kind: "forward-auth" as const,
    ...(endpoint === undefined ? {} : { endpoint }),
  };
}

function middlewareOf(
  exposure: Exposure,
  route: Route,
  platform: PlatformIntentDocument,
  union: readonly EffectiveProject[],
  gate: boolean,
): Middleware[] {
  const audience = route.audience ?? exposure.audience;
  // The route reaches the tier carrying its own audience, which may not be
  // the exposure's: that tier names the endpoint an authenticated route asks.
  const tier = tierFor(audience, platform);
  return [
    // A tier that carries `authenticated` names its endpoint, or
    // E_NO_FORWARD_AUTH_ENDPOINT refused the Platform document.
    ...(audience === "authenticated" && gate
      ? [forwardAuthStep(platform, union, tier.forwardAuth as ForwardAuth)]
      : []),
    baselineOf(exposure),
    ...(route.redirectTo === undefined
      ? []
      : [{ kind: "redirect" as const, redirectTo: route.redirectTo }]),
    ...(route.rateLimit === undefined
      ? []
      : [
          {
            kind: "rate-limit" as const,
            allowance: route.rateLimit.requests,
            per: route.rateLimit.per,
            // A client that has sent nothing may send its whole allowance at once.
            burst: route.rateLimit.requests,
            clientAddress: tier.proxiedBy ?? ("connection" as const),
          },
        ]),
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
  application: EffectiveApplication,
  platform: PlatformIntentDocument,
  union: readonly EffectiveProject[],
): ResolvedExposure {
  const tier = tierFor(exposure.audience, platform);
  // The tier's proxy is declared, or E_UNKNOWN_TIER_PROXY refused the set.
  const [proxy] = peersOf(platform, tier.traefik, union);
  const gated = gatedBy(application, exposure);
  const precedence = precedenceAmong([
    ...exposure.routes,
    ...(gated ? [GATE_ROUTE] : []),
  ]);
  const gate = asksTheGate(application, exposure);
  const resolved: ResolvedExposure = {
    name: exposure.name,
    host: exposure.host,
    tier: tier.name,
    // A tier an exposure is on names one, or E_TIER_WITHOUT_INGRESS_CLASS
    // refused the set.
    ingressClass: tier.ingressClass as string,
    ...(tier.dns === undefined ? {} : { dns: tier.dns }),
    listener: tier.listener,
    certificates: tier.certificates,
    proxy: {
      application: applicationOf(tier.traefik),
      namespace: (proxy as { namespace: string }).namespace,
    },
    routes: exposure.routes.map((route) => ({
      path: route.path,
      match: route.match,
      process: route.process,
      surface: route.surface,
      audience: route.audience ?? exposure.audience,
      precedence: precedence(route),
      middleware: middlewareOf(exposure, route, platform, union, gate),
    })),
  };
  if (!gated) return resolved;
  // A gated Client's exposure carries `authenticated`, or E_CLIENT_AUDIENCE
  // refused it, so its tier names the Gate.
  return {
    ...resolved,
    routes: [
      ...resolved.routes,
      {
        ...GATE_ROUTE,
        gate: gateAddressOf(tier.forwardAuth as ForwardAuth, platform, union),
        audience: exposure.audience,
        precedence: precedence(GATE_ROUTE),
        // The Gate answers here itself, so nothing asks it first.
        middleware: [baselineOf(exposure)],
      },
    ],
  };
}

export const resolveExposure = (
  application: EffectiveApplication,
  platform: PlatformIntentDocument,
  union: readonly EffectiveProject[],
): ResolvedExposure[] =>
  // Stryker disable next-line ArrayDeclaration: no exposure and an empty list resolve none alike.
  (application.exposure ?? []).map((exposure) =>
    resolveOne(exposure, application, platform, union),
  );
