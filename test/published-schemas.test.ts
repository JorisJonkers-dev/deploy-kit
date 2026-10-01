// REQ-041 (docs/requirements.md): every document the toolkit writes for a
// consumer outside this repository has a committed JSON Schema, generated from
// the model, shipped in the package, and holding every committed oracle of it.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  compositionLock,
  type CompositionLockDocument,
} from "../src/model/composition-lock.ts";
import { DRAFT } from "../src/model/json-schema.ts";
import {
  PIN_ANNOTATIONS,
  pinAnnotations,
} from "../src/model/pin-annotations.ts";
import { PUBLISHED_SCHEMAS, publishedJsonSchema } from "../src/index.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const read = (path: string): string =>
  readFileSync(join(REPOSITORY, path), "utf8");

const schemaAt = (path: string): object => {
  const found = PUBLISHED_SCHEMAS.find((published) => published.path === path);
  if (found === undefined) throw new Error(`no published schema at ${path}`);
  return JSON.parse(publishedJsonSchema(found)) as object;
};

// Compiled inside each test, never while the file is collected: a schema that
// fails to generate must fail the test that reads it, not the whole file.
const compiled = (path: string) =>
  new Ajv2020({ strict: true, validateFormats: false }).compile(schemaAt(path));

const validator =
  (path: string) =>
  (data: unknown): boolean =>
    compiled(path)(data);

/** Every committed Resolved Deployment projection under the worked examples. */
function resolvedOracles(): string[] {
  const examples = join(REPOSITORY, "spec", "v1", "examples");
  return readdirSync(examples, { recursive: true, encoding: "utf8" })
    .filter((path) =>
      /(^|\/)expected\/resolved(\.[a-z0-9-]+)?\.json$/.test(path),
    )
    .map((path) => relative(REPOSITORY, join(examples, path)))
    .sort();
}

const DIGEST = `sha256:${"a".repeat(64)}`;
const COMMIT = "b".repeat(40);
const REF = `ghcr.io/jorisjonkers-dev/intent-knowledge@${DIGEST}`;

const LOCK: CompositionLockDocument = {
  apiVersion: "resolved.jorisjonkers.dev/v1",
  kind: "CompositionLock",
  metadata: { cluster: "production", generatedAt: "2026-10-01T12:00:00Z" },
  spec: {
    schemaVersion: "1.0.0",
    toolkitVersion: "0.22.0",
    composedDigest: DIGEST,
    previousLockDigest: DIGEST,
    lockChain: [
      { digest: DIGEST, commit: COMMIT, timestamp: "2026-10-01T12:00:00Z" },
    ],
    fragments: {
      "intent-knowledge": {
        ref: REF,
        project: "knowledge",
        repository: "JorisJonkers-dev/knowledge",
        schemaVersion: "1.0.0",
        version: "2.1.2",
        revisions: { knowledge: DIGEST, "knowledge-ingest": DIGEST },
        sourceSha: COMMIT,
        inputsSha: "c".repeat(64),
      },
    },
    isolated: { data: { refused: REF, codes: ["E_CUTOVER_UNHONOURABLE"] } },
    clusterStateDigest: DIGEST,
  },
};

const PAUSE = {
  [PIN_ANNOTATIONS.pausedBy]: "joris",
  [PIN_ANNOTATIONS.pausedAt]: "2026-10-01T12:00:00+02:00",
  [PIN_ANNOTATIONS.pausedReason]: "the 2.1.3 release corrupts thumbnails",
};

const ROLLBACK = {
  ...PAUSE,
  [PIN_ANNOTATIONS.rollbackVersion]: "2.1.2",
  [PIN_ANNOTATIONS.rollbackFragment]: REF,
};

describe("the published JSON Schemas", () => {
  it.each(PUBLISHED_SCHEMAS.map((published) => [published.path, published]))(
    "%s regenerates without a diff",
    (path, published) => {
      expect(publishedJsonSchema(published)).toBe(read(path));
    },
  );

  it("are published under spec/, which the package ships, at these paths", () => {
    const { files } = JSON.parse(read("package.json")) as { files: string[] };

    expect(files).toContain("spec/");
    expect(PUBLISHED_SCHEMAS.map(({ path }) => path)).toStrictEqual([
      "spec/v1/schemas/resolved-deployment.schema.json",
      "spec/v1/schemas/resolved-application.schema.json",
      "spec/v1/schemas/composition-lock.schema.json",
      "spec/v1/schemas/pin-annotations.schema.json",
      "spec/v1/schemas/cluster-state-snapshot.schema.json",
    ]);
  });

  it("declare the draft they are written against", () => {
    for (const published of PUBLISHED_SCHEMAS)
      expect(
        publishedJsonSchema(published).split("\n").slice(0, 2),
      ).toStrictEqual(["{", `  "$schema": "${DRAFT}",`]);
  });

  it("are the output variant, so a consumer reads what the toolkit wrote", () => {
    const schema = schemaAt(
      "spec/v1/schemas/resolved-deployment.schema.json",
    ) as {
      $ref: string;
      $defs: Record<string, { required?: string[] }>;
    };

    expect(schema.$ref).toBe("#/$defs/ResolvedDeployment");
    expect(schema.$defs["ResolvedDeployment"]?.required).toStrictEqual([
      "apiVersion",
      "kind",
      "provenance",
      "pathPlan",
      "reconcileUnits",
      "applications",
    ]);
  });
});

describe("the Resolved Deployment schema", () => {
  const valid = validator("spec/v1/schemas/resolved-application.schema.json");

  it("finds the committed projections it holds", () => {
    expect(resolvedOracles()).toContain(
      "spec/v1/examples/minimal/expected/resolved.json",
    );
    expect(resolvedOracles()).toContain(
      "spec/v1/examples/knowledge/expected/resolved.knowledge-ingest.json",
    );
  });

  it.each(resolvedOracles())("holds %s", (path) => {
    const check = compiled("spec/v1/schemas/resolved-application.schema.json");

    expect(check(JSON.parse(read(path))), JSON.stringify(check.errors)).toBe(
      true,
    );
  });

  it("refuses a projection with a field the model does not have", () => {
    const projection = JSON.parse(
      read("spec/v1/examples/minimal/expected/resolved.json"),
    ) as object;

    expect(valid({ ...projection, replicas: 3 })).toBe(false);
  });
});

describe("the composition lock", () => {
  const valid = validator("spec/v1/schemas/composition-lock.schema.json");

  it("holds a lock with a released fragment and an isolated Project", () => {
    expect(compositionLock.parse(LOCK)).toStrictEqual(LOCK);
    expect(valid(LOCK)).toBe(true);
  });

  it("holds a reference through a registry port", () => {
    const ref = `registry.local:5000/intent-knowledge@${DIGEST}`;
    const fragment = { ...LOCK.spec.fragments["intent-knowledge"], ref };
    const lock = {
      ...LOCK,
      spec: { ...LOCK.spec, fragments: { "intent-knowledge": fragment } },
    };

    expect(compositionLock.safeParse(lock).success).toBe(true);
    expect(valid(lock)).toBe(true);
  });

  it("holds a first lock, with no previous lock and nothing isolated", () => {
    const { previousLockDigest: _, isolated: __, ...spec } = LOCK.spec;

    expect(compositionLock.safeParse({ ...LOCK, spec }).success).toBe(true);
  });

  it.each([
    ["a fragment with no version", { version: undefined }],
    ["a version that is not semver", { version: "v2.1.2" }],
    ["a version with a suffix", { version: "2.1.2-rc.1" }],
    [
      "a reference by tag",
      { ref: "ghcr.io/jorisjonkers-dev/intent-knowledge:2.1.2" },
    ],
    [
      "a reference by tag and digest",
      { ref: `ghcr.io/jorisjonkers-dev/intent-knowledge:2.1.2@${DIGEST}` },
    ],
    [
      "a reference with no repository path",
      { ref: `intent-knowledge@${DIGEST}` },
    ],
    ["a revision that is not a digest", { revisions: { knowledge: "2.1.2" } }],
    ["a reference with a short digest", { ref: `${REF}0`.slice(0, -2) }],
    ["a reference with nothing before the digest", { ref: `@${DIGEST}` }],
    ["a repository with no owner", { repository: "knowledge" }],
    [
      "a repository with a path",
      { repository: "JorisJonkers-dev/knowledge/x" },
    ],
    ["a short commit", { sourceSha: "22b9d33" }],
    ["an upper-case commit", { sourceSha: "B".repeat(40) }],
    ["an inputs hash with a prefix", { inputsSha: `sha256:${"c".repeat(64)}` }],
    ["an inputs hash too short", { inputsSha: "c".repeat(63) }],
  ])("refuses %s", (_, change) => {
    const fragment = { ...LOCK.spec.fragments["intent-knowledge"], ...change };
    const lock = {
      ...LOCK,
      spec: { ...LOCK.spec, fragments: { "intent-knowledge": fragment } },
    };

    expect(compositionLock.safeParse(lock).success).toBe(false);
    expect(valid(JSON.parse(JSON.stringify(lock)))).toBe(false);
  });

  it.each([
    ["an isolation with no codes", { refused: REF, codes: [] }],
    [
      "an isolation naming something not a code",
      { refused: REF, codes: ["W_X"] },
    ],
    [
      "an isolation naming a lower-case code",
      { refused: REF, codes: ["E_dup"] },
    ],
    [
      "an isolation refusing a tag",
      { refused: "intent-data:1.0.0", codes: ["E_X"] },
    ],
  ])("refuses %s", (_, isolation) => {
    const lock = {
      ...LOCK,
      spec: { ...LOCK.spec, isolated: { data: isolation } },
    };

    expect(compositionLock.safeParse(lock).success).toBe(false);
    expect(valid(lock)).toBe(false);
  });

  it.each([
    [
      "a composed digest of another algorithm",
      { composedDigest: `sha512:${"a".repeat(64)}` },
    ],
    ["a composed digest too long", { composedDigest: `${DIGEST}a` }],
    ["a toolkit version that is not exact", { toolkitVersion: "^0.22.0" }],
  ])("refuses %s", (_, change) => {
    const lock = { ...LOCK, spec: { ...LOCK.spec, ...change } };

    expect(compositionLock.safeParse(lock).success).toBe(false);
    expect(valid(lock)).toBe(false);
  });
});

describe("the pin annotations", () => {
  const valid = validator("spec/v1/schemas/pin-annotations.schema.json");

  it.each([
    ["a Project that is not paused", {}],
    ["a Pause", PAUSE],
    ["a Rollback, which is also a Pause", ROLLBACK],
  ])("hold %s", (_, annotations) => {
    expect(pinAnnotations.parse(annotations)).toStrictEqual(annotations);
    expect(valid(annotations)).toBe(true);
  });

  it.each([
    [
      "a Pause with no reason",
      { ...PAUSE, [PIN_ANNOTATIONS.pausedReason]: "" },
    ],
    [
      "a Pause at no time",
      { ...PAUSE, [PIN_ANNOTATIONS.pausedAt]: "yesterday" },
    ],
    [
      "a Rollback that does not pause",
      {
        [PIN_ANNOTATIONS.rollbackVersion]: "2.1.2",
        [PIN_ANNOTATIONS.rollbackFragment]: REF,
      },
    ],
    [
      "a Rollback to a tag",
      { ...ROLLBACK, [PIN_ANNOTATIONS.rollbackVersion]: "v2.1.2" },
    ],
    [
      "a Rollback to a release suffixed",
      { ...ROLLBACK, [PIN_ANNOTATIONS.rollbackVersion]: "2.1.2-rc.1" },
    ],
    [
      "a Rollback to a fragment by tag",
      { ...ROLLBACK, [PIN_ANNOTATIONS.rollbackFragment]: "intent-data:2.1.2" },
    ],
    ["an annotation of someone else's", { ...PAUSE, "example.com/x": "y" }],
  ])("refuse %s", (_, annotations) => {
    expect(pinAnnotations.safeParse(annotations).success).toBe(false);
    expect(valid(annotations)).toBe(false);
  });

  it("are the five keys the spec names, under the estate's prefix", () => {
    expect(Object.values(PIN_ANNOTATIONS)).toStrictEqual([
      "estate.jorisjonkers.dev/paused-by",
      "estate.jorisjonkers.dev/paused-at",
      "estate.jorisjonkers.dev/paused-reason",
      "estate.jorisjonkers.dev/rollback-version",
      "estate.jorisjonkers.dev/rollback-fragment",
    ]);
  });
});
