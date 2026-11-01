// REQ-166 (docs/requirements.md): each real estate Project worked under
// spec/v1/examples/estate/ parses, resolves and renders, composed with the
// whole estate it was taken from, to its committed oracles byte for byte.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  parseProjectIntent,
  renderIntentSet,
  resolveIntentSet,
  serialize,
  sha256Hasher,
  type AuthoredFile,
} from "../../src/index.ts";

const ESTATE = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
  "estate",
);

/** The Projects worked from the estate, each with its oracles beside it. */
const CASES = ["hindsight", "immich", "observability"];

/** Every file under `directory`, by its path relative to `root`. */
function walk(directory: string, root: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? walk(path, root)
      : [relative(root, path)];
  });
}

/**
 * The estate as composition read it: every authored file under the directory,
 * and none of the oracles, the trees or the README written beside them.
 */
const SET: AuthoredFile[] = walk(ESTATE, ESTATE)
  .filter(
    (name) =>
      !name
        .split("/")
        .some((part) => part === "expected" || part === "rendered") &&
      !name.endsWith(".md"),
  )
  .sort()
  .map((name) => ({ name, text: readFileSync(join(ESTATE, name), "utf8") }));

const OPTIONS = {
  hash: sha256Hasher,
  schemaPackageIntegrity:
    "sha256:5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b",
};

const text = (path: string): string => readFileSync(join(ESTATE, path), "utf8");

const resolved = (() => {
  const result = resolveIntentSet(SET, OPTIONS);
  if (!result.ok)
    throw new Error(JSON.stringify(result.diagnostics.map(({ code }) => code)));
  return result.value.projects;
})();

const projectOf = (name: string) => {
  const found = resolved.find(({ project }) => project === name);
  if (found === undefined) throw new Error(`${name} did not resolve`);
  return found;
};

describe("the real estate's worked Projects", () => {
  it("compose the whole estate, every Project on its path beside the three worked", () => {
    expect(resolved.map(({ project }) => project)).toStrictEqual(
      expect.arrayContaining([...CASES, "auth", "data", "delivery", "edge"]),
    );
    expect(resolved).toHaveLength(24);
  });

  it.each(CASES)(
    "parses %s's project file to its committed intent oracle, byte for byte",
    (name) => {
      const file = readdirSync(join(ESTATE, name)).find((entry) =>
        entry.endsWith(".project.yml"),
      ) as string;
      const result = parseProjectIntent(text(`${name}/${file}`));

      expect(result.ok && canonicalJson(result.value.document)).toBe(
        text(`${name}/expected/intent.json`),
      );
    },
  );

  it.each(CASES)(
    "resolves %s's dependency edges to its committed oracle, byte for byte",
    (name) => {
      expect(canonicalJson(projectOf(name).dependencies)).toBe(
        text(`${name}/expected/dependencies.json`),
      );
    },
  );

  it.each(CASES)(
    "resolves each of %s's Applications to its committed projection, byte for byte, and holds an oracle for no other",
    (name) => {
      const { applications } = projectOf(name);
      const oracles = readdirSync(join(ESTATE, name, "expected"))
        .filter((entry) => entry.startsWith("resolved."))
        .sort();

      expect(oracles).toStrictEqual(
        applications.map(({ id }) => `resolved.${id}.json`).sort(),
      );
      for (const application of applications)
        expect(canonicalJson(application), application.id).toBe(
          text(`${name}/expected/resolved.${application.id}.json`),
        );
    },
  );

  it.each(CASES)(
    "renders %s's share of the tree, alone, to its committed tree, byte for byte",
    (name) => {
      const result = renderIntentSet(SET, {
        ...OPTIONS,
        serialize,
        projects: [name],
      });
      const artifact = result.ok
        ? result.value.find((candidate) => candidate.name === name)
        : undefined;
      const root = join(ESTATE, name, "rendered");

      expect(
        Object.fromEntries(
          (artifact?.files ?? []).map(({ path, text: body }) => [path, body]),
        ),
      ).toStrictEqual(
        Object.fromEntries(
          walk(root, root).map((path) => [
            path,
            readFileSync(join(root, path), "utf8"),
          ]),
        ),
      );
    },
  );
});
