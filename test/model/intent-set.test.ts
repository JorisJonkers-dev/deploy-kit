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
  "edge/edge.project.yml",
  "knowledge/knowledge.project.yml",
  "minimal/notes.project.yml",
  "observability/observability.project.yml",
  "secrets/secrets.project.yml",
].map(read);

/** The worked Platform document's telemetry block, which a variant composed with fewer projects drops. */
const TELEMETRY = /\ntelemetry:\n( {2}.*\n)+/;

/** The worked Platform document's API access block, which names Applications a variant may not compose. */
const API_ACCESS = /\napiAccess:\n( {2}.*\n)+/;

/** The worked Platform document's delivery machinery. */
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
  it("refuses nothing in the worked estate: the foundation is declared and secrets are encrypted at rest", () => {
    expect(refusalsOf(WORKED)).toStrictEqual([]);
  });

  it("refuses every env and file grant of the worked estate where secrets are not encrypted at rest", () => {
    const [platform, ...projects] = WORKED;
    const unencrypted = {
      name: (platform as AuthoredFile).name,
      text: (platform as AuthoredFile).text.replace(
        "secretsEncryption: true",
        "secretsEncryption: false",
      ),
    };

    expect(refusalsOf([unencrypted, ...projects])).toStrictEqual([
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
      result.ok && result.value.projects.map(({ project }) => project),
    ).toStrictEqual([
      "auth",
      "data",
      "delivery",
      "edge",
      "knowledge",
      "notes",
      "observability",
      "secrets",
    ]);
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
        .replace(MACHINERY, "machinery: [notes]")
        .replace("gate: release-gate", "gate: notes")
        .replace("secretStore: vault", "secretStore: notes")
        .replace(TELEMETRY, "\n")
        .replace(API_ACCESS, "\n"),
    };
    const result = checkIntentSet([
      platform,
      read("minimal/notes.project.yml"),
    ]);

    expect(result.ok && result.value.platform?.tiers[0]?.traefik).toBe("notes");
    expect(
      result.ok && result.value.projects.map(({ project }) => project),
    ).toStrictEqual(["notes"]);
  });

  it("reads the env files under the project's own env/ directory, and no other", () => {
    const platform = {
      ...read("platform/platform.intent.yml"),
      text: read("platform/platform.intent.yml")
        .text.replace("secretsEncryption: false", "secretsEncryption: true")
        .replace("traefik: traefik-public", "traefik: notes")
        .replace("traefik: traefik-lan", "traefik: notes")
        .replace(MACHINERY, "machinery: [notes]")
        .replace("gate: release-gate", "gate: notes")
        .replace("secretStore: vault", "secretStore: notes")
        .replace(TELEMETRY, "\n")
        .replace(API_ACCESS, "\n"),
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
        result.value.projects[0]?.applications[0]?.processes[0]?.env?.flatMap(
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
        .replace(MACHINERY, "machinery: [knowledge]")
        .replace("gate: release-gate", "gate: knowledge")
        .replace("secretStore: vault", "secretStore: knowledge")
        .replace(TELEMETRY, "\n")
        .replace(API_ACCESS, "\n"),
    };
    const knowledge = read("knowledge/knowledge.project.yml");
    const lanExposure = {
      name: knowledge.name,
      text: knowledge.text.replace("audience: authenticated", "audience: lan"),
    };

    expect(
      refusalsOf([lanOnly, lanExposure])
        // knowledge stands in for the machinery here, and a changelog on the
        // machinery is its own refusal.
        .filter(({ code }) => code === "E_NO_TIER_FOR_AUDIENCE")
        .map(({ code, path }) => `${code} ${path}`),
    ).toStrictEqual([
      "E_NO_TIER_FOR_AUDIENCE /applications/0/exposure/0/routes/0",
      "E_NO_TIER_FOR_AUDIENCE /applications/0/exposure/0/routes/1",
      "E_NO_TIER_FOR_AUDIENCE /applications/0/exposure/0/routes/2",
      "E_NO_TIER_FOR_AUDIENCE /applications/0/exposure/0/routes/3",
    ]);
  });

  it("says what every refusal across documents refused and how to fix it", () => {
    // Without the foundation's projects, every name the platform makes into
    // them is refused, each with what to do about it.
    const withoutFoundation = WORKED.filter(
      ({ name }) =>
        !["edge/", "observability/"].some((dir) => name.startsWith(dir)),
    );
    const result = checkIntentSet(withoutFoundation);
    const diagnostics = result.ok ? [] : result.diagnostics;

    expect(diagnostics.map(({ message }) => message)).toStrictEqual([
      "no project file declares the Application traefik-public this tier's proxy names",
      "no project file declares the Application traefik-lan this tier's proxy names",
      "no project file declares the Application traefik-public the delivery machinery names",
      "no project file declares the Application traefik-lan the delivery machinery names",
      "no project file declares an Application otel-collector whose Process provides an `otlp` surface",
      "no project file declares the Application prometheus the metrics stack names",
    ]);
    expect(diagnostics.map(({ hint }) => hint).slice(1)).toStrictEqual([
      "Declare the proxy Application in a project file the platform owns.",
      "Declare the Application in a project file the platform owns, or drop it from `delivery.machinery`.",
      "Declare the Application in a project file the platform owns, or drop it from `delivery.machinery`.",
      "Declare the collector in a project file the platform owns, with an `otlp` surface on one of its Processes.",
      "Declare the metrics stack in a project file the platform owns.",
    ]);
  });

  it("says what a Release Gate that answers nowhere was refused for, and how to fix it", () => {
    const platform = read("platform/platform.intent.yml");
    const result = checkIntentSet([
      {
        name: platform.name,
        text: platform.text.replace(
          "gate: release-gate",
          "gate: otel-collector",
        ),
      },
      ...WORKED.slice(1),
    ]);
    const refusal = (result.ok ? [] : result.diagnostics).find(
      ({ code }) => code === "E_UNKNOWN_RELEASE_GATE",
    );

    expect([refusal?.message, refusal?.hint]).toStrictEqual([
      "no project file declares an Application otel-collector whose Process provides an `http` surface",
      "Declare the Release Gate in a project file the platform owns, with an `http` surface on one of its Processes.",
    ]);
  });

  it("refuses a Secret Store that answers on no http surface, and says how to fix it", () => {
    const platform = read("platform/platform.intent.yml");
    const refusals = (store: string) => {
      const result = checkIntentSet([
        {
          name: platform.name,
          text: platform.text.replace(
            "secretStore: vault",
            `secretStore: ${store}`,
          ),
        },
        ...WORKED.slice(1),
      ]);
      return (result.ok ? [] : result.diagnostics)
        .filter(({ code }) => code === "E_UNKNOWN_SECRET_STORE")
        .map(({ document, path, message, hint }) => ({
          document,
          path,
          message,
          hint,
        }));
    };

    // `otel-collector` is declared and serves only `otlp`; `gone` is declared nowhere.
    expect([...refusals("otel-collector"), ...refusals("gone")]).toStrictEqual(
      ["otel-collector", "gone"].map((store) => ({
        document: "platform/platform.intent.yml",
        path: "/secretStore",
        message: `no project file declares an Application ${store} whose Process provides an \`http\` surface`,
        hint: "Declare the Secret Store in a project file the platform owns, with an `http` surface on one of its Processes.",
      })),
    );
    expect(refusals("vault")).toStrictEqual([]);
  });

  it("refuses a Release Gate that answers on no http surface, and a metrics stack nothing declares", () => {
    const platform = read("platform/platform.intent.yml");
    const misnamed = {
      name: platform.name,
      text: platform.text
        .replace("gate: release-gate", "gate: otel-collector")
        .replace("metrics: prometheus", "metrics: grafana"),
    };

    expect(
      refusalsOf([misnamed, ...WORKED.slice(1)]).filter(({ code }) =>
        ["E_UNKNOWN_RELEASE_GATE", "E_UNKNOWN_METRICS_STACK"].includes(code),
      ),
    ).toStrictEqual([
      {
        code: "E_UNKNOWN_METRICS_STACK",
        document: "platform/platform.intent.yml",
        path: "/telemetry",
      },
      {
        code: "E_UNKNOWN_RELEASE_GATE",
        document: "platform/platform.intent.yml",
        path: "/delivery",
      },
    ]);
  });

  // REQ-048 (docs/requirements.md): the platform admits a holder by id, so an
  // id two Applications carry admits neither of them.
  it("admits no Application to hold API access under an id a second project also carries", () => {
    const impostor = read("refusals/process-rbac-grant/refusals.project.yml");
    const result = checkIntentSet([
      ...WORKED,
      {
        name: "impostor/impostor.project.yml",
        text: impostor.text.replace("id: edge-proxy", "id: flagger"),
      },
    ]);
    const refused = result.ok
      ? []
      : result.diagnostics.filter(
          ({ code }) => code === "E_PROCESS_RBAC_GRANT",
        );

    expect(
      refused.map(({ document, path, message }) => [document, path, message]),
    ).toStrictEqual([
      [
        "delivery/delivery.project.yml",
        "/applications/0/processes/0/api",
        "flagger declares Kubernetes API access, and more than one Application carries the id flagger, so the platform admits none of them",
      ],
      [
        "impostor/impostor.project.yml",
        "/applications/0/processes/0/api",
        "edge-proxy declares Kubernetes API access, and more than one Application carries the id flagger, so the platform admits none of them",
      ],
    ]);
  });

  it("says which Application the platform does not admit, where its id is its own", () => {
    const [platform, ...projects] = WORKED;
    const result = checkIntentSet([
      {
        name: (platform as AuthoredFile).name,
        text: (platform as AuthoredFile).text.replace(
          "holders: [flagger, release-gate, collector]",
          "holders: [flagger, release-gate]",
        ),
      },
      ...projects,
    ]);

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, path, message, hint }) => [
            code,
            path,
            message,
            hint,
          ]),
    ).toStrictEqual([
      [
        "E_PROCESS_RBAC_GRANT",
        "/applications/2/processes/0/api",
        "collector declares Kubernetes API access, and the platform does not admit the Application collector to hold any",
        "Name the Application in the Platform document's `apiAccess.holders`, under an id no other Application carries, or drop `api`.",
      ],
    ]);
  });

  it("refuses a collector that provides no otlp surface, as it refuses one nothing declares", () => {
    const observability = read("observability/observability.project.yml");
    const deaf = {
      name: observability.name,
      text: observability.text.replace("otlp: 4317", "grpc: 4317"),
    };

    expect(
      refusalsOf([
        ...WORKED.filter(({ name }) => name !== observability.name),
        deaf,
      ]).filter(({ code }) => code === "E_UNKNOWN_TELEMETRY_COLLECTOR"),
    ).toStrictEqual([
      {
        code: "E_UNKNOWN_TELEMETRY_COLLECTOR",
        document: "platform/platform.intent.yml",
        path: "/telemetry",
      },
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
      - {name: edge-proxy, lifecycle: application, image: t, runtime: none, provides: {http: 8080}, placement: {memory: 1Mi, cpu: 1m}, cutover: continuous}
`;
  const process = (name: string, extra = ""): string =>
    `      - {name: ${name}, lifecycle: application, image: ${name}, runtime: none, placement: {memory: 1Mi, cpu: 1m}, cutover: continuous${extra}}\n`;
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

  it("decides nothing while a provider the Application reaches was not read, and refuses only the edge", () => {
    const edges =
      ", dependsOn: [{application: edge-proxy, surface: http}, {application: elsewhere, surface: s}]";

    expect(
      check(
        `  - id: api\n    migration: {changelog: c}\n    processes:\n${process("api", edges)}`,
      ),
    ).toStrictEqual([
      {
        code: "E_UNRESOLVED_APPLICATION",
        document: "p.project.yml",
        path: "/applications/1/processes/0/dependsOn/1/application",
      },
    ]);
  });

  it("counts a provider as a database when any one of its Processes is", () => {
    const store = `  - id: store
    processes:
      - {name: store, lifecycle: application, image: s, runtime: none, engine: postgres, provides: {postgres: 5432}, placement: {memory: 1Mi, cpu: 1m}, cutover: interrupted, volumes: [{claim: d, mountAt: /d, size: 1Gi, durability: recoverable}]}
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

// REQ-031, the gated-migration half (spec/v1/10-project-intent.md#migration): the
// Release Gate starts a migration, so a changelog needs an Application it holds.
describe("the gated migration rule across documents", () => {
  const platform = read("refusals/migration-ungated/platform.intent.yml");
  const project = read("refusals/migration-ungated/refusals.project.yml");
  const api = (edit: (text: string) => string): AuthoredFile => ({
    name: project.name,
    text: edit(project.text),
  });
  const continuous = (text: string): string =>
    text.replace(
      "startupBudget: 20s\n        cutover: interrupted",
      "startupBudget: 20s\n        cutover: continuous",
    );
  const REFUSED = [
    {
      code: "E_MIGRATION_UNGATED",
      document: "refusals/migration-ungated/refusals.project.yml",
      path: "/applications/2/migration",
    },
  ];

  it("refuses a changelog on an Application that stops before it starts again, and says how to fix it", () => {
    const result = checkIntentSet([platform, project]);

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      {
        ...REFUSED[0],
        message:
          "no Process of this Application switches blue/green, so nothing starts its migration",
        hint: "Give a Process a `continuous` cutover, or let the image migrate with `migration: self`.",
      },
    ]);
  });

  it("accepts the changelog once a serving Process is continuous, and an image that migrates itself either way", () => {
    expect(refusalsOf([platform, api(continuous)])).toStrictEqual([]);
    expect(
      refusalsOf([
        platform,
        api((text) =>
          text.replace(
            "migration:\n      changelog: api/db/changelog.yml",
            "migration: self",
          ),
        ),
      ]),
    ).toStrictEqual([]);
  });

  it("asks for one serving Process that is continuous, not for every Process: a job beside it changes nothing", () => {
    expect(
      refusalsOf([
        platform,
        api(
          (text) =>
            `${continuous(text).trimEnd()}\n      - {name: once, lifecycle: job, image: api, runtime: none, placement: {memory: 1Mi, cpu: 1m}, cutover: interrupted}\n`,
        ),
      ]),
    ).toStrictEqual([]);
  });

  it("counts no job: a continuous one switches nothing, so the changelog beside it is still ungated", () => {
    expect(
      refusalsOf([
        platform,
        api((text) =>
          continuous(text).replace(
            "      - name: api\n        lifecycle: application",
            "      - name: api\n        lifecycle: job",
          ),
        ),
      ]),
    ).toStrictEqual(REFUSED);
  });

  it("refuses a changelog on the delivery machinery, which switches rolling and is never gated", () => {
    expect(
      refusalsOf([
        {
          name: platform.name,
          text: platform.text.replace(
            "machinery: [edge-proxy]",
            "machinery: [edge-proxy, api]",
          ),
        },
        api(continuous),
      ]),
    ).toStrictEqual(REFUSED);
  });

  it("refuses it under a platform with no delivery policy too, which names no machinery", () => {
    expect(
      refusalsOf([
        {
          name: platform.name,
          text: platform.text.replace(/\ndelivery:\n( {2}.*\n)+/, "\n"),
        },
        project,
      ]).filter(({ code }) => code === "E_MIGRATION_UNGATED"),
    ).toStrictEqual(REFUSED);
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
