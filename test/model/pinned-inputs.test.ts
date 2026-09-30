// REQ-039 (docs/requirements.md), the inputs' own shapes: the worked images
// lock and ClusterState snapshot read into their models, and each field the
// chapter fixes refuses what it does not admit.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { clusterState } from "../../src/model/cluster-state.ts";
import { imagesLock } from "../../src/model/images-lock.ts";

const PLATFORM = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
  "platform",
);
const worked = (file: string): Record<string, unknown> =>
  parse(readFileSync(join(PLATFORM, file), "utf8")) as Record<string, unknown>;

const LOCK = worked("images.lock.yml");
const STATE = worked("cluster-state.yml");
const IMAGE = {
  repository: "r",
  digest: `sha256:${"a".repeat(64)}`,
  uid: 1,
  gid: 1,
};

describe("the images lock", () => {
  it("reads the worked lock", () => {
    expect(imagesLock.safeParse(LOCK).success).toBe(true);
  });

  it.each([
    "1.0",
    "v1.0.0",
    "1.0.0-rc",
    "10.20.30x",
    "x1.0.0",
    "11.22.333",
    "",
  ])("admits a three-part schemaVersion only: %s", (schemaVersion) => {
    expect(imagesLock.safeParse({ ...LOCK, schemaVersion }).success).toBe(
      schemaVersion === "11.22.333",
    );
  });

  it.each([
    [`sha256:${"a".repeat(64)}`, true],
    [`sha256:${"a".repeat(63)}`, false],
    [`xsha256:${"a".repeat(64)}`, false],
    [`sha256:${"a".repeat(64)}0`, false],
    [`sha512:${"a".repeat(64)}`, false],
  ])("admits one sha256 digest, whole: %s", (digest, admitted) => {
    expect(
      imagesLock.safeParse({ ...LOCK, images: { x: { ...IMAGE, digest } } })
        .success,
    ).toBe(admitted);
  });
});

describe("the ClusterState snapshot", () => {
  it("reads the worked, empty snapshot", () => {
    expect(clusterState.safeParse(STATE).success).toBe(true);
  });

  it.each(["1.0", "1.0.0-rc", "x1.0.0", "11.22.333"])(
    "admits a three-part schemaVersion only: %s",
    (schemaVersion) => {
      expect(clusterState.safeParse({ ...STATE, schemaVersion }).success).toBe(
        schemaVersion === "11.22.333",
      );
    },
  );

  it("records a binding as a claim on a node, and a placement as a Process on one", () => {
    expect(
      clusterState.safeParse({
        ...STATE,
        bindings: [{ claim: "c", node: "n" }],
        placements: [{ process: "p", node: "n" }],
      }).success,
    ).toBe(true);
    expect(
      clusterState.safeParse({ ...STATE, bindings: [{ claim: "c" }] }).success,
    ).toBe(false);
    expect(
      clusterState.safeParse({ ...STATE, placements: [{ node: "n" }] }).success,
    ).toBe(false);
  });
});
