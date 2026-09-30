// RULE-045 (docs/architecture-rules.md): every registered adapter satisfies the
// adapter port (spec/v1/30-deliverables.md#the-adapter-port). It attributes
// every Deliverable to itself, renders the same Deliverables twice, and writes
// only relative, normalised paths.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADAPTERS, type Adapter } from "../../src/adapters/registry.ts";
import {
  resolveIntentSet,
  sha256Hasher,
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

function minimal(): ResolvedProject {
  const result = resolveIntentSet(
    [
      "platform/platform.intent.yml",
      "platform/node-contract.yml",
      "platform/images.lock.yml",
      "platform/cluster-state.yml",
      "minimal/notes.project.yml",
      "minimal/env/notes-api/base.env",
      "delivery/delivery.project.yml",
      "edge/edge.project.yml",
      "observability/observability.project.yml",
    ].map((name) => ({
      name,
      text: readFileSync(join(EXAMPLES, name), "utf8"),
    })),
    { hash: sha256Hasher, schemaPackageIntegrity: `sha256:${"0".repeat(64)}` },
  );
  const notes = result.ok
    ? result.value.projects.find(({ project }) => project === "notes")
    : undefined;
  if (notes === undefined) throw new Error("minimal did not resolve");
  return notes;
}

/** Every way `adapter` breaks the port over `project`, or none. */
function violationsOf(adapter: Adapter, project: ResolvedProject): string[] {
  const first = adapter.render(project);
  const second = adapter.render(project);
  return [
    ...first
      .filter((deliverable) => deliverable.adapter !== adapter.name)
      .map(({ path, adapter: owner }) => `${path} is attributed to ${owner}`),
    ...first
      .filter(
        ({ path }) => path.startsWith("/") || path.split("/").includes(".."),
      )
      .map(({ path }) => `${path} is not a safe relative path`),
    ...(JSON.stringify(first) === JSON.stringify(second)
      ? []
      : [`${adapter.name} renders differently twice`]),
  ];
}

describe("the adapter contract", () => {
  it.each(ADAPTERS.map((adapter) => [adapter.name, adapter] as const))(
    "%s satisfies the adapter port",
    (_name, adapter) => {
      expect(violationsOf(adapter, minimal())).toStrictEqual([]);
    },
  );

  it("registers the four adapters minimal needs, each with a default path", () => {
    expect(
      ADAPTERS.map(({ name, defaultPath }) => [name, defaultPath.length > 0]),
    ).toStrictEqual([
      ["kubernetes", true],
      ["networking", true],
      ["prometheus", true],
      ["traefik", true],
    ]);
  });

  it("names an adapter that attributes, places or renders wrongly", () => {
    let calls = 0;
    const broken: Adapter = {
      name: "broken",
      defaultPath: "apps/<project>/broken.yaml",
      render: () => {
        calls += 1;
        return [
          {
            path: `../escape-${String(calls)}.yaml`,
            adapter: "someone-else",
            objects: [],
          },
        ];
      },
    };

    expect(violationsOf(broken, minimal())).toStrictEqual([
      "../escape-1.yaml is attributed to someone-else",
      "../escape-1.yaml is not a safe relative path",
      "broken renders differently twice",
    ]);
  });
});
