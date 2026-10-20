// REQ-044 (docs/requirements.md): composition at its use-case seam, with
// in-memory fragments built from the worked examples. A clean union composes
// every Project; a refused fragment isolates its Project at its last composed
// fragment; a Pause holds a pin; a Rollback composes the held fragment; and an
// unchanged Project moves no pin (spec/v1/40-composition.md#the-composition-run,
// spec/v1/55-delivery.md#pause-and-rollback).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { parse, parseAllDocuments, stringify } from "yaml";
import {
  composeEstate,
  type ComposeInput,
  type Composition,
  type Fragment,
  type Pin,
} from "../../src/application/compose-estate.ts";
import { pinSources } from "../../src/application/pin-sources.ts";
import {
  RECREATE_DEPLOYMENTS,
  versionPatches,
} from "../../src/adapters/flux/source.ts";
import { PIN_ANNOTATIONS } from "../../src/model/pin-annotations.ts";
import {
  rolloutAnnotations,
  rolloutUrlOf,
  type Rollout,
} from "../../src/model/rollout.ts";
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
/** The line of the worked Platform document that names its Reporter. */
const REPORTER = "  reporter: reporter\n";
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
      // Without a Reporter, so the estate-scoped artifact holds what each
      // test below gives it; the Reporter's own tests name one again.
      text: withLedger(
        text("platform/platform.intent.yml").replace(REPORTER, ""),
        LEDGER,
      ),
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

/**
 * A participants list that expects exactly these fragments and the Platform
 * document's, each published as the composition runs.
 */
const expecting = (
  fragments: readonly Fragment[],
  platform: Fragment = PLATFORM,
): Pick<ComposeInput, "participants" | "published"> => {
  const projects = [platform, ...fragments].map(
    ({ manifest }) => manifest.spec.project,
  );
  return {
    participants: {
      participants: Object.fromEntries(projects.map((name) => [name, {}])),
    },
    published: Object.fromEntries(
      projects.map((name) => [name, OPTIONS.generatedAt]),
    ),
  };
};

const EXPECTED = expecting(RELEASES);

function compose(input: Partial<ComposeInput> = {}): Composition {
  const result = composeEstate(
    {
      ...EXPECTED,
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
        "sha256:08cba86a5a74fdd40eb2e8baf0fc2c7120f1e0bd2f5949bb854b9d6270302d62",
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
    // The content hash covers the share as rendered: the index the artifact
    // carries is the rendered one with the release's label patches added.
    const index = "apps/notes/kustomization.yaml";
    const rendered = notes?.files.map(({ path, text: body }) => ({
      path,
      text:
        path === index
          ? serialize(
              [
                (({ patches: _, ...rest }) => rest)(
                  parse(body) as Record<string, unknown>,
                ) as never,
              ],
              index,
            )
          : body,
    }));
    expect(notes?.contentHash).toBe(sha256Hasher(rendered));
    expect(FIRST.lock.spec.composedDigest).toBe(
      sha256Hasher(
        FIRST.artifacts.map(({ name, contentHash }) => ({ name, contentHash })),
      ),
    );
  });

  it("labels every pod of a moving Project with its release, in the index the artifact carries", () => {
    const notes = FIRST.artifacts.find(({ name }) => name === "notes");
    const index = notes?.files.find(
      ({ path }) => path === "apps/notes/kustomization.yaml",
    );
    expect(notes?.rollout?.version).toBe("1.0.0");
    expect(
      (parse(index?.text ?? "") as { patches?: unknown }).patches,
    ).toStrictEqual(versionPatches("1.0.0"));
    // Only the unit's own index: every other file is the share as rendered.
    expect(
      notes?.files
        .filter(({ text: body }) => body.includes("app.kubernetes.io/version"))
        .map(({ path }) => path),
    ).toStrictEqual(["apps/notes/kustomization.yaml"]);
  });

  it("labels nothing in an artifact whose pin stays, which publishes nothing", () => {
    const again = after({});
    expect(again.artifacts.every(({ moves }) => !moves)).toBe(true);
    expect(
      again.artifacts.some(({ files }) =>
        files.some(({ text: body }) =>
          body.includes("app.kubernetes.io/version"),
        ),
      ),
    ).toBe(false);
  });

  it("labels nothing in the estate-scoped artifact, which is no Project's release", () => {
    const estate = FIRST.artifacts.find(({ name }) => name === "_estate");
    expect(
      (estate?.files ?? []).some(({ text: body }) =>
        body.includes("app.kubernetes.io/version"),
      ),
    ).toBe(false);
  });

  it("moves the pin of a Project whose pinned artifact labels no release, though its render did not change", () => {
    const pins = pinned(FIRST);
    const again = after({
      pins: { ...pins, notes: { ...(pins["notes"] as Pin), labelled: null } },
    });
    const notes = again.artifacts.find(({ name }) => name === "notes");

    expect(notes?.moves).toBe(true);
    expect(
      (
        parse(
          notes?.files.find(
            ({ path }) => path === "apps/notes/kustomization.yaml",
          )?.text ?? "",
        ) as { patches?: unknown }
      ).patches,
    ).toStrictEqual(versionPatches("1.0.0"));
    expect(notes?.rollout?.version).toBe("1.0.0");
  });

  it("moves no pin of a Project whose pinned artifact labels its release, and whose render did not change", () => {
    const pins = pinned(FIRST);
    const again = after({
      pins: {
        ...pins,
        notes: { ...(pins["notes"] as Pin), labelled: "1.0.0" },
      },
    });

    expect(again.artifacts.find(({ name }) => name === "notes")?.moves).toBe(
      false,
    );
  });

  it("holds the pin of a paused Project whose pinned artifact labels no release", () => {
    const pins = pinned(FIRST, { notes: PAUSE });
    const again = after({
      pins: { ...pins, notes: { ...(pins["notes"] as Pin), labelled: null } },
    });

    expect(again.artifacts.find(({ name }) => name === "notes")?.moves).toBe(
      false,
    );
  });

  it("moves no pin of the estate-scoped artifact, which labels no release", () => {
    // With no Project left on the old path, the estate-scoped artifact exists.
    const platform = {
      ...PLATFORM,
      files: PLATFORM.files.map((file) =>
        file.name === "platform.intent.yml"
          ? { ...file, text: withLedger(file.text, "") }
          : file,
      ),
    };
    const pins = pinned(compose({ platform }));
    const again = compose({
      platform,
      pins: {
        ...pins,
        _estate: { ...(pins["_estate"] as Pin), labelled: null },
      },
    });

    expect(again.artifacts.find(({ name }) => name === "_estate")?.moves).toBe(
      false,
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

  it("composes a rolled-back Project at its held fragment, which its pin already holds", () => {
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
        body: "Rolled back to 1.0.0 by joris at 2026-10-02T08:00:00Z: a bad release. It is composed at that release's fragment, and its pin moves to no newer release until it is resumed.",
        discord: "notes rolled back to 1.0.0 by joris: a bad release",
      },
    ]);
  });

  it("moves a rolled-back Project's pin to the release it was rolled back to, keeping the record on its source", () => {
    const newest = release("notes", "1.1.0", (body) =>
      body.replace("memory: 256Mi", "memory: 320Mi"),
    );
    const rollback = {
      ...PAUSE,
      [PIN_ANNOTATIONS.rollbackVersion]: "1.0.0",
      [PIN_ANNOTATIONS.rollbackFragment]: RELEASES[0]?.ref as string,
    };
    const fragments = RELEASES.map((fragment) =>
      fragment.manifest.spec.project === "notes" ? newest : fragment,
    );
    // 1.1.0 is what the pin holds when the Rollback is recorded.
    const deployed = after({ fragments });
    const composed = after({
      fragments,
      pins: {
        ...pinned(deployed),
        notes: { ...(pinned(deployed).notes as Pin), annotations: rollback },
      },
      previous: { lock: deployed.lock, commit: hex("estate-commit", 40) },
    });
    const notes = composed.artifacts.find(({ name }) => name === "notes");

    expect(notes?.moves).toBe(true);
    expect(notes?.contentHash).toBe(
      FIRST.artifacts.find(({ name }) => name === "notes")?.contentHash,
    );
    const source = composed.sources.find(({ name }) => name === "notes")?.text;
    const [repository] = parseAllDocuments(source ?? "")
      .map(
        (document) =>
          document.toJS() as {
            kind: string;
            metadata: { annotations?: unknown };
          },
      )
      .filter(({ kind }) => kind === "OCIRepository");
    expect(repository?.metadata.annotations).toStrictEqual(rollback);
  });

  it("fails the run on an error that names no changed fragment", () => {
    const unchangedButBroken = release("notes", "1.0.0", broken);
    const result = composeEstate(
      {
        ...EXPECTED,
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
        ...EXPECTED,
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
        ...EXPECTED,
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

  // deploy-kit#286: an estate-path Project's unit depends on the secrets unit,
  // so it is delivered while the old path still serves the edge.
  it("delivers the secrets unit alone of the estate-scoped artifact while a Project is legacy", () => {
    const under = (ledger: string): Composition =>
      compose({
        platform: {
          ...PLATFORM,
          files: PLATFORM.files.map((file) =>
            file.name === "platform.intent.yml"
              ? { ...file, text: withLedger(file.text, ledger) }
              : file,
          ),
        },
      });
    const estateOf = (composition: Composition) =>
      composition.artifacts.find(({ name }) => name === "_estate");
    const handingOver = under(
      "handover:\n  retireBy: 2027-03-31\n  legacy: [auth, edge, knowledge, notes, observability, secrets]\n  estate: [data, delivery]\n",
    );
    const whole = estateOf(under(""))?.files.map(({ path }) => path) ?? [];
    const cut = estateOf(handingOver)?.files.map(({ path }) => path) ?? [];

    expect(cut).not.toEqual([]);
    expect(cut.every((path) => path.startsWith("estate/vso-secrets/"))).toBe(
      true,
    );
    expect(whole.some((path) => path.startsWith("estate/edge/"))).toBe(true);
    // Its pin source applies the secrets unit and no edge unit, and does not
    // follow the Secret Store's unit while secrets is still on the old path.
    const source = handingOver.sources.find(({ name }) => name === "_estate");
    expect(source?.text).toContain("name: estate-vso-secrets");
    expect(source?.text).not.toContain("estate-edge-");
    expect(source?.text).not.toContain("apps-secrets");
    expect(
      handingOver.sources.find(({ name }) => name === "data")?.text,
    ).toContain("- name: estate-vso-secrets");
    // When the last Project leaves the old path, the artifact gains the edge
    // units, its pin moves, and its source is rewritten to apply them.
    const handedOver = compose({
      platform: {
        ...PLATFORM,
        files: PLATFORM.files.map((file) =>
          file.name === "platform.intent.yml"
            ? { ...file, text: withLedger(file.text, "") }
            : file,
        ),
      },
      pins: pinned(handingOver),
    }).sources.find(({ name }) => name === "_estate");
    expect(handedOver?.text).toContain("name: estate-vso-secrets");
    expect(handedOver?.text).toContain("name: estate-edge-");
    // Where no estate-path Project's render holds a secrets document, there
    // is no estate-scoped artifact at all.
    expect(estateOf(FIRST)).toBeUndefined();
  });

  // deploy-kit#316, #310: while the Secret Store and the edge are legacy, the
  // estate path reaches them where the ledger states the old path runs them.
  it("reaches a legacy Application where the handover ledger states it serves", () => {
    const composed = compose({
      platform: {
        ...PLATFORM,
        files: PLATFORM.files.map((file) =>
          file.name === "platform.intent.yml"
            ? {
                ...file,
                text: withLedger(
                  file.text,
                  "handover:\n  retireBy: 2027-03-31\n  legacy: [auth, edge, knowledge, observability, secrets]\n  estate: [data, delivery, notes]\n  serving:\n    - application: vault\n      namespace: data-system\n    - application: traefik-public\n      namespace: ingress-system\n      instance: traefik-ingress-system\n",
                ),
              }
            : file,
        ),
      },
    });
    const text = (name: string): string =>
      (
        composed.artifacts.find((artifact) => artifact.name === name)?.files ??
        []
      )
        .map((file) => file.text)
        .join("\n");

    expect(composed.conditions).toEqual([]);
    // The Vault policy job runs beside the Vault the old path runs.
    expect(text("_estate")).toContain("namespace: data-system");
    expect(text("_estate")).not.toContain("secrets-system");
    // A grant reads the Secret Store at its stated address, and a routed
    // Process admits the Traefik that serves it.
    expect(text("data")).toContain(
      "http://vault.data-system.svc.cluster.local:8200",
    );
    expect(text("data")).not.toContain("secrets-system");
    expect(text("notes")).toContain(
      "kubernetes.io/metadata.name: ingress-system",
    );
    expect(text("notes")).toContain(
      "app.kubernetes.io/instance: traefik-ingress-system",
    );
    expect(text("notes")).not.toContain("edge-system");
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
    // and the estate-scoped artifact with them: no Project is still legacy.
    expect(
      compose({
        platform: {
          ...PLATFORM,
          files: PLATFORM.files.map((file) =>
            file.name === "platform.intent.yml"
              ? { ...file, text: withLedger(file.text, "") }
              : file,
          ),
        },
      }).artifacts.map(({ name }) => name),
    ).toEqual([
      "_estate",
      "data",
      "delivery",
      "edge",
      "notes",
      "observability",
      "secrets",
    ]);
  });
});

// REQ-051 (docs/requirements.md): whenever an artifact's pin moves, the first
// delivery among them, composition writes its pin source, from the Platform
// document and the Reconcile Unit DAG
// (spec/v1/55-delivery.md#rendered-artifacts-and-pins).
describe("composeEstate, for an artifact whose pin moves", () => {
  /** Every Project delivered: the worked Platform document with no handover ledger. */
  const delivered = (input: Partial<ComposeInput> = {}) =>
    compose({
      platform: {
        ...PLATFORM,
        files: PLATFORM.files.map((file) =>
          file.name === "platform.intent.yml"
            ? { ...file, text: withLedger(file.text, "") }
            : file,
        ),
      },
      ...input,
    });
  const committed = (path: string): string => text(`pins/rendered/${path}`);

  it("writes each artifact's pin source to its committed file, byte for byte", () => {
    const { sources } = delivered();

    expect(sources.map(({ name, path }) => [name, path])).toStrictEqual([
      ["_estate", "projects/_estate/source.yaml"],
      ["data", "projects/data/source.yaml"],
      ["delivery", "projects/delivery/source.yaml"],
      ["edge", "projects/edge/source.yaml"],
      ["notes", "projects/notes/source.yaml"],
      ["observability", "projects/observability/source.yaml"],
      ["secrets", "projects/secrets/source.yaml"],
    ]);
    for (const { path, text: body } of sources)
      expect(body, path).toBe(committed(path));
    // Each is published where its source points: the estate's beside the
    // Projects' repository, since an OCI name cannot start with an underscore.
    expect(
      delivered()
        .artifacts.filter(({ name }) => ["_estate", "notes"].includes(name))
        .map(({ name, repository }) => [name, repository]),
    ).toStrictEqual([
      ["_estate", "ghcr.io/jorisjonkers-dev/render-estate"],
      ["notes", "ghcr.io/jorisjonkers-dev/render/notes"],
    ]);
  });

  it("pulls every pinned artifact with the Secret the Platform document names for a private repository", () => {
    const { sources } = delivered({
      platform: {
        ...PLATFORM,
        files: PLATFORM.files.map((file) =>
          file.name === "platform.intent.yml"
            ? {
                ...file,
                text: withLedger(file.text, "").replace(
                  "      repository: ghcr.io/jorisjonkers-dev/render\n",
                  "      repository: ghcr.io/jorisjonkers-dev/render\n      pullSecret: render-pull\n",
                ),
              }
            : file,
        ),
      },
    });

    expect(
      sources.map(({ name, text: body }) => [
        name,
        (
          parseAllDocuments(body)
            .map((document) => document.toJSON() as Record<string, unknown>)
            .find(({ kind }) => kind === "OCIRepository")?.["spec"] as {
            secretRef?: unknown;
          }
        ).secretRef,
      ]),
    ).toStrictEqual(sources.map(({ name }) => [name, { name: "render-pull" }]));
  });

  it("writes none for an artifact whose pin stays, and rewrites one whose pin moves unless it is paused", () => {
    const first = delivered();
    const previous = { lock: first.lock, commit: hex("estate-commit", 40) };
    const again = delivered({ held: RELEASES, pins: pinned(first), previous });

    expect(again.sources).toStrictEqual([]);
    // A pin on other content moves, and its source is written whole again.
    const stale = {
      ...pinned(first),
      notes: { contentHash: sha256Hasher("older notes"), annotations: {} },
    };
    expect(
      delivered({ held: RELEASES, pins: stale, previous }).sources.map(
        ({ name }) => name,
      ),
    ).toStrictEqual(["notes"]);
    expect(
      delivered({
        held: RELEASES,
        pins: {
          ...stale,
          notes: { ...(stale.notes as Pin), annotations: PAUSE },
        },
        previous,
      }).sources,
    ).toStrictEqual([]);
    // A pin for one artifact leaves every other's source to be written.
    const { notes: _kept, ...unpinned } = pinned(first);
    expect(
      delivered({
        held: RELEASES,
        pins: { notes: _kept as Pin },
        previous: { lock: first.lock, commit: hex("estate-commit", 40) },
      }).sources.map(({ name }) => name),
    ).toStrictEqual(Object.keys(unpinned).sort());
  });

  it("recreates a Project's Deployments on its first delivery alone, and never the estate's", () => {
    /** Whether each written source's units carry the recreation patch. */
    const recreating = (composition: Composition) =>
      composition.sources.map(({ name, text: body }) => [
        name,
        parseAllDocuments(body)
          .map((document) => document.toJSON() as Record<string, unknown>)
          .filter(({ kind }) => kind === "Kustomization")
          .every(
            ({ spec }) =>
              (spec as { patches?: { patch: string }[] }).patches?.some(
                ({ patch }) => patch === RECREATE_DEPLOYMENTS.patch,
              ) === true,
          ),
      ]);
    const first = delivered();

    // No pin yet: every Project's source is a first delivery, the handover's.
    expect(recreating(first)).toStrictEqual([
      ["_estate", false],
      ["data", true],
      ["delivery", true],
      ["edge", true],
      ["notes", true],
      ["observability", true],
      ["secrets", true],
    ]);
    // A pin that moves is rewritten without it.
    const stale = {
      ...pinned(first),
      notes: { contentHash: sha256Hasher("older notes"), annotations: {} },
    };
    expect(
      recreating(
        delivered({
          held: RELEASES,
          pins: stale,
          previous: { lock: first.lock, commit: hex("estate-commit", 40) },
        }),
      ),
    ).toStrictEqual([["notes", false]]);
  });

  it("gives each tier's routes a unit that follows that tier's proxy and the Projects it serves, and no unit where the artifact holds no index", () => {
    // Two tiers, a Project on each, and their proxies in a third: enough of a
    // resolved union to tell one tier's Projects from the other's.
    const project = (
      name: string,
      applications: readonly Record<string, unknown>[],
    ) => ({ project: name, applications });
    const estateArtifact = {
      name: "_estate",
      files: [
        "estate/edge/public/kustomization.yaml",
        "estate/edge/public/shop-public.yaml",
        "estate/edge/lan/kustomization.yaml",
        // Vault documents with no job beside them: no index, so no unit.
        "estate/vso-secrets/policies/shop-system-api.policy.json",
      ].map((path) => ({ path, adapter: "traefik", text: "" })),
    };
    const artifact = (name: string) => ({ name, files: [] });
    /** The estate source's units, with every Project in `delivered` on the estate path. */
    const applied = (delivered: readonly string[]) => {
      const [estate] = pinSources(
        [estateArtifact],
        [estateArtifact, ...delivered.map(artifact)],
        [
          project("shop", [{ id: "shop", exposure: [{ tier: "public" }] }]),
          project("wiki", [{ id: "wiki", exposure: [{ tier: "lan" }] }]),
          project("edge", [{ id: "proxy-public" }, { id: "proxy-lan" }]),
        ] as never,
        {
          tiers: [
            { name: "public", traefik: "proxy-public" },
            { name: "lan", traefik: "proxy-lan" },
            // A tier no route reaches: the artifact holds no index for it.
            { name: "idle", traefik: "proxy-lan" },
          ],
          bootstrap: {
            flux: {
              sourceRef: "flux-system/platform",
              artifacts: {
                repository: "ghcr.io/x/render",
                signer: { issuer: "i", subject: "s" },
              },
            },
          },
        } as never,
        serialize,
      );
      return (parseAllDocuments(estate?.text ?? "") as { toJS(): unknown }[])
        .map(
          (document) =>
            document.toJS() as {
              kind: string;
              metadata: { name: string; namespace: string };
              spec: { path?: string; dependsOn?: { name: string }[] };
            },
        )
        .filter(({ kind }) => kind === "Kustomization")
        .map(({ metadata, spec }) => [
          metadata.name,
          metadata.namespace,
          spec.path,
          spec.dependsOn?.map(({ name }) => name),
        ]);
    };

    expect(applied(["edge", "shop", "wiki"])).toStrictEqual([
      [
        "estate-edge-public",
        "flux-system",
        "./estate/edge/public",
        ["apps-edge", "apps-shop"],
      ],
      [
        "estate-edge-lan",
        "flux-system",
        "./estate/edge/lan",
        ["apps-edge", "apps-wiki"],
      ],
    ]);
    // A Project still on the old path has no unit here, which would never
    // become Ready; it is running where the old path put it.
    expect(applied(["edge", "shop"])).toStrictEqual([
      [
        "estate-edge-public",
        "flux-system",
        "./estate/edge/public",
        ["apps-edge", "apps-shop"],
      ],
      ["estate-edge-lan", "flux-system", "./estate/edge/lan", ["apps-edge"]],
    ]);
    expect(applied([])).toStrictEqual([
      ["estate-edge-public", "flux-system", "./estate/edge/public", undefined],
      ["estate-edge-lan", "flux-system", "./estate/edge/lan", undefined],
    ]);
  });

  it("writes a source only for what it delivers: a Project still on the old path has none", () => {
    expect(FIRST.sources.map(({ name }) => name)).toStrictEqual(
      FIRST.artifacts.map(({ name }) => name),
    );
    expect(FIRST.sources.map(({ name }) => name)).not.toContain("data");
  });
});

// REQ-050 (docs/requirements.md): composition reads the participants list, and
// a participant's own standing isolates it before the union is composed
// (spec/v1/40-composition.md#participants).
describe("composeEstate, against the participants list", () => {
  const notes = (composition: Composition) => ({
    locked: composition.lock.spec.fragments["notes"]?.ref,
    isolated: composition.lock.spec.isolated?.["notes"],
    moves: composition.artifacts.find(({ name }) => name === "notes")?.moves,
  });
  const NOTES = RELEASES.find(
    ({ manifest }) => manifest.spec.project === "notes",
  ) as Fragment;
  const others = RELEASES.filter((fragment) => fragment !== NOTES);
  const publishedAt = (time: string) => ({
    published: { ...EXPECTED.published, notes: time },
  });
  const listing = (entry: Record<string, unknown>) => ({
    participants: {
      participants: { ...EXPECTED.participants.participants, notes: entry },
    },
  });
  const refused = (input: Partial<ComposeInput>) => {
    const result = composeEstate(
      {
        ...EXPECTED,
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
    return result.ok
      ? []
      : result.diagnostics.map(
          ({ code, document, path, message }) =>
            `${code} ${String(document)} ${path} ${message}`,
        );
  };

  it("holds a participant that published nothing at the fragment it last composed at, and records no fragment for it", () => {
    const composed = after({ fragments: others });

    expect(notes(composed)).toStrictEqual({
      locked: NOTES.ref,
      isolated: { codes: ["E_PARTICIPANT_MISSING"] },
      moves: false,
    });
    expect(
      composed.conditions.find(({ project }) => project === "notes"),
    ).toStrictEqual({
      project: "notes",
      condition: "isolated",
      title: "notes: no fragment published",
      body: "The participants list expects notes, and it published no fragment: E_PARTICIPANT_MISSING. notes stays at the fragment it last composed at, and its pin does not move until a release composes.",
      discord: "notes published no fragment: E_PARTICIPANT_MISSING",
    });
    // No commit published it, so no commit is told.
    expect(
      composed.statuses.filter(({ repository }) =>
        repository.endsWith("/notes"),
      ),
    ).toStrictEqual([]);
  });

  it("leaves a participant that published nothing and never composed out of the render, and still records it", () => {
    const composed = compose({ fragments: others });

    expect(notes(composed)).toStrictEqual({
      locked: undefined,
      isolated: { codes: ["E_PARTICIPANT_MISSING"] },
      moves: undefined,
    });
  });

  it("holds a participant whose newest publish is older than seven days, to the second", () => {
    // Seven days before the run, to the second, is still within the bound.
    expect(
      notes(after(publishedAt("2026-09-25T09:00:00Z"))).isolated,
    ).toBeUndefined();

    const stale = after({ ...publishedAt("2026-09-25T08:59:59Z"), held: [] });

    // The stale fragment is the one it last composed at, so it stays there
    // with nothing held handed over.
    expect(notes(stale)).toStrictEqual({
      locked: NOTES.ref,
      isolated: { refused: NOTES.ref, codes: ["E_PARTICIPANT_STALE"] },
      moves: false,
    });
    expect(
      stale.statuses.find(({ repository }) => repository.endsWith("/notes"))
        ?.description,
    ).toBe("notes 1.0.0 isolated: E_PARTICIPANT_STALE");
  });

  it("holds a stale participant's newer fragment back, at the one it last composed at", () => {
    const newer = release("notes", "1.1.0", (body) =>
      body.replace("memory: 256Mi", "memory: 512Mi"),
    );
    const composed = after({
      fragments: [newer, ...others],
      ...publishedAt("2026-09-01T09:00:00Z"),
    });

    expect(notes(composed)).toStrictEqual({
      locked: NOTES.ref,
      isolated: { refused: newer.ref, codes: ["E_PARTICIPANT_STALE"] },
      moves: false,
    });
  });

  it("leaves a stale participant that never composed out of the render", () => {
    expect(notes(compose(publishedAt("2026-09-01T09:00:00Z")))).toStrictEqual({
      locked: undefined,
      isolated: { refused: NOTES.ref, codes: ["E_PARTICIPANT_STALE"] },
      moves: undefined,
    });
  });

  it("reads a participant's own age where its entry states one, and none where it is dormant", () => {
    const old = publishedAt("2026-09-12T09:00:00Z");
    const explained = { maxAge: "21d", reason: "releases batch fortnightly" };

    // Twenty days old: past the default, within its own bound.
    expect(
      notes(after({ ...old, ...listing(explained) })).isolated,
    ).toBeUndefined();
    expect(
      notes(
        after({
          ...publishedAt("2026-09-11T08:59:59Z"),
          ...listing(explained),
        }),
      ).isolated,
    ).toStrictEqual({ refused: NOTES.ref, codes: ["E_PARTICIPANT_STALE"] });
    // Dormant exempts it from its age, with no publish time read at all.
    expect(
      notes(
        after({
          published: Object.fromEntries(
            Object.entries(EXPECTED.published).filter(
              ([project]) => project !== "notes",
            ),
          ),
          ...listing({
            dormant: true,
            owner: "joris",
            reason: "stable",
            reviewBy: "2026-10-02",
          }),
        }),
      ).isolated,
    ).toBeUndefined();
  });

  it("leaves a fragment the list does not name out of the render, though its Project composed before", () => {
    const { notes: _dropped, ...listed } = EXPECTED.participants.participants;
    const composed = after({ participants: { participants: listed } });

    expect(notes(composed)).toStrictEqual({
      locked: undefined,
      isolated: { refused: NOTES.ref, codes: ["E_PARTICIPANT_UNLISTED"] },
      moves: undefined,
    });
    expect(
      composed.statuses.find(({ repository }) => repository.endsWith("/notes")),
    ).toMatchObject({
      state: "failure",
      description: "notes 1.0.0 isolated: E_PARTICIPANT_UNLISTED",
    });
  });

  it("reads the list for an entry of its own, so a project named for something every object has is not listed", () => {
    // `constructor` is a name every plain object answers to.
    const named = {
      ...NOTES,
      ref: NOTES.ref.replace("/notes@", "/constructor@"),
      manifest: {
        ...NOTES.manifest,
        spec: { ...NOTES.manifest.spec, project: "constructor" },
      },
      files: NOTES.files.map(({ name, text: body }) => ({
        name,
        text: body.replace("project: notes", "project: constructor"),
      })),
    };
    const composed = compose({
      fragments: [named, ...others],
      participants: EXPECTED.participants,
      published: EXPECTED.published,
    });

    expect(composed.lock.spec.isolated?.["constructor"]).toStrictEqual({
      refused: named.ref,
      codes: ["E_PARTICIPANT_UNLISTED"],
    });
    expect(Object.keys(composed.lock.spec.fragments)).not.toContain(
      "constructor",
    );
  });

  it("holds a fragment to the project its own files declare: one published as a listed project and declaring another is not that participant", () => {
    const disguised = {
      ...NOTES,
      files: NOTES.files.map(({ name, text: body }) => ({
        name,
        text: body.replace("project: notes", "project: kube"),
      })),
    };
    const composed = after({ fragments: [disguised, ...others] });

    expect(notes(composed)).toStrictEqual({
      locked: undefined,
      isolated: { refused: NOTES.ref, codes: ["E_PARTICIPANT_UNLISTED"] },
      moves: undefined,
    });
    expect(composed.artifacts.map(({ name }) => name)).not.toContain("kube");
  });

  it("holds the Platform document's fragment to the project its own document declares", () => {
    expect(
      refused({
        platform: {
          ...PLATFORM,
          files: PLATFORM.files.map((file) =>
            file.name === "platform.intent.yml"
              ? {
                  ...file,
                  text: file.text.replace(
                    "project: jorisjonkers.dev",
                    "project: elsewhere.example",
                  ),
                }
              : file,
          ),
        },
      }),
    ).toStrictEqual([
      "E_PARTICIPANT_UNLISTED participants.yml /participants the Platform document's fragment, jorisjonkers.dev, cannot be composed with: E_PARTICIPANT_UNLISTED",
    ]);
  });

  it("reads what a fragment declares from its project files and its Platform document, and from no other file it carries", () => {
    // A copy of the Platform document under another name declares nothing,
    // whatever project it names.
    const withCopy = {
      ...PLATFORM,
      files: [
        ...PLATFORM.files,
        {
          name: "archive/platform.intent.yml.bak",
          text: text("platform/platform.intent.yml").replace(
            "project: jorisjonkers.dev",
            "project: elsewhere.example",
          ),
        },
      ],
    };

    expect(refused({ platform: withCopy })).toStrictEqual([]);
  });

  it("reads a publish time for an entry of its own, too", () => {
    const named = {
      ...NOTES,
      manifest: {
        ...NOTES.manifest,
        spec: { ...NOTES.manifest.spec, project: "constructor" },
      },
      files: NOTES.files.map(({ name, text: body }) => ({
        name,
        text: body.replace("project: notes", "project: constructor"),
      })),
    };

    expect(() =>
      compose({
        fragments: [named, ...others],
        participants: {
          participants: {
            ...EXPECTED.participants.participants,
            constructor: {},
          },
        },
        published: EXPECTED.published,
      }),
    ).toThrow(
      "constructor: a fragment whose publish time the caller did not supply",
    );
  });

  it("records every isolated Project in name order, whatever order they were found in", () => {
    const { data: _dropped, ...listed } = EXPECTED.participants.participants;
    const composed = compose({
      fragments: others,
      participants: { participants: listed },
    });

    expect(Object.keys(composed.lock.spec.isolated ?? {})).toStrictEqual([
      "data",
      "notes",
    ]);
  });

  it("stops the run where the Platform document published nothing, is stale, or is not listed", () => {
    expect(refused({ platform: undefined })).toStrictEqual([
      "E_PARTICIPANT_MISSING participants.yml /participants the Platform document published no fragment",
    ]);
    expect(
      refused({
        published: {
          ...EXPECTED.published,
          "jorisjonkers.dev": "2026-09-01T09:00:00Z",
        },
      }),
    ).toStrictEqual([
      "E_PARTICIPANT_STALE participants.yml /participants the Platform document's fragment, jorisjonkers.dev, cannot be composed with: E_PARTICIPANT_STALE",
    ]);
    const { "jorisjonkers.dev": _dropped, ...listed } =
      EXPECTED.participants.participants;
    expect(refused({ participants: { participants: listed } })).toStrictEqual([
      "E_PARTICIPANT_UNLISTED participants.yml /participants the Platform document's fragment, jorisjonkers.dev, cannot be composed with: E_PARTICIPANT_UNLISTED",
    ]);
  });

  it("stops the run where a dormant participant is past its review, and not on the day of it", () => {
    const dormant = (reviewBy: string) =>
      listing({ dormant: true, owner: "joris", reason: "stable", reviewBy });

    expect(refused(dormant("2026-10-01"))).toStrictEqual([
      "E_LEDGER_REVIEW_OVERDUE participants.yml /participants/notes/reviewBy notes is dormant until a review on 2026-10-01, which has passed",
    ]);
    expect(refused(dormant("2026-10-02"))).toStrictEqual([]);
  });

  it("says how to clear what stops the run", () => {
    const result = composeEstate(
      {
        ...EXPECTED,
        ...listing({
          dormant: true,
          owner: "joris",
          reason: "stable",
          reviewBy: "2026-01-01",
        }),
        platform: undefined,
        fragments: RELEASES,
        held: [],
        pins: {},
        clusterState: { name: "cluster-state.yml", text: "" },
      },
      OPTIONS,
    );

    expect(
      result.ok ? [] : result.diagnostics.map(({ hint }) => hint),
    ).toStrictEqual([
      "Review the participant: set a later date with its reason, or drop `dormant`.",
      "No render is composed without a current, listed Platform document: publish it, or correct its entry.",
    ]);
  });

  it("asks for the publish time of every fragment whose age it reads", () => {
    expect(() =>
      compose({
        published: Object.fromEntries(
          Object.entries(EXPECTED.published).filter(
            ([project]) => project !== "notes",
          ),
        ),
      }),
    ).toThrow("notes: a fragment whose publish time the caller did not supply");
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
        ...EXPECTED,
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
        ...EXPECTED,
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
        ...EXPECTED,
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
        ...EXPECTED,
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

// REQ-051 (docs/requirements.md): a pin source says what composition derives
// now, whether or not its pin moves
// (spec/v1/55-delivery.md#what-a-pin-source-holds).
describe("composeEstate, for an artifact whose pin stays", () => {
  const UNPUBLISHED = `sha256:${"0".repeat(64)}`;
  const digestOf = (name: string): string => `sha256:${hex(name, 64)}`;
  const withPlatform = (
    edit: (platform: string) => string,
    input: Partial<ComposeInput> = {},
  ): Composition =>
    compose({
      platform: {
        ...PLATFORM,
        files: PLATFORM.files.map((file) =>
          file.name === "platform.intent.yml"
            ? { ...file, text: edit(withLedger(file.text, "")) }
            : file,
        ),
      },
      ...input,
    });
  /** What the Estate repository holds once `composition` is published: each source at its artifact's digest. */
  const committedBy = (composition: Composition): Record<string, string> =>
    Object.fromEntries(
      composition.sources.map(({ name, text: body }) => [
        name,
        body.replace(UNPUBLISHED, digestOf(name)),
      ]),
    );
  const objectsOf = (body: string) =>
    parseAllDocuments(body).map(
      (document) =>
        document.toJSON() as {
          kind: string;
          metadata: { annotations?: Record<string, string> };
          spec: {
            ref?: { digest: string };
            secretRef?: { name: string };
            verify?: { matchOIDCIdentity: { subject: string }[] };
            url?: string;
            patches?: { patch: string }[];
            dependsOn?: { name: string }[];
          };
        },
    );
  const repositoryOf = (body: string) =>
    objectsOf(body).find(({ kind }) => kind === "OCIRepository")?.spec;
  const recreates = (body: string): boolean =>
    objectsOf(body).some(
      ({ spec }) =>
        spec.patches?.some(
          ({ patch }) => patch === RECREATE_DEPLOYMENTS.patch,
        ) === true,
    );

  // Composed before each test rather than as the suite is collected, so a
  // mutation run sees which test reaches which code.
  let first: Composition;
  let settled: {
    held: readonly Fragment[];
    pins: Record<string, Pin>;
    sources: Record<string, string>;
    previous: NonNullable<ComposeInput["previous"]>;
  };
  let NAMES: string[];
  beforeEach(() => {
    first = withPlatform((same) => same);
    settled = {
      held: RELEASES,
      pins: pinned(first),
      sources: committedBy(first),
      previous: { lock: first.lock, commit: hex("estate-commit", 40) },
    };
    NAMES = first.artifacts.map(({ name }) => name);
  });

  it("writes no source when the committed one already says what composition derives", () => {
    expect(withPlatform((same) => same, settled).sources).toStrictEqual([]);
  });

  it("writes no source when the committed one says the same and is only written differently", () => {
    const reworded = Object.fromEntries(
      Object.entries(settled.sources).map(([name, body]) => [
        name,
        `# committed by hand\n${body
          .replace(/^( +interval): (.*)$/gm, '$1: "$2"')
          .replace(/^( +)(prune: .*)\n( +)(wait: .*)$/gm, "$3$4\n$1$2")}`,
      ]),
    );
    for (const name of NAMES)
      expect(reworded[name], name).not.toBe(settled.sources[name]);

    expect(
      withPlatform((same) => same, { ...settled, sources: reworded }).sources,
    ).toStrictEqual([]);
  });

  it("writes no source for a Pause whose time is committed bare, as a render before YAML 1.1 quoting wrote it", () => {
    const pins = pinned(first, { notes: PAUSE });
    const [paused] = withPlatform((same) => same, { ...settled, pins }).sources;
    const at = PAUSE[PIN_ANNOTATIONS.pausedAt];
    // Composition quotes the time, which YAML 1.1 reads as a timestamp, as `yq`
    // does; an earlier render left it bare.
    expect(paused?.text).toContain(`: "${at}"\n`);
    const committed = (paused?.text ?? "").replace(`: "${at}"\n`, `: ${at}\n`);
    expect(committed).not.toBe(paused?.text);

    expect(
      withPlatform((same) => same, {
        ...settled,
        pins,
        sources: { ...settled.sources, notes: committed },
      }).sources,
    ).toStrictEqual([]);
  });

  it.each([
    [
      "pull Secret",
      (platform: string) =>
        platform.replace(
          "      repository: ghcr.io/jorisjonkers-dev/render\n",
          "      repository: ghcr.io/jorisjonkers-dev/render\n      pullSecret: render-pull\n",
        ),
      (body: string) => repositoryOf(body)?.secretRef?.name === "render-pull",
    ],
    [
      "repository",
      (platform: string) =>
        platform.replace(
          "      repository: ghcr.io/jorisjonkers-dev/render\n",
          "      repository: ghcr.io/jorisjonkers-dev/moved\n",
        ),
      (body: string) =>
        repositoryOf(body)?.url?.startsWith(
          "oci://ghcr.io/jorisjonkers-dev/moved",
        ) === true,
    ],
    [
      "signer",
      (platform: string) =>
        platform.replace(
          /(\n {6}signer:\n(?: {8}.*\n)*? {8}subject: ).*\n/,
          "$1https://github.com/x/estate/.github/workflows/other.yml@refs/heads/main\n",
        ),
      (body: string) =>
        repositoryOf(body)?.verify?.matchOIDCIdentity[0]?.subject.includes(
          "other",
        ) === true,
    ],
  ])(
    "rewrites every source when the Platform document's %s changes, and moves no digest",
    (_fact, edit, says) => {
      const changed = withPlatform(edit, settled);

      expect(changed.artifacts.filter(({ moves }) => moves)).toStrictEqual([]);
      expect(changed.sources.map(({ name }) => name)).toStrictEqual(NAMES);
      for (const { name, path, text: body } of changed.sources) {
        expect(path, name).toBe(`projects/${name}/source.yaml`);
        expect(says(body), name).toBe(true);
        expect(repositoryOf(body)?.ref?.digest, name).toBe(digestOf(name));
        // What the first delivery recreates, it still recreates: the next
        // move of the pin is what ends a handover, not a rewrite beside it.
        expect(recreates(body), name).toBe(name !== "_estate");
      }
    },
  );

  it("leaves a source that is no longer a first delivery's without the recreation patch", () => {
    // notes moved once since its handover, so its committed source carries no patch.
    const moved = withPlatform((same) => same, {
      ...settled,
      pins: {
        ...settled.pins,
        notes: { contentHash: sha256Hasher("older notes"), annotations: {} },
      },
    });
    const committed = { ...settled.sources, ...committedBy(moved) };
    expect(recreates(committed["notes"] ?? "")).toBe(false);

    const changed = withPlatform(
      (platform) =>
        platform.replace(
          "      repository: ghcr.io/jorisjonkers-dev/render\n",
          "      repository: ghcr.io/jorisjonkers-dev/render\n      pullSecret: render-pull\n",
        ),
      { ...settled, sources: committed },
    );

    expect(
      changed.sources.map(({ name, text: body }) => [name, recreates(body)]),
    ).toStrictEqual(
      NAMES.map((name) => [name, name !== "_estate" && name !== "notes"]),
    );
  });

  it("keeps a paused Project's units as committed, and still gives its source what the Platform document says", () => {
    const withPullSecret = (platform: string): string =>
      platform.replace(
        "      repository: ghcr.io/jorisjonkers-dev/render\n",
        "      repository: ghcr.io/jorisjonkers-dev/render\n      pullSecret: render-pull\n",
      );
    const pins = pinned(first, { notes: PAUSE });
    // The source as the Pause committed it: the annotations, at the same digest.
    const [paused] = withPlatform((same) => same, { ...settled, pins }).sources;
    expect(paused?.name).toBe("notes");
    // Its unit is one composition would not derive now, as a held-back
    // fragment's would differ from the pinned artifact's.
    const committed = (paused?.text ?? "").replace(
      "path: ./apps/notes",
      "path: ./apps/notes-as-pinned",
    );
    const held = {
      ...settled,
      pins,
      sources: { ...settled.sources, notes: committed },
    };

    // Nothing the Platform document says changed, so the unit alone moves nothing.
    expect(withPlatform((same) => same, held).sources).toStrictEqual([]);
    const notes = withPlatform(withPullSecret, held).sources.find(
      ({ name }) => name === "notes",
    );
    expect(notes?.path).toBe("projects/notes/source.yaml");
    expect(repositoryOf(notes?.text ?? "")?.secretRef?.name).toBe(
      "render-pull",
    );
    expect(repositoryOf(notes?.text ?? "")?.ref?.digest).toBe(
      digestOf("notes"),
    );
    expect(
      objectsOf(notes?.text ?? "").find(({ kind }) => kind === "OCIRepository")
        ?.metadata.annotations,
    ).toStrictEqual(PAUSE);
    // Every unit is byte for byte the committed one.
    const unitsOf = (body: string): string =>
      body.slice(body.indexOf("kind: Kustomization"));
    expect(unitsOf(notes?.text ?? "")).toBe(unitsOf(committed));
    expect(unitsOf(committed)).toContain("path: ./apps/notes-as-pinned");
    // Resumed, the unit is derived again like any other Project's.
    const resumed = withPlatform((same) => same, {
      ...settled,
      sources: {
        ...settled.sources,
        notes: (settled.sources["notes"] ?? "").replace(
          "path: ./apps/notes",
          "path: ./apps/notes-as-pinned",
        ),
      },
    }).sources;
    expect(resumed.map(({ name }) => name)).toStrictEqual(["notes"]);
    expect(resumed[0]?.text).toBe(settled.sources["notes"]);
  });

  it("writes a source only for a pin that moves where the caller supplies no committed source", () => {
    const { notes: _notes, ...others } = settled.sources;
    const changed = withPlatform(
      (platform) =>
        platform.replace(
          "      repository: ghcr.io/jorisjonkers-dev/render\n",
          "      repository: ghcr.io/jorisjonkers-dev/render\n      pullSecret: render-pull\n",
        ),
      { ...settled, sources: others },
    );

    expect(changed.sources.map(({ name }) => name)).toStrictEqual(
      NAMES.filter((name) => name !== "notes"),
    );
  });

  // The unit that provisions secrets follows the Secret Store's unit, which
  // is on the estate path only once its Project has handed over.
  it("gives a unit the unit it follows as soon as that one hands over, though its own pin stays", () => {
    const under = (
      ledger: string,
      input: Partial<ComposeInput> = {},
    ): Composition =>
      compose({
        platform: {
          ...PLATFORM,
          files: PLATFORM.files.map((file) =>
            file.name === "platform.intent.yml"
              ? { ...file, text: withLedger(file.text, ledger) }
              : file,
          ),
        },
        ...input,
      });
    const followedBySecrets = (body: string | undefined) =>
      objectsOf(body ?? "").find(
        ({ kind, spec }) =>
          kind === "Kustomization" && spec.dependsOn !== undefined,
      )?.spec.dependsOn;
    const before = under(
      "handover:\n  retireBy: 2027-03-31\n  legacy: [auth, edge, knowledge, notes, observability, secrets]\n  estate: [data, delivery]\n",
    );
    expect(
      followedBySecrets(
        before.sources.find(({ name }) => name === "_estate")?.text,
      ),
    ).toBeUndefined();
    const handedOver = {
      held: RELEASES,
      pins: pinned(before),
      previous: { lock: before.lock, commit: hex("estate-commit", 40) },
    };
    const LEDGER_AFTER =
      "handover:\n  retireBy: 2027-03-31\n  legacy: [auth, edge, knowledge, notes, observability]\n  estate: [data, delivery, secrets]\n";

    const after = under(LEDGER_AFTER, {
      ...handedOver,
      sources: committedBy(before),
    });

    expect(
      after.artifacts.filter(({ moves }) => moves).map(({ name }) => name),
    ).toStrictEqual(["secrets"]);
    expect(after.sources.map(({ name }) => name)).toStrictEqual([
      "_estate",
      "secrets",
    ]);
    const [estate, secrets] = after.sources;
    expect(followedBySecrets(estate?.text)).toStrictEqual([
      { name: "apps-secrets" },
    ]);
    expect(repositoryOf(estate?.text ?? "")?.ref?.digest).toBe(
      digestOf("_estate"),
    );
    // The Project that hands over is a first delivery, at no digest yet.
    expect(repositoryOf(secrets?.text ?? "")?.ref?.digest).toBe(UNPUBLISHED);
    expect(recreates(secrets?.text ?? "")).toBe(true);
    // With no committed source to compare, the edge waits for a pin move.
    expect(
      under(LEDGER_AFTER, handedOver).sources.map(({ name }) => name),
    ).toStrictEqual(["secrets"]);
  });

  it("refuses to go on from a committed source that names no digest", () => {
    expect(() =>
      withPlatform((same) => same, {
        ...settled,
        sources: { ...settled.sources, notes: "kind: OCIRepository\n" },
      }),
    ).toThrow(
      "projects/notes/source.yaml: a committed pin source names no digest",
    );
  });
});

// REQ-056 (docs/requirements.md): a Rollout is one Project's release from the
// moment its pin moves, and its identity is what composition records and what
// the pin source hands Flux (spec/v1/55-delivery.md#rollouts).
describe("composeEstate, for a Rollout", () => {
  /** Where each worked Project with an exposure is reachable: its first exposure's host, over https. */
  const URLS: Readonly<Record<string, string>> = {
    data: "https://rabbitmq.jorisjonkers.dev",
    notes: "https://notes.jorisjonkers.dev",
  };
  const identityOf = (project: string, version = "1.0.0") => ({
    project,
    repository: `JorisJonkers-dev/${project}`,
    sha: release(project, version).manifest.metadata.sourceSha,
    environment: "production" as const,
    version,
    ...(project in URLS ? { url: URLS[project] } : {}),
  });
  /** A composition with no Project left on the old path, so the estate-scoped artifact is delivered. */
  const handedOver = (): Composition =>
    compose({
      platform: {
        ...PLATFORM,
        files: PLATFORM.files.map((file) =>
          file.name === "platform.intent.yml"
            ? { ...file, text: withLedger(file.text, "") }
            : file,
        ),
      },
    });
  /** The annotations each Kustomization of a source carries, by the unit's name. */
  const annotated = (body: string): Record<string, unknown> =>
    Object.fromEntries(
      parseAllDocuments(body)
        .map(
          (document) =>
            document.toJSON() as {
              kind: string;
              metadata: { name: string; annotations?: Record<string, string> };
            },
        )
        .filter(({ kind }) => kind === "Kustomization")
        .map(({ metadata }) => [metadata.name, metadata.annotations]),
    );
  const eventsOf = ({ project: _project, ...identity }: Rollout) =>
    Object.fromEntries(
      Object.entries(identity).map(([field, value]) => [
        `event.toolkit.fluxcd.io/${field}`,
        value,
      ]),
    );
  const sourceOf = (composition: Composition, name: string): string =>
    composition.sources.find((source) => source.name === name)?.text ?? "";
  const bumped = (project: string, edit?: (text: string) => string) =>
    RELEASES.map((fragment) =>
      fragment.manifest.spec.project === project
        ? release(project, "1.1.0", edit)
        : fragment,
    );
  const heavier = (body: string): string =>
    body.replace("memory: 256Mi", "memory: 320Mi");

  it("records one for every Project whose pin moves, and none for the estate-scoped artifact", () => {
    const first = handedOver();
    const projects = first.artifacts
      .map(({ name }) => name)
      .filter((name) => name !== "_estate");

    expect(first.artifacts.map(({ name }) => name)).toContain("_estate");
    expect(first.artifacts.every(({ moves }) => moves)).toBe(true);
    expect(first.rollouts).toStrictEqual(
      projects.map((project) => identityOf(project)),
    );
  });

  it("is reachable at its Project's first exposure, over the scheme the tier's listener serves", () => {
    const exposed = (...hosts: [string, "tls" | "plain"][][]) => ({
      applications: hosts.map((exposure) => ({
        exposure: exposure.map(([host, listener]) => ({ host, listener })),
      })),
    });

    expect(rolloutUrlOf(exposed([["a.example", "tls"]]))).toBe(
      "https://a.example",
    );
    expect(rolloutUrlOf(exposed([["lan.example", "plain"]]))).toBe(
      "http://lan.example",
    );
    expect(
      rolloutUrlOf(
        exposed(
          [],
          [
            ["b.example", "plain"],
            ["c.example", "tls"],
          ],
        ),
      ),
    ).toBe("http://b.example");
    expect(rolloutUrlOf({ applications: [{}] })).toBeUndefined();
    expect(rolloutUrlOf({ applications: [] })).toBeUndefined();
    // A Rollout with nowhere to reach hands Flux no URL at all, not an empty one.
    expect(
      Object.keys(rolloutAnnotations(identityOf("observability"))),
    ).not.toContain("event.toolkit.fluxcd.io/url");
  });

  it("hands Flux a moved Project's Rollout on its unit, and nothing on an estate unit", () => {
    expect(annotated(sourceOf(FIRST, "notes"))).toStrictEqual({
      "apps-notes": {
        "event.toolkit.fluxcd.io/repository": "JorisJonkers-dev/notes",
        "event.toolkit.fluxcd.io/sha": identityOf("notes").sha,
        "event.toolkit.fluxcd.io/environment": "production",
        "event.toolkit.fluxcd.io/version": "1.0.0",
        "event.toolkit.fluxcd.io/url": "https://notes.jorisjonkers.dev",
      },
    });
    const estate = annotated(sourceOf(handedOver(), "_estate"));
    expect(Object.keys(estate)).not.toStrictEqual([]);
    expect(Object.values(estate)).toStrictEqual(
      Object.keys(estate).map(() => undefined),
    );
  });

  it("records none where no pin moves, a release that renders the same among them", () => {
    expect(after({}).rollouts).toStrictEqual([]);
    const same = after({ fragments: bumped("notes") });

    expect(same.lock.spec.fragments.notes?.version).toBe("1.1.0");
    expect(same.rollouts).toStrictEqual([]);
    expect(same.sources).toStrictEqual([]);
  });

  it("records the release a pin moves to, and that one alone", () => {
    const next = after({ fragments: bumped("notes", heavier) });

    expect(next.rollouts).toStrictEqual([identityOf("notes", "1.1.0")]);
    expect(annotated(sourceOf(next, "notes"))).toStrictEqual({
      "apps-notes": eventsOf(identityOf("notes", "1.1.0")),
    });
  });

  it("records none for a paused Project, and the release a Rollback moves its pin to", () => {
    const fragments = bumped("notes", heavier);
    expect(
      after({ fragments, pins: pinned(FIRST, { notes: PAUSE }) }).rollouts,
    ).toStrictEqual([]);
    // 1.1.0 is what the pin holds when the Rollback to 1.0.0 is recorded.
    const deployed = after({ fragments });
    const back = after({
      fragments,
      pins: pinned(deployed, {
        notes: {
          ...PAUSE,
          [PIN_ANNOTATIONS.rollbackVersion]: "1.0.0",
          [PIN_ANNOTATIONS.rollbackFragment]: RELEASES.find(
            ({ manifest }) => manifest.spec.project === "notes",
          )?.ref as string,
        },
      }),
      previous: { lock: deployed.lock, commit: hex("estate-commit", 40) },
    });

    expect(back.rollouts).toStrictEqual([identityOf("notes", "1.0.0")]);
    expect(annotated(sourceOf(back, "notes"))).toStrictEqual({
      "apps-notes": eventsOf(identityOf("notes", "1.0.0")),
    });
  });

  it("keeps the Rollout a source is committed with when the source is written again and its pin stays", () => {
    const committed = Object.fromEntries(
      FIRST.sources.map(({ name, text: body }) => [name, body]),
    );
    // A later release that renders the same moves no pin: the unit still
    // applies what 1.0.0 put there.
    const rewritten = compose({
      platform: {
        ...PLATFORM,
        files: PLATFORM.files.map((file) =>
          file.name === "platform.intent.yml"
            ? {
                ...file,
                text: file.text.replace(
                  "      repository: ghcr.io/jorisjonkers-dev/render\n",
                  "      repository: ghcr.io/jorisjonkers-dev/render\n      pullSecret: render-pull\n",
                ),
              }
            : file,
        ),
      },
      fragments: bumped("notes"),
      held: RELEASES,
      pins: pinned(FIRST),
      sources: committed,
      previous: { lock: FIRST.lock, commit: hex("estate-commit", 40) },
    });

    expect(rewritten.rollouts).toStrictEqual([]);
    expect(rewritten.lock.spec.fragments.notes?.version).toBe("1.1.0");
    expect(annotated(sourceOf(rewritten, "notes"))).toStrictEqual({
      "apps-notes": eventsOf(identityOf("notes", "1.0.0")),
    });
    expect(sourceOf(rewritten, "notes")).toContain("name: render-pull");
  });
});

// REQ-059 (docs/requirements.md): where the platform names a Reporter, the
// estate-scoped artifact holds the route Flux's events take to it, as a unit
// of its own (spec/v1/55-delivery.md#rollouts).
describe("composeEstate, for the route Flux's events take", () => {
  const EVENTS = "estate/rollout-events/";
  const LEGACY =
    "handover:\n  retireBy: 2027-03-31\n  legacy: [auth, edge, knowledge, notes, observability, secrets]\n  estate: [data, delivery]\n";
  /** A composition under `ledger`, the Platform document naming its Reporter or not. */
  const composed = (ledger: string, named: boolean): Composition =>
    compose({
      platform: {
        ...PLATFORM,
        files: PLATFORM.files.map((file) =>
          file.name === "platform.intent.yml"
            ? {
                ...file,
                text: withLedger(
                  named
                    ? file.text.replace(
                        "  gate: release-gate\n",
                        `  gate: release-gate\n${REPORTER}`,
                      )
                    : file.text,
                  ledger,
                ),
              }
            : file,
        ),
      },
    });
  const estate = (composition: Composition) =>
    composition.artifacts.find(({ name }) => name === "_estate");
  const paths = (composition: Composition): string[] =>
    estate(composition)?.files.map(({ path }) => path) ?? [];
  /** Each unit the estate-scoped artifact's pin source applies, as written. */
  const units = (composition: Composition) =>
    parseAllDocuments(
      composition.sources.find(({ name }) => name === "_estate")?.text ?? "",
    )
      .map(
        (document) =>
          document.toJSON() as {
            kind: string;
            metadata: Record<string, unknown>;
            spec: { path?: string; dependsOn?: unknown };
          },
      )
      .filter(({ kind }) => kind === "Kustomization");

  it("holds the Provider and the Alert, and applies them as a unit that follows nothing", () => {
    const whole = composed("", true);
    const unit = units(whole).find(
      ({ metadata }) => metadata["name"] === "estate-rollout-events",
    );

    expect(
      paths(whole).filter((path) => path.startsWith(EVENTS)),
    ).toStrictEqual([
      `${EVENTS}alert.yaml`,
      `${EVENTS}kustomization.yaml`,
      `${EVENTS}provider.yaml`,
    ]);
    expect(unit?.spec.path).toBe("./estate/rollout-events");
    expect(unit === undefined || "dependsOn" in unit.spec).toBe(false);
    // It is no Project's release, so it carries no Rollout.
    expect(unit === undefined || "annotations" in unit.metadata).toBe(false);
    const provider = parse(
      estate(whole)?.files.find(({ path }) => path === `${EVENTS}provider.yaml`)
        ?.text ?? "",
    ) as { metadata: { namespace: string }; spec: { address: string } };
    expect(provider.metadata.namespace).toBe("flux-system");
    expect(provider.spec.address).toBe(
      "http://reporter.delivery-system.svc.cluster.local:8080/flux",
    );
  });

  it("holds neither, and applies no such unit, where the platform names no Reporter", () => {
    const whole = composed("", false);

    expect(paths(whole)).not.toStrictEqual([]);
    expect(
      paths(whole).filter((path) => path.startsWith(EVENTS)),
    ).toStrictEqual([]);
    expect(units(whole).map(({ metadata }) => metadata["name"])).not.toContain(
      "estate-rollout-events",
    );
  });

  it("keeps the route beside the secrets unit while a Project is legacy, and still no edge", () => {
    const handingOver = composed(LEGACY, true);

    expect(
      [...new Set(paths(handingOver).map((path) => path.split("/")[1]))].sort(),
    ).toStrictEqual(["rollout-events", "vso-secrets"]);
    expect(
      units(handingOver)
        .map(({ metadata }) => metadata["name"])
        .sort(),
    ).toStrictEqual(["estate-rollout-events", "estate-vso-secrets"]);
    // Without a Reporter the same handover leaves the secrets unit alone.
    expect([
      ...new Set(
        paths(composed(LEGACY, false)).map((path) => path.split("/")[1]),
      ),
    ]).toStrictEqual(["vso-secrets"]);
  });
});

// REQ-060 (docs/requirements.md).
describe("composeEstate, for a Rollback's backup", () => {
  const BACKUPS = "estate/rollback-backups/";
  const REQUEST = "38526643693";
  const HANDED_OVER =
    "handover:\n  retireBy: 2027-03-31\n  legacy: [auth, delivery, edge, knowledge, notes, observability]\n  estate: [data, secrets]\n";
  const PLATFORM_HANDED_OVER: Fragment = {
    ...PLATFORM,
    files: PLATFORM.files.map((file) =>
      file.name === "platform.intent.yml"
        ? { ...file, text: withLedger(file.text, HANDED_OVER) }
        : file,
    ),
  };
  const NEWER = RELEASES.map((fragment) =>
    fragment.manifest.spec.project === "data"
      ? release("data", "1.1.0")
      : fragment,
  );
  const ASKED = { ...PAUSE, [PIN_ANNOTATIONS.rollbackBackup]: REQUEST };

  /** The data Project composed once, then again with `annotations` on its pin and a newer release published. */
  function asked(annotations: Pin["annotations"]): Composition {
    const first = compose({ platform: PLATFORM_HANDED_OVER });
    return compose({
      platform: PLATFORM_HANDED_OVER,
      fragments: NEWER,
      held: RELEASES,
      pins: pinned(first, { data: annotations }),
      previous: { lock: first.lock, commit: hex("estate-commit", 40) },
    });
  }
  const estateFiles = (composition: Composition) =>
    composition.artifacts.find(({ name }) => name === "_estate")?.files ?? [];
  interface RenderedJob {
    apiVersion: string;
    kind: string;
    metadata: {
      name: string;
      namespace: string;
      labels: Record<string, string>;
    };
    spec: {
      backoffLimit: number;
      activeDeadlineSeconds: number;
      template: {
        metadata: { labels: Record<string, string> };
        spec: {
          serviceAccountName: string;
          restartPolicy: string;
          containers: { env: { name: string; value: string }[] }[];
        };
      };
    };
  }
  const jobsOf = (composition: Composition): RenderedJob[] =>
    parseAllDocuments(
      estateFiles(composition).find(
        ({ path }) => path === `${BACKUPS}data.yaml`,
      )?.text ?? "",
    ).map((document) => document.toJSON() as RenderedJob);

  it("renders one one-shot Job per backed-up volume, run as its backup is and marked with the request", () => {
    const jobs = jobsOf(asked(ASKED));

    expect(
      estateFiles(asked(ASKED))
        .map(({ path }) => path)
        .filter((path) => path.startsWith(BACKUPS)),
    ).toStrictEqual([`${BACKUPS}data.yaml`, `${BACKUPS}kustomization.yaml`]);
    expect(jobs.map(({ metadata }) => metadata.name)).toStrictEqual([
      `postgres-data-backup-${REQUEST}`,
      `rabbitmq-data-backup-${REQUEST}`,
    ]);
    for (const { apiVersion, kind, metadata, spec } of jobs) {
      expect([apiVersion, kind]).toStrictEqual(["batch/v1", "Job"]);
      expect(metadata.namespace).toBe("data-system");
      expect(metadata.labels["estate.jorisjonkers.dev/rollback-backup"]).toBe(
        REQUEST,
      );
      expect(spec.template.metadata.labels).toStrictEqual(metadata.labels);
      expect(spec.backoffLimit).toBe(0);
      expect(spec.activeDeadlineSeconds).toBe(7200);
      expect(spec.template.spec.restartPolicy).toBe("Never");
      expect(spec.template.spec.containers[0]?.env).toContainEqual({
        name: "BACKUP_ROLLBACK",
        value: REQUEST,
      });
    }
  });

  it("runs each Job as the identity, with the method and claims, the scheduled backup uses", () => {
    const composition = asked(ASKED);
    const scheduled = parseAllDocuments(
      composition.artifacts
        .find(({ name }) => name === "data")
        ?.files.find(({ path }) =>
          path.endsWith("/platform-postgres/backup.yaml"),
        )?.text ?? "",
    ).map(
      (document) =>
        document.toJSON() as {
          spec: {
            jobTemplate: {
              spec: {
                template: { spec: RenderedJob["spec"]["template"]["spec"] };
              };
            };
          };
        },
    )[0]?.spec.jobTemplate.spec.template.spec;
    const [postgres] = jobsOf(composition);
    const { restartPolicy, containers, ...rest } = postgres?.spec.template
      .spec as RenderedJob["spec"]["template"]["spec"];
    const {
      restartPolicy: scheduledPolicy,
      containers: scheduledContainers,
      ...scheduledRest
    } = scheduled as RenderedJob["spec"]["template"]["spec"];

    expect([restartPolicy, scheduledPolicy]).toStrictEqual([
      "Never",
      "OnFailure",
    ]);
    expect(rest).toStrictEqual(scheduledRest);
    expect(containers[0]?.env).toStrictEqual([
      ...(scheduledContainers[0]?.env ?? []),
      { name: "BACKUP_ROLLBACK", value: REQUEST },
    ]);
  });

  it("backs up the release the Project is pinned to, and moves none of its pin", () => {
    const composition = asked(ASKED);

    expect(composition.lock.spec.fragments["data"]?.version).toBe("1.0.0");
    expect(
      composition.artifacts.find(({ name }) => name === "data")?.moves,
    ).toBe(false);
  });

  it("applies the Jobs as a unit of the estate's pin source that follows nothing", () => {
    const unit = parseAllDocuments(
      asked(ASKED).sources.find(({ name }) => name === "_estate")?.text ?? "",
    )
      .map(
        (document) =>
          document.toJSON() as {
            kind: string;
            metadata: { name: string };
            spec: Record<string, unknown>;
          },
      )
      .find(({ metadata }) => metadata.name === "estate-rollback-backups");

    expect(unit?.kind).toBe("Kustomization");
    expect(unit?.spec["path"]).toBe("./estate/rollback-backups");
    expect(unit === undefined || "dependsOn" in unit.spec).toBe(false);
  });

  it("renders nothing for a Project that is only paused, or that never composed", () => {
    const paused = asked(PAUSE);
    const never = compose({
      platform: PLATFORM_HANDED_OVER,
      pins: { data: { contentHash: "sha256:0", annotations: ASKED } },
    });

    for (const composition of [paused, never])
      expect(
        estateFiles(composition).some(({ path }) => path.startsWith(BACKUPS)),
      ).toBe(false);
    expect(paused.lock.spec.fragments["data"]?.version).toBe("1.1.0");
  });

  it("renders nothing for a Project on the estate path with no backed-up volume", () => {
    const first = compose({ platform: PLATFORM_HANDED_OVER });
    const composition = compose({
      platform: PLATFORM_HANDED_OVER,
      held: RELEASES,
      pins: pinned(first, { secrets: ASKED }),
      previous: { lock: first.lock, commit: hex("estate-commit", 40) },
    });

    expect(
      estateFiles(composition).some(({ path }) => path.startsWith(BACKUPS)),
    ).toBe(false);
    expect(
      composition.artifacts.find(({ name }) => name === "secrets")?.moves,
    ).toBe(false);
  });

  it("renders nothing for a Project still on the old path", () => {
    const first = compose();
    const composition = compose({
      fragments: NEWER,
      held: RELEASES,
      pins: pinned(first, { data: ASKED }),
      previous: { lock: first.lock, commit: hex("estate-commit", 40) },
    });

    expect(
      estateFiles(composition).some(({ path }) => path.startsWith(BACKUPS)),
    ).toBe(false);
  });
});
