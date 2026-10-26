// A Process's L4 exposures to the L4 Addresses it is reached on
// (spec/v1/20-resolved-deployment.md#l4-exposure): per address, every port a
// client dials on it, each to the surface's own port, carried by one Service
// on a pool and by host ports on a node's own address.
import type { EffectiveProcess } from "../model/effective-intent.ts";
import { l4AddressOf, type L4Address } from "../model/l4-addresses.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { L4Exposure } from "../model/project-intent.ts";
import type { ResolvedL4Exposure } from "../model/resolved-deployment.ts";

type Port = ResolvedL4Exposure["ports"][number];

/**
 * Ports by the client's port, and TCP before UDP on one port: a port and a
 * protocol are dialled once, or E_DUPLICATE_L4_PORT refused the document.
 */
const byPort = (a: Port, b: Port): number =>
  a.port - b.port || (a.protocol === "tcp" ? -1 : 1);

/** The Service a Process is reached on at one L4 Address. */
export const l4ServiceOf = (process: string, address: string): string =>
  `${process}-${address}`;

export function resolveL4Exposure(
  exposures: readonly L4Exposure[],
  process: EffectiveProcess,
  platform: PlatformIntentDocument,
): ResolvedL4Exposure[] {
  const addresses = [...new Set(exposures.map(({ address }) => address))];
  // Code-point order, which the projection is sorted by.
  return addresses.sort().map((address): ResolvedL4Exposure => {
    const ports = exposures
      .filter((entry) => entry.address === address)
      .map(({ port, protocol, surface }) => ({
        name: `${protocol}-${String(port)}`,
        port,
        protocol,
        surface,
        // The surface is provided, or E_UNKNOWN_SURFACE refused the route.
        targetPort: process.provides?.[surface] as number,
      }))
      .sort(byPort);
    // Every address is declared, or E_UNKNOWN_L4_ADDRESS refused the set.
    const declared = l4AddressOf(platform, address) as L4Address;
    return declared.kind === "node"
      ? { address, kind: "node", node: declared.node, ports }
      : {
          address,
          kind: "pool",
          site: declared.site,
          range: declared.range,
          service: l4ServiceOf(process.name, address),
          ports,
        };
  });
}
