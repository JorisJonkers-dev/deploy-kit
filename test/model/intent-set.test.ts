// REQ-031 (docs/requirements.md): the Platform document and the project files
// read beside it are refused where a reference one makes into the other does
// not resolve, or a policy one asks for the other does not offer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkIntentSet, type AuthoredFile } from "../../src/index.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);
const read = (path: string): AuthoredFile => ({
  name: path,
  text: readFileSync(join(EXAMPLES, path), "utf8"),
});

const WORKED = [
  "platform/platform.intent.yml",
  "auth/auth.project.yml",
  "data/data.project.yml",
  "knowledge/knowledge.project.yml",
  "minimal/notes.project.yml",
].map(read);

const refusalsOf = (files: readonly AuthoredFile[]) => {
  const result = checkIntentSet(files);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, document, path }) => ({
        code,
        document,
        path,
      }));
};

describe("checkIntentSet", () => {
  it("refuses the worked estate exactly where the Platform document says it will", () => {
    expect(refusalsOf(WORKED)).toStrictEqual([
      {
        code: "E_UNKNOWN_TIER_PROXY",
        document: "platform/platform.intent.yml",
        path: "/tiers/0",
      },
      {
        code: "E_UNKNOWN_TIER_PROXY",
        document: "platform/platform.intent.yml",
        path: "/tiers/1",
      },
      {
        code: "E_SECRETS_AT_REST_REQUIRED",
        document: "data/data.project.yml",
        path: "/applications/0/processes/0/secrets/0",
      },
      // The two grants both Applications share sit at the project header,
      // and a header grant is refused where it is written.
      {
        code: "E_SECRETS_AT_REST_REQUIRED",
        document: "knowledge/knowledge.project.yml",
        path: "/secrets/0",
      },
      {
        code: "E_SECRETS_AT_REST_REQUIRED",
        document: "knowledge/knowledge.project.yml",
        path: "/secrets/1",
      },
      {
        code: "E_SECRETS_AT_REST_REQUIRED",
        document: "knowledge/knowledge.project.yml",
        path: "/applications/0/processes/0/secrets/0",
      },
      {
        code: "E_SECRETS_AT_REST_REQUIRED",
        document: "knowledge/knowledge.project.yml",
        path: "/applications/1/processes/0/secrets/0",
      },
    ]);
  });

  it("reads project files alone, with no rule across documents, when no Platform document is among them", () => {
    const result = checkIntentSet(WORKED.slice(1));

    expect(result.ok && result.value).toStrictEqual({
      projects: expect.any(Array) as unknown,
    });
    expect(
      result.ok && result.value.projects.map(({ name }) => name),
    ).toStrictEqual(["auth", "data", "knowledge", "notes"]);
  });

  it("returns the Platform and the projects when the set breaks nothing", () => {
    const encrypted = {
      ...read("platform/platform.intent.yml"),
    };
    const platform = {
      name: encrypted.name,
      text: encrypted.text
        .replace("secretsEncryption: false", "secretsEncryption: true")
        .replace("traefik: traefik-public", "traefik: notes")
        .replace("traefik: traefik-lan", "traefik: notes"),
    };
    const result = checkIntentSet([
      platform,
      read("minimal/notes.project.yml"),
    ]);

    expect(result.ok && result.value.platform?.tiers[0]?.proxy).toBe("notes");
    expect(
      result.ok && result.value.projects.map(({ name }) => name),
    ).toStrictEqual(["notes"]);
  });

  it("reads the env files under the project's own env/ directory, and no other", () => {
    const platform = {
      ...read("platform/platform.intent.yml"),
      text: read("platform/platform.intent.yml")
        .text.replace("secretsEncryption: false", "secretsEncryption: true")
        .replace("traefik: traefik-public", "traefik: notes")
        .replace("traefik: traefik-lan", "traefik: notes"),
    };
    const result = checkIntentSet([
      platform,
      read("minimal/notes.project.yml"),
      read("minimal/env/notes-api/base.env"),
      // Neither reaches `minimal`: one names a scope it has no Process for,
      // the other sits in no `env/` directory at all.
      { name: "other/env/nope/base.env", text: "A=1\n" },
      { name: "minimal/notes.env", text: "A=1\n" },
      // A file under the project's own `env/` that is not an env file at all.
      { name: "minimal/env/notes-api/README.md", text: "# notes-api\n" },
    ]);

    expect(
      refusalsOf([platform, read("minimal/notes.project.yml")]),
    ).toStrictEqual([]);
    expect(result.ok).toBe(true);
    expect(
      result.ok &&
        result.value.projects[0]?.applications[0]?.processes[0]?.env.flatMap(
          ({ entries }) => entries.map(({ name }) => name),
        ),
    ).toStrictEqual(["NODE_ENV", "NOTES_PAGE_SIZE"]);
  });

  it("names the document a single file's refusal belongs to, and runs no rule across documents until every file parses", () => {
    const broken = { name: "broken.project.yml", text: "kind: Project\n" };
    const platform = read("platform/platform.intent.yml");
    const unparsed = { name: platform.name, text: `${platform.text}---\n` };

    expect(
      refusalsOf([platform, broken]).every(
        ({ document }) => document === "broken.project.yml",
      ),
    ).toBe(true);
    expect(
      refusalsOf([unparsed, read("minimal/notes.project.yml")]),
    ).toStrictEqual([
      { code: "schema", document: "platform/platform.intent.yml", path: "" },
    ]);
  });

  it("ignores a file that is neither a Platform document nor a project file", () => {
    expect(
      checkIntentSet([{ name: "notes.env", text: "NODE_ENV=production\n" }]),
    ).toStrictEqual({
      ok: true,
      value: { projects: [] },
    });
  });

  it("refuses a route whose own audience no tier carries, at the route", () => {
    const platform = read("platform/platform.intent.yml");
    const lanOnly = {
      name: platform.name,
      text: platform.text
        .replace("audiences: [anonymous, authenticated]", "audiences: [lan]")
        .replace(/\n\s+forwardAuth: [^\n]*/, "")
        .replace("secretsEncryption: false", "secretsEncryption: true")
        .replace("traefik: traefik-public", "traefik: knowledge")
        .replace("traefik: traefik-lan", "traefik: knowledge"),
    };
    const knowledge = read("knowledge/knowledge.project.yml");
    const lanExposure = {
      name: knowledge.name,
      text: knowledge.text.replace("audience: authenticated", "audience: lan"),
    };

    expect(
      refusalsOf([lanOnly, lanExposure]).map(
        ({ code, path }) => `${code} ${path}`,
      ),
    ).toStrictEqual([
      "E_NO_TIER_FOR_AUDIENCE /applications/0/exposure/0/routes/0",
      "E_NO_TIER_FOR_AUDIENCE /applications/0/exposure/0/routes/1",
      "E_NO_TIER_FOR_AUDIENCE /applications/0/exposure/0/routes/2",
      "E_NO_TIER_FOR_AUDIENCE /applications/0/exposure/0/routes/3",
    ]);
  });

  it("says what every refusal across documents refused and how to fix it", () => {
    const result = checkIntentSet(WORKED);
    const diagnostics = result.ok ? [] : result.diagnostics;

    expect(diagnostics.map(({ message }) => message).slice(0, 3)).toStrictEqual(
      [
        "no project file declares the Application traefik-public this tier's proxy names",
        "no project file declares the Application traefik-lan this tier's proxy names",
        "delivery env writes a secret into the cluster, and the platform does not encrypt secrets at rest",
      ],
    );
    expect(diagnostics.map(({ hint }) => hint).slice(1, 3)).toStrictEqual([
      "Declare the proxy Application in a project file the platform owns.",
      "Deliver the secret through the application itself, or enable `secretsEncryption` on the platform.",
    ]);
  });
});
