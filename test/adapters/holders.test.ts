// RULE-045 (docs/architecture-rules.md): the identities that hold a grant
// (spec/v1/16-dependencies.md#what-a-grant-confers), which the vso and
// vault-policy adapters both read. A backup identity holds the off-cluster
// destination's credential and the one its method dumps the Process with.
import { describe, expect, it } from "vitest";
import { holdersOf } from "../../src/adapters/shared/holders.ts";

const grant = (path: string) => ({
  path,
  access: "read",
  delivery: "env",
  destination: `store-backup-${path}`,
});
const OFF_CLUSTER = grant("platform/backup/off-cluster");
const PEER = grant("notes/store/backup");

/** A backup plan of the Process `store`, holding what `extra` adds. */
const backup = (extra: Readonly<Record<string, unknown>> = {}) => ({
  identity: "store-backup",
  ...extra,
});

const holders = (volumes: readonly Readonly<Record<string, unknown>>[]) =>
  holdersOf({
    id: "notes",
    processes: [{ name: "store", identity: "store", volumes }],
  } as never).map(({ identity, grants }) => [identity, grants]);

describe("the holders of an Application's grants", () => {
  it("gives a backup identity the off-cluster credential of whichever backup copies off-cluster, then its peer's", () => {
    expect(
      holders([
        // A volume nothing backs up comes first, and so does a backup that
        // keeps its copies in the cluster.
        { claim: "cache" },
        { claim: "queue", backup: backup({ peer: { credential: PEER } }) },
        {
          claim: "keep",
          backup: backup({
            credential: OFF_CLUSTER,
            peer: { credential: PEER },
          }),
        },
      ]),
    ).toStrictEqual([["store-backup", [OFF_CLUSTER, PEER]]]);
  });

  it("gives a backup identity nothing to hold where no backup copies off-cluster or dumps over the network", () => {
    expect(holders([{ claim: "keep", backup: backup() }])).toStrictEqual([]);
    expect(holders([{ claim: "cache" }])).toStrictEqual([]);
    expect(
      holders([{ claim: "keep", backup: backup({ credential: OFF_CLUSTER }) }]),
    ).toStrictEqual([["store-backup", [OFF_CLUSTER]]]);
  });
});
