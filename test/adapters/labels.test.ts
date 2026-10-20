// Spec chapter 10, the label set: each container's software version is an
// annotation of its pod template, written only where the lock records one.
import { describe, expect, it } from "vitest";
import { podMetadataOf } from "../../src/adapters/shared/labels.ts";

const labels = { "app.kubernetes.io/name": "karakeep" };

describe("a pod template's metadata", () => {
  it("annotates each container the lock records a version for, by container name in order", () => {
    const metadata = podMetadataOf(labels, [
      ["karakeep", "0.33.2"],
      ["meilisearch", "v1.41.0"],
      ["chrome", "124.0"],
      ["vpn", undefined],
    ]);

    expect(metadata.labels).toBe(labels);
    expect(Object.entries(metadata.annotations ?? {})).toStrictEqual([
      ["image.jorisjonkers.dev/chrome", "124.0"],
      ["image.jorisjonkers.dev/karakeep", "0.33.2"],
      ["image.jorisjonkers.dev/meilisearch", "v1.41.0"],
    ]);
  });

  it("carries no annotations where no container has a version", () => {
    expect(podMetadataOf(labels, [["vpn", undefined]])).toStrictEqual({
      labels,
    });
  });
});
