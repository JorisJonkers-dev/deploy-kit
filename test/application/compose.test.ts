// REQ-044 (docs/requirements.md): composition at its use-case seam, with
// in-memory fragments built from the worked examples. A clean union composes
// every Project; a refused fragment isolates its Project at its last composed
// fragment; a Pause holds a pin; a Rollback composes the held fragment; and an
// unchanged Project moves no pin (spec/v1/40-composition.md#the-composition-run,
// spec/v1/55-delivery.md#pause-and-rollback).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
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
