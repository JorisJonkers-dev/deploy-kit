// The Intent Fragment's manifest (spec/v1/40-composition.md#fragments): what
// it records, each field held to the shape the composition lock records it in.
import { describe, expect, it } from "vitest";
import { fragmentManifest } from "../../src/model/fragment.ts";

const MANIFEST = {
  apiVersion: "intent.jorisjonkers.dev/v1",
  kind: "IntentFragment",
  metadata: {
    repository: "JorisJonkers-dev/notes",
    sourceSha: "a".repeat(40),
  },
  spec: {
    schemaVersion: "1.0.0",
    project: "notes",
    version: "1.4.0",
    inputsSha: "b".repeat(64),
  },
};

const accepts = (edit: (manifest: typeof MANIFEST) => unknown): boolean =>
  fragmentManifest.safeParse(edit(structuredClone(MANIFEST))).success;

describe("an Intent Fragment's manifest", () => {
  it("records the repository, commit, project, release and input hash", () => {
    expect(accepts((manifest) => manifest)).toBe(true);
  });

  it.each([
    [
      "a repository with no owner",
      (m: typeof MANIFEST) => ({
        ...m,
        metadata: { ...m.metadata, repository: "notes" },
      }),
    ],
    [
      "a repository below a repository",
      (m: typeof MANIFEST) => ({
        ...m,
        metadata: { ...m.metadata, repository: "a/b/c" },
      }),
    ],
    [
      "a repository after a path",
      (m: typeof MANIFEST) => ({
        ...m,
        metadata: { ...m.metadata, repository: "x/a/b" },
      }),
    ],
    [
      "a commit with a character too many",
      (m: typeof MANIFEST) => ({
        ...m,
        metadata: { ...m.metadata, sourceSha: "a".repeat(41) },
      }),
    ],
    [
      "a commit after a stray character",
      (m: typeof MANIFEST) => ({
        ...m,
        metadata: { ...m.metadata, sourceSha: `g${"a".repeat(40)}` },
      }),
    ],
    [
      "an input hash with a character too many",
      (m: typeof MANIFEST) => ({
        ...m,
        spec: { ...m.spec, inputsSha: "b".repeat(65) },
      }),
    ],
    [
      "an input hash after a stray character",
      (m: typeof MANIFEST) => ({
        ...m,
        spec: { ...m.spec, inputsSha: `g${"b".repeat(64)}` },
      }),
    ],
    [
      "a version with its tag's v",
      (m: typeof MANIFEST) => ({
        ...m,
        spec: { ...m.spec, version: "v1.4.0" },
      }),
    ],
  ])("refuses %s", (_, edit) => {
    expect(accepts(edit)).toBe(false);
  });
});
