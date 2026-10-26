// REQ-112 (docs/requirements.md): a change an engine's data cannot follow in
// place derives a Move, whose reversibility and retirement are derived too.
import { describe, expect, it } from "vitest";
import type { ClusterStateDocument } from "../../src/model/cluster-state.ts";
import type { ImagesLockDocument } from "../../src/model/images-lock.ts";
import type { PlatformIntentDocument } from "../../src/model/platform-intent.ts";
import {
  activeInstanceOf,
  boundToOf,
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
