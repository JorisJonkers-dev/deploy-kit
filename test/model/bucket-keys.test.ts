// REQ-109 (docs/requirements.md): an edge naming buckets reaches one object
// store, and a Process holds one key grant per store its edges name buckets in
// (spec/v1/16-dependencies.md#the-bucket-catalog).
import { describe, expect, it } from "vitest";
import type { EffectiveProcess } from "../../src/model/effective-intent.ts";
import { bucketStoreOf } from "../../src/model/project-intent-queries.ts";
import { resolveBucketKeys } from "../../src/resolve/credentials.ts";

const union = [
  {
    applications: [
      {
        id: "platform-garage",
        processes: [
          { name: "exporter", provides: { s3: 9100 } },
          { name: "garage", engine: "s3" as const, provides: { s3: 3900 } },
          { name: "cold", engine: "s3" as const, provides: { cold: 3910 } },
          { name: "idle", engine: "s3" as const },
        ],
      },
      {
        id: "elsewhere",
        processes: [
          { name: "garage", engine: "s3" as const, provides: { other: 3900 } },
        ],
      },
    ],
  },
];

describe("bucketStoreOf", () => {
  it.each([
    ["the store's own surface", "platform-garage", "s3", "garage"],
    [
      "another store of the same Application",
      "platform-garage",
      "cold",
      "cold",
    ],
    [
      "a surface no store of that Application provides",
      "elsewhere",
      "s3",
      undefined,
    ],
    ["a surface nothing provides", "platform-garage", "admin", undefined],
  ])("reaches %s", (_, application, surface, store) => {
    expect(bucketStoreOf({ application, surface }, union)).toBe(store);
  });
});

describe("resolveBucketKeys", () => {
  const keysOf = (dependsOn: EffectiveProcess["dependsOn"]) =>
    resolveBucketKeys(
      { name: "api", dependsOn } as unknown as EffectiveProcess,
      { project: "knowledge", union } as unknown as Parameters<
        typeof resolveBucketKeys
      >[1],
    );

  it("grants read on the project's key once per store, synced to the environment", () => {
    expect(
      keysOf([
        { application: "platform-garage", surface: "s3", buckets: ["assets"] },
        { application: "platform-garage", surface: "s3", buckets: ["more"] },
        { application: "platform-garage", surface: "cold", buckets: ["old"] },
      ]),
    ).toStrictEqual([
      {
        path: "secret/data/knowledge/garage/s3",
        keys: ["access-key-id", "secret-access-key"],
        access: "read",
        delivery: "env",
        destination: "api-knowledge-garage-s3",
      },
      {
        path: "secret/data/knowledge/cold/s3",
        keys: ["access-key-id", "secret-access-key"],
        access: "read",
        delivery: "env",
        destination: "api-knowledge-cold-s3",
      },
    ]);
  });

  it("grants nothing for an edge that names no bucket, or reaches no store", () => {
    expect(
      keysOf([
        { application: "platform-garage", surface: "s3" },
        { application: "elsewhere", surface: "s3", buckets: ["assets"] },
      ]),
    ).toStrictEqual([]);
    expect(keysOf(undefined)).toStrictEqual([]);
  });
});
