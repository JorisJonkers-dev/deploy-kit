// REQ-111 (docs/requirements.md): every surface an edge, a spawn template's
// edge or a tier's forward-auth names derives a Stable Address, recording
// each Project that resolves it, except one at an address no name stands for.
import { describe, expect, it } from "vitest";
import type { EffectiveProject } from "../../src/model/effective-intent.ts";
import type { PlatformIntentDocument } from "../../src/model/platform-intent.ts";
import { resolveStableAddresses } from "../../src/resolve/stable-addresses.ts";

const PLATFORM = {
  // A tier with no forward-auth asks for no Stable Address.
  tiers: [{ name: "public", traefik: "edge/traefik-public" }],
  providers: [
    { name: "at-ip", address: "10.0.0.5", surfaces: { db: 5432 } },
    { name: "at-ipv6", address: "fd00::5", surfaces: { db: 5432 } },
    {
      name: "numbered",
      address: "1password-storage-1",
      surfaces: { db: 5432 },
    },
    { name: "plain", address: "nas", surfaces: { db: 5432 } },
  ],
} as unknown as PlatformIntentDocument;

const naming = (
  project: string,
  edges: readonly string[],
  spawned: readonly string[] = [],
): EffectiveProject =>
  ({
    project,
    applications: [
      {
        id: `${project}-app`,
        processes: [
          {
            name: "a",
            dependsOn: edges.map((application) => ({
              application,
              surface: "db",
            })),
          },
          {
            name: "b",
            dependsOn: edges.map((application) => ({
              application,
              surface: "db",
            })),
            spawns: [
              {
                dependsOn: spawned.map((application) => ({
                  application,
                  surface: "db",
                })),
              },
            ],
          },
        ],
      },
    ],
  }) as unknown as EffectiveProject;

describe("the Stable Addresses of a union", () => {
  it("are one per surface named, at a name and never at an IP", () => {
    expect(
      resolveStableAddresses(
        [naming("one", ["at-ip", "at-ipv6", "numbered", "plain"])],
        PLATFORM,
      ).map(({ name, target }) => [name, target]),
    ).toStrictEqual([
      ["numbered-db", "1password-storage-1"],
      ["plain-db", "nas"],
    ]);
  });

  it("record each Project that resolves one once, in name order, a spawn template's edges among them", () => {
    expect(
      resolveStableAddresses(
        [naming("zeta", ["plain"]), naming("alpha", [], ["plain"])],
        PLATFORM,
      ),
    ).toStrictEqual([
      {
        name: "plain-db",
        target: "nas",
        port: 5432,
        consumers: ["alpha", "zeta"],
      },
    ]);
  });
});
