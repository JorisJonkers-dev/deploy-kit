// REQ-039 (docs/requirements.md): the composed union and the pinned inputs
// beside it resolve at the use-case seam to every project's projections, and
// minimal's equal its committed resolved.json and dependencies.json byte for
// byte; a pinned input the render cannot trust is refused before resolution.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  parseProjectIntent,
  resolveIntentSet,
  sha256Hasher,
  type AuthoredFile,
  type ResolvedProject,
} from "../../src/index.ts";

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

/** The integrity the worked projections record for the schema package. */
const INTEGRITY =
  "sha256:5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b";

/** minimal, the foundation it composes with, and the pinned inputs beside them. */
const MINIMAL_SET = [
  "platform/platform.intent.yml",
  "platform/node-contract.yml",
  "platform/images.lock.yml",
  "platform/cluster-state.yml",
  "minimal/notes.project.yml",
  "minimal/env/notes-api/base.env",
  "delivery/delivery.project.yml",
  "edge/edge.project.yml",
  "observability/observability.project.yml",
  "secrets/secrets.project.yml",
];

/** The set, with `edit` applied to the file named `name`. */
function files(
  edits: Readonly<Record<string, (text: string) => string>> = {},
  extra: readonly AuthoredFile[] = [],
): AuthoredFile[] {
  return [
    ...MINIMAL_SET.map((name) => ({
      name,
      text: (edits[name] ?? ((same: string) => same))(text(name)),
    })),
    ...extra,
  ];
}

const options = { hash: sha256Hasher, schemaPackageIntegrity: INTEGRITY };

function resolved(
  edits?: Readonly<Record<string, (text: string) => string>>,
  extra?: readonly AuthoredFile[],
): ResolvedProject[] {
  const result = resolveIntentSet(files(edits, extra), options);
  if (!result.ok)
    throw new Error(JSON.stringify(result.diagnostics.map(({ code }) => code)));
  return [...result.value.projects];
}

const refusals = (
  edits?: Readonly<Record<string, (text: string) => string>>,
  extra?: readonly AuthoredFile[],
): { code: string; document?: string; path: string }[] => {
  const result = resolveIntentSet(files(edits, extra), options);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, document, path }) => ({
        code,
        ...(document === undefined ? {} : { document }),
        path,
      }));
};

const project = (
  projects: ResolvedProject[],
  name: string,
): ResolvedProject => {
  const found = projects.find((candidate) => candidate.project === name);
  if (found === undefined) throw new Error(`${name} did not resolve`);
  return found;
};

const notes = (edits?: Readonly<Record<string, (text: string) => string>>) => {
  const [application] = project(resolved(edits), "notes").applications;
  if (application === undefined) throw new Error("notes holds no Application");
  return application;
};

describe("resolveIntentSet", () => {
  it("resolves minimal to its committed projection, byte for byte", () => {
    expect(canonicalJson(notes())).toBe(text("minimal/expected/resolved.json"));
  });

  it("resolves the Release Gate, composed with the same foundation, to its committed projection", () => {
    const gate = project(resolved(), "delivery").applications.find(
      ({ id }) => id === "release-gate",
    );

    expect(canonicalJson(gate)).toBe(text("delivery/expected/resolved.json"));
  });

  describe("auth, composed with data, the same foundation and the files beside both", () => {
    const auth = () => {
      const result = resolveIntentSet(
        [
          ...files().filter(({ name }) => !name.startsWith("minimal/")),
          ...[
            "auth/auth.project.yml",
            "auth/env/auth-api/base.env",
            "auth/migration-proof.yml",
            "data/data.project.yml",
            "data/env/postgres/base.env",
            "data/config/postgresql.conf",
          ].map((name) => ({ name, text: text(name) })),
        ],
        options,
      );
      if (!result.ok)
        throw new Error(
          JSON.stringify(result.diagnostics.map(({ code }) => code)),
        );
      return project([...result.value.projects], "auth");
    };

    it("resolves auth to its committed projection, byte for byte", () => {
      expect(canonicalJson(auth().applications[0])).toBe(
        text("auth/expected/resolved.json"),
      );
    });

    it("resolves auth's dependency edges to its committed oracle, byte for byte", () => {
      expect(canonicalJson(auth().dependencies)).toBe(
        text("auth/expected/dependencies.json"),
      );
    });
  });

  describe("data, composed with the same foundation and the files beside it", () => {
    const data = () => {
      const result = resolveIntentSet(
        [
          ...files().filter(({ name }) => !name.startsWith("minimal/")),
          ...[
            "data/data.project.yml",
            "data/env/postgres/base.env",
            "data/config/postgresql.conf",
          ].map((name) => ({ name, text: text(name) })),
        ],
        options,
      );
      if (!result.ok)
        throw new Error(
          JSON.stringify(result.diagnostics.map(({ code }) => code)),
        );
      return project([...result.value.projects], "data");
    };

    it.each([
      ["platform-postgres", "resolved.json"],
      ["platform-rabbitmq", "resolved.platform-rabbitmq.json"],
      ["platform-valkey", "resolved.platform-valkey.json"],
    ])(
      "resolves %s to its committed projection, byte for byte",
      (id, oracle) => {
        expect(
          canonicalJson(
            data().applications.find((candidate) => candidate.id === id),
          ),
        ).toBe(text(`data/expected/${oracle}`));
      },
    );

    it("resolves data's dependency edges to its committed oracle, byte for byte", () => {
      expect(canonicalJson(data().dependencies)).toBe(
        text("data/expected/dependencies.json"),
      );
    });
  });

  it("resolves minimal's dependency edges to its committed oracle, byte for byte", () => {
    expect(canonicalJson(project(resolved(), "notes").dependencies)).toBe(
      text("minimal/expected/dependencies.json"),
    );
  });

  it("moves the projection, the revision and the render hash when one authored field moves", () => {
    const moved = notes({
      "minimal/notes.project.yml": (document) =>
        document.replace("memory: 256Mi", "memory: 512Mi"),
    });
    const committed = JSON.parse(text("minimal/expected/resolved.json")) as {
      revision: string;
      provenance: { renderHash: string };
    };

    expect(moved.revision).not.toBe(committed.revision);
    expect(moved.provenance.renderHash).not.toBe(
      committed.provenance.renderHash,
    );
  });

  it("resolves every project of the union, each with its own projections", () => {
    expect(resolved().map(({ project: name }) => name)).toStrictEqual([
      "notes",
      "delivery",
      "edge",
      "observability",
      "secrets",
    ]);
  });

  it("records one digest per pinned input, every fragment first and by name", () => {
    expect(
      notes().provenance.inputDigests.map(
        ({ input, name }) => `${input} ${name}`,
      ),
    ).toStrictEqual([
      "intent-fragment delivery",
      "intent-fragment edge",
      "intent-fragment notes",
      "intent-fragment observability",
      "intent-fragment secrets",
      "platform-intent jorisjonkers.dev",
      "node-contract production",
      "images-lock estate",
      "cluster-state production",
    ]);
  });

  it("digests a fragment's env files in path order, whatever order they are read in", () => {
    const shared = {
      name: "minimal/env/_project/base.env",
      text: "SHARED=1\n",
    };
    const digest = (reorder: boolean) => {
      const set = files({}, [shared]);
      const ordered = reorder
        ? [shared, ...set.filter((file) => file !== shared)]
        : set;
      const result = resolveIntentSet(ordered, options);
      return result.ok
        ? result.value.projects[0]?.applications[0]?.provenance.renderHash
        : undefined;
    };

    expect(digest(true)).toBe(digest(false));
    expect(digest(false)).toBeDefined();
  });

  it("digests a fragment as its document, its env files' scopes and contents, and its Asset files, in path order", () => {
    const shared = {
      name: "minimal/env/_project/base.env",
      text: "SHARED=1\n",
    };
    const result = resolveIntentSet(files({}, [shared]), options);
    const recorded = result.ok
      ? result.value.projects[0]?.applications[0]?.provenance.inputDigests.find(
          ({ name }) => name === "notes",
        )?.digest
      : undefined;
    const parsed = parseProjectIntent(text("minimal/notes.project.yml"), [
      { path: shared.name, text: shared.text },
      {
        path: "minimal/env/notes-api/base.env",
        text: text("minimal/env/notes-api/base.env"),
      },
    ]);
    if (!parsed.ok) throw new Error("minimal did not parse");

    expect(recorded).toBe(
      sha256Hasher({
        document: parsed.value.document,
        env: parsed.value.env.map(({ scope, file }) => ({ scope, file })),
        assets: [],
      }),
    );
  });

  it("moves a fragment's digest when only an env file beside it moves", () => {
    const digestOf = (projects: ResolvedProject[]) =>
      project(projects, "notes").applications[0]?.provenance.inputDigests.find(
        ({ name }) => name === "notes",
      )?.digest;
    const before = digestOf(resolved());
    const after = digestOf(
      resolved({
        "minimal/env/notes-api/base.env": (env) =>
          env.replace("NOTES_PAGE_SIZE=50", "NOTES_PAGE_SIZE=51"),
      }),
    );

    expect(after).not.toBe(before);
  });
});

describe("the pinned inputs a render cannot trust", () => {
  it("refuses a node contract other than the one the Platform document pins", () => {
    expect(
      refusals({
        "platform/node-contract.yml": (contract) =>
          contract.replace(
            "allocatable: { cpu: 5750m, memory: 7936Mi }",
            "allocatable: { cpu: 5751m, memory: 7936Mi }",
          ),
      }),
    ).toStrictEqual([
      {
        code: "E_NODE_CONTRACT_MISMATCH",
        document: "platform/platform.intent.yml",
        path: "/metadata/nodeContract",
      },
    ]);
  });

  it("refuses an image alias the images lock does not hold, on a Process and on a sidecar", () => {
    expect(
      refusals({
        "minimal/notes.project.yml": (document) =>
          document
            .replace("image: notes-api", "image: notes-unlocked")
            .replace(
              "    placement:",
              "    sidecars:\n          - {name: shipper, image: shipper, memory: 16Mi, cpu: 5m}\n        placement:",
            ),
      }),
    ).toStrictEqual([
      {
        code: "E_UNLOCKED_IMAGE",
        document: "minimal/notes.project.yml",
        path: "/applications/0/processes/0/image",
      },
      {
        code: "E_UNLOCKED_IMAGE",
        document: "minimal/notes.project.yml",
        path: "/applications/0/processes/0/sidecars/0/image",
      },
    ]);
  });

  it("refuses a Process no node can hold", () => {
    expect(
      refusals({
        "minimal/notes.project.yml": (document) =>
          document.replace("memory: 256Mi", "memory: 64Gi"),
      }),
    ).toStrictEqual([
      {
        code: "E_PLACEMENT_UNSATISFIABLE",
        document: "minimal/notes.project.yml",
        path: "/applications/0/processes/0/placement",
      },
    ]);
  });

  it("names every pinned input the set is missing, and a Platform document before them", () => {
    const withoutPinned = files().filter(
      ({ name }) =>
        !name.startsWith("platform/") || name.endsWith("platform.intent.yml"),
    );
    const without = resolveIntentSet(withoutPinned, options);

    expect(
      without.ok ? [] : without.diagnostics.map(({ message }) => message),
    ).toStrictEqual([
      "a resolution reads a node-contract.yml, and the set holds none",
      "a resolution reads a images.lock.yml, and the set holds none",
      "a resolution reads a cluster-state.yml, and the set holds none",
    ]);

    const noPlatform = resolveIntentSet(
      files().filter(({ name }) => !name.endsWith("platform.intent.yml")),
      options,
    );

    expect(
      noPlatform.ok ? [] : noPlatform.diagnostics.map(({ message }) => message),
    ).toStrictEqual([
      "a resolution reads a Platform document, and the set holds none",
    ]);
  });

  it("refuses a pinned input that breaks its schema or the YAML subset, in that input", () => {
    expect(
      refusals({
        "platform/images.lock.yml": (lock) =>
          lock.replace("uid: 1000", "uid: -1"),
        "platform/cluster-state.yml": (state) => `${state}---\n${state}`,
      }).map(({ code, document }) => `${code} ${document ?? ""}`),
    ).toStrictEqual([
      "schema platform/images.lock.yml",
      "schema platform/cluster-state.yml",
    ]);
  });

  it("refuses the set before resolution where composition refuses it", () => {
    expect(
      refusals({
        "observability/observability.project.yml": (document) =>
          document.replace("otlp: 4317", "grpc: 4317"),
      }).map(({ code }) => code),
    ).toStrictEqual(["E_UNKNOWN_TELEMETRY_COLLECTOR"]);
  });
});

describe("what a refusal before resolution says", () => {
  const full = (edits: Readonly<Record<string, (text: string) => string>>) => {
    const result = resolveIntentSet(files(edits), options);
    return result.ok ? [] : result.diagnostics;
  };

  it("names the node contract read and what to do about it", () => {
    const [refusal] = full({
      "platform/platform.intent.yml": (platform) =>
        platform.replace(
          /nodeContract: "sha256:[a-f0-9]+"/,
          `nodeContract: "sha256:${"0".repeat(64)}"`,
        ),
    });

    expect(refusal?.message).toMatch(
      /^the node contract read is sha256:[a-f0-9]{64}, not the one this document pins$/,
    );
    expect(refusal?.hint).toBe(
      "Pin the digest of the node contract the render reads, or read the one pinned.",
    );
  });

  it("names the alias no lock holds and the Process nothing can hold", () => {
    expect(
      full({
        "minimal/notes.project.yml": (document) =>
          document
            .replace("image: notes-api", "image: notes-unlocked")
            .replace("memory: 256Mi", "memory: 64Gi"),
      }).map(({ message, hint }) => ({ message, hint })),
    ).toStrictEqual([
      {
        message: "the images lock holds no entry for notes-unlocked",
        hint: "Lock the alias, or name one the images lock holds.",
      },
      {
        message: "no node in the node contract can hold notes-api",
        hint: "Relax a placement dimension, or lower what the Process asks for.",
      },
    ]);
  });

  it("says a missing input is the set's to supply, with nowhere in any document to point", () => {
    const [missing] = (() => {
      const result = resolveIntentSet(
        files().filter(({ name }) => !name.endsWith("images.lock.yml")),
        options,
      );
      return result.ok ? [] : result.diagnostics;
    })();

    expect(missing).toStrictEqual({
      code: "schema",
      path: "",
      message: "a resolution reads a images.lock.yml, and the set holds none",
      hint: "Read the set together with its Platform document, node contract, images lock and ClusterState snapshot.",
    });
  });

  it.each([
    ["platform/node-contract.yml", "labelPrefix:", "labelPrefixes:"],
    ["platform/images.lock.yml", "name: estate", "name: ''"],
    ["platform/cluster-state.yml", "bindings: []", "bindings: {}"],
  ])(
    "refuses %s alone when it alone breaks its schema, against chapter 20",
    (name, from, to) => {
      const refused = full({ [name]: (input) => input.replace(from, to) });

      expect([
        ...new Set(refused.map(({ document }) => document)),
      ]).toStrictEqual([name]);
      expect(refused[0]?.hint).toBe(
        "Correct the field against spec/v1/20-resolved-deployment.md.",
      );
    },
  );
});
