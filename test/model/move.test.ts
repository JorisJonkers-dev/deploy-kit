// REQ-112 (docs/requirements.md): a change an engine's data cannot follow in
// place derives a Move, whose reversibility and retirement are derived too.
import { describe, expect, it } from "vitest";
import type { ClusterStateDocument } from "../../src/model/cluster-state.ts";
import type { ImagesLockDocument } from "../../src/model/images-lock.ts";
import type { PlatformIntentDocument } from "../../src/model/platform-intent.ts";
import { resolveMove } from "../../src/resolve/move.ts";
import {
  activeInstanceOf,
  boundToOf,
  departingFromOf,
  departingOf,
  movePolicyOf,
  moveTriggers,
  moveTriggersOf,
  retiredOf,
  reversibleOf,
} from "../../src/model/move.ts";

const ACTIVE = {
  application: "platform-postgres",
  instance: "postgres",
  version: "16.4.0",
  namespace: "data-system",
  node: "enschede-t1000-1",
};
const NOW = {
  version: "16.4.0",
  namespace: "data-system",
  eligibleNodes: ["enschede-t1000-1"],
  boundTo: "enschede-t1000-1",
};

describe("what derives a Move", () => {
  it("is a version change in the component the engine breaks on", () => {
    expect(
      moveTriggersOf({ ...NOW, version: "17.2.0" }, ACTIVE, "major"),
    ).toStrictEqual(["version"]);
    expect(
      moveTriggersOf({ ...NOW, version: "16.5.0" }, ACTIVE, "major"),
    ).toStrictEqual([]);
    expect(
      moveTriggersOf({ ...NOW, version: "16.5.0" }, ACTIVE, "minor"),
    ).toStrictEqual(["version"]);
    expect(
      moveTriggersOf({ ...NOW, version: "16.4.9" }, ACTIVE, "minor"),
    ).toStrictEqual([]);
  });

  it("is a namespace other than the active Instance's, whatever the engine", () => {
    expect(
      moveTriggersOf(
        { ...NOW, namespace: "storage-system" },
        ACTIVE,
        undefined,
      ),
    ).toStrictEqual(["namespace"]);
  });

  it("is an eligible node set that excludes the node holding the bound volume", () => {
    expect(
      moveTriggersOf(
        { ...NOW, eligibleNodes: ["enschede-2"] },
        ACTIVE,
        "major",
      ),
    ).toStrictEqual(["binding"]);
    expect(
      moveTriggersOf(
        { ...NOW, eligibleNodes: ["enschede-2"], boundTo: undefined },
        ACTIVE,
        "major",
      ),
    ).toStrictEqual([]);
  });

  it("reads no version where the engine names no move method", () => {
    expect(
      moveTriggersOf({ ...NOW, version: "17.2.0" }, ACTIVE, undefined),
    ).toStrictEqual([]);
  });
});

describe("whether a Move can be rolled back", () => {
  it("reads the engine's reverse against the two versions", () => {
    expect(reversibleOf("always", "16.4.0", "17.2.0")).toBe(true);
    expect(reversibleOf("never", "16.4.0", "16.5.0")).toBe(false);
    expect(reversibleOf("same-major", "16.4.0", "16.5.0")).toBe(true);
    expect(reversibleOf("same-major", "16.4.0", "17.2.0")).toBe(false);
  });
});

describe("when a Move's source retires", () => {
  const flipped = {
    ...ACTIVE,
    phase: "retire" as const,
    flippedAt: "2026-10-01T00:00:00Z",
  };

  it("is once the flip has held past the retention", () => {
    expect(retiredOf(flipped, "7d", "2026-10-08T00:00:01Z")).toBe(true);
    expect(retiredOf(flipped, "7d", "2026-10-08T00:00:00Z")).toBe(false);
  });

  it("is never before the flip has held at all", () => {
    expect(
      retiredOf({ ...ACTIVE, phase: "lag" }, "7d", "2027-01-01T00:00:00Z"),
    ).toBe(false);
  });
});

describe("what a Move is read from", () => {
  const state = (instances: ClusterStateDocument["instances"]) =>
    ({
      capturedAt: "2026-10-30T00:00:00Z",
      bindings: [
        { claim: "other", node: "enschede-2" },
        { claim: "data", node: "enschede-t1000-1" },
      ],
      instances,
    }) as unknown as ClusterStateDocument;

  it("is the Instance recorded for the Application and Process both", () => {
    const strangers = [
      { ...ACTIVE, application: "platform-other" },
      { ...ACTIVE, instance: "other" },
    ];

    expect(
      activeInstanceOf(state(strangers), "platform-postgres", "postgres"),
    ).toBeUndefined();
    expect(
      activeInstanceOf(
        state([...strangers, ACTIVE]),
        "platform-postgres",
        "postgres",
      ),
    ).toStrictEqual(ACTIVE);
  });

  it("is the node a claim of the Process is bound to, where one is", () => {
    expect(
      boundToOf(state([]), { volumes: [{ claim: "data" }] } as never),
    ).toBe("enschede-t1000-1");
    expect(boundToOf(state([]), {})).toBeUndefined();
  });

  it("names no bounds under a platform with no delivery policy", () => {
    expect(movePolicyOf({} as PlatformIntentDocument)).toBeUndefined();
  });

  it("keeps a flipped Move open under a platform that bounds no retention", () => {
    const derived = moveTriggers(
      { name: "postgres", image: "postgres", engine: "postgres" },
      { eligibleNodes: ["enschede-t1000-1"] },
      {
        platform: {
          engines: {
            postgres: {
              move: { image: "m", breaksOn: "major", reverse: "never" },
            },
          },
        } as unknown as PlatformIntentDocument,
        lock: {
          images: { postgres: { version: "17.2.0" } },
        } as unknown as ImagesLockDocument,
        clusterState: state([{ ...ACTIVE, flippedAt: "2026-01-01T00:00:00Z" }]),
        project: "data",
        application: "platform-postgres",
      },
    );

    expect(derived?.triggers).toStrictEqual(["version"]);
  });
});

describe("the Move a Process resolves", () => {
  it("says nowhere for the flip to write under a platform that says nowhere the API answers", () => {
    const platform = {
      engines: {
        postgres: {
          surface: "postgres",
          move: { image: "m", breaksOn: "major", reverse: "never" },
        },
      },
      delivery: {
        move: { timeout: "300s", retention: "7d", memory: "64Mi", cpu: "10m" },
      },
      substrate: { clusterDns: "kube-system" },
      tiers: [],
    } as unknown as PlatformIntentDocument;
    const move = resolveMove(
      {
        name: "postgres",
        image: "postgres",
        engine: "postgres",
        provides: { postgres: 5432 },
      } as never,
      { eligibleNodes: ["enschede-t1000-1"] },
      {
        platform,
        lock: {
          images: {
            postgres: { repository: "r", digest: "d", version: "17.2.0" },
            m: {
              repository: "m",
              digest: "e",
              version: "1.0.0",
              uid: 1,
              gid: 1,
            },
          },
        } as unknown as ImagesLockDocument,
        clusterState: {
          capturedAt: "2026-10-30T00:00:00Z",
          bindings: [],
          instances: [ACTIVE],
        } as unknown as ClusterStateDocument,
        union: [],
        project: "data",
        application: "platform-postgres",
      },
    );

    expect(move?.identity).toBe("postgres-move");
    expect(move).not.toHaveProperty("server");
  });
});

describe("an Application the Project it moves out of renders", () => {
  it("renders its source alone: no Move, and none of what the target alone renders", () => {
    const application = {
      id: "vault",
      exposure: [],
      client: {},
      alertRules: [],
      alerting: {},
      dashboards: {},
      migration: {},
      scrape: {},
      processes: [{ name: "vault", move: {}, replicas: 1 }],
    } as unknown as Parameters<typeof departingOf>[0];

    expect(departingOf(application)).toStrictEqual({
      id: "vault",
      scrape: {},
      departing: true,
      processes: [{ name: "vault", replicas: 1 }],
    });
  });
});

describe("where a provider moving out of a namespace still serves", () => {
  const PLATFORM = {
    delivery: { move: { retention: "7d" } },
  } as unknown as PlatformIntentDocument;
  const at = (instance: object, platform = PLATFORM) =>
    departingFromOf(
      {
        capturedAt: "2026-10-30T00:00:00Z",
        bindings: [],
        instances: [instance],
      } as unknown as ClusterStateDocument,
      platform,
      "platform-postgres",
      "postgres",
      "storage-system",
    );
  const FLIPPED = { ...ACTIVE, flippedAt: "2026-10-01T00:00:00Z" };

  it("is the namespace its source runs in, until the source retires", () => {
    expect(at(ACTIVE)).toBe("data-system");
    expect(at(FLIPPED)).toBeUndefined();
    expect(at(FLIPPED, {} as PlatformIntentDocument)).toBe("data-system");
  });

  it("is nowhere else where its Instance runs where it now resolves, or is not recorded", () => {
    expect(at({ ...ACTIVE, namespace: "storage-system" })).toBeUndefined();
    expect(at({ ...ACTIVE, instance: "other" })).toBeUndefined();
  });
});
