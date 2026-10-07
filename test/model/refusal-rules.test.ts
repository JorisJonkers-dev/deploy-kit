// REQ-024 (docs/requirements.md): the refusals resolution used to stop at,
// each answered before resolution with its code, where it is written, and
// what it tells its author (spec/v1/10-project-intent.md#validation,
// spec/v1/14-platform-intent.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkIntentSet, type AuthoredFile } from "../../src/index.ts";

const CASE = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
  "refusals",
  "unbound-secret-grant",
);
const PLATFORM = readFileSync(join(CASE, "platform.intent.yml"), "utf8");
const EDGE = `  - id: edge-proxy
    processes:
      - name: edge-proxy
        lifecycle: application
        image: traefik
        runtime: none
        provides: { http: 8080 }
        placement: { memory: 128Mi, cpu: 50m }
        probes: { readiness: { tcp: 8080 } }
        cutover: continuous
`;

/** A Process of Application `api`, its `extra` lines indented as the file reads. */
const api = (extra = "", provides = "{ http: 8080 }") => `  - id: api
    processes:
      - name: api
        lifecycle: application
        image: api
        runtime: node
        provides: ${provides}
        placement: { memory: 128Mi, cpu: 25m }
        probes: { readiness: { tcp: 8080 } }
        cutover: continuous
${extra}`;

const project = (
  applications: string,
  header = "",
) => `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: refusals
owner: joris
${header}applications:
${applications}${EDGE}`;

type Refusal = { code: string; path: string; message: string; hint: string };

function refusals(
  applications: string,
  {
    env = "",
    header = "",
    platform = (text: string) => text,
    files = [],
  }: {
    env?: string;
    header?: string;
    platform?: (text: string) => string;
    files?: readonly AuthoredFile[];
  } = {},
): Refusal[] {
  const result = checkIntentSet([
    { name: "platform.intent.yml", text: platform(PLATFORM) },
    { name: "refusals.project.yml", text: project(applications, header) },
    ...(env === "" ? [] : [{ name: "env/api/base.env", text: env }]),
    ...files,
  ]);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, path, message, hint }) => ({
        code,
        path,
        message,
        hint,
      }));
}

const AT = "/applications/0/processes/0";
const PLACEHOLDER_HINT =
  "A dependency placeholder names the Application of one edge the Process holds and `host` or `port`; an exposure placeholder names an exposure the Application declares and `url`, `host` or `scheme`.";

describe("a dependency or exposure placeholder", () => {
  const edges = `        dependsOn:
          - { application: edge-proxy, surface: http }
`;

  it.each([
    [
      "no edge to the Application",
      "",
      "edge-proxy.host",
      "the Process holds no edge to edge-proxy",
    ],
    [
      "two edges to the Application",
      `${edges}          - { application: edge-proxy, surface: admin }\n`,
      "edge-proxy.host",
      "the Process holds more than one edge to edge-proxy",
    ],
    [
      "a coordinate no edge hands out",
      edges,
      "edge-proxy.database",
      "an edge hands no coordinate database",
    ],
  ])("is refused, naming %s", (_, extra, source, why) => {
    expect(
      refusals(api(extra), {
        env: `X=\${dependency:${source}}\n`,
      }).filter(({ code }) => code === "E_UNRESOLVED_PLACEHOLDER"),
    ).toStrictEqual([
      {
        code: "E_UNRESOLVED_PLACEHOLDER",
        path: AT,
        message: `X reads \${dependency:${source}}, and ${why}`,
        hint: PLACEHOLDER_HINT,
      },
    ]);
  });

  const exposed = (extra: string) =>
    api(extra).replace(
      "  - id: api\n",
      `  - id: api
    exposure:
      - { name: lan, host: api.lan.jorisjonkers.dev, audience: lan, routes: [{ path: /, match: prefix, process: api, surface: http }] }
      - { name: public, host: api.jorisjonkers.dev, audience: lan, routes: [{ path: /, match: prefix, process: api, surface: http }] }
`,
    );

  it("resolves against any exposure the Application declares, not only its first", () => {
    expect(
      refusals(exposed(""), { env: "X=${exposure:api.public#url}\n" }),
    ).toStrictEqual([]);
  });

  it.each([
    [
      "an exposure the Application does not declare",
      "api.gone#url",
      "api declares no exposure gone",
    ],
    [
      "a field no exposure hands out",
      "api.public#path",
      "an exposure has no field path",
    ],
  ])("is refused, naming %s", (_, source, why) => {
    expect(
      refusals(exposed(""), { env: `X=\${exposure:${source}}\n` }),
    ).toStrictEqual([
      {
        code: "E_UNRESOLVED_PLACEHOLDER",
        path: AT,
        message: `X reads \${exposure:${source}}, and ${why}`,
        hint: PLACEHOLDER_HINT,
      },
    ]);
  });

  it("names the Application of an exposure nothing declares, whatever the field holds", () => {
    expect(
      refusals(api(), { env: "X=${exposure:gone.app#a.b}\n" }),
    ).toStrictEqual([
      {
        code: "E_UNRESOLVED_APPLICATION",
        path: AT,
        message:
          "X reads an exposure of gone, and no fragment declares that Application",
        hint: "Name an Application a fragment declares, and an exposure it carries.",
      },
    ]);
  });
});

describe("an edge written above the Process", () => {
  it("is refused where it is written, at the project header", () => {
    expect(
      refusals(api(), {
        header: "dependsOn:\n  - { application: gone, surface: http }\n",
      }).map(({ code, path }) => ({ code, path })),
    ).toStrictEqual([
      { code: "E_UNRESOLVED_APPLICATION", path: "/dependsOn/0" },
    ]);
  });
});

describe("a secret placeholder and the grant it reads", () => {
  const grant = `        secrets:
          - { path: secret/data/api, keys: [token], access: read, delivery: env, rotation: { tolerates: restart } }
`;

  it("tells its author which key of which path no grant delivers", () => {
    expect(
      refusals(api(grant), {
        env: "TOKEN=${secret:secret/data/api#token}\nOTHER=${secret:secret/data/api#other}\n",
      }),
    ).toStrictEqual([
      {
        code: "E_UNAUTHORISED_SECRET_REFERENCE",
        path: AT,
        message:
          "OTHER reads secret/data/api#other, and no grant the Process holds delivers that key of that path to its environment",
        hint: "Grant the path to this Process with `delivery: env` and the key in `keys`, or read a path it is granted.",
      },
    ]);
  });

  it("tells its author which path nothing reads", () => {
    expect(refusals(api(grant), { env: "LEVEL=info\n" })).toStrictEqual([
      {
        code: "E_UNBOUND_SECRET_GRANT",
        path: AT,
        message:
          "api is granted secret/data/api into its environment, and no env file reads it",
        hint: "Read the path with a `${secret:…}` placeholder, or remove the grant: a grant nothing reads is a dead grant.",
      },
    ]);
  });

  it("is answered with no Platform document read, as every env rule is", () => {
    const result = checkIntentSet([
      { name: "refusals.project.yml", text: project(api(grant)) },
      {
        name: "env/api/base.env",
        text: "OTHER=${secret:secret/data/other#key}\nX=${dependency:gone.host}\n",
      },
    ]);

    expect(
      result.ok ? [] : result.diagnostics.map(({ code }) => code),
    ).toStrictEqual([
      "E_UNAUTHORISED_SECRET_REFERENCE",
      "E_UNBOUND_SECRET_GRANT",
      "E_UNRESOLVED_PLACEHOLDER",
    ]);
  });
});

describe("a Runtime Profile key written in an env file", () => {
  const telemetry = (text: string) =>
    text.replace(
      "\nmonitors:",
      "\ntelemetry:\n  collector: collector\n  metrics: edge-proxy\nmonitors:",
    );

  it.each([
    ["DEPLOYMENT_ENVIRONMENT", "{ http: 8080 }", (text: string) => text],
    ["OTEL_SERVICE_NAME", "{ http: 8080 }", (text: string) => text],
    ["PORT", "{ http: 8080 }", (text: string) => text],
  ])("is refused: %s", (key, provides, platform) => {
    expect(
      refusals(api("", provides), { env: `${key}=x\n`, platform }),
    ).toStrictEqual([
      {
        code: "E_PROFILE_KEY_AUTHORED",
        path: AT,
        message: `${key} is written in an env file, and the Runtime Profile injects it`,
        hint: "Delete the line: the model sets this variable for every Process of the runtime.",
      },
    ]);
  });

  it("is the author's where the profile injects none: PORT beside two surfaces, the collector's endpoint where nothing collects", () => {
    expect(
      refusals(api("", "{ http: 8080, admin: 9090 }"), {
        env: "PORT=8080\nOTEL_EXPORTER_OTLP_ENDPOINT=http://elsewhere\n",
      }),
    ).toStrictEqual([]);
  });

  it("is refused for the collector's endpoint where the platform names a collector", () => {
    expect(
      refusals(
        `${api()}  - id: collector
    processes:
      - name: collector
        lifecycle: application
        image: collector
        runtime: none
        provides: { otlp: 4317 }
        placement: { memory: 64Mi, cpu: 10m }
        probes: { readiness: { tcp: 4317 } }
        cutover: continuous
`,
        {
          env: "OTEL_EXPORTER_OTLP_ENDPOINT=http://elsewhere\n",
          platform: telemetry,
        },
      )
        .map(({ code }) => code)
        .filter((code) => code === "E_PROFILE_KEY_AUTHORED"),
    ).toStrictEqual(["E_PROFILE_KEY_AUTHORED"]);
  });
});

describe("an Asset", () => {
  const asset = "  - { from: config/api.conf, mountAt: /etc/api/api.conf }\n";

  it.each([
    ["the project header", "", `assets:\n${asset}`, "/assets/0/from"],
    [
      "an Application",
      `    assets:\n  ${asset.replace("  - ", "    - ")}`,
      "",
      "/applications/0/assets/0/from",
    ],
  ])(
    "is refused where it is written, at %s",
    (_, applicationAssets, header, path) => {
      expect(
        refusals(
          api().replace(
            "    processes:\n",
            `${applicationAssets}    processes:\n`,
          ),
          {
            header,
          },
        ),
      ).toStrictEqual([
        {
          code: "E_ASSET_NOT_FOUND",
          path,
          message: "no file config/api.conf is read beside the project file",
          hint: "Commit the file at that path beside the project file, or correct `from`.",
        },
      ]);
    },
  );

  it("is read from beside its project file", () => {
    expect(
      refusals(api(), {
        header: `assets:\n${asset}`,
        files: [{ name: "config/api.conf", text: "a = 1\n" }],
      }),
    ).toStrictEqual([]);
  });
});

describe("a platform that names no Secret Store", () => {
  const withoutStore = (text: string) =>
    text.replace("secretStore: edge-proxy\n", "");

  it.each([
    [
      "a managed migration",
      api().replace("  - id: api\n", "  - id: api\n    migration: self\n"),
      false,
    ],
    [
      "a changelog",
      api().replace(
        "  - id: api\n",
        "  - id: api\n    migration: { changelog: db/changelog.yml }\n",
      ),
      true,
    ],
    [
      "a backup that copies off-cluster",
      api(`        engine: postgres
        volumes:
          - { claim: cache, mountAt: /cache, size: 1Gi, durability: recoverable }
          - { claim: data, mountAt: /data, size: 1Gi, durability: irreplaceable }
`).replace("cutover: continuous", "cutover: interrupted"),
      true,
    ],
    [
      "a grant on one Process of two",
      api().replace(
        "    processes:\n",
        `    processes:
      - name: worker
        lifecycle: application
        image: api
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        probes: { readiness: { tcp: 9090 } }
        cutover: continuous
        secrets:
          - { path: secret/data/worker, keys: [k], access: read, delivery: self, rotation: { tolerates: restart } }
`,
      ),
      true,
    ],
  ])("refuses %s only where it reads the store", (_, applications, refused) => {
    expect(
      refusals(applications, {
        platform: (text) =>
          withoutStore(text).replace(
            'irreplaceable: { schedule: "45 2 * * *", retain: 90 }',
            'irreplaceable: { schedule: "45 2 * * *", retain: 90, offCluster: { destination: s3://b, credential: secret/data/b, egress: [{ cidr: 10.0.0.0/8, port: 443 }] } }',
          ),
      })
        .map(({ code }) => code)
        .includes("E_NO_SECRET_STORE"),
    ).toBe(refused);
  });
});

describe("a release unit and its readiness", () => {
  it("asks nothing of a job, which switches nothing", () => {
    expect(
      refusals(
        api()
          .replace("lifecycle: application", "lifecycle: job")
          .replace("        probes: { readiness: { tcp: 8080 } }\n", ""),
      ).map(({ code }) => code),
    ).not.toContain("E_RELEASE_UNIT_NO_READINESS");
  });

  it("counts liveness as no readiness", () => {
    expect(
      refusals(
        api().replace(
          "probes: { readiness: { tcp: 8080 } }",
          "probes: { liveness: { tcp: 8080 } }",
        ),
      ).map(({ code, path }) => ({ code, path })),
    ).toContainEqual({
      code: "E_RELEASE_UNIT_NO_READINESS",
      path: "/applications/0",
    });
  });
});

describe("a backed-up durability class", () => {
  it("says which half of its policy is missing", () => {
    const result = checkIntentSet([
      {
        name: "platform.intent.yml",
        text: PLATFORM.replace(
          'recoverable: { schedule: "15 3 * * *", retain: 14 }',
          "recoverable: { retain: 14 }",
        ),
      },
    ]);

    expect(
      result.ok ? [] : result.diagnostics.map(({ message }) => message),
    ).toStrictEqual([
      "the recoverable class derives a backup, and its policy names no schedule",
    ]);
  });

  it("names the retention where the schedule is there", () => {
    const result = checkIntentSet([
      {
        name: "platform.intent.yml",
        text: PLATFORM.replace(
          'recoverable: { schedule: "15 3 * * *", retain: 14 }',
          'recoverable: { schedule: "15 3 * * *" }',
        ),
      },
    ]);

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ message, hint }) => [message, hint]),
    ).toStrictEqual([
      [
        "the recoverable class derives a backup, and its policy names no retention",
        "Give the policy a `schedule` and a `retain` count.",
      ],
    ]);
  });
});
