// A tier's proxy (spec/v1/14-platform-intent.md#tiers): the L4 Address a tier
// names, and the ports its listener derives on the proxy it names. No project
// file writes them: an edge proxy is reached where its tier says.
import {
  holds,
  type DnsProvider,
  type Listener,
  type PlatformIntentDocument,
} from "./platform-intent.ts";
import type { L4Exposure } from "./project-intent.ts";

type Tier = PlatformIntentDocument["tiers"][number];

/**
 * The ports a listener derives, each to the surface the proxy answers it on:
 * 80 to `web` on every tier, and on a `tls` one 443 to `websecure` too.
 */
export const LISTENER_PORTS: Readonly<
  Record<
    Listener,
    readonly { readonly port: number; readonly surface: string }[]
  >
> = {
  plain: [{ port: 80, surface: "web" }],
  tls: [
    { port: 80, surface: "web" },
    { port: 443, surface: "websecure" },
  ],
};

/** The tiers whose proxy is `<project>/<application>`, in the Platform document's order. */
export const tiersProxiedBy = (
  platform: Pick<PlatformIntentDocument, "tiers">,
  project: string,
  application: string,
): Tier[] =>
  platform.tiers.filter(({ traefik }) => holds(traefik, project, application));

interface ProxyApplication {
  readonly id: string;
  readonly processes: readonly {
    readonly name: string;
    readonly provides?: Readonly<Record<string, number>> | undefined;
  }[];
}

/**
 * The Process of a proxy that answers a tier: the one that provides every
 * surface the tier's listener names, if any does.
 */
export const proxyProcessOf = (
  application: ProxyApplication,
  listener: Listener,
): string | undefined =>
  application.processes.find(({ provides }) =>
    LISTENER_PORTS[listener].every(
      ({ surface }) =>
        provides !== undefined && Object.hasOwn(provides, surface),
    ),
  )?.name;

/**
 * The L4 exposures a proxy's tiers derive on it: per tier that names an
 * address, each port its listener derives, on the Process that answers it.
 */
export function tierExposuresOf(
  platform: Pick<PlatformIntentDocument, "tiers">,
  project: string,
  application: ProxyApplication,
): L4Exposure[] {
  return tiersProxiedBy(platform, project, application.id).flatMap(
    ({ address, listener }) => {
      const process = proxyProcessOf(application, listener);
      return address === undefined || process === undefined
        ? []
        : LISTENER_PORTS[listener].map(({ port, surface }) => ({
            address,
            port,
            protocol: "tcp" as const,
            process,
            surface,
          }));
    },
  );
}

/**
 * Every L4 exposure of an Application: what it authors, and what the tiers
 * whose proxy it is derive on it.
 */
export const exposuresOf = (
  platform: Pick<PlatformIntentDocument, "tiers">,
  project: string,
  application: ProxyApplication & {
    readonly l4Exposure?: readonly L4Exposure[] | undefined;
  },
): L4Exposure[] => [
  // A missing list and an empty one expose nothing alike.
  // Stryker disable next-line ArrayDeclaration
  ...(application.l4Exposure ?? []),
  ...tierExposuresOf(platform, project, application),
];

/** Where an acme tier's proxy keeps its ACME state, on the claim the tier derives. */
export const ACME_CLAIM = "acme";
export const ACME_MOUNT = "/acme";
export const ACME_SIZE = "16Mi";

/** The key of the Secret Store path holding each DNS provider's token, as its client reads it. */
export const DNS_TOKEN_KEYS: Readonly<Record<DnsProvider, string>> = {
  cloudflare: "CF_DNS_API_TOKEN",
};

/** The tiers a proxy's Process answers: those whose listener its surfaces serve. */
export const tiersAnsweredBy = (
  platform: Pick<PlatformIntentDocument, "tiers">,
  project: string,
  application: ProxyApplication,
  process: string,
): Tier[] =>
  tiersProxiedBy(platform, project, application.id).filter(
    ({ listener }) => proxyProcessOf(application, listener) === process,
  );
