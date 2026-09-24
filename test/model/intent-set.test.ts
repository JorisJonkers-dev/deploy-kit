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
  "delivery/delivery.project.yml",
  "knowledge/knowledge.project.yml",
  "minimal/notes.project.yml",
].map(read);

/** The worked Platform document's delivery machinery, which no worked project declares. */
const MACHINERY =
  "machinery: [traefik-public, traefik-lan, flagger, release-gate]";

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
      // The edge proxies are named as machinery and declared nowhere, as they
      // are named as tier proxies; `delivery` declares the other two.
      {
        code: "E_UNKNOWN_MACHINERY",
        document: "platform/platform.intent.yml",
        path: "/delivery",
      },
      {
        code: "E_UNKNOWN_MACHINERY",
        document: "platform/platform.intent.yml",
        path: "/delivery",
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
    ).toStrictEqual(["auth", "data", "delivery", "knowledge", "notes"]);
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
        .replace("traefik: traefik-lan", "traefik: notes")
        .replace(MACHINERY, "machinery: [notes]"),
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
        .replace("traefik: traefik-lan", "traefik: notes")
        .replace(MACHINERY, "machinery: [notes]"),
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
        .replace("traefik: traefik-lan", "traefik: knowledge")
        .replace(MACHINERY, "machinery: [knowledge]"),
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

    expect(diagnostics.map(({ message }) => message).slice(0, 5)).toStrictEqual(
      [
        "no project file declares the Application traefik-public this tier's proxy names",
        "no project file declares the Application traefik-lan this tier's proxy names",
        "no project file declares the Application traefik-public the delivery machinery names",
        "no project file declares the Application traefik-lan the delivery machinery names",
        "delivery env writes a secret into the cluster, and the platform does not encrypt secrets at rest",
      ],
    );
    expect(diagnostics.map(({ hint }) => hint).slice(1, 5)).toStrictEqual([
      "Declare the proxy Application in a project file the platform owns.",
      "Declare the Application in a project file the platform owns, or drop it from `delivery.machinery`.",
      "Declare the Application in a project file the platform owns, or drop it from `delivery.machinery`.",
      "Deliver the secret through the application itself, or enable `secretsEncryption` on the platform.",
    ]);
  });
});

// REQ-031, the migration half (spec/v1/10-project-intent.md#migration): whether
// an Application derives a database is read across the documents, and decided
// only where every provider it reaches was read.
describe("the migration rules across documents", () => {
  const platform = read("refusals/migration-undeclared/platform.intent.yml");
  const withPolicy: AuthoredFile = {
    name: platform.name,
    text: `${platform.text}migration: {runner: r, deadline: 10m, memory: 1Mi, cpu: 1m}\n`,
  };
  const HEADER = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: p
owner: o
`;
  const PROXY = `  - id: edge-proxy
    processes:
      - {name: edge-proxy, lifecycle: application, image: t, runtime: none, placement: {memory: 1Mi, cpu: 1m}, cutover: continuous}
`;
  const process = (name: string, extra = ""): string =>
    `      - {name: ${name}, lifecycle: application, image: ${name}, runtime: none, placement: {memory: 1Mi, cpu: 1m}, cutover: interrupted${extra}}\n`;
  const check = (applications: string, header = HEADER) =>
    refusalsOf([
      withPolicy,
      {
        name: "p.project.yml",
        text: `${header}applications:\n${PROXY}${applications}`,
      },
    ]);

  it("refuses a changelog on an Application that reaches nothing", () => {
    expect(
      check(
        `  - id: api\n    migration: {changelog: c}\n    processes:\n${process("api")}`,
      ),
    ).toStrictEqual([
      {
        code: "E_MIGRATION_WITHOUT_DATABASE",
        document: "p.project.yml",
        path: "/applications/1/migration",
      },
    ]);
  });

  it("decides nothing while a provider the Application reaches was not read", () => {
    const edges =
      ", dependsOn: [{application: edge-proxy, surface: http}, {application: elsewhere, surface: s}]";

    expect(
      check(
        `  - id: api\n    migration: {changelog: c}\n    processes:\n${process("api", edges)}`,
      ),
    ).toStrictEqual([]);
  });

  it("counts a provider as a database when any one of its Processes is", () => {
    const store = `  - id: store
    processes:
      - {name: store, lifecycle: application, image: s, runtime: none, engine: postgres, placement: {memory: 1Mi, cpu: 1m}, cutover: interrupted, volumes: [{claim: d, mountAt: /d, size: 1Gi, durability: recoverable}]}
      - {name: exporter, lifecycle: application, image: e, runtime: none, placement: {memory: 1Mi, cpu: 1m}, cutover: interrupted}
`;
    const api = `  - id: api\n    processes:\n${process("api", ", dependsOn: [{application: store, surface: postgres}]")}`;

    expect(check(`${store}${api}`)).toStrictEqual([
      {
        code: "E_MIGRATION_UNDECLARED",
        document: "p.project.yml",
        path: "/applications/2",
      },
    ]);
  });

  it("refuses credentials on an edge the project header shares, at the header", () => {
    const header = `${HEADER}dependsOn: [{application: edge-proxy, surface: http, credentials: {rotation: {tolerates: restart}}}]\n`;

    expect(
      check(`  - id: api\n    processes:\n${process("api")}`, header),
    ).toContainEqual({
      code: "E_CREDENTIALS_WITHOUT_DATABASE",
      document: "p.project.yml",
      path: "/dependsOn/0/credentials",
    });
  });
});

// REQ-031, the delivery half (spec/v1/14-platform-intent.md#delivery-policy): a
// continuous Application is gated, so it needs the platform's analysis cadence.
describe("the delivery rule across documents", () => {
  const platform = read("refusals/no-delivery-policy/platform.intent.yml");
  const HEADER = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: p
owner: o
applications:
  - id: edge-proxy
    processes:
      - {name: edge-proxy, lifecycle: application, image: t, runtime: none, placement: {memory: 1Mi, cpu: 1m}, cutover: interrupted}
`;
  const process = (name: string, lifecycle: string, cutover: string): string =>
    `      - {name: ${name}, lifecycle: ${lifecycle}, image: ${name}, runtime: none, placement: {memory: 1Mi, cpu: 1m}, cutover: ${cutover}, probes: {readiness: {tcp: 1}}}\n`;
  const check = (processes: string) =>
    refusalsOf([
      platform,
      {
        name: "p.project.yml",
        text: `${HEADER}  - id: api\n    processes:\n${processes}`,
      },
    ]).map(({ code, path }) => `${code} ${path}`);

  it("asks nothing of a job, which switches nothing", () => {
    expect(check(process("once", "job", "continuous"))).toStrictEqual([]);
  });

  it("refuses an Application one serving Process of which is continuous", () => {
    expect(
      check(
        `${process("api", "application", "continuous")}${process("once", "job", "interrupted")}`,
      ),
    ).toStrictEqual(["E_NO_DELIVERY_POLICY /applications/1"]);
  });
});

// REQ-031, the handover half (spec/v1/60-setup.md#handing-over-one-project-at-a-time):
// while the ledger lasts, every project read beside it is on one path it names.
describe("the handover rule across documents", () => {
  const platform = read("refusals/handover-unlisted/platform.intent.yml");
  const project = read("refusals/handover-unlisted/refusals.project.yml");
  const withLedger = (lists: string): AuthoredFile => ({
    name: platform.name,
    text: platform.text.replace(
      /\nhandover:\n( {2}.*\n)+/,
      `\nhandover:\n  retireBy: 2027-03-31\n${lists}`,
    ),
  });

  it("accepts a project on the old path alone, or on the estate path alone", () => {
    expect(
      refusalsOf([withLedger("  legacy: [refusals]\n"), project]),
    ).toStrictEqual([]);
    expect(
      refusalsOf([withLedger("  estate: [refusals]\n"), project]),
    ).toStrictEqual([]);
  });

  it("refuses a project a ledger with only an old path leaves off it", () => {
    expect(
      refusalsOf([withLedger("  legacy: [media]\n"), project]).map(
        ({ code }) => code,
      ),
    ).toStrictEqual(["E_HANDOVER_UNLISTED"]);
  });

  it("refuses a project on neither path, at the project file", () => {
    expect(
      refusalsOf([
        withLedger("  legacy: [media]\n  estate: [delivery]\n"),
        project,
      ]),
    ).toStrictEqual([
      { code: "E_HANDOVER_UNLISTED", document: project.name, path: "" },
    ]);
  });
});
