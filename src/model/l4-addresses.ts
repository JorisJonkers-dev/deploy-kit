// L4 Addresses (spec/v1/14-platform-intent.md#l4-addresses): an address the
// Platform document declares by name, which an Application's L4 exposure
// names, and what one Process's exposures on them hold it to.
import type { PlatformIntentDocument } from "./platform-intent.ts";
import type { L4Exposure } from "./project-intent.ts";

export type L4Address = NonNullable<
  PlatformIntentDocument["l4Addresses"]
>[string];

/** The L4 Address the Platform document declares under `name`, if it declares one. */
export const l4AddressOf = (
  platform: Pick<PlatformIntentDocument, "l4Addresses">,
  name: string,
): L4Address | undefined =>
  platform.l4Addresses !== undefined &&
  Object.hasOwn(platform.l4Addresses, name)
    ? platform.l4Addresses[name]
    : undefined;

/** How many addresses a CIDR range holds. */
export const addressesIn = (range: string): number =>
  2 ** (32 - Number(range.slice(range.indexOf("/") + 1)));

/** The L4 exposures of an Application that reach one of its Processes. */
export const l4ExposuresOf = (
  application: { readonly l4Exposure?: readonly L4Exposure[] | undefined },
  process: string,
): L4Exposure[] =>
  // A missing list and an empty one expose nothing alike.
  // Stryker disable next-line ArrayDeclaration
  (application.l4Exposure ?? []).filter((entry) => entry.process === process);

/**
 * The sites a Process is held to by the pools it is exposed on, each once: a
 * pool is announced on its own site's segment, so a Process behind it runs
 * there. Every address is declared, since E_UNKNOWN_L4_ADDRESS refuses one
 * that is not before anything places the Process.
 */
export const l4SitesOf = (
  exposures: readonly L4Exposure[],
  platform: Pick<PlatformIntentDocument, "l4Addresses">,
): string[] => [
  ...new Set(
    addressesOf(exposures, platform).flatMap((address) =>
      address.kind === "pool" ? [address.site] : [],
    ),
  ),
];

/**
 * The nodes a Process is held to by the node addresses it is exposed on, each
 * once: a host port listens on its own node alone.
 */
export const l4NodesOf = (
  exposures: readonly L4Exposure[],
  platform: Pick<PlatformIntentDocument, "l4Addresses">,
): string[] => [
  ...new Set(
    addressesOf(exposures, platform).flatMap((address) =>
      address.kind === "node" ? [address.node] : [],
    ),
  ),
];

const addressesOf = (
  exposures: readonly L4Exposure[],
  platform: Pick<PlatformIntentDocument, "l4Addresses">,
): L4Address[] =>
  exposures.map(({ address }) => l4AddressOf(platform, address) as L4Address);

/** Where a Process's L4 exposures hold it: the sites of its pools and the nodes of its node addresses. */
export interface L4Hold {
  readonly sites: readonly string[];
  readonly nodes: readonly string[];
}

/** A Process exposed on no L4 Address is held nowhere. */
export const HELD_NOWHERE: L4Hold = { sites: [], nodes: [] };

/** Where `exposures` hold the Process they reach. */
export const l4HoldOf = (
  exposures: readonly L4Exposure[],
  platform: Pick<PlatformIntentDocument, "l4Addresses">,
): L4Hold => ({
  sites: l4SitesOf(exposures, platform),
  nodes: l4NodesOf(exposures, platform),
});
