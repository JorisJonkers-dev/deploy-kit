// REQ-044 (docs/requirements.md): composition at its use-case seam, with
// in-memory fragments built from the worked examples. A clean union composes
// every Project; a refused fragment isolates its Project at its last composed
// fragment; a Pause holds a pin; a Rollback composes the held fragment; and an
// unchanged Project moves no pin (spec/v1/40-composition.md#the-composition-run,
// spec/v1/55-delivery.md#pause-and-rollback).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  composeEstate,
  type ComposeInput,
  type Composition,
  type Fragment,
  type Pin,
} from "../../src/application/compose-estate.ts";
import { PIN_ANNOTATIONS } from "../../src/model/pin-annotations.ts";
import { serialize, sha256Hasher } from "../../src/index.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);
const text = (path: string): string =>
  readFileSync(join(EXAMPLES, path), "utf8");

/** Each Project's fragment: the example directory it is read from, and its files there. */
const PROJECTS: Readonly<Record<string, readonly [string, readonly string[]]>> =
  {
    notes: ["minimal", ["notes.project.yml", "env/notes-api/base.env"]],
    data: [
      "data",
      ["data.project.yml", "env/postgres/base.env", "config/postgresql.conf"],
    ],
    delivery: ["delivery", ["delivery.project.yml"]],
    edge: ["edge", ["edge.project.yml"]],
    observability: ["observability", ["observability.project.yml"]],
    secrets: ["secrets", ["secrets.project.yml"]],
  };

/** The ledger these tests compose under: the Projects whose render the adapters spell, delivered. */
const LEDGER = `handover:
  retireBy: 2027-03-31
  legacy: [auth, data, delivery, edge, knowledge]
  estate: [notes, observability, secrets]
`;
const withLedger = (platform: string, ledger: string): string =>
  platform.replace(/\nhandover:\n(?: {2}.*\n)+/, `\n${ledger}`);

const hex = (seed: unknown, length: number): string =>
  sha256Hasher(seed).slice("sha256:".length, "sha256:".length + length);

/** A release of one Project, its project file passed through `edit`. */
function release(
  project: string,
  version = "1.0.0",
  edit: (text: string) => string = (same) => same,
): Fragment {
  const [directory, names] = PROJECTS[project] as readonly [
    string,
    readonly string[],
  ];
  const files = names.map((name, index) => {
    const body = text(`${directory}/${name}`);
    return { name, text: index === 0 ? edit(body) : body };
  });
  return {
    ref: `ghcr.io/jorisjonkers-dev/intent/${project}@sha256:${hex({ project, version, files }, 64)}`,
    manifest: {
      apiVersion: "intent.jorisjonkers.dev/v1",
      kind: "IntentFragment",
      metadata: {
        repository: `JorisJonkers-dev/${project}`,
        sourceSha: hex({ project, version, commit: true }, 40),
      },
      spec: {
        schemaVersion: "1.0.0",
        project,
        version,
        inputsSha: hex({ project, version, files, inputs: true }, 64),
      },
    },
    files,
  };
}

const PLATFORM: Fragment = {
  ref: `ghcr.io/jorisjonkers-dev/intent/platform@sha256:${hex("platform", 64)}`,
  manifest: {
    apiVersion: "intent.jorisjonkers.dev/v1",
    kind: "IntentFragment",
    metadata: {
      repository: "JorisJonkers-dev/estate",
      sourceSha: hex("platform-commit", 40),
    },
    spec: {
      schemaVersion: "1.0.0",
      project: "jorisjonkers.dev",
      version: "1.0.0",
      inputsSha: hex("platform-inputs", 64),
    },
  },
  files: [
    {
      name: "platform.intent.yml",
      text: withLedger(text("platform/platform.intent.yml"), LEDGER),
    },
    { name: "node-contract.yml", text: text("platform/node-contract.yml") },
    { name: "images.lock.yml", text: text("platform/images.lock.yml") },
  ],
};

const OPTIONS = {
  hash: sha256Hasher,
  serialize,
  schemaPackageIntegrity:
    "sha256:5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b",
  schemaVersion: "1.0.0",
  toolkitVersion: "0.2.0",
  generatedAt: "2026-10-02T09:00:00Z",
};

const RELEASES = Object.keys(PROJECTS).map((project) => release(project));

function compose(input: Partial<ComposeInput> = {}): Composition {
  const result = composeEstate(
    {
      platform: PLATFORM,
      fragments: RELEASES,
      held: [],
      pins: {},
      clusterState: {
        name: "cluster-state.yml",
        text: text("platform/cluster-state.yml"),
      },
      ...input,
    },
    OPTIONS,
  );
  if (!result.ok)
    throw new Error(JSON.stringify(result.diagnostics.map(({ code }) => code)));
  return result.value;
}

/**
 * The first composition: every Project new, nothing pinned. Composed before
 * each test rather than once at import, so a mutation run sees which test
 * reaches which code.
 */
let FIRST: Composition;
beforeEach(() => {
  FIRST = compose();
});

/** Every artifact of a composition, pinned at the content it holds. */
const pinned = (
  composition: Composition,
  annotations: Readonly<Record<string, Pin["annotations"]>> = {},
): Record<string, Pin> =>
  Object.fromEntries(
    composition.artifacts.map(({ name, contentHash }) => [
      name,
      { contentHash, annotations: annotations[name] ?? {} },
    ]),
  );

/** A composition after FIRST: FIRST's lock and pins as the previous ones, its fragments held. */
const after = (input: Partial<ComposeInput>): Composition =>
  compose({
    held: RELEASES,
    pins: pinned(FIRST),
    previous: { lock: FIRST.lock, commit: hex("estate-commit", 40) },
    ...input,
  });

const PAUSE = {
  [PIN_ANNOTATIONS.pausedBy]: "joris",
  [PIN_ANNOTATIONS.pausedAt]: "2026-10-02T08:00:00Z",
  [PIN_ANNOTATIONS.pausedReason]: "a bad release",
};

const broken = (body: string): string =>
  body.replace("surface: http }", "surface: grpc }");
const paged = (body: string): string => body;

describe("composeEstate", () => {
  it("composes a clean union: every delivered Project published, every Project locked at its release", () => {
    expect(FIRST.artifacts.map(({ name, moves }) => [name, moves])).toEqual([
      ["notes", true],
      ["observability", true],
      ["secrets", true],
    ]);
    expect(
      Object.values(FIRST.lock.spec.fragments).map(
        ({ project, version }) => `${project}@${version}`,
      ),
    ).toEqual([
      "data@1.0.0",
      "delivery@1.0.0",
      "edge@1.0.0",
      "jorisjonkers.dev@1.0.0",
      "notes@1.0.0",
      "observability@1.0.0",
      "secrets@1.0.0",
    ]);
    expect(FIRST.lock.spec.fragments.notes?.revisions).toEqual({
      notes:
        "sha256:493fb16ace2e5e7bebf96ea8490f20c2f1dd82fbbf8ce4a9d6b67963b0bcb048",
    });
    expect(FIRST.lock.spec.fragments["jorisjonkers.dev"]?.revisions).toEqual(
      {},
    );
    expect(FIRST.lock.spec.isolated).toBeUndefined();
    expect(FIRST.lock.spec.lockChain).toEqual([]);
    expect(FIRST.lock.spec.previousLockDigest).toBeUndefined();
    expect(FIRST.lock.metadata).toEqual({
      cluster: "production",
      generatedAt: OPTIONS.generatedAt,
    });
    expect(FIRST.lock.spec.toolkitVersion).toBe("0.2.0");
    expect(FIRST.statuses.every(({ state }) => state === "success")).toBe(true);
    expect(FIRST.statuses[0]).toEqual({
      repository: "JorisJonkers-dev/data",
      sha: RELEASES[1]?.manifest.metadata.sourceSha,
      state: "success",
      description: "data 1.0.0 composed",
    });
    expect(FIRST.conditions).toEqual([]);
  });

  it("publishes a Project's share and nothing estate-scoped while a Project is legacy", () => {
    const notes = FIRST.artifacts.find(({ name }) => name === "notes");
    expect(notes?.files.map(({ path }) => path)).toContain(
      "apps/notes/notes/workload.yaml",
    );
    expect(notes?.contentHash).toBe(
      sha256Hasher(
        notes?.files.map(({ path, text: body }) => ({ path, text: body })),
      ),
    );
    expect(FIRST.lock.spec.composedDigest).toBe(
      sha256Hasher(
        FIRST.artifacts.map(({ name, contentHash }) => ({ name, contentHash })),
      ),
    );
  });

  it("composes the same estate whatever order the fragments were pulled in", () => {
    expect(compose({ fragments: [...RELEASES].reverse() })).toEqual(FIRST);
  });

  it("moves no pin for a Project whose render did not change", () => {
    const again = after({});

    expect(again.artifacts.map(({ moves }) => moves)).toEqual([
      false,
      false,
      false,
    ]);
    expect(again.lock.spec.previousLockDigest).toBe(sha256Hasher(FIRST.lock));
    expect(again.lock.spec.lockChain).toEqual([
      {
        digest: sha256Hasher(FIRST.lock),
        commit: hex("estate-commit", 40),
        timestamp: OPTIONS.generatedAt,
      },
    ]);
  });

  it("isolates a refused fragment at the fragment its Project last composed at", () => {
    const refused = release("notes", "1.1.0", broken);
    const composed = after({
      fragments: RELEASES.map((fragment) =>
        fragment.manifest.spec.project === "notes" ? refused : fragment,
      ),
    });

    expect(composed.lock.spec.isolated).toEqual({
      notes: { refused: refused.ref, codes: ["E_UNKNOWN_SURFACE"] },
    });
    expect(composed.lock.spec.fragments.notes?.ref).toBe(RELEASES[0]?.ref);
    expect(composed.artifacts.find(({ name }) => name === "notes")?.moves).toBe(
      false,
    );
    expect(
      composed.statuses.find(({ repository }) => repository.endsWith("/notes")),
    ).toEqual({
      repository: "JorisJonkers-dev/notes",
      sha: refused.manifest.metadata.sourceSha,
      state: "failure",
      description: "notes 1.1.0 isolated: E_UNKNOWN_SURFACE",
    });
    expect(composed.conditions).toEqual([
      {
        project: "notes",
        condition: "isolated",
        title: "notes: 1.1.0 isolated",
        body: `The fragment ${refused.ref} was refused with E_UNKNOWN_SURFACE. notes stays at the fragment it last composed at, and its pin does not move until a release composes.`,
        discord: "notes 1.1.0 isolated: E_UNKNOWN_SURFACE",
      },
    ]);
  });

  it("leaves out a refused Project that has never composed, and composes the rest", () => {
    const refused = release("notes", "1.0.0", broken);
    const composed = compose({
      fragments: RELEASES.map((fragment) =>
        fragment.manifest.spec.project === "notes" ? refused : fragment,
      ),
    });

    expect(composed.artifacts.map(({ name }) => name)).toEqual([
      "observability",
      "secrets",
    ]);
    expect(composed.lock.spec.fragments.notes).toBeUndefined();
    expect(composed.lock.spec.isolated?.notes?.refused).toBe(refused.ref);
  });

  it("isolates every changed fragment an error names, each with its own codes", () => {
    const notes = release("notes", "1.1.0", broken);
    const secrets = release("secrets", "1.1.0", (body) =>
      body.replace("project: secrets", "project: secrets\nbogus: true"),
    );
    // Pulled in reverse, so secrets is refused first, and still reported second.
    const composed = after({
      fragments: RELEASES.map((fragment) => {
        const { project } = fragment.manifest.spec;
        return project === "notes"
          ? notes
          : project === "secrets"
            ? secrets
            : fragment;
      }).reverse(),
    });

    expect(Object.keys(composed.lock.spec.isolated ?? {}).sort()).toEqual([
      "notes",
      "secrets",
    ]);
    expect(
      composed.statuses.map(({ repository }) => repository.split("/")[1]),
    ).toEqual([
      "data",
      "delivery",
      "edge",
      "estate",
      "notes",
      "observability",
      "secrets",
    ]);
    expect(composed.conditions.map(({ project }) => project)).toEqual([
      "notes",
      "secrets",
    ]);
  });

  it("names every code that refused a fragment, in the order the checks found them", () => {
    const refused = release("notes", "1.1.0", (body) =>
      broken(body).replace(
        "process: notes-api\n        surface: http",
        "process: ghost\n        surface: http",
      ),
    );
    const composed = after({
      fragments: RELEASES.map((fragment) =>
        fragment.manifest.spec.project === "notes" ? refused : fragment,
      ),
    });
    const codes = composed.lock.spec.isolated?.notes?.codes ?? [];

    expect(codes).toHaveLength(2);
    expect(composed.conditions[0]?.discord).toBe(
      `notes 1.1.0 isolated: ${codes.join(", ")}`,
    );
    expect(composed.conditions[0]?.body).toContain(
      `was refused with ${codes.join(", ")}.`,
    );
    expect(
      composed.statuses.find(({ state }) => state === "failure")?.description,
    ).toBe(`notes 1.1.0 isolated: ${codes.join(", ")}`);
  });

  it("reports every held Project in name order, whatever order its pins were read in", () => {
    const composed = after({
      // Read secrets first, so name order is not read order.
      pins: {
        secrets: { ...(pinned(FIRST).secrets as Pin), annotations: PAUSE },
        observability: pinned(FIRST).observability as Pin,
        notes: { ...(pinned(FIRST).notes as Pin), annotations: PAUSE },
      },
    });

    expect(composed.conditions.map(({ project }) => project)).toEqual([
      "notes",
      "secrets",
    ]);
  });

  it("delivers nothing while the ledger hands no Project to the estate path", () => {
    const composed = compose({
      platform: {
        ...PLATFORM,
        files: PLATFORM.files.map((file) =>
          file.name === "platform.intent.yml"
            ? {
                ...file,
                text: withLedger(
                  file.text,
                  "handover:\n  retireBy: 2027-03-31\n  legacy: [auth, data, delivery, edge, knowledge, notes, observability, secrets]\n",
                ),
              }
            : file,
        ),
      },
    });

    expect(composed.artifacts).toEqual([]);
    expect(Object.keys(composed.lock.spec.fragments)).toHaveLength(7);
  });

  it("holds a paused Project's pin, though its newest fragment composes", () => {
    const changed = release("notes", "1.1.0", (body) =>
      body.replace("memory: 256Mi", "memory: 320Mi"),
    );
    const composed = after({
      fragments: RELEASES.map((fragment) =>
        fragment.manifest.spec.project === "notes" ? changed : fragment,
      ),
      pins: pinned(FIRST, { notes: PAUSE }),
    });

    expect(composed.lock.spec.fragments.notes?.ref).toBe(changed.ref);
    expect(composed.artifacts.find(({ name }) => name === "notes")?.moves).toBe(
      false,
    );
    expect(composed.conditions).toEqual([
      {
        project: "notes",
        condition: "paused",
        title: "notes: paused",
        body: "Paused by joris at 2026-10-02T08:00:00Z: a bad release. Composition checks its newest fragment and moves no pin until it is resumed.",
        discord: "notes paused by joris: a bad release",
      },
    ]);
  });

  it("composes a rolled-back Project at its held fragment, and moves no pin", () => {
    const newest = release("notes", "1.1.0", paged);
    const composed = after({
      fragments: RELEASES.map((fragment) =>
        fragment.manifest.spec.project === "notes" ? newest : fragment,
      ),
      pins: pinned(FIRST, {
        notes: {
          ...PAUSE,
          [PIN_ANNOTATIONS.rollbackVersion]: "1.0.0",
          [PIN_ANNOTATIONS.rollbackFragment]: RELEASES[0]?.ref as string,
        },
      }),
    });

    expect(composed.lock.spec.fragments.notes?.version).toBe("1.0.0");
    expect(composed.lock.spec.fragments.notes?.ref).toBe(RELEASES[0]?.ref);
    expect(
      composed.statuses.find(({ repository }) => repository.endsWith("/notes"))
        ?.description,
    ).toBe("notes 1.1.0 held: rolled back to 1.0.0");
    expect(composed.conditions).toEqual([
      {
        project: "notes",
        condition: "rolled-back",
        title: "notes: rolled back to 1.0.0",
        body: "Rolled back to 1.0.0 by joris at 2026-10-02T08:00:00Z: a bad release. It is composed at that release's fragment and moves no pin until it is resumed.",
        discord: "notes rolled back to 1.0.0 by joris: a bad release",
      },
    ]);
  });

  it("fails the run on an error that names no changed fragment", () => {
    const unchangedButBroken = release("notes", "1.0.0", broken);
    const result = composeEstate(
      {
        platform: PLATFORM,
        fragments: RELEASES.map((fragment) =>
          fragment.manifest.spec.project === "notes"
            ? unchangedButBroken
            : fragment,
        ),
        held: RELEASES,
        pins: {},
        clusterState: {
          name: "cluster-state.yml",
          text: text("platform/cluster-state.yml"),
        },
        previous: {
          lock: {
            ...FIRST.lock,
            spec: {
              ...FIRST.lock.spec,
              fragments: {
                ...FIRST.lock.spec.fragments,
                notes: {
                  ...(FIRST.lock.spec.fragments.notes as NonNullable<
                    (typeof FIRST.lock.spec.fragments)["notes"]
                  >),
                  ref: unchangedButBroken.ref,
                },
              },
            },
          },
          commit: hex("estate-commit", 40),
        },
      },
      OPTIONS,
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.diagnostics.map(({ code }) => code)).toEqual(
      ["E_UNKNOWN_SURFACE"],
    );
  });

  it("fails the run on an error that names no document, such as two adapters claiming one path", () => {
    const claims = (name: string) => ({
      name,
      defaultPath: "apps/notes/claimed.yaml",
      render: () => [
        { path: "apps/notes/claimed.yaml", adapter: name, objects: [] },
      ],
    });
    const result = composeEstate(
      {
        platform: PLATFORM,
        fragments: RELEASES,
        held: [],
        pins: {},
        clusterState: {
          name: "cluster-state.yml",
          text: text("platform/cluster-state.yml"),
        },
      },
      { ...OPTIONS, adapters: [claims("one"), claims("two")] },
    );

    expect(result.ok ? [] : result.diagnostics.map(({ code }) => code)).toEqual(
      ["E_PATH_COLLISION"],
    );
  });

  it("fails the run on a refused Platform document, which nothing isolates", () => {
    const result = composeEstate(
      {
        platform: {
          ...PLATFORM,
          files: PLATFORM.files.map((file) =>
            file.name === "platform.intent.yml"
              ? {
                  ...file,
                  text: withLedger(
                    file.text,
                    `handover:\n  retireBy: 2027-03-31\n  legacy: [data, delivery, edge]\n  estate: [notes, observability, secrets, data]\n`,
                  ),
                }
              : file,
          ),
        },
        fragments: RELEASES,
        held: [],
        pins: {},
        clusterState: {
          name: "cluster-state.yml",
          text: text("platform/cluster-state.yml"),
        },
      },
      OPTIONS,
    );

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, document }) => [code, document]),
    ).toEqual([["E_HANDOVER_BOTH_PATHS", "_platform/platform.intent.yml"]]);
  });

  it("asks for every held fragment a reference names, and composes every Project when no ledger is kept", () => {
    expect(() =>
      after({
        held: [],
        pins: pinned(FIRST, {
          notes: {
            ...PAUSE,
            [PIN_ANNOTATIONS.rollbackVersion]: "1.0.0",
            [PIN_ANNOTATIONS.rollbackFragment]: RELEASES[0]?.ref as string,
          },
        }),
      }),
    ).toThrow("a held fragment the caller did not supply");
    // With no ledger, every Project is delivered, the delivery machinery too,
    // which no adapter spells yet (JorisJonkers-dev/deploy-kit#202).
    expect(() =>
      compose({
        platform: {
          ...PLATFORM,
          files: PLATFORM.files.map((file) =>
            file.name === "platform.intent.yml"
              ? { ...file, text: withLedger(file.text, "") }
              : file,
          ),
        },
      }),
    ).toThrow("is not rendered yet");
  });
});

// REQ-047 (docs/requirements.md): composition unions every fragment's share of
// the images lock into the one lock resolution reads
// (spec/v1/40-composition.md#fragments).
describe("composeEstate, over the fragments' shares of the images lock", () => {
  interface Locked {
    repository: string;
    digest: string;
    uid: number;
    gid: number;
  }
  interface Lock {
    name: string;
    images: Record<string, Locked>;
  }
  const ESTATE_LOCK = parse(text("platform/images.lock.yml")) as Lock;
  const NOTES_API = ESTATE_LOCK.images["notes-api"] as Locked;

  /** A lock file as a fragment carries it. */
  const lockFile = (name: string, images: Lock["images"]) => ({
    name: "images.lock.yml",
    text: stringify({ ...ESTATE_LOCK, name, images }),
  });

  /** The Platform document's fragment, its lock holding everything but one Project's image. */
  const PLATFORM_WITHOUT_NOTES: Fragment = {
    ...PLATFORM,
    files: PLATFORM.files.map((file) =>
      file.name === "images.lock.yml"
        ? lockFile(
            "estate",
            Object.fromEntries(
              Object.entries(ESTATE_LOCK.images).filter(
                ([alias]) => alias !== "notes-api",
              ),
            ),
          )
        : file,
    ),
  };

  /** A release of notes that carries its share. */
  const notesWith = (version: string, locked: Locked | string): Fragment => {
    const fragment = release("notes", version);
    const share =
      typeof locked === "string"
        ? { name: "images.lock.yml", text: locked }
        : lockFile("notes", { "notes-api": locked });
    return {
      ...fragment,
      ref: `${fragment.ref.slice(0, -8)}${hex(share.text, 8)}`,
      files: [...fragment.files, share],
    };
  };
  const others = RELEASES.filter(
    ({ manifest }) => manifest.spec.project !== "notes",
  );
  const artifact = (composition: Composition, name: string) =>
    composition.artifacts.find((candidate) => candidate.name === name);

  it("resolves a Project's image from the share its own fragment carries", () => {
    const composed = compose({
      platform: PLATFORM_WITHOUT_NOTES,
      fragments: [notesWith("1.0.0", NOTES_API), ...others],
    });

    // The same images, locked across two fragments instead of one, render
    // the same objects.
    expect(composed.lock.spec.isolated).toBeUndefined();
    expect(artifact(composed, "notes")?.files).toEqual(
      artifact(FIRST, "notes")?.files,
    );
  });

  it("leaves a Project's image unlocked when no fragment carries it", () => {
    const composed = compose({
      platform: PLATFORM_WITHOUT_NOTES,
      fragments: RELEASES,
    });

    expect(composed.lock.spec.isolated?.notes?.codes).toEqual([
      "E_UNLOCKED_IMAGE",
    ]);
    expect(artifact(composed, "notes")).toBeUndefined();
  });

  it("renders the image a changed share locks, when nothing else locks the alias", () => {
    const bumped = { ...NOTES_API, digest: `sha256:${"7".repeat(64)}` };
    const first = compose({
      platform: PLATFORM_WITHOUT_NOTES,
      fragments: [notesWith("1.0.0", NOTES_API), ...others],
    });
    const composed = compose({
      platform: PLATFORM_WITHOUT_NOTES,
      fragments: [notesWith("1.1.0", bumped), ...others],
      held: [notesWith("1.0.0", NOTES_API), ...others],
      pins: pinned(first),
      previous: { lock: first.lock, commit: hex("estate-commit", 40) },
    });

    expect(composed.lock.spec.isolated).toBeUndefined();
    expect(artifact(composed, "notes")?.moves).toBe(true);
    expect(
      artifact(composed, "notes")?.files.some(({ text: body }) =>
        body.includes(bumped.digest),
      ),
    ).toBe(true);
  });

  it("isolates a changed fragment whose share locks an alias another fragment locks differently", () => {
    const conflicting = notesWith("1.1.0", {
      ...NOTES_API,
      digest: `sha256:${"7".repeat(64)}`,
    });
    const composed = after({
      fragments: [conflicting, ...others],
    });

    expect(composed.lock.spec.isolated).toEqual({
      notes: { refused: conflicting.ref, codes: ["E_IMAGE_LOCK_CONFLICT"] },
    });
    expect(composed.lock.spec.fragments.notes?.ref).toBe(RELEASES[0]?.ref);
    expect(artifact(composed, "notes")?.moves).toBe(false);
  });

  it("isolates a changed fragment whose share cannot be read", () => {
    const unreadable = notesWith("1.1.0", "images: [");
    const composed = after({ fragments: [unreadable, ...others] });

    expect(composed.lock.spec.isolated?.notes?.refused).toBe(unreadable.ref);
    expect(composed.lock.spec.fragments.notes?.ref).toBe(RELEASES[0]?.ref);
  });

  it("fails the run when the share of a fragment that already composed is what disagrees", () => {
    // notes composed with this share, so it is not what changed: the
    // Platform document's lock is, and nothing isolates the platform.
    const shared = notesWith("1.0.0", NOTES_API);
    const first = compose({ fragments: [shared, ...others] });
    const moved: Fragment = {
      ...PLATFORM,
      files: PLATFORM.files.map((file) =>
        file.name === "images.lock.yml"
          ? lockFile("estate", {
              ...ESTATE_LOCK.images,
              "notes-api": { ...NOTES_API, uid: 2000 },
            })
          : file,
      ),
    };
    const result = composeEstate(
      {
        platform: moved,
        fragments: [shared, ...others],
        held: [shared, ...others],
        pins: pinned(first),
        clusterState: {
          name: "cluster-state.yml",
          text: text("platform/cluster-state.yml"),
        },
        previous: { lock: first.lock, commit: hex("estate-commit", 40) },
      },
      OPTIONS,
    );

    expect(result.ok).toBe(false);
    expect(
      !result.ok &&
        result.diagnostics.map(({ code, document }) => [code, document]),
    ).toEqual([
      ["E_IMAGE_LOCK_CONFLICT", "_platform/images.lock.yml"],
      ["E_IMAGE_LOCK_CONFLICT", "notes/images.lock.yml"],
    ]);
  });

  it("never resolves another Project, or the Platform document, from a fragment's share", () => {
    // notes now runs the image the Platform document's postgres backup names,
    // and locks it in its own share. The platform's own lock no longer holds
    // it, and the platform's files arrive in another order.
    const squatting: Fragment = {
      ...release("notes", "1.0.0", (body) =>
        body.replace("image: notes-api", "image: postgres-backup"),
      ),
    };
    const share = lockFile("notes", {
      "postgres-backup": ESTATE_LOCK.images["postgres-backup"] as Locked,
    });
    const result = composeEstate(
      {
        platform: {
          ...PLATFORM,
          files: PLATFORM.files
            .map((file) =>
              file.name === "images.lock.yml"
                ? lockFile(
                    "estate",
                    Object.fromEntries(
                      Object.entries(ESTATE_LOCK.images).filter(
                        ([alias]) => alias !== "postgres-backup",
                      ),
                    ),
                  )
                : file,
            )
            .reverse(),
        },
        fragments: [
          { ...squatting, files: [...squatting.files, share] },
          ...others,
        ],
        held: [],
        pins: {},
        clusterState: {
          name: "cluster-state.yml",
          text: text("platform/cluster-state.yml"),
        },
      },
      OPTIONS,
    );

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "E_UNLOCKED_IMAGE",
          document: "_platform/platform.intent.yml",
          message:
            "no lock this document is resolved from holds an entry for postgres-backup",
        }),
      ],
    });
  });

  it("reads names from the project file and the Platform document, and from no other file a fragment holds", () => {
    // A file that would parse as a project file naming vault, beside a share
    // that locks vault to another image: not the project file, so the share
    // is not read for vault and disagrees with nothing.
    const fragment = release("notes", "1.1.0");
    const decoy: Fragment = {
      ...fragment,
      files: [
        ...fragment.files,
        {
          name: "config/decoy.yml",
          text: text("minimal/notes.project.yml").replace(
            "image: notes-api",
            "image: vault",
          ),
        },
        lockFile("notes", {
          "notes-api": NOTES_API,
          vault: { ...NOTES_API, digest: `sha256:${"7".repeat(64)}` },
        }),
      ],
    };
    // And a file beside the Platform document that would parse as one naming
    // a backup image nothing locks.
    const drafted: Fragment = {
      ...PLATFORM,
      files: [
        {
          name: "platform.intent.yml.draft",
          text: withLedger(
            text("platform/platform.intent.yml"),
            LEDGER,
          ).replace("backup: postgres-backup", "backup: unlocked-backup"),
        },
        ...PLATFORM.files,
      ],
    };
    const composed = after({
      platform: drafted,
      fragments: [decoy, ...others],
    });

    expect(composed.lock.spec.isolated).toBeUndefined();
    expect(composed.lock.spec.fragments.notes?.ref).toBe(decoy.ref);
  });

  it("isolates a changed fragment whose project file cannot be read, share and all", () => {
    const fragment = release("notes", "1.1.0", () => "kind: [");
    const unreadable: Fragment = {
      ...fragment,
      files: [...fragment.files, lockFile("notes", { "notes-api": NOTES_API })],
    };
    const composed = after({ fragments: [unreadable, ...others] });

    expect(composed.lock.spec.isolated?.notes?.refused).toBe(unreadable.ref);
    expect(composed.lock.spec.fragments.notes?.ref).toBe(RELEASES[0]?.ref);
  });

  it("fails the run on a Platform document's lock that cannot be read", () => {
    const result = composeEstate(
      {
        platform: {
          ...PLATFORM,
          files: PLATFORM.files.map((file) =>
            file.name === "images.lock.yml"
              ? { name: file.name, text: "images: [" }
              : file,
          ),
        },
        fragments: RELEASES,
        held: [],
        pins: {},
        clusterState: {
          name: "cluster-state.yml",
          text: text("platform/cluster-state.yml"),
        },
      },
      OPTIONS,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics[0]?.document).toBe(
      "_platform/images.lock.yml",
    );
  });

  it("composes with no lock beside the Platform document, every alias then unlocked", () => {
    const result = composeEstate(
      {
        platform: {
          ...PLATFORM,
          files: PLATFORM.files.filter(
            ({ name }) => name !== "images.lock.yml",
          ),
        },
        fragments: RELEASES,
        held: [],
        pins: {},
        clusterState: {
          name: "cluster-state.yml",
          text: text("platform/cluster-state.yml"),
        },
      },
      OPTIONS,
    );

    // The images the Platform document itself names are unlocked too, and
    // nothing isolates the platform.
    expect(result.ok).toBe(false);
    expect(
      !result.ok &&
        result.diagnostics.some(
          ({ code, document }) =>
            code === "E_UNLOCKED_IMAGE" &&
            document === "_platform/platform.intent.yml",
        ),
    ).toBe(true);
  });
});
