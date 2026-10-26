// REQ-039 (docs/requirements.md), the inputs' own shapes: the worked images
// lock and ClusterState snapshot read into their models, and each field the
// chapter fixes refuses what it does not admit.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { clusterState } from "../../src/model/cluster-state.ts";
import { imagesLock } from "../../src/model/images-lock.ts";
import { readImagesLock } from "../../src/read/pinned-inputs.ts";

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
  version: "1.0.0",
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

// Spec chapter 20, the images lock: every entry records its version.
describe("an images lock entry's version", () => {
  const refused = (images: Record<string, unknown>) => {
    const read = readImagesLock({ ...LOCK, images });
    return read.ok
      ? []
      : read.diagnostics.map(({ code, path }) => `${code} ${path}`);
  };
  const { version: _, ...unversioned } = IMAGE;

  it("is required: an entry without one is refused at its alias, by name", () => {
    const read = readImagesLock({ ...LOCK, images: { x: unversioned } });

    expect(read.ok ? [] : read.diagnostics).toStrictEqual([
      {
        code: "E_IMAGE_VERSION_MISSING",
        path: "/images/x",
        message: "the images lock records no version for x",
        hint: "Record the version of the software in the image, as its org.opencontainers.image.version label names it.",
      },
    ]);
  });

  it("is refused once per entry that lacks it, and never for one that records it", () => {
    expect(refused({ a: unversioned, b: IMAGE, c: unversioned })).toStrictEqual(
      [
        "E_IMAGE_VERSION_MISSING /images/a",
        "E_IMAGE_VERSION_MISSING /images/c",
      ],
    );
  });

  it.each([
    ["empty", ""],
    ["a number", 1],
    ["null", null],
  ])("is a schema refusal where it is present but %s", (_, version) => {
    expect(refused({ x: { ...IMAGE, version } })).toStrictEqual([
      "schema /images/x/version",
    ]);
  });

  it("leaves every other missing field to the schema, reported beside it", () => {
    const { uid: __, ...unowned } = unversioned;

    expect(refused({ x: unowned })).toStrictEqual([
      "E_IMAGE_VERSION_MISSING /images/x",
      "schema /images/x/uid",
    ]);
  });

  it("is no field outside an entry: a lock without a name is the schema's alone", () => {
    const { name: __, ...nameless } = LOCK;

    expect(
      ((read) =>
        read.ok
          ? []
          : read.diagnostics.map(({ code, path }) => `${code} ${path}`))(
        readImagesLock(nameless),
      ),
    ).toStrictEqual(["schema /name"]);
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

  // REQ-109 (docs/requirements.md): the facts a Move is derived from.
  it("records each engine Process's active Instance, and an open Move's phase and when its flip held", () => {
    const active = {
      application: "platform-postgres",
      instance: "postgres",
      version: "17.2.0",
      namespace: "data-system",
      node: "enschede-t1000-1",
    };

    expect(
      clusterState.safeParse({ ...STATE, instances: [active] }).success,
    ).toBe(true);
    expect(
      clusterState.safeParse({
        ...STATE,
        instances: [
          { ...active, phase: "retire", flippedAt: "2026-10-26T12:00:00Z" },
        ],
      }).success,
    ).toBe(true);
    // A phase is one of a Move's steps.
    expect(
      clusterState.safeParse({
        ...STATE,
        instances: [{ ...active, phase: "halfway" }],
      }).success,
    ).toBe(false);
    expect(
      clusterState.safeParse({
        ...STATE,
        instances: [{ ...active, version: undefined }],
      }).success,
    ).toBe(false);
  });

  it("records how each Rollback's backup Job ended, and only that it succeeded or failed", () => {
    const ended = {
      request: "38526643693",
      project: "data",
      job: "postgres-data-backup-38526643693",
      outcome: "succeeded",
      finishedAt: "2026-10-14T10:00:00Z",
    };

    expect(clusterState.safeParse({ ...STATE, backups: [ended] }).success).toBe(
      true,
    );
    expect(
      clusterState.safeParse({
        ...STATE,
        backups: [{ ...ended, outcome: "running" }],
      }).success,
    ).toBe(false);
    expect(
      clusterState.safeParse({
        ...STATE,
        backups: [{ ...ended, finishedAt: undefined }],
      }).success,
    ).toBe(false);
  });
});
