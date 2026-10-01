// REQ-040 (docs/requirements.md) and RULE-034 (docs/architecture-rules.md): the composed union renders, at the use-case
// seam, to each project's share of the tree and the estate-scoped share, and
// minimal's equal their committed trees byte for byte, every file attributed
// to one adapter. Rendering twice from the same inputs writes the same bytes.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  renderIntentSet,
  serialize,
  serializeYaml,
  sha256Hasher,
  type AuthoredFile,
  type RenderedArtifact,
} from "../../src/index.ts";
import { ADAPTERS } from "../../src/adapters/registry.ts";

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

const SET = [
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
  "data/data.project.yml",
  "data/env/postgres/base.env",
  "data/config/postgresql.conf",
];

const OPTIONS = {
  hash: sha256Hasher,
  schemaPackageIntegrity:
    "sha256:5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b",
  serialize,
  projects: ["notes"],
};

function files(
  edits: Readonly<Record<string, (text: string) => string>> = {},
): AuthoredFile[] {
  return SET.map((name) => ({
    name,
    text: (edits[name] ?? ((same: string) => same))(text(name)),
  }));
}

function render(
  edits?: Readonly<Record<string, (text: string) => string>>,
  projects: readonly string[] = ["notes"],
): readonly RenderedArtifact[] {
  const result = renderIntentSet(files(edits), { ...OPTIONS, projects });
  if (!result.ok)
    throw new Error(JSON.stringify(result.diagnostics.map(({ code }) => code)));
  return result.value;
}

/** Every file under a committed tree, by its path relative to the tree. */
function committed(tree: string): Record<string, string> {
  const root = join(EXAMPLES, tree);
  const walk = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  return Object.fromEntries(
    walk(root).map((path) => [
      relative(root, path),
      readFileSync(path, "utf8"),
    ]),
  );
}

const asTree = (
  artifact: RenderedArtifact | undefined,
): Record<string, string> =>
  Object.fromEntries(
    (artifact?.files ?? []).map(({ path, text: body }) => [path, body]),
  );

const artifact = (artifacts: readonly RenderedArtifact[], name: string) =>
  artifacts.find((candidate) => candidate.name === name);

describe("renderIntentSet", () => {
  it("renders minimal's share of the tree to its committed tree, byte for byte", () => {
    expect(asTree(artifact(render(), "notes"))).toStrictEqual(
      committed("minimal/rendered"),
    );
  });

  it("renders data's share of the tree to its committed tree, byte for byte", () => {
    expect(asTree(artifact(render(undefined, ["data"]), "data"))).toStrictEqual(
      committed("data/rendered"),
    );
  });

  it("renders the estate-scoped share of both to its committed tree, byte for byte", () => {
    expect(
      asTree(artifact(render(undefined, ["notes", "data"]), "_estate")),
    ).toStrictEqual(committed("_estate/rendered"));
  });

  it("renders the same bytes twice from the same inputs, in one module and in a fresh one", async () => {
    vi.resetModules();
    const fresh = await import("../../src/index.ts");
    const again = fresh.renderIntentSet(files(), {
      ...OPTIONS,
      serialize: fresh.serialize,
      hash: fresh.sha256Hasher,
    });

    expect(render()).toStrictEqual(render());
    expect(again.ok && again.value).toStrictEqual(render());
  });

  it("differs from the committed tree when one authored field moves", () => {
    expect(
      asTree(
        artifact(
          render({
            "minimal/notes.project.yml": (document) =>
              document.replace("memory: 256Mi", "memory: 512Mi"),
          }),
          "notes",
        ),
      ),
    ).not.toStrictEqual(committed("minimal/rendered"));
  });

  it("attributes every file to the one adapter that owns its kind", () => {
    expect(
      Object.fromEntries(
        (artifact(render(), "notes")?.files ?? []).map(({ path, adapter }) => [
          path,
          adapter,
        ]),
      ),
    ).toStrictEqual({
      "apps/notes/kustomization.yaml": "kubernetes",
      "apps/notes/namespace.yaml": "kubernetes",
      "apps/notes/networkpolicy.yaml": "networking",
      "apps/notes/notes/canary.yaml": "kubernetes",
      "apps/notes/notes/kustomization.yaml": "kubernetes",
      "apps/notes/notes/networkpolicy.yaml": "networking",
      "apps/notes/notes/podmonitor.yaml": "prometheus",
      "apps/notes/notes/serviceaccount.yaml": "kubernetes",
      "apps/notes/notes/workload.yaml": "kubernetes",
    });
  });

  it("renders only the projects it is asked for", () => {
    expect(render(undefined, []).map(({ name }) => name)).toStrictEqual([]);
  });

  it("refuses the set before rendering where resolution refuses it", () => {
    const result = renderIntentSet(
      files({
        "minimal/notes.project.yml": (document) =>
          document.replace("image: notes-api", "image: unlocked"),
      }),
      OPTIONS,
    );

    expect(
      result.ok ? [] : result.diagnostics.map(({ code }) => code),
    ).toStrictEqual(["E_UNLOCKED_IMAGE"]);
  });

  it("refuses a render in which two adapters claim one path, before anything is serialized", () => {
    let serialized = 0;
    const claims = (name: string) => ({
      name,
      defaultPath: "apps/<project>/claimed.yaml",
      render: () => [
        { path: "apps/notes/claimed.yaml", adapter: name, objects: [] },
      ],
    });
    const result = renderIntentSet(files(), {
      ...OPTIONS,
      adapters: [claims("one"), claims("two")],
      serialize: () => {
        serialized += 1;
        return "";
      },
    });

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, message }) => `${code} ${message}`),
    ).toStrictEqual([
      "E_PATH_COLLISION apps/notes/claimed.yaml is claimed by one and two",
    ]);
    expect(serialized).toBe(0);
  });

  it("stops at a project it cannot render yet: the rolling delivery machinery waits on its slice", () => {
    expect(() => render(undefined, ["delivery"])).toThrow(
      "flagger: a application Process that switches rolling is not rendered yet",
    );
  });

  it("stops at a file grant, which the render mounts in its own slice", () => {
    expect(() =>
      render({
        "minimal/notes.project.yml": (document) =>
          document.replace(
            "        runtime: node\n",
            "        runtime: node\n        secrets:\n          - { path: secret/data/notes/key, keys: [key], access: read, delivery: file, mountAt: /run/key, rotation: {tolerates: restart} }\n",
          ),
      }),
    ).toThrow("notes-api: a file grant is not rendered yet");
  });

  it("orders the tree whatever order the adapters hand it out in", () => {
    const reversed = ADAPTERS.map((adapter) => ({
      ...adapter,
      render: (project: Parameters<typeof adapter.render>[0]) =>
        adapter.render(project).reverse(),
    })).reverse();
    const result = renderIntentSet(files(), { ...OPTIONS, adapters: reversed });

    expect(result.ok && result.value).toStrictEqual(render());
  });

  it("hands out each artifact's files in path order, and the artifacts by name", () => {
    const artifacts = render();
    const paths = (name: string) =>
      artifact(artifacts, name)?.files.map(({ path }) => path) ?? [];

    expect(artifacts.map(({ name }) => name)).toStrictEqual([
      "_estate",
      "notes",
    ]);
    expect(paths("notes")).toStrictEqual([
      "apps/notes/kustomization.yaml",
      "apps/notes/namespace.yaml",
      "apps/notes/networkpolicy.yaml",
      "apps/notes/notes/canary.yaml",
      "apps/notes/notes/kustomization.yaml",
      "apps/notes/notes/networkpolicy.yaml",
      "apps/notes/notes/podmonitor.yaml",
      "apps/notes/notes/serviceaccount.yaml",
      "apps/notes/notes/workload.yaml",
    ]);
    expect(paths("_estate")).toStrictEqual([
      "apps/edge/public-frankfurt/kustomization.yaml",
      "apps/edge/public-frankfurt/notes-public.yaml",
    ]);
  });

  it("puts a path under apps/edge in the _estate artifact, and one merely naming edge in its project's", () => {
    const result = renderIntentSet(files(), {
      ...OPTIONS,
      adapters: [
        {
          name: "probe",
          defaultPath: "apps/<project>/x.yaml",
          render: () => [
            {
              path: "apps/notes/apps/edge/x.yaml",
              adapter: "probe",
              objects: [],
            },
            { path: "apps/edge/lan/x.yaml", adapter: "probe", objects: [] },
          ],
        },
      ],
      serialize: () => "",
    });

    expect(
      result.ok &&
        result.value.map(({ name, files: held }) => [
          name,
          held.map(({ path }) => path),
        ]),
    ).toStrictEqual([
      ["_estate", ["apps/edge/lan/kustomization.yaml", "apps/edge/lan/x.yaml"]],
      [
        "notes",
        [
          "apps/notes/apps/edge/kustomization.yaml",
          "apps/notes/apps/edge/x.yaml",
        ],
      ],
    ]);
  });

  it("writes every object of a file as its own document after the one header line", () => {
    expect(
      serializeYaml([
        {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: { name: "a", labels: {} },
        },
        {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: { name: "b", labels: {} },
        },
      ]),
    ).toBe(
      "# GENERATED. Never hand-edit.\n---\napiVersion: v1\nkind: Namespace\nmetadata:\n  name: a\n  labels: {}\n---\napiVersion: v1\nkind: Namespace\nmetadata:\n  name: b\n  labels: {}\n",
    );
  });
});
