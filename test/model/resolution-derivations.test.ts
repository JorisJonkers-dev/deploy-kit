// REQ-039 (docs/requirements.md), derivation by derivation: each mechanic
// chapter 20 derives, read off a notes project written for it and resolved
// through the use-case with the worked foundation and pinned inputs.
import { datastoreOf } from "../../src/resolve/database.ts";
import { resolveEdge } from "../../src/resolve/dependencies.ts";
import type { PlatformIntentDocument } from "../../src/model/platform-intent.ts";
import { backedUp, dumpedSurfaceOf } from "../../src/model/backup.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  parsePlatformIntent,
  parseProjectIntent,
  resolveIntentSet,
  sha256Hasher,
  type AuthoredFile,
  type ResolvedProject,
} from "../../src/index.ts";
import { seconds } from "../../src/model/durations.ts";
import { eligibleNodes, estateJobNodes } from "../../src/model/eligibility.ts";
import {
  readClusterState,
  readImagesLock,
  readNodeContract,
} from "../../src/read/pinned-inputs.ts";
import { resolveApplication } from "../../src/resolve/application.ts";
import { resolveLibraries } from "../../src/resolve/libraries.ts";
import { mebibytes, millicores } from "../../src/model/quantities.ts";

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

const FOUNDATION = [
  "platform/node-contract.yml",
  "platform/images.lock.yml",
  "platform/cluster-state.yml",
  "delivery/delivery.project.yml",
  "edge/edge.project.yml",
  "observability/observability.project.yml",
  "secrets/secrets.project.yml",
].map((name): AuthoredFile => ({ name, text: text(name) }));

const PLATFORM = text("platform/platform.intent.yml");
/** data, for a Process whose edge reaches one of its Applications. */
const DATA = [
  "data/data.project.yml",
  "data/env/postgres/base.env",
  "data/config/postgresql.conf",
].map((name): AuthoredFile => ({ name, text: text(name) }));
const LOCK = parseYaml(text("platform/images.lock.yml")) as {
  images: Record<
    string,
    { repository: string; digest: string; uid: number; gid: number }
  >;
};

const HEADER = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: notes
owner: joris
applications:
`;

/** A serving Process of notes-api's image, with `extra` lines under it. */
const serving = (name: string, extra = ""): string => `      - name: ${name}
        lifecycle: application
        image: notes-api
        runtime: node
        provides: { http: 8080 }
        placement: { memory: 64Mi, cpu: 10m }
        probes:
          readiness: { path: /ready, port: 8080 }
          liveness: { path: /live, port: 8080 }
        startupBudget: 20s
        cutover: continuous
${extra}`;

interface Options {
  readonly platform?: (platform: string) => string;
  /** Files read beside the project: its env files, and its Asset files. */
  readonly env?: readonly AuthoredFile[];
  readonly lock?: (lock: string) => string;
}

/** The codes a resolution refused with, in the order it reported them. */
const codesOf = (result: ReturnType<typeof resolve>): string[] =>
  result.ok ? [] : result.diagnostics.map(({ code }) => code);

function resolve(applications: string, options: Options = {}) {
  return resolveIntentSet(
    [
      {
        name: "platform/platform.intent.yml",
        text: (options.platform ?? ((same: string) => same))(PLATFORM),
      },
      ...FOUNDATION.map((file) =>
        file.name === "platform/images.lock.yml" && options.lock !== undefined
          ? { ...file, text: options.lock(file.text) }
          : file,
      ),
      { name: "minimal/notes.project.yml", text: HEADER + applications },
      ...(options.env ?? []),
    ],
    {
      hash: sha256Hasher,
      schemaPackageIntegrity: `sha256:${"0".repeat(64)}`,
    },
  );
}

function projects(applications: string, options?: Options): ResolvedProject[] {
  const result = resolve(applications, options);
  if (!result.ok)
    throw new Error(
      JSON.stringify(
        result.diagnostics.map(({ code, path }) => `${code} ${path}`),
      ),
    );
  return [...result.value.projects];
}

const projectNamed = (all: ResolvedProject[], name: string) => {
  const found = all.find(({ project }) => project === name);
  if (found === undefined) throw new Error(`${name} did not resolve`);
  return found;
};

const application = (applications: string, options?: Options, index = 0) => {
  const found = projectNamed(projects(applications, options), "notes")
    .applications[index];
  if (found === undefined) throw new Error("no such Application");
  return found;
};

const processOf = (applications: string, options?: Options) => {
  const found = application(applications, options).processes[0];
  if (found === undefined) throw new Error("no Process");
  return found;
};

const one = (processBlock: string): string =>
  `  - id: notes\n    processes:\n${processBlock}`;

/** One Application whose Process reaches a datastore, which moves no schema of its own. */
const reaching = (processBlock: string): string =>
  `  - id: notes\n    migration: none\n    processes:\n${processBlock}`;

describe("the route a request takes", () => {
  const exposed = (routes: string, extra = "") => `  - id: notes
    exposure:
      - name: app
        host: notes.jorisjonkers.dev
        audience: authenticated
${extra}        routes:
${routes}
    processes:
${serving("notes-api")}`;

  it("orders exact before prefix and a longer prefix before a shorter, and lets unordered routes share a precedence", () => {
    const [exposure] =
      application(
        exposed(`          - { path: /, match: prefix, process: notes-api, surface: http }
          - { path: /api/, match: prefix, process: notes-api, surface: http }
          - { path: /a, match: exact, process: notes-api, surface: http }
          - { path: /b, match: exact, process: notes-api, surface: http }`),
      ).exposure ?? [];

    expect(
      exposure?.routes.map(
        ({ path, precedence }) => `${path} ${String(precedence)}`,
      ),
    ).toStrictEqual(["/ 3", "/api/ 2", "/a 1", "/b 1"]);
    expect(exposure?.tier).toBe("public-frankfurt");
  });

  it("puts forward-auth before the baseline on an authenticated route, and neither the profile nor a redirect where none is asked", () => {
    const [exposure] =
      application(
        exposed(`          - { path: /, match: prefix, process: notes-api, surface: http }
          - { path: /open, match: exact, process: notes-api, surface: http, audience: anonymous, redirectTo: /other }`),
      ).exposure ?? [];

    expect(
      exposure?.routes.map(({ audience, middleware }) => ({
        audience,
        middleware,
      })),
    ).toStrictEqual([
      {
        audience: "authenticated",
        middleware: [
          {
            kind: "forward-auth",
            endpoint:
              "http://auth-api.auth-system.svc.cluster.local:8081/api/auth/forward",
          },
          { kind: "security-headers" },
        ],
      },
      {
        audience: "anonymous",
        middleware: [
          { kind: "security-headers" },
          { kind: "redirect", redirectTo: "/other" },
        ],
      },
    ]);
  });

  it("carries the content profile the exposure names onto every route's baseline", () => {
    const [exposure] =
      application(
        exposed(
          "          - { path: /, match: prefix, process: notes-api, surface: http }",
          "        contentPolicy: admin\n",
        ),
      ).exposure ?? [];

    expect(exposure?.routes[0]?.middleware?.at(-1)).toStrictEqual({
      kind: "security-headers",
      contentPolicy: "admin",
    });
  });
});

describe("how a Process switches, and how long it may take", () => {
  it("stops then starts an interrupted Process, and gates nothing", () => {
    const resolved = application(
      one(
        serving("notes-api").replace(
          "cutover: continuous",
          "cutover: interrupted",
        ),
      ),
    );

    expect(resolved.processes[0]?.switchover).toBe("stop-start");
    expect(resolved.releaseGate).toBeUndefined();
  });

  it("rolls the delivery machinery, gates none of it, and leaves the Collector beside it what it declares", () => {
    const delivery = projectNamed(
      projects(one(serving("notes-api"))),
      "delivery",
    );

    expect(
      delivery.applications.map(({ processes, releaseGate }) => [
        processes[0]?.switchover,
        releaseGate,
      ]),
    ).toStrictEqual([
      ["rolling", undefined],
      ["rolling", undefined],
      // Not machinery: it switches nothing, and it declares `interrupted`.
      ["stop-start", undefined],
      // Nor is the Reporter, which only reports.
      ["stop-start", undefined],
    ]);
  });

  it("switches neither a job nor a Process with no cutover", () => {
    const job = processOf(
      one(`      - name: notes-job
        lifecycle: job
        image: notes-api
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        startupBudget: 30s
        cutover: interrupted
`),
    );

    expect(job.switchover).toBeUndefined();
    expect(job.readiness).toBeUndefined();
    expect(job.cutover).toBe("interrupted");
  });

  it("gives a serving Process three budgets and a prepare Process one, and the gate the slowest", () => {
    const resolved = application(`  - id: notes
    processes:
${serving("notes-api").replace("startupBudget: 20s", "startupBudget: 10m")}${serving("notes-web").replace("startupBudget: 20s", "startupBudget: 1h")}      - name: notes-seed
        lifecycle: prepare
        image: notes-api
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        startupBudget: 700ms
`);

    // Each with the worked substrate's two-minute image pull on top.
    expect(resolved.processes.map(({ deadline }) => deadline)).toStrictEqual([
      "1920s",
      "10920s",
      "121s",
    ]);
    expect(resolved.releaseGate?.deadline).toBe("10920s");
    expect(resolved.processes[2]?.cutover).toBeUndefined();
  });

  it("gives a Process with no budget the substrate's deadline and no startup probe", () => {
    const resolved = processOf(
      one(serving("notes-api").replace("        startupBudget: 20s\n", "")),
    );

    expect(resolved.deadline).toBe("720s");
    expect(resolved.startup).toBeUndefined();
  });

  it("allows the substrate's image pull on every deadline, rounded up, and nothing where it states none", () => {
    const deadline = (pull: (text: string) => string) =>
      processOf(one(serving("notes-api")), { platform: pull }).deadline;

    expect(deadline((same) => same)).toBe("180s");
    expect(
      deadline((text) => text.replace("imagePull: 2m", "imagePull: 1500ms")),
    ).toBe("62s");
    expect(
      deadline((text) =>
        text.replace(/\n {2}imagePull: 2m[^\n]*\n(?: {2}#[^\n]*\n)?/, "\n"),
      ),
    ).toBe("60s");
  });

  it("carries the replica count a Process declares, with its reason", () => {
    expect(
      processOf(
        one(
          serving(
            "notes-api",
            "        replicas: { count: 2, reason: two zones }\n",
          ),
        ),
      ).replicas,
    ).toBe(2);
  });
});

describe("probes and the release gate", () => {
  it("derives no startup probe and no liveness where only readiness is declared", () => {
    const resolved = processOf(
      one(
        serving("notes-api").replace(
          "          liveness: { path: /live, port: 8080 }\n",
          "",
        ),
      ),
    );

    expect(resolved.readiness).toStrictEqual({
      path: "/ready",
      port: 8080,
      period: "10s",
      timeout: "5s",
      failures: 3,
    });
    expect(resolved.liveness).toBeUndefined();
    expect(resolved.startup).toBeUndefined();
  });

  it("polls liveness every five seconds for as long as the budget, rounded up", () => {
    expect(
      processOf(
        one(
          serving("notes-api").replace(
            "startupBudget: 20s",
            "startupBudget: 21s",
          ),
        ),
      ).startup,
    ).toStrictEqual({
      path: "/live",
      port: 8080,
      period: "5s",
      timeout: "5s",
      failures: 5,
    });
  });

  it("gates a tcp member with no checks where its profile exports no metrics", () => {
    const gate = application(
      one(
        serving("notes-api")
          .replace("runtime: node", "runtime: static")
          .replace(
            "          readiness: { path: /ready, port: 8080 }\n",
            "          readiness: { tcp: 8080 }\n",
          ),
      ),
    ).releaseGate;

    expect(gate?.members).toStrictEqual([
      { process: "notes-api", readiness: { tcp: 8080 } },
    ]);
    expect(gate?.analysis).toStrictEqual({
      interval: "30s",
      iterations: 4,
      threshold: 3,
      errorRate: "1%",
      latency: "500ms",
    });
  });

  it("refuses a blue/green Application no member of which publishes readiness", () => {
    expect(
      codesOf(
        resolve(
          one(
            serving("notes-api").replace(
              "        probes:\n          readiness: { path: /ready, port: 8080 }\n          liveness: { path: /live, port: 8080 }\n",
              "        probes: none\n",
            ),
          ),
        ),
      ),
    ).toStrictEqual(["E_RELEASE_UNIT_NO_READINESS"]);
  });
});

describe("the environment a Process runs with", () => {
  const env = (path: string, content: string): AuthoredFile => ({
    name: `minimal/env/${path}`,
    text: content,
  });

  it("overlays the render's Cluster Target on the base file, and no other cluster's", () => {
    const resolved = processOf(one(serving("notes-api")), {
      // Another cluster's overlay is read first, then this one's, then the
      // base, so finding either cannot fall back on order.
      env: [
        env("notes-api/staging.env", "D=staging\n"),
        env("notes-api/production.env", "B=production\nC=production\n"),
        env("notes-api/base.env", "A=base\nB=base\n"),
      ],
    });

    expect(
      resolved.environment
        ?.filter(({ name }) => name.length === 1)
        .map((entry) => `${entry.name}=${"value" in entry ? entry.value : ""}`),
    ).toStrictEqual(["A=base", "B=production", "C=production"]);
  });

  it("resolves an identity placeholder to the Process's own derived facts", () => {
    const resolved = processOf(one(serving("notes-api")), {
      env: [
        env(
          "notes-api/base.env",
          "NS=${identity:namespace}\nROLE=${identity:vaultRole}\nSA=${identity:serviceAccount}\n",
        ),
      ],
    });

    expect(
      resolved.environment?.filter(({ name }) =>
        ["NS", "ROLE", "SA"].includes(name),
      ),
    ).toStrictEqual([
      { name: "NS", value: "notes-system" },
      // The Secret Store has no namespaces, so the role's name carries one.
      { name: "ROLE", value: "notes-system-notes-api" },
      { name: "SA", value: "notes-api" },
    ]);
  });

  it("resolves a dependency placeholder to one coordinate of the Process's own edge, with the text after it", () => {
    const resolved = processOf(
      reaching(
        serving(
          "notes-api",
          "        dependsOn:\n          - { application: platform-postgres, surface: postgres }\n",
        ),
      ),
      {
        env: [
          env(
            "notes-api/base.env",
            "DB_HOST=${dependency:platform-postgres.host}\nDB_PORT=${dependency:platform-postgres.port}\nDB_URL=${dependency:platform-postgres.host}/notes\n",
          ),
          ...DATA,
        ],
      },
    );

    expect(
      resolved.environment?.filter(({ name }) => name.startsWith("DB_")),
    ).toStrictEqual([
      { name: "DB_HOST", value: "postgres.data-system.svc.cluster.local" },
      { name: "DB_PORT", value: "5432" },
      {
        name: "DB_URL",
        value: "postgres.data-system.svc.cluster.local/notes",
      },
    ]);
  });

  it.each([
    [
      "an Application the Process has no edge to",
      "${dependency:platform-valkey.host}",
    ],
    [
      "a coordinate an edge does not hand out",
      "${dependency:platform-postgres.url}",
    ],
  ])("refuses a dependency placeholder naming %s", (_, placeholder) => {
    expect(
      codesOf(
        resolve(
          reaching(
            serving(
              "notes-api",
              "        dependsOn:\n          - { application: platform-postgres, surface: postgres }\n",
            ),
          ),
          { env: [env("notes-api/base.env", `X=${placeholder}\n`), ...DATA] },
        ),
      ),
    ).toStrictEqual(["E_UNRESOLVED_PLACEHOLDER"]);
  });

  it("refuses a dependency placeholder on a Process that has no edge at all", () => {
    expect(
      codesOf(
        resolve(one(serving("notes-api")), {
          env: [
            env(
              "notes-api/base.env",
              "X=${dependency:platform-postgres.host}\n",
            ),
          ],
        }),
      ),
    ).toStrictEqual(["E_UNRESOLVED_PLACEHOLDER"]);
  });

  it("refuses a dependency placeholder naming an Application the Process has two edges to", () => {
    expect(
      codesOf(
        resolve(
          reaching(
            serving(
              "notes-api",
              "        dependsOn:\n          - { application: platform-postgres, surface: postgres }\n          - { application: platform-postgres, surface: metrics }\n",
            ),
          ),
          {
            env: [
              env(
                "notes-api/base.env",
                "X=${dependency:platform-postgres.host}\n",
              ),
              ...DATA,
            ],
          },
        ),
      ),
    ).toStrictEqual(["E_UNRESOLVED_PLACEHOLDER"]);
  });

  it("resolves an exposure placeholder to its url, host or scheme, by the tier that carries it", () => {
    const exposed = `  - id: notes
    exposure:
      - { name: app, host: notes.jorisjonkers.dev, audience: lan, routes: [{ path: /, match: prefix, process: notes-api, surface: http }] }
    processes:
${serving("notes-api")}`;
    const resolved = processOf(exposed, {
      env: [
        env(
          "notes-api/base.env",
          "URL=${exposure:notes.app#url}/login\nHOST=${exposure:notes.app#host}\nSCHEME=${exposure:notes.app#scheme}\n",
        ),
      ],
      platform: (document) =>
        document.replace("listener: tls\n", "listener: plain\n"),
    });

    expect(
      resolved.environment?.filter(({ name }) =>
        ["URL", "HOST", "SCHEME"].includes(name),
      ),
    ).toStrictEqual([
      { name: "HOST", value: "notes.jorisjonkers.dev" },
      { name: "SCHEME", value: "http" },
      { name: "URL", value: "http://notes.jorisjonkers.dev/login" },
    ]);
  });

  it.each([
    [
      "an exposure the union does not declare",
      "${exposure:notes.gone#url}",
      "E_UNRESOLVED_PLACEHOLDER",
    ],
    [
      "an Application the union does not hold",
      "${exposure:gone.app#url}",
      "E_UNRESOLVED_APPLICATION",
    ],
    [
      "an Application that declares no exposure",
      "${exposure:release-gate.app#url}",
      "E_UNRESOLVED_PLACEHOLDER",
    ],
    [
      "a field an exposure does not hand out",
      "${exposure:notes.app#path}",
      "E_UNRESOLVED_PLACEHOLDER",
    ],
  ])("refuses an exposure placeholder naming %s", (_, placeholder, code) => {
    expect(
      codesOf(
        resolve(
          `  - id: notes
    exposure:
      - { name: app, host: notes.jorisjonkers.dev, audience: authenticated, routes: [{ path: /, match: prefix, process: notes-api, surface: http }] }
    processes:
${serving("notes-api")}`,
          { env: [env("notes-api/base.env", `X=${placeholder}\n`)] },
        ),
      ),
    ).toStrictEqual([code]);
  });

  it("injects no Runtime Profile where the runtime exports nothing, and no PORT beside two surfaces", () => {
    expect(
      processOf(
        one(serving("notes-api").replace("runtime: node", "runtime: none")),
      ).environment,
    ).toBeUndefined();
    expect(
      processOf(
        one(
          serving("notes-api").replace(
            "provides: { http: 8080 }",
            "provides: { http: 8080, admin: 9090 }",
          ),
        ),
      ).environment?.map(({ name }) => name),
    ).toStrictEqual([
      "DEPLOYMENT_ENVIRONMENT",
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "OTEL_SERVICE_NAME",
    ]);
  });

  it("hands PORT to no Process that provides no surface", () => {
    expect(
      processOf(
        one(`      - name: notes-job
        lifecycle: job
        image: notes-api
        runtime: node
        placement: { memory: 64Mi, cpu: 10m }
        startupBudget: 30s
        cutover: interrupted
`),
      ).environment?.map(({ name }) => name),
    ).toStrictEqual([
      "DEPLOYMENT_ENVIRONMENT",
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "OTEL_SERVICE_NAME",
    ]);
  });

  it("hands no collector endpoint where the platform names no collector", () => {
    expect(
      processOf(one(serving("notes-api")), {
        platform: (platform) =>
          platform.replace(/\ntelemetry:\n( {2}.*\n)+/, "\n"),
      }).environment?.map(({ name }) => name),
    ).toStrictEqual(["DEPLOYMENT_ENVIRONMENT", "OTEL_SERVICE_NAME", "PORT"]);
  });
});

describe("where a Process may land", () => {
  const placed = (placement: string, cutover = "interrupted") =>
    processOf(
      one(
        serving("notes-api")
          .replace(
            "placement: { memory: 64Mi, cpu: 10m }",
            `placement: ${placement}`,
          )
          .replace("cutover: continuous", `cutover: ${cutover}`),
      ),
    ).placement.eligibleNodes;

  it("matches every declared dimension against the node contract", () => {
    expect(placed("{ memory: 64Mi, cpu: 10m, arch: [arm64] }")).toStrictEqual([
      "enschede-pi-1",
      "enschede-pi-2",
      "enschede-pi-3",
    ]);
    expect(placed("{ memory: 64Mi, cpu: 10m, site: frankfurt }")).toStrictEqual(
      ["frankfurt-contabo-1"],
    );
    expect(
      placed("{ memory: 64Mi, cpu: 10m, capabilities: [nvidia, lan-ingress] }"),
    ).toStrictEqual(["enschede-t1000-1", "enschede-gtx-960m-1"]);
    expect(
      placed(
        "{ memory: 64Mi, cpu: 10m, gpu: { class: transcode, memory: 4Gi } }",
      ),
    ).toStrictEqual(["enschede-t1000-1"]);
    expect(
      placed("{ memory: 64Mi, cpu: 10m, disk: { media: [nvme] } }"),
    ).toStrictEqual(["enschede-t1000-1", "enschede-rx7900xtx-1"]);
  });

  it("counts a continuous Process twice, its sidecars with it, and reads whole cores and larger units", () => {
    expect(placed("{ memory: 7900Mi, cpu: 10m }")).toStrictEqual([
      "enschede-t1000-1",
      "enschede-rx7900xtx-1",
      "enschede-gtx-960m-1",
      "enschede-pi-1",
      "frankfurt-contabo-1",
    ]);
    expect(placed("{ memory: 7900Mi, cpu: 10m }", "continuous")).toStrictEqual([
      "enschede-t1000-1",
      "enschede-rx7900xtx-1",
      "enschede-gtx-960m-1",
      "frankfurt-contabo-1",
    ]);
    expect(placed("{ memory: 1Gi, cpu: 20000m }")).toStrictEqual([
      "enschede-t1000-1",
      "enschede-rx7900xtx-1",
      "enschede-gtx-960m-1",
    ]);
    expect(
      processOf(
        one(
          serving(
            "notes-api",
            "        sidecars:\n          - { name: shipper, image: notes-api, memory: 200Mi, cpu: 5m }\n",
          )
            .replace(
              "placement: { memory: 64Mi, cpu: 10m }",
              "placement: { memory: 7800Mi, cpu: 10m }",
            )
            .replace("cutover: continuous", "cutover: interrupted"),
        ),
      ).placement.eligibleNodes,
    ).not.toContain("enschede-pi-1");
    expect(() => placed("{ memory: 1Ti, cpu: 10m }")).toThrow(
      "E_PLACEMENT_UNSATISFIABLE",
    );
  });
});

// REQ-071 (docs/requirements.md): the VPN container beside an attached
// Process, its derived settings, its credential and the refusals around it.
describe("a Process that attaches to the VPN", () => {
  const attached = (vpn: string, extra = "") =>
    one(
      serving("notes-api", `        vpn: ${vpn}\n${extra}`).replace(
        "cutover: continuous",
        "cutover: interrupted",
      ),
    );
  const SETTINGS = [
    { name: "DNS_KEEP_NAMESERVER", value: "on" },
    { name: "DOT", value: "off" },
  ];

  it("runs the platform's VPN beside it, its firewall admitting the Process's surfaces, and forwards a port only where asked", () => {
    const process = processOf(attached("{ forwardedPort: true }"));

    expect(process.vpn).toStrictEqual({
      image:
        "docker.io/qmcgaw/gluetun@sha256:7e1f3c5a9b2d4f6e8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f",
      memory: "128Mi",
      cpu: "50m",
      forwardedPort: true,
      // The platform's settings and the derived values, one list, by name.
      environment: [
        ...SETTINGS,
        { name: "FIREWALL_INPUT_PORTS", value: "8080" },
        { name: "PORT_FORWARD_ONLY", value: "on" },
        { name: "SERVER_COUNTRIES", value: "Netherlands" },
        { name: "VPN_PORT_FORWARDING", value: "on" },
        {
          name: "VPN_PORT_FORWARDING_UP_COMMAND",
          value: "/bin/sh -c 'echo {{PORT}} > /run/vpn/forwarded-port'",
        },
        { name: "VPN_SERVICE_PROVIDER", value: "protonvpn" },
        { name: "VPN_TYPE", value: "wireguard" },
      ],
      // Only the VPN reads it, from a Secret of its own.
      credential: {
        // Its own key below the platform's prefix: one device per Process.
        path: "secret/data/platform/vpn/notes-notes-api",
        access: "read",
        delivery: "env",
        destination: "notes-api-vpn-platform-vpn-notes-notes-api",
      },
    });
    // The tunnel's endpoint is a public address.
    expect(process.internetEgress).toStrictEqual({
      reason: "the VPN's tunnel reaches its provider's servers",
    });

    const egressOnly = processOf(attached("{ forwardedPort: false }")).vpn;
    expect(egressOnly?.forwardedPort).toBe(false);
    expect(
      egressOnly?.environment.filter(({ name }) => name.startsWith("VPN_PORT")),
    ).toStrictEqual([{ name: "VPN_PORT_FORWARDING", value: "off" }]);
    expect(processOf(one(serving("notes-api")))).not.toHaveProperty("vpn");
  });

  it("admits every surface, once each and in order, and none where the Process provides none", () => {
    const ports = (provides: string) =>
      processOf(
        attached("{ forwardedPort: false }").replace(
          "provides: { http: 8080 }",
          provides,
        ),
      ).vpn?.environment.find(({ name }) => name === "FIREWALL_INPUT_PORTS");

    expect(
      ports("provides: { metrics: 9090, http: 8080, admin: 8080 }"),
    ).toStrictEqual({
      name: "FIREWALL_INPUT_PORTS",
      value: "8080,9090",
    });

    // A Process that serves nothing admits nothing.
    const serving = attached("{ forwardedPort: false }")
      .replace("        provides: { http: 8080 }\n", "")
      .replace(
        "        probes:\n          readiness: { path: /ready, port: 8080 }\n          liveness: { path: /live, port: 8080 }\n",
        "        probes: none\n",
      );
    expect(
      processOf(serving).vpn?.environment.map(({ name }) => name),
    ).not.toContain("FIREWALL_INPUT_PORTS");
  });

  it("connects its Application to the Secret Store, after the unit that writes its role", () => {
    const attachedApp = application(attached("{ forwardedPort: false }"));
    const bare = application(
      one(
        serving("notes-api").replace(
          "cutover: continuous",
          "cutover: interrupted",
        ),
      ),
    );

    expect(attachedApp.secretStore).toBe(
      "http://vault.secrets-system.svc.cluster.local:8200",
    );
    expect(attachedApp.reconcileAfter).toContain("estate-vso-secrets");
    expect(bare).not.toHaveProperty("secretStore");
    expect(bare.reconcileAfter ?? []).not.toContain("estate-vso-secrets");
  });

  it("keeps the reason an author gave for internet egress", () => {
    expect(
      processOf(
        attached(
          "{ forwardedPort: false }",
          "        egress: { to: internet, reason: fetches feeds }\n",
        ),
      ).internetEgress,
    ).toStrictEqual({ reason: "fetches feeds" });
  });

  it("asks a node to fit the VPN container beside it", () => {
    const placed = (memory: string) =>
      processOf(attached("{ forwardedPort: false }"), {
        platform: (platform) =>
          platform.replace(
            "  memory: 128Mi\n  cpu: 50m\n  settings:",
            `  memory: ${memory}\n  cpu: 50m\n  settings:`,
          ),
      }).placement.eligibleNodes;

    expect(placed("128Mi")).toContain("enschede-pi-2");
    // 4000Mi beside the Process's 64Mi no longer fits a 4096Mi Pi.
    expect(placed("4000Mi")).not.toContain("enschede-pi-2");
  });

  it("asks nothing of a platform that runs no VPN, where no Process attaches", () => {
    const noVpn = resolve(one(serving("notes-api")), {
      platform: (platform) =>
        platform.slice(0, platform.indexOf("\n# The VPN")) + "\n",
      lock: (lock) => lock.replace("  gluetun:\n", "  gluetun-retired:\n"),
    });

    expect(codesOf(noVpn)).toStrictEqual([]);
  });

  it("refuses an attachment the platform runs no VPN for, and a VPN image the lock does not hold", () => {
    const unrun = resolve(attached("{ forwardedPort: true }"), {
      platform: (platform) =>
        platform.slice(0, platform.indexOf("\n# The VPN")) + "\n",
    });
    expect(codesOf(unrun)).toStrictEqual(["E_NO_VPN_POLICY"]);
    expect(unrun.ok ? [] : unrun.diagnostics).toMatchObject([
      {
        path: "/applications/0/processes/0/vpn",
        message: "notes-api attaches to a VPN, and the platform runs none",
        hint: "Declare the VPN in the Platform document's `vpn`, or drop the attachment.",
      },
    ]);

    const unlocked = resolve(attached("{ forwardedPort: true }"), {
      lock: (lock) => lock.replace("  gluetun:\n", "  gluetun-retired:\n"),
    });
    expect(codesOf(unlocked)).toStrictEqual(["E_UNLOCKED_IMAGE"]);
    expect(unlocked.ok ? [] : unlocked.diagnostics).toMatchObject([
      {
        path: "/vpn/image",
        message: "the images lock holds no entry for gluetun",
        hint: "Lock the alias, or name one the images lock holds.",
      },
    ]);
  });
});

// REQ-070 (docs/requirements.md): the card a Process locks, the share it
// requests, and the vendor it must resolve to one Platform entry.
describe("a Process that requires a GPU", () => {
  const holding = (gpu: string) =>
    one(
      serving("notes-api")
        .replace(
          "placement: { memory: 64Mi, cpu: 10m }",
          `placement: { memory: 64Mi, cpu: 10m, gpu: ${gpu} }`,
        )
        .replace("cutover: continuous", "cutover: interrupted"),
    );
  const NVIDIA = { resource: "nvidia.com/gpu", runtimeClass: "nvidia-cdi" };

  it("matches one card on every term it declares, and takes a vendor or a model as a set", () => {
    const placedOn = (gpu: string) =>
      processOf(holding(gpu)).placement.eligibleNodes;

    expect(placedOn("{ class: transcode, model: [t1000] }")).toStrictEqual([
      "enschede-t1000-1",
    ]);
    expect(placedOn("{ vendor: [nvidia] }")).toStrictEqual([
      "enschede-t1000-1",
      "enschede-gtx-960m-1",
    ]);
    expect(placedOn("{ model: [gtx960m, t1000] }")).toStrictEqual([
      "enschede-t1000-1",
      "enschede-gtx-960m-1",
    ]);
    // Every term holds on one card: no nvidia card is a render-compute one.
    expect(
      codesOf(resolve(holding("{ class: render-compute, vendor: [nvidia] }"))),
    ).toStrictEqual(["E_PLACEMENT_UNSATISFIABLE"]);
    expect(codesOf(resolve(holding("{ model: [a100] }")))).toStrictEqual([
      "E_PLACEMENT_UNSATISFIABLE",
    ]);
  });

  it("derives one share of its vendor's resource and the runtime class the Platform names for it", () => {
    expect(processOf(holding("{ model: [t1000] }")).gpu).toStrictEqual(NVIDIA);
    expect(processOf(holding("{ vendor: [nvidia] }")).gpu).toStrictEqual(
      NVIDIA,
    );
    // Only the cards of eligible nodes count: the AMD card's node carries no `nvidia`.
    expect(
      processOf(
        one(
          serving("notes-api")
            .replace(
              "placement: { memory: 64Mi, cpu: 10m }",
              "placement: { memory: 64Mi, cpu: 10m, capabilities: [nvidia], gpu: {} }",
            )
            .replace("cutover: continuous", "cutover: interrupted"),
        ),
      ).gpu,
    ).toStrictEqual(NVIDIA);
    expect(processOf(one(serving("notes-api")))).not.toHaveProperty("gpu");
  });

  it("refuses cards of two vendors, and a vendor the Platform names nothing for", () => {
    const refused = resolve(holding("{}"));
    expect(codesOf(refused)).toStrictEqual(["E_GPU_VENDOR_AMBIGUOUS"]);
    expect(refused.ok ? [] : refused.diagnostics).toMatchObject([
      {
        path: "/applications/0/processes/0/placement/gpu",
        message:
          "notes-api may land on cards of nvidia, amd, and one request names one vendor's resource",
        hint: "Lock the `gpu` to one `vendor`, or to models of one vendor.",
      },
    ]);

    const unnamed = resolve(holding("{ vendor: [amd] }"));
    expect(codesOf(unnamed)).toStrictEqual(["E_NO_GPU_POLICY"]);
    expect(unnamed.ok ? [] : unnamed.diagnostics).toMatchObject([
      {
        path: "/applications/0/processes/0/placement/gpu",
        message:
          "the platform names no resource or runtime class for amd cards",
        hint: "Add the vendor to the Platform document's `gpus`.",
      },
    ]);
    // The Platform names it, so the same Process resolves.
    expect(
      processOf(holding("{ vendor: [amd] }"), {
        platform: (platform) =>
          platform.replace(
            "    runtimeClass: nvidia-cdi\n",
            "    runtimeClass: nvidia-cdi\n  amd:\n    resource: amd.com/gpu\n    runtimeClass: rocm\n",
          ),
      }).gpu,
    ).toStrictEqual({ resource: "amd.com/gpu", runtimeClass: "rocm" });
  });
});

describe("dependency edges and the order they impose", () => {
  const consumer = (edges: string) =>
    `  - id: notes
    processes:
${serving("notes-api", `        dependsOn:\n${edges}`)}  - id: notes-worker
    processes:
      - name: notes-worker-seed
        lifecycle: job
        image: notes-api
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        startupBudget: 20s
        cutover: interrupted
${serving("notes-worker").replace("provides: { http: 8080 }", "provides: { jobs: 7000 }")}`;

  it("resolves an edge into another project, one into the same project, and one to a platform provider", () => {
    const all = projects(
      consumer(`          - { application: otel-collector, surface: otlp }
          - { application: notes-worker, surface: jobs }
          - { application: stalwart, surface: smtp }
`),
    );
    const notes = projectNamed(all, "notes");

    expect(notes.applications[0]?.processes[0]?.dependencies).toStrictEqual([
      {
        application: "otel-collector",
        surface: "otlp",
        address: "otel-collector.observability-system.svc.cluster.local:4317",
        peers: [
          {
            namespace: "observability-system",
            process: "otel-collector",
            port: 4317,
          },
        ],
      },
      {
        application: "notes-worker",
        surface: "jobs",
        address: "notes-worker.notes-system.svc.cluster.local:7000",
        peers: [
          { namespace: "notes-system", process: "notes-worker", port: 7000 },
        ],
      },
      { application: "stalwart", surface: "smtp", address: "10.0.0.12:25" },
    ]);
    expect(notes.applications[0]?.reconcileAfter).toStrictEqual([
      "apps-observability",
    ]);
    expect(
      notes.dependencies.applications.map(({ id, edges }) => [
        id,
        edges.length,
      ]),
    ).toStrictEqual([
      ["notes", 3],
      ["notes-worker", 0],
    ]);
    expect(notes.dependencies.applications[0]?.edges[0]?.["consumer"]).toBe(
      "notes-api",
    );
  });

  it("refuses an edge to a surface neither the Application nor the register provides, rather than writing no address", () => {
    expect(
      codesOf(
        resolve(
          consumer("          - { application: stalwart, surface: imap }\n"),
        ),
      ),
    ).toStrictEqual(["E_UNKNOWN_SURFACE"]);
    expect(
      codesOf(
        resolve(
          consumer(
            "          - { application: notes-worker, surface: http }\n",
          ),
        ),
      ),
    ).toStrictEqual(["E_UNKNOWN_SURFACE"]);
  });
});

describe("the quantities eligibility compares", () => {
  it("reads whole cores as a thousand millicores, the way a node may publish them", () => {
    expect(millicores("16")).toBe(16000);
    expect(millicores("250m")).toBe(250);
  });

  it("reads every memory unit in MiB", () => {
    expect([
      mebibytes("1Ti"),
      mebibytes("2Gi"),
      mebibytes("3Mi"),
      mebibytes("1048576"),
    ]).toStrictEqual([1048576, 2048, 3, 1]);
  });
});

describe("what a grant derives", () => {
  const granted = (grant: string) =>
    one(serving("notes-api", `        secrets:\n          - ${grant}\n`));
  const SELF =
    "{ path: secret/data/notes/token, keys: [token], access: read, delivery: self, rotation: {tolerates: reload} }";
  const ENV =
    "{ path: secret/data/notes/token, keys: [token], access: read, delivery: env, rotation: {tolerates: restart} }";
  const bound = (line: string): Options => ({
    env: [{ name: "minimal/env/notes-api/base.env", text: line }],
  });

  it("reads a self grant in the Process, mounting the token it authenticates with and syncing nothing", () => {
    const resolved = processOf(granted(SELF));

    expect(resolved.secrets).toStrictEqual([
      {
        path: "secret/data/notes/token",
        keys: ["token"],
        access: "read",
        delivery: "self",
      },
    ]);
    expect(resolved.identityToken).toBe(true);
  });

  it("syncs an env grant to a Secret named for the Process and the path below the mount, and restarts the Process on rotation", () => {
    const resolved = processOf(
      granted(ENV),
      bound("TOKEN=${secret:secret/data/notes/token#token}\n"),
    );

    expect(resolved.secrets).toStrictEqual([
      {
        path: "secret/data/notes/token",
        keys: ["token"],
        access: "read",
        delivery: "env",
        destination: "notes-api-notes-token",
        restartTargets: ["notes-api"],
      },
    ]);
    expect(resolved.identityToken).toBe(false);
    expect(
      resolved.environment?.find(({ name }) => name === "TOKEN"),
    ).toStrictEqual({
      name: "TOKEN",
      secret: { path: "secret/data/notes/token", key: "token" },
    });
  });

  it("leaves the mount out of a Secret's name only where it opens the path", () => {
    expect(
      processOf(
        granted(
          "{ path: team/secret/data/token, keys: [token], access: read, delivery: env, rotation: {tolerates: restart} }",
        ),
        bound("TOKEN=${secret:team/secret/data/token#token}\n"),
      ).secrets?.[0],
    ).toHaveProperty("destination", "notes-api-team-secret-data-token");
  });

  // A synced value restarts its consumer once the operator syncs it, whatever
  // the rotation tolerates (spec/v1/10-project-intent.md#delivery).
  it("carries a file grant's mount and mode, and restarts its consumer even where it tolerates a reload", () => {
    expect(
      processOf(
        granted(
          "{ path: secret/data/notes/key, keys: [key], access: read, delivery: file, mountAt: /run/key, fileMode: '0400', rotation: {tolerates: reload} }",
        ),
      ).secrets,
    ).toStrictEqual([
      {
        path: "secret/data/notes/key",
        keys: ["key"],
        access: "read",
        delivery: "file",
        destination: "notes-api-notes-key",
        mountAt: "/run/key",
        fileMode: "0400",
        restartTargets: ["notes-api"],
      },
    ]);
  });

  it("admits the Secret Store's http surface to a Process that holds a grant, and to no other", () => {
    const rules = (applications: string) =>
      processOf(applications).egress?.map(
        ({ rule, namespace, process, port }) =>
          `${rule} ${namespace} ${process ?? "*"} ${String(port)}`,
      );

    expect(rules(granted(SELF))).toStrictEqual([
      "cluster-dns kube-system * 53",
      "secret-store secrets-system vault 8200",
    ]);
    expect(rules(one(serving("notes-api")))).toStrictEqual([
      "cluster-dns kube-system * 53",
    ]);
  });

  it("finds the Secret Store's http surface on whichever of its Processes provides it", () => {
    const secrets = text("secrets/secrets.project.yml").replace(
      "    processes:\n",
      "    processes:\n      - name: vault-agent\n        lifecycle: job\n        image: vault\n        runtime: none\n        placement: { memory: 64Mi, cpu: 10m }\n        startupBudget: 20s\n        cutover: interrupted\n",
    );
    const result = resolveIntentSet(
      [
        { name: "platform/platform.intent.yml", text: PLATFORM },
        ...FOUNDATION.filter(({ name }) => !name.startsWith("secrets/")),
        { name: "secrets/secrets.project.yml", text: secrets },
        { name: "minimal/notes.project.yml", text: HEADER + granted(SELF) },
      ],
      {
        hash: sha256Hasher,
        schemaPackageIntegrity: `sha256:${"0".repeat(64)}`,
      },
    );
    const notes = result.ok
      ? result.value.projects.find(({ project }) => project === "notes")
      : undefined;

    expect(notes?.applications[0]?.processes[0]?.egress?.[1]).toStrictEqual({
      rule: "secret-store",
      namespace: "secrets-system",
      process: "vault",
      port: 8200,
    });
  });

  it("hands the Secret Store's endpoint to an Application holding a grant, and to no other", () => {
    expect(application(granted(SELF)).secretStore).toBe(
      "http://vault.secrets-system.svc.cluster.local:8200",
    );
    // One Process holding a grant is enough.
    expect(
      application(`${granted(SELF)}${serving("notes-worker")}`).secretStore,
    ).toBe("http://vault.secrets-system.svc.cluster.local:8200");
    expect(application(one(serving("notes-api"))).secretStore).toBeUndefined();
  });

  it("orders an Application holding a grant after the unit that materialises its credentials", () => {
    expect(application(granted(SELF)).reconcileAfter).toStrictEqual([
      "estate-vso-secrets",
    ]);
    // One Process holding a grant is enough.
    expect(
      application(`${granted(SELF)}${serving("notes-worker")}`).reconcileAfter,
    ).toStrictEqual(["estate-vso-secrets"]);
    expect(
      application(one(serving("notes-api"))).reconcileAfter,
    ).toBeUndefined();
  });

  it("refuses a grant under a platform that names no Secret Store", () => {
    expect(
      codesOf(
        resolve(granted(SELF), {
          platform: (document) => document.replace("secretStore: vault\n", ""),
        }),
      ),
    ).toStrictEqual(["E_NO_SECRET_STORE"]);
  });

  it.each([
    [
      // The grant's own path is then read by nothing.
      "a path no grant names",
      "${secret:secret/data/notes/other#token}",
      ["E_UNAUTHORISED_SECRET_REFERENCE", "E_UNBOUND_SECRET_GRANT"],
    ],
    [
      "a key the grant does not list",
      "${secret:secret/data/notes/token#other}",
      ["E_UNAUTHORISED_SECRET_REFERENCE"],
    ],
  ])("refuses a placeholder naming %s", (_, placeholder, codes) => {
    expect(
      codesOf(resolve(granted(ENV), bound(`TOKEN=${placeholder}\n`))),
    ).toStrictEqual(codes);
  });

  it.each([
    ["no grant at all", "", ""],
    [
      "a grant on another engine",
      "        secrets:\n          - { engine: database, role: notes, delivery: self, rotation: {tolerates: reload} }\n",
      "",
    ],
  ])("refuses a placeholder on a Process holding %s", (_, block) => {
    expect(
      codesOf(
        resolve(
          one(serving("notes-api", block)),
          bound("TOKEN=${secret:secret/data/notes/token#token}\n"),
        ),
      ),
    ).toStrictEqual(["E_UNAUTHORISED_SECRET_REFERENCE"]);
  });

  it("refuses a placeholder naming a grant the Process reads itself", () => {
    expect(
      codesOf(
        resolve(
          granted(SELF),
          bound("TOKEN=${secret:secret/data/notes/token#token}\n"),
        ),
      ),
    ).toStrictEqual(["E_UNAUTHORISED_SECRET_REFERENCE"]);
  });
});

describe("what an Asset and a sidecar derive", () => {
  const ASSET =
    "        assets:\n          - { from: config/notes.yml, mountAt: /etc/notes.yml }\n";
  const beside = (content: string): Options => ({
    env: [{ name: "minimal/config/notes.yml", text: content }],
  });

  it("names an Asset for its Process, its file and its content, and carries the file", () => {
    const content = "page-size: 20\n";

    expect(
      processOf(one(serving("notes-api", ASSET)), beside(content)).assets,
    ).toStrictEqual([
      {
        name: `notes-api-notes-yml-${sha256Hasher(content).slice(7, 17)}`,
        from: "config/notes.yml",
        mountAt: "/etc/notes.yml",
        content,
      },
    ]);
  });

  it("spells every run of other characters in an Asset's file name as one `-`", () => {
    const [asset] =
      processOf(
        one(
          serving(
            "notes-api",
            "        assets:\n          - { from: config/Notes--v1.yml, mountAt: /etc/notes.yml }\n",
          ),
        ),
        { env: [{ name: "minimal/config/Notes--v1.yml", text: "a: 1\n" }] },
      ).assets ?? [];

    expect(asset?.name).toMatch(/^notes-api-notes-v1-yml-[0-9a-f]{10}$/);
  });

  it("renames an Asset, and moves its fragment's digest, when only its content moves", () => {
    const resolved = (content: string) =>
      application(one(serving("notes-api", ASSET)), beside(content));
    const digest = (content: string) =>
      resolved(content).provenance.inputDigests.find(
        ({ name }) => name === "notes",
      )?.digest;

    expect(resolved("a: 1\n").processes[0]?.assets?.[0]?.name).not.toBe(
      resolved("a: 2\n").processes[0]?.assets?.[0]?.name,
    );
    expect(digest("a: 1\n")).not.toBe(digest("a: 2\n"));
  });

  it("digests a fragment's Asset files in path order, whatever order the project names them in", () => {
    const two =
      "        assets:\n          - { from: config/b.yml, mountAt: /etc/b.yml }\n          - { from: config/c.yml, mountAt: /etc/c.yml }\n          - { from: config/a.yml, mountAt: /etc/a.yml }\n";
    const source = HEADER + one(serving("notes-api", two));
    const beside = [
      { name: "minimal/config/b.yml", text: "b: 1\n" },
      { name: "minimal/config/c.yml", text: "c: 1\n" },
      { name: "minimal/config/a.yml", text: "a: 1\n" },
    ];
    const parsed = parseProjectIntent(source);
    if (!parsed.ok) throw new Error("the project did not parse");

    expect(
      application(one(serving("notes-api", two)), {
        env: beside,
      }).provenance.inputDigests.find(({ name }) => name === "notes")?.digest,
    ).toBe(
      sha256Hasher({
        document: parsed.value.document,
        env: [],
        assets: [
          { from: "config/a.yml", text: "a: 1\n" },
          { from: "config/b.yml", text: "b: 1\n" },
          { from: "config/c.yml", text: "c: 1\n" },
        ],
      }),
    );
  });

  it("reads an Asset only from beside its own project", () => {
    expect(
      codesOf(
        resolve(one(serving("notes-api", ASSET)), {
          env: [{ name: "other/config/notes.yml", text: "a: 1\n" }],
        }),
      ),
    ).toStrictEqual(["E_ASSET_NOT_FOUND"]);
  });

  it("stops at a placeholder in an Asset", () => {
    expect(() =>
      resolve(
        one(serving("notes-api", ASSET)),
        beside("url: ${exposure:notes.app#url}\n"),
      ),
    ).toThrow(
      "config/notes.yml: a placeholder in an Asset is not resolved yet",
    );
  });

  it("pins a sidecar's image by digest and carries its own resources", () => {
    expect(
      processOf(
        one(
          serving(
            "notes-api",
            "        sidecars:\n          - { name: exporter, image: postgres-exporter, memory: 32Mi, cpu: 5m }\n",
          ),
        ),
      ).sidecars,
    ).toStrictEqual([
      {
        name: "exporter",
        image: `${LOCK.images["postgres-exporter"]?.repository ?? ""}@${LOCK.images["postgres-exporter"]?.digest ?? ""}`,
        memory: "32Mi",
        cpu: "5m",
      },
    ]);
  });
});

describe("what an engine grant derives", () => {
  const holding = (grant: string) =>
    processOf(
      one(serving("notes-api", `        secrets:\n          - ${grant}\n`)),
    );

  it("covers one path per transit operation, each the one Vault maps it to", () => {
    expect(
      holding(
        "{ engine: transit, key: notes-jwt, operations: [sign, verify, encrypt, decrypt, rotate], delivery: self, rotation: {tolerates: restart} }",
      ).secrets,
    ).toStrictEqual([
      {
        engine: "transit",
        delivery: "self",
        paths: [
          { path: "transit/sign/notes-jwt", allows: ["update"] },
          { path: "transit/verify/notes-jwt", allows: ["update"] },
          { path: "transit/encrypt/notes-jwt", allows: ["update"] },
          { path: "transit/decrypt/notes-jwt", allows: ["update"] },
          { path: "transit/keys/notes-jwt/rotate", allows: ["update"] },
        ],
        restartTargets: ["notes-api"],
      },
    ]);
  });

  it("reads a database role's credential, and mounts the token the Process reads it with", () => {
    const resolved = holding(
      "{ engine: database, role: notes, delivery: self, rotation: {tolerates: reload} }",
    );

    expect(resolved.secrets).toStrictEqual([
      {
        engine: "database",
        delivery: "self",
        paths: [{ path: "database/creds/notes", allows: ["read"] }],
      },
    ]);
    expect(resolved.identityToken).toBe(true);
  });
});

describe("what has not landed yet", () => {
  it("gives every writable path the platform's ephemeral size", () => {
    expect(
      processOf(
        one(serving("notes-api", "        writablePaths: [/tmp, /cache]\n")),
      ).writablePaths,
    ).toStrictEqual([
      { path: "/tmp", size: "64Mi" },
      { path: "/cache", size: "64Mi" },
    ]);
  });
});

describe("what a managed migration derives", () => {
  const managed = `  - id: notes
    migration: { changelog: db/changelog.yml }
    processes:
${serving("notes-api", "        dependsOn:\n          - { application: platform-postgres, surface: postgres }\n")}`;
  const LOCKED = (lock: string) =>
    `${lock.trimEnd()}\n  notes-migration:\n    repository: ghcr.io/jorisjonkers-dev/notes/notes-migration\n    digest: "sha256:${"7".repeat(64)}"\n    uid: 1000\n    gid: 1000\n`;
  const PROOF = (body: string): AuthoredFile => ({
    name: "minimal/migration-proof.yml",
    text: `apiVersion: proof.jorisjonkers.dev/v1\nkind: MigrationProof\nschemaVersion: 1.0.0\napplications:\n${body}`,
  });
  const migration = (files: readonly AuthoredFile[] = []) =>
    application(managed, { lock: LOCKED, env: [...files, ...DATA] }).migration;
  /** What the plan holds whatever the proof says: the platform's terms and the project's database. */
  const PLAN = {
    identity: "notes-migration",
    deadline: "10m",
    memory: "256Mi",
    cpu: "100m",
    scratch: "64Mi",
    database: {
      host: "postgres.data-system.svc.cluster.local",
      port: 5432,
      name: "notes_db",
    },
    credential: {
      engine: "database",
      delivery: "self",
      paths: [{ path: "database/creds/notes-owner", allows: ["read"] }],
    },
    egress: [
      {
        rule: "datastore",
        namespace: "data-system",
        process: "postgres",
        port: 5432,
      },
      {
        rule: "secret-store",
        namespace: "secrets-system",
        process: "vault",
        port: 8200,
      },
      { rule: "cluster-dns", namespace: "kube-system", port: 53 },
    ],
  };

  it("runs the image the lock holds for the Application, as a first release where no proof names it", () => {
    expect(migration()).toStrictEqual({
      runner: `ghcr.io/jorisjonkers-dev/notes/notes-migration@sha256:${"7".repeat(64)}`,
      uid: 1000,
      gid: 1000,
      nonTransactional: false,
      ...PLAN,
    });
    expect(
      migration([PROOF("  - { id: other, nonTransactional: true }\n")]),
    ).toStrictEqual({
      runner: `ghcr.io/jorisjonkers-dev/notes/notes-migration@sha256:${"7".repeat(64)}`,
      uid: 1000,
      gid: 1000,
      nonTransactional: false,
      ...PLAN,
    });
  });

  it("runs as the image's own user, under the platform's terms for a migration", () => {
    const plan = application(managed, {
      lock: (lock) =>
        LOCKED(lock).replace(
          /uid: 1000\n {4}gid: 1000\n$/,
          "uid: 1001\n    gid: 1002\n",
        ),
      platform: (platform) =>
        platform
          .replace("deadline: 10m", "deadline: 15m")
          .replace(
            /(migration:\n(?: {2}.*\n)*? {2}memory: )256Mi\n {2}cpu: 100m/,
            "$1384Mi\n  cpu: 150m",
          ),
      env: DATA,
    }).migration;

    expect([plan?.uid, plan?.gid]).toStrictEqual([1001, 1002]);
    expect([plan?.deadline, plan?.memory, plan?.cpu]).toStrictEqual([
      "15m",
      "384Mi",
      "150m",
    ]);
  });

  it("derives each Process's database credential from its edge, the data role's under a changelog and the owner's when the Application migrates itself", () => {
    const held = application(managed, { lock: LOCKED, env: DATA });
    const self = application(
      managed.replace("{ changelog: db/changelog.yml }", "self"),
      { env: DATA },
    );
    const credential = (role: string) => [
      [
        {
          engine: "database",
          delivery: "self",
          paths: [{ path: `database/creds/${role}`, allows: ["read"] }],
        },
      ],
    ];

    expect(held.processes.map(({ secrets }) => secrets)).toStrictEqual(
      credential("notes-data"),
    );
    expect(self.processes.map(({ secrets }) => secrets)).toStrictEqual(
      credential("notes-owner"),
    );
    for (const resolved of [held, self])
      expect([resolved.secretStore, resolved.reconcileAfter]).toStrictEqual([
        "http://vault.secrets-system.svc.cluster.local:8200",
        ["apps-data", "estate-vso-secrets"],
      ]);
  });

  it("refuses an edge to a database under a platform that names no Secret Store, since its credential is the store's", () => {
    const selfMigrating = managed.replace(
      "{ changelog: db/changelog.yml }",
      "self",
    );
    // The data project holds grants of its own; this asks only what notes is refused for.
    const refusedNotes = (applications: string) => {
      const result = resolve(applications, {
        env: DATA,
        platform: (document) => document.replace("secretStore: vault\n", ""),
      });
      return result.ok
        ? []
        : result.diagnostics
            .filter(({ document }) => document === "minimal/notes.project.yml")
            .map(({ code }) => code);
    };

    expect(refusedNotes(selfMigrating)).toStrictEqual(["E_NO_SECRET_STORE"]);
  });

  it("finds its datastore through the first edge that names a surface of a Process whose engine owns databases", () => {
    const reaching = (...edges: readonly [string, string][]) =>
      ({
        processes: [
          {},
          {
            dependsOn: edges.map(([provider, surface]) => ({
              application: provider,
              surface,
            })),
          },
        ],
      }) as never;
    const union = [
      {
        project: "other",
        applications: [
          {
            id: "other-db",
            processes: [
              { name: "pg", engine: "postgres", provides: { sql: 1 } },
            ],
          },
        ],
      },
      {
        project: "data",
        applications: [
          {
            id: "db",
            processes: [
              { name: "cache", provides: { sql: 2 } },
              { name: "idle", engine: "postgres" },
              {
                name: "postgres",
                engine: "postgres",
                provides: { metrics: 9187, sql: 5432 },
              },
            ],
          },
        ],
      },
    ] as never;

    expect(
      datastoreOf(reaching(["db", "http"], ["db", "sql"]), union, {}),
    ).toStrictEqual({
      rule: "datastore",
      namespace: "data-system",
      process: "postgres",
      port: 5432,
    });
    expect(datastoreOf(reaching(["db", "http"]), union, {})).toBeUndefined();
    expect(
      datastoreOf(reaching(["db", "sql"]), union, {
        handover: {
          retireBy: "2027-03-31",
          serving: [
            { application: "db", namespace: "storage", instance: "pg" },
          ],
        },
      }),
    ).toStrictEqual({
      rule: "datastore",
      namespace: "storage",
      process: "pg",
      port: 5432,
    });
  });

  it("refuses the edge, not the migration, where the datastore is not among the files read", () => {
    expect(codesOf(resolve(managed, { lock: LOCKED }))).toStrictEqual([
      "E_UNRESOLVED_APPLICATION",
    ]);
  });

  it("hands the gate the migration it starts and may undo: its identity and what the proof records, and nothing where none is declared", () => {
    const proof = PROOF(
      `  - { id: notes, testedAgainst: "sha256:${"8".repeat(64)}", nonTransactional: true }\n`,
    );
    const gate = (files: readonly AuthoredFile[], applications = managed) =>
      application(applications, { lock: LOCKED, env: [...files, ...DATA] })
        .releaseGate;

    expect(gate([])?.migration).toStrictEqual({
      identity: "notes-migration",
      nonTransactional: false,
    });
    expect(gate([proof])?.migration).toStrictEqual({
      identity: "notes-migration",
      testedAgainst: `sha256:${"8".repeat(64)}`,
      nonTransactional: true,
    });
    const unmanaged = gate(
      [],
      managed.replace("{ changelog: db/changelog.yml }", "self"),
    );
    expect(unmanaged?.members).toHaveLength(1);
    expect(Object.keys(unmanaged ?? {})).not.toContain("migration");
  });

  it("is admitted by no Process but the datastore's own: neither another of its namespace nor one of its name elsewhere", () => {
    const named = `${managed}${serving("postgres")}`;
    const all = projects(named, { lock: LOCKED, env: DATA });
    const admitting = all.flatMap(({ applications }) =>
      applications.flatMap(({ namespace, processes }) =>
        processes
          .filter(({ ingress }) =>
            (ingress ?? []).some(({ rule }) => rule === "migration"),
          )
          .map(({ name }) => `${namespace}/${name}`),
      ),
    );

    expect(admitting).toStrictEqual(["data-system/postgres"]);
  });

  it("is admitted by the datastore that holds its database, on the surface its edge names, and no unmanaged Application is", () => {
    const admitted = (applications: string, options: Options) =>
      projectNamed(projects(applications, options), "data")
        .applications.find(({ id }) => id === "platform-postgres")
        ?.processes.flatMap(({ ingress }) => ingress ?? [])
        .filter(({ rule }) => rule === "migration");

    expect(admitted(managed, { lock: LOCKED, env: DATA })).toStrictEqual([
      {
        rule: "migration",
        namespace: "notes-system",
        process: "notes-migration",
        port: 5432,
      },
    ]);
    expect(
      admitted(managed.replace("{ changelog: db/changelog.yml }", "self"), {
        env: DATA,
      }),
    ).toStrictEqual([]);
  });

  it("carries what the proof beside the project records, and covers it with the fragment's digest", () => {
    const proof = PROOF(
      `  - { id: notes, testedAgainst: "sha256:${"8".repeat(64)}", nonTransactional: true }\n`,
    );
    const digest = (files: readonly AuthoredFile[]) =>
      application(managed, {
        lock: LOCKED,
        env: [...files, ...DATA],
      }).provenance.inputDigests.find(({ name }) => name === "notes")?.digest;

    expect(migration([proof])).toStrictEqual({
      runner: `ghcr.io/jorisjonkers-dev/notes/notes-migration@sha256:${"7".repeat(64)}`,
      uid: 1000,
      gid: 1000,
      testedAgainst: `sha256:${"8".repeat(64)}`,
      nonTransactional: true,
      ...PLAN,
    });
    expect(digest([proof])).not.toBe(digest([]));
  });

  it("refuses a managed migration whose image the lock does not hold, at the migration, and says how to fix it", () => {
    const result = resolve(managed, { env: DATA });

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, document, path, message, hint }) => ({
            code,
            document,
            path,
            message,
            hint,
          })),
    ).toStrictEqual([
      {
        code: "E_UNLOCKED_IMAGE",
        document: "minimal/notes.project.yml",
        path: "/applications/0/migration",
        message: "the images lock holds no entry for notes-migration",
        hint: "Lock the migration image the Application's CI builds from the platform's runner.",
      },
    ]);
  });

  it.each([
    [
      "a revision that is not a digest",
      `  - { id: notes, testedAgainst: "xsha256:${"8".repeat(64)}", nonTransactional: false }\n`,
    ],
    [
      "a digest with more after it",
      `  - { id: notes, testedAgainst: "sha256:${"8".repeat(64)}0", nonTransactional: false }\n`,
    ],
  ])("refuses a proof naming %s", (_, body) => {
    expect(
      resolve(managed, { lock: LOCKED, env: [PROOF(body), ...DATA] }).ok,
    ).toBe(false);
  });

  it.each([
    ["1.0.0-draft", false],
    ["v1.0.0", false],
    ["10.20.30", true],
  ])(
    "reads a proof of schema version %s only where it is semver",
    (version, ok) => {
      const proof = PROOF("  - { id: notes, nonTransactional: false }\n");

      expect(
        resolve(managed, {
          lock: LOCKED,
          env: [
            { ...proof, text: proof.text.replace("1.0.0", version) },
            ...DATA,
          ],
        }).ok,
      ).toBe(ok);
    },
  );

  it.each([
    ["breaks its schema", PROOF("  - { id: notes }\n")],
    [
      "is no YAML",
      { name: "minimal/migration-proof.yml", text: "applications: [\n" },
    ],
  ])("refuses a proof that %s, at the proof", (_, proof) => {
    const result = resolve(managed, { lock: LOCKED, env: [proof, ...DATA] });

    expect(
      result.ok
        ? []
        : [...new Set(result.diagnostics.map(({ document }) => document))],
    ).toStrictEqual(["minimal/migration-proof.yml"]);
  });
});

describe("the durations a derivation multiplies", () => {
  it("reads every unit the model writes in seconds, milliseconds before minutes", () => {
    expect(["500ms", "20s", "10m", "1h"].map(seconds)).toStrictEqual([
      0.5, 20, 600, 3600,
    ]);
  });
});

describe("an Application under a platform with no delivery policy", () => {
  it("is machinery of nothing, so an interrupted Process still stops then starts", () => {
    const parsed = parseProjectIntent(
      HEADER +
        one(
          serving("notes-api").replace(
            "cutover: continuous",
            "cutover: interrupted",
          ),
        ),
    );
    const platform = parsePlatformIntent(
      PLATFORM.replace(/\ndelivery:\n( {2}.*\n)+/, "\n"),
    );
    const lock = readImagesLock(parseYaml(text("platform/images.lock.yml")));
    const contract = readNodeContract(
      parseYaml(text("platform/node-contract.yml")),
    );
    const state = readClusterState(
      parseYaml(text("platform/cluster-state.yml")),
    );
    if (!parsed.ok || !platform.ok || !lock.ok || !contract.ok || !state.ok)
      throw new Error("the worked inputs did not read");
    const [application] = parsed.value.effective.applications;
    if (application === undefined) throw new Error("no Application");

    const resolved = resolveApplication(application, {
      platform: platform.value.document,
      contract: contract.value,
      lock: lock.value,
      clusterState: state.value,
      project: "notes",
      union: [parsed.value.effective],
      projectOf: new Map([["notes", "notes"]]),
      hash: sha256Hasher,
      collector: undefined,
      gate: undefined,
      store: undefined,
      proof: undefined,
      assets: new Map(),
    });

    expect(resolved.processes[0]?.switchover).toBe("stop-start");
  });
});

describe("the profiles that inject, and the collector they are handed", () => {
  it.each(["jvm", "node", "python"])("injects the %s profile", (runtime) => {
    expect(
      processOf(
        one(
          serving("notes-api").replace("runtime: node", `runtime: ${runtime}`),
        ),
      ).environment?.map(({ name }) => name),
    ).toStrictEqual([
      "DEPLOYMENT_ENVIRONMENT",
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "OTEL_SERVICE_NAME",
      "PORT",
    ]);
  });

  it("finds the collector's otlp surface on whichever of its Processes provides it", () => {
    const observability = text(
      "observability/observability.project.yml",
    ).replace(
      "    processes:\n",
      "    processes:\n      - name: otel-sidekick\n        lifecycle: job\n        image: otel-collector\n        runtime: none\n        placement: { memory: 64Mi, cpu: 10m }\n        startupBudget: 20s\n        cutover: interrupted\n",
    );
    const result = resolveIntentSet(
      [
        { name: "platform/platform.intent.yml", text: PLATFORM },
        ...FOUNDATION.filter(({ name }) => !name.startsWith("observability/")),
        {
          name: "observability/observability.project.yml",
          text: observability,
        },
        {
          name: "minimal/notes.project.yml",
          text: HEADER + one(serving("notes-api")),
        },
      ],
      {
        hash: sha256Hasher,
        schemaPackageIntegrity: `sha256:${"0".repeat(64)}`,
      },
    );
    const notes = result.ok
      ? result.value.projects.find(({ project }) => project === "notes")
      : undefined;

    expect(
      notes?.applications[0]?.processes[0]?.environment?.find(
        ({ name }) => name === "OTEL_EXPORTER_OTLP_ENDPOINT",
      ),
    ).toHaveProperty(
      "value",
      "http://otel-collector.observability-system.svc.cluster.local:4317",
    );
  });
});

describe("eligibility at its edges", () => {
  const contract = {
    apiVersion: "contract.jorisjonkers.dev/v1" as const,
    kind: "NodeContract" as const,
    schemaVersion: "1.0.0",
    cluster: "c",
    labelPrefix: "p",
    nodes: [
      {
        name: "bare",
        site: "s",
        arch: "amd64" as const,
        allocatable: { cpu: "100m", memory: "128Mi" },
      },
      {
        name: "two-cards",
        site: "s",
        arch: "amd64" as const,
        allocatable: { cpu: "100m", memory: "128Mi" },
        gpus: [
          { vendor: "v", model: "small", class: "x", memory_mib: 512 },
          { vendor: "v", model: "large", class: "x", memory_mib: 2048 },
        ],
      },
    ],
  };
  const process = (
    placement: Record<string, unknown>,
    cutover = "interrupted",
  ) =>
    ({
      name: "p",
      lifecycle: "application",
      image: "i",
      runtime: "none",
      cutover,
      placement: { memory: "128Mi", cpu: "100m", ...placement },
    }) as unknown as Parameters<typeof eligibleNodes>[0];

  it("admits a Process that fits allocatable exactly, and not twice over when it runs two copies", () => {
    expect(eligibleNodes(process({}), contract, {})).toStrictEqual([
      "bare",
      "two-cards",
    ]);
    expect(
      eligibleNodes(
        process({ memory: "64Mi", cpu: "100m" }, "continuous"),
        contract,
        {},
      ),
    ).toStrictEqual([]);
    expect(
      eligibleNodes(
        process({ memory: "64Mi", cpu: "50m" }, "continuous"),
        contract,
        {},
      ),
    ).toStrictEqual(["bare", "two-cards"]);
  });

  it("refuses a node that publishes no capability, card or disk to a Process that asks for one", () => {
    expect(
      eligibleNodes(process({ capabilities: ["x"] }), contract, {}),
    ).toStrictEqual([]);
    expect(
      eligibleNodes(
        process({ gpu: { class: "x", memory: "1Gi" } }),
        contract,
        {},
      ),
      // Only one of two-cards' cards is large enough, and one is.
    ).toStrictEqual(["two-cards"]);
    expect(
      eligibleNodes(process({ disk: { media: ["ssd"] } }), contract, {}),
    ).toStrictEqual([]);
  });

  it("keeps a derived estate Job off a node that holds an sdcard medium, beside any other", () => {
    const node = (name: string, media: readonly ("ssd" | "sdcard")[]) => ({
      name,
      site: "s",
      arch: "amd64" as const,
      allocatable: { cpu: "100m", memory: "128Mi" },
      ...(media.length === 0
        ? {}
        : {
            disks: media.map((medium) => ({ media: medium, usable_gib: 64 })),
          }),
    });
    expect(
      estateJobNodes(
        { memory: "128Mi", cpu: "100m" },
        {
          ...contract,
          nodes: [
            node("bare", []),
            node("ssd", ["ssd"]),
            node("ssd-and-card", ["ssd", "sdcard"]),
          ],
        },
      ),
    ).toStrictEqual(["bare", "ssd"]);
  });

  it("holds a Process that mounts a library to the library's node, beside its other terms", () => {
    const mounting = (libraries: readonly string[], placement = {}) =>
      ({
        ...process(placement),
        libraries: libraries.map((library) => ({
          library,
          mountAt: `/${library}`,
          access: "read",
        })),
      }) as Parameters<typeof eligibleNodes>[0];
    const platform = {
      libraries: {
        media: { node: "two-cards", path: "/srv/media", gid: 3001, grants: {} },
        books: { node: "bare", path: "/srv/books", gid: 3002, grants: {} },
      },
    };

    expect(
      eligibleNodes(mounting(["media"]), contract, platform),
    ).toStrictEqual(["two-cards"]);
    expect(
      eligibleNodes(mounting(["media", "books"]), contract, platform),
    ).toStrictEqual([]);
    expect(
      eligibleNodes(
        mounting(["media"], { disk: { media: ["ssd"] } }),
        contract,
        platform,
      ),
    ).toStrictEqual([]);
    expect(
      eligibleNodes(mounting(["toString"]), contract, platform),
    ).toStrictEqual([]);
    expect(eligibleNodes(mounting(["media"]), contract, {})).toStrictEqual([]);
  });
});

describe("what a library mount derives", () => {
  it("resolves a mount that names no subPath to the whole library, with no subPath", () => {
    const mounting = {
      name: "notes-api",
      libraries: [{ library: "media", mountAt: "/media", access: "read" }],
    } as unknown as Parameters<typeof resolveLibraries>[0];
    const platform = {
      libraries: {
        media: {
          node: "enschede-t1000-1",
          path: "/srv/media",
          gid: 3001,
          grants: { notes: "read" },
        },
      },
    } as unknown as PlatformIntentDocument;

    expect(resolveLibraries(mounting, platform, "notes")).toStrictEqual([
      {
        library: "media",
        claim: "library-media",
        volume: "notes-system-media",
        node: "enschede-t1000-1",
        path: "/srv/media",
        gid: 3001,
        mountAt: "/media",
        access: "read",
      },
    ]);
  });
});

describe("the order edges impose, and a platform with no register", () => {
  it("orders the units a Process waits on by name, whatever order its edges are written in", () => {
    const resolved = application(
      one(
        serving(
          "notes-api",
          "        dependsOn:\n          - { application: otel-collector, surface: otlp }\n          - { application: flagger, surface: http }\n",
        ),
      ),
    );

    expect(resolved.reconcileAfter).toStrictEqual([
      "apps-delivery",
      "apps-observability",
    ]);
  });

  it("resolves nothing against a register the platform does not keep", () => {
    expect(
      codesOf(
        resolve(
          one(
            serving(
              "notes-api",
              "        dependsOn:\n          - { application: stalwart, surface: smtp }\n",
            ),
          ),
          {
            platform: (platform) =>
              platform.replace(/\nproviders:\n(.*\n?)+$/, "\n"),
          },
        ),
      ),
    ).toStrictEqual(["E_UNRESOLVED_APPLICATION"]);
  });
});

describe("the edges of the derivations", () => {
  it("reads an overlay with no base file beside it", () => {
    expect(
      processOf(one(serving("notes-api")), {
        env: [
          { name: "minimal/env/notes-api/production.env", text: "ONLY=here\n" },
        ],
      }).environment?.find(({ name }) => name === "ONLY"),
    ).toStrictEqual({ name: "ONLY", value: "here" });
  });

  it("keeps the order routes already sort in, as it fixes the order they do not", () => {
    const [exposure] =
      application(`  - id: notes
    exposure:
      - name: app
        host: notes.jorisjonkers.dev
        audience: anonymous
        routes:
          - { path: /a, match: exact, process: notes-api, surface: http }
          - { path: /api/, match: prefix, process: notes-api, surface: http }
          - { path: /, match: prefix, process: notes-api, surface: http }
    processes:
${serving("notes-api")}`).exposure ?? [];

    expect(exposure?.routes.map(({ precedence }) => precedence)).toStrictEqual([
      1, 2, 3,
    ]);
  });

  it("waits only on the members: a blue/green Process that publishes no readiness gates nothing and holds nothing", () => {
    const resolved = application(`  - id: notes
    processes:
${serving("notes-api")}      - name: notes-worker
        lifecycle: application
        image: notes-api
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        startupBudget: 10m
        cutover: continuous
`);

    expect(resolved.processes[1]?.switchover).toBe("blue-green");
    expect(
      resolved.releaseGate?.members.map(({ process }) => process),
    ).toStrictEqual(["notes-api"]);
    // notes-api's 20s budget, three times, and the image pull.
    expect(resolved.releaseGate?.deadline).toBe("180s");
  });
});

describe("what the review found", () => {
  it("refuses a Runtime Profile key written in an env file", () => {
    expect(
      codesOf(
        resolve(one(serving("notes-api")), {
          env: [
            { name: "minimal/env/notes-api/base.env", text: "PORT=9000\n" },
          ],
        }),
      ),
    ).toStrictEqual(["E_PROFILE_KEY_AUTHORED"]);
  });

  it("asks the tier carrying a route's own audience for its forward-auth endpoint", () => {
    const [exposure] =
      application(
        `  - id: notes
    exposure:
      - name: app
        host: notes.jorisjonkers.dev
        audience: anonymous
        routes:
          - { path: /, match: prefix, process: notes-api, surface: http, audience: authenticated }
    processes:
${serving("notes-api")}`,
        {
          platform: (platform) =>
            platform
              .replace(
                "audiences: [anonymous, authenticated]",
                "audiences: [anonymous]",
              )
              .replace(/\n\s+forwardAuth: [^\n]*/, "")
              .replace(
                "audiences: [lan]",
                "audiences: [lan, authenticated]\n    forwardAuth: http://lan-auth",
              ),
        },
      ).exposure ?? [];

    expect(exposure?.tier).toBe("public-frankfurt");
    expect(exposure?.routes[0]?.middleware?.[0]).toStrictEqual({
      kind: "forward-auth",
      endpoint: "http://lan-auth",
    });
  });

  it("stops at a duration or a quantity it cannot read, rather than deriving NaN", () => {
    expect(() => seconds("600")).toThrow(
      "600: not a duration the model writes",
    );
    for (const unread of ["x20s", "20sx"])
      expect(() => seconds(unread)).toThrow("not a duration");
    for (const unread of ["x5m", "5mx"])
      expect(() => millicores(unread)).toThrow("not a cpu quantity");
    for (const unread of ["x5Mi", "5Mix"])
      expect(() => mebibytes(unread)).toThrow("not a memory quantity");
    expect(() => mebibytes("1G")).toThrow(
      "1G: not a memory quantity the model reads",
    );
    expect(() => millicores("one")).toThrow(
      "one: not a cpu quantity the model reads",
    );
  });
});

describe("the peers a policy admits", () => {
  const ingressOf = (all: ResolvedProject[], project: string, index = 0) =>
    projectNamed(all, project).applications[0]?.processes[index]?.ingress;

  it("admits each consumer of a surface once, on that surface, and no consumer of another Application", () => {
    const all = projects(`  - id: notes
    exposure:
      - name: app
        host: notes.jorisjonkers.dev
        audience: anonymous
        routes:
          - { path: /, match: prefix, process: notes-api, surface: http }
          - { path: /api/, match: prefix, process: notes-api, surface: http }
          - { path: /web/, match: prefix, process: notes-web, surface: http }
    processes:
${serving("notes-api", "        dependsOn:\n          - { application: notes-store, surface: store }\n")}${serving("notes-web")}  - id: notes-store
    processes:
${serving("notes-store").replace("provides: { http: 8080 }", "provides: { store: 7000, http: 8080 }")}  - id: notes-other
    processes:
${serving("notes-other").replace("provides: { http: 8080 }", "provides: { store: 7000 }")}`);

    // Two routes reach notes-api through one proxy on one port: one peer. The
    // route to notes-web reaches notes-web alone.
    expect(ingressOf(all, "notes")).toStrictEqual([
      {
        rule: "tier-proxy",
        namespace: "edge-system",
        process: "traefik-public",
        port: 8080,
      },
    ]);
    expect(ingressOf(all, "notes", 1)).toStrictEqual([
      {
        rule: "tier-proxy",
        namespace: "edge-system",
        process: "traefik-public",
        port: 8080,
      },
    ]);
    const store = projectNamed(all, "notes").applications[1]?.processes[0]
      ?.ingress;
    const other = projectNamed(all, "notes").applications[2]?.processes[0]
      ?.ingress;
    expect(store).toStrictEqual([
      {
        rule: "consumer",
        namespace: "notes-system",
        process: "notes-api",
        port: 7000,
      },
    ]);
    expect(other).toBeUndefined();
  });

  it("admits the metrics stack only on the scraped Process, and every Process of the stack", () => {
    const all = projects(`  - id: notes
    observability:
      alertClass: business-hours
      scrape: { process: notes-web, surface: http, path: /metrics }
    processes:
${serving("notes-api")}${serving("notes-web")}`);

    expect(ingressOf(all, "notes")).toBeUndefined();
    expect(ingressOf(all, "notes", 1)).toStrictEqual([
      {
        rule: "metrics-stack",
        namespace: "observability-system",
        process: "prometheus",
        port: 8080,
      },
    ]);
  });

  it("admits no metrics stack where the platform names none", () => {
    expect(
      ingressOf(
        projects(
          `  - id: notes
    observability:
      alertClass: business-hours
      scrape: { process: notes-api, surface: http, path: /metrics }
    processes:
${serving("notes-api")}`,
          {
            platform: (platform) =>
              platform.replace(/\ntelemetry:\n( {2}.*\n)+/, "\n"),
          },
        ),
        "notes",
      ),
    ).toBeUndefined();
  });

  it("records no surfaces on a Process that provides none", () => {
    expect(
      processOf(
        one(`      - name: notes-job
        lifecycle: job
        image: notes-api
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        startupBudget: 30s
        cutover: interrupted
`),
      ).surfaces,
    ).toBeUndefined();
  });
});

describe("a route admits the proxy of its own tier to its own Process only", () => {
  it("does not admit the LAN proxy to a Process only a public route reaches", () => {
    const all = projects(`  - id: notes
    exposure:
      - name: app
        host: notes.jorisjonkers.dev
        audience: anonymous
        routes:
          - { path: /, match: prefix, process: notes-api, surface: http }
      - name: home
        host: notes.lan
        audience: lan
        routes:
          - { path: /, match: prefix, process: notes-web, surface: http }
    processes:
${serving("notes-api")}${serving("notes-web")}`);
    const [api, web] =
      projectNamed(all, "notes").applications[0]?.processes ?? [];

    expect(api?.ingress?.map(({ process }) => process)).toStrictEqual([
      "traefik-public",
    ]);
    expect(web?.ingress?.map(({ process }) => process)).toStrictEqual([
      "traefik-lan",
    ]);
  });
});

describe("a volume and what its class derives", () => {
  // The Process provides the surface the platform's rabbitmq method dumps.
  const holding = (volumes: string, engine = "") =>
    one(
      serving("notes-store", `${engine}        volumes:\n${volumes}`)
        .replace("cutover: continuous", "cutover: interrupted")
        .replace(
          "provides: { http: 8080 }",
          "provides: { http: 8080, management: 15672 }",
        ),
    );
  const DNS = { rule: "cluster-dns", namespace: "kube-system", port: 53 };
  const DUMPED = {
    rule: "datastore",
    namespace: "notes-system",
    process: "notes-store",
    port: 15672,
  };
  const PEER = {
    host: "notes-store.notes-system.svc.cluster.local",
    port: 15672,
    credential: {
      path: "secret/data/notes/notes-store/backup",
      access: "read",
      delivery: "env",
      destination: "notes-store-backup-notes-notes-store-backup",
    },
  };

  it("hands the Secret Store's endpoint to an Application whose backup holds the off-cluster credential, and to no other", () => {
    const store = (durability: string) =>
      application(
        holding(
          `          - { claim: keep, mountAt: /k, size: 1Gi, durability: ${durability} }\n`,
          "        engine: files\n",
        ),
      ).secretStore;

    expect(store("irreplaceable")).toBe(
      "http://vault.secrets-system.svc.cluster.local:8200",
    );
    // One volume of the Process whose backup holds it is enough.
    expect(
      application(
        holding(
          "          - { claim: cache, mountAt: /c, size: 1Gi, durability: reconstructible }\n          - { claim: keep, mountAt: /k, size: 1Gi, durability: irreplaceable }\n",
          "        engine: files\n",
        ),
      ).secretStore,
    ).toBe("http://vault.secrets-system.svc.cluster.local:8200");
    expect(store("recoverable")).toBeUndefined();
    // A backup that dumps over the network holds its peer's credential.
    expect(
      application(
        holding(
          "          - { claim: keep, mountAt: /k, size: 1Gi, durability: recoverable }\n",
          "        engine: rabbitmq\n",
        ),
      ).secretStore,
    ).toBe("http://vault.secrets-system.svc.cluster.local:8200");
  });

  it("refuses a backup holding the off-cluster credential under a platform that names no Secret Store", () => {
    expect(
      codesOf(
        resolve(
          holding(
            "          - { claim: keep, mountAt: /k, size: 1Gi, durability: irreplaceable }\n",
            "        engine: files\n",
          ),
          {
            platform: (document) =>
              document.replace("secretStore: vault\n", ""),
          },
        ),
      ),
    ).toStrictEqual(["E_NO_SECRET_STORE"]);
    // A backup that dumps its Process over the network logs in with a
    // credential the Secret Store holds; one that reads the volume does not.
    // One such Process is enough, beside one that holds nothing.
    const unstored = (engine: string) =>
      codesOf(
        resolve(
          holding(
            "          - { claim: keep, mountAt: /k, size: 1Gi, durability: recoverable }\n",
            `        engine: ${engine}\n`,
          ) +
            serving("notes-web").replace(
              "cutover: continuous",
              "cutover: interrupted",
            ),
          {
            platform: (document) =>
              document.replace("secretStore: vault\n", ""),
          },
        ),
      );
    expect(unstored("rabbitmq")).toStrictEqual(["E_NO_SECRET_STORE"]);
    expect(unstored("files")).toStrictEqual([]);
  });

  it("carries a reconstructible claim with no backup plan", () => {
    expect(
      processOf(
        holding(
          "          - { claim: cache, mountAt: /cache, size: 2Gi, durability: reconstructible }\n",
        ),
      ).volumes,
    ).toStrictEqual([
      {
        claim: "cache",
        mountAt: "/cache",
        size: "2Gi",
        durability: "reconstructible",
      },
    ]);
  });

  it("derives the platform's plan for its class, the method the platform names for the engine, and an off-cluster copy where the class keeps one", () => {
    expect(
      processOf(
        holding(
          "          - { claim: queue, mountAt: /q, size: 20Gi, durability: recoverable }\n          - { claim: keep, mountAt: /k, size: 1Gi, durability: irreplaceable }\n",
          "        engine: rabbitmq\n",
        ),
      ).volumes?.map(({ claim, backup }) => [claim, backup]),
    ).toStrictEqual([
      [
        "queue",
        {
          schedule: "15 3 * * *",
          retain: 14,
          method:
            "ghcr.io/jorisjonkers-dev/platform/rabbitmq-backup@sha256:a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2",
          uid: LOCK.images["rabbitmq-backup"]?.uid,
          gid: LOCK.images["rabbitmq-backup"]?.gid,
          identity: "notes-store-backup",
          claim: "queue-backup",
          // The method dumps the Process over the network: its Service, on
          // the surface the platform names for the engine, logging in with a
          // credential derived from the Process.
          peer: PEER,
          // What the backup identity's own policy admits: the Process it
          // dumps, on the surface the platform names for the engine, and DNS.
          egress: [DUMPED, DNS],
        },
      ],
      [
        "keep",
        {
          schedule: "45 2 * * *",
          retain: 90,
          offCluster: "s3://backup-storage/jorisjonkers-dev",
          method:
            "ghcr.io/jorisjonkers-dev/platform/rabbitmq-backup@sha256:a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2",
          uid: LOCK.images["rabbitmq-backup"]?.uid,
          gid: LOCK.images["rabbitmq-backup"]?.gid,
          identity: "notes-store-backup",
          claim: "keep-backup",
          // Only the backup identity holds the destination's credential.
          credential: {
            path: "secret/data/platform/backup/off-cluster",
            access: "read",
            delivery: "env",
            destination: "notes-store-backup-platform-backup-off-cluster",
          },
          peer: PEER,
          egress: [DUMPED, DNS],
          // Where the off-cluster copy goes, as the class's policy states it.
          destinations: [{ cidr: "203.0.113.0/24", port: 443 }],
        },
      ],
    ]);
  });

  it("admits a backup that reads the volume alone to the cluster's DNS and nowhere else", () => {
    const [volume] =
      processOf(
        holding(
          "          - { claim: keep, mountAt: /k, size: 1Gi, durability: recoverable }\n",
          "        engine: files\n",
        ),
      ).volumes ?? [];

    // The platform names no surface for `files`, and never the Secret Store:
    // the operator reads a backup's credential for it.
    expect(volume?.backup?.egress).toStrictEqual([DNS]);
    expect(volume?.backup?.destinations).toBeUndefined();
    // Nothing is dumped over the network, so there is no peer to log in to.
    expect(volume?.backup).not.toHaveProperty("peer");
  });

  it("runs a backup that reads the volume alone as the Process that owns it, not as the method's user", () => {
    // The method's own user differs, so only the Process's can read files it
    // wrote with mode 0600.
    const process = processOf(
      holding(
        "          - { claim: keep, mountAt: /k, size: 1Gi, durability: recoverable }\n",
        "        engine: files\n",
      ),
      {
        lock: (lock) =>
          lock.replace(
            /( {2}file-backup:\n(?: {4}.*\n){2} {4})uid: 1000\n {4}gid: 1000/,
            "$1uid: 65532\n    gid: 65532",
          ),
      },
    );

    expect(
      process.volumes?.map(({ backup }) => [backup?.uid, backup?.gid]),
    ).toStrictEqual([[1000, 1000]]);
    expect([process.uid, process.gid]).toStrictEqual([1000, 1000]);
  });

  it("admits a Process's backup identity on the surface it dumps, and no backup that dumps none", () => {
    const admitted = (engine: string) =>
      processOf(
        holding(
          "          - { claim: keep, mountAt: /k, size: 1Gi, durability: recoverable }\n",
          `        engine: ${engine}\n`,
        ),
      ).ingress?.filter(({ rule }) => rule === "backup");

    expect(admitted("rabbitmq")).toStrictEqual([
      {
        rule: "backup",
        namespace: "notes-system",
        process: "notes-store-backup",
        port: 15672,
      },
    ]);
    // No peer at all, so the Process carries no ingress.
    expect(admitted("files")).toBeUndefined();
  });

  it("names a dumped surface only for a Process that is backed up, of an engine whose method dumps one", () => {
    const platform = {
      engines: {
        postgres: { backup: "postgres-backup", surface: "postgres" },
        files: { backup: "file-backup" },
      },
    } as unknown as Parameters<typeof dumpedSurfaceOf>[1];
    const process = (engine: string | undefined, ...durabilities: string[]) =>
      ({
        name: "store",
        ...(engine === undefined ? {} : { engine }),
        ...(durabilities.length === 0
          ? {}
          : {
              volumes: durabilities.map((durability) => ({
                claim: "c",
                mountAt: "/c",
                size: "1Gi",
                durability,
              })),
            }),
      }) as unknown as Parameters<typeof dumpedSurfaceOf>[0];

    expect(
      dumpedSurfaceOf(process("postgres", "irreplaceable"), platform),
    ).toBe("postgres");
    expect(
      dumpedSurfaceOf(
        process("postgres", "reconstructible", "recoverable"),
        platform,
      ),
    ).toBe("postgres");
    // A method that reads the volume alone, an engine the platform does not
    // name, and no engine at all dump nothing.
    expect(
      dumpedSurfaceOf(process("files", "recoverable"), platform),
    ).toBeUndefined();
    expect(
      dumpedSurfaceOf(process("rabbitmq", "recoverable"), platform),
    ).toBeUndefined();
    expect(
      dumpedSurfaceOf(process(undefined, "recoverable"), platform),
    ).toBeUndefined();
    // Nothing backs the Process up, so there is no backup to admit: not for a
    // claim that is only a cache, and not where it holds no volume.
    expect(
      dumpedSurfaceOf(process("postgres", "reconstructible"), platform),
    ).toBeUndefined();
    expect(dumpedSurfaceOf(process("postgres"), platform)).toBeUndefined();
    expect(backedUp(process("postgres"))).toBe(false);
    expect(backedUp(process(undefined, "irreplaceable"))).toBe(true);
  });

  it("refuses an engine whose method dumps a surface the Process does not provide", () => {
    const result = resolve(
      one(
        serving(
          "notes-store",
          "        engine: rabbitmq\n        volumes:\n          - { claim: keep, mountAt: /k, size: 1Gi, durability: recoverable }\n",
        ).replace("cutover: continuous", "cutover: interrupted"),
      ),
    );

    expect(
      result.ok ||
        result.diagnostics.map(({ code, path, message }) => [
          code,
          path,
          message,
        ]),
    ).toStrictEqual([
      [
        "E_BACKUP_SURFACE_NOT_PROVIDED",
        "/applications/0/processes/0",
        "the backup of engine rabbitmq dumps the surface management, which notes-store does not provide",
      ],
    ]);
  });

  it("refuses it of a Process that provides no surface at all", () => {
    const result = resolve(
      one(
        serving(
          "notes-store",
          "        engine: rabbitmq\n        volumes:\n          - { claim: keep, mountAt: /k, size: 1Gi, durability: recoverable }\n",
        )
          .replace("cutover: continuous", "cutover: interrupted")
          .replace("        provides: { http: 8080 }\n", "")
          .replace(
            "          readiness: { path: /ready, port: 8080 }\n          liveness: { path: /live, port: 8080 }",
            "          readiness: { tcp: 8080 }",
          ),
      ),
    );

    expect(result.ok || result.diagnostics.map(({ code }) => code)).toContain(
      "E_BACKUP_SURFACE_NOT_PROVIDED",
    );
  });

  it("refuses a class the platform derives a backup for with no schedule or retention", () => {
    expect(
      codesOf(
        resolve(
          holding(
            "          - { claim: queue, mountAt: /q, size: 20Gi, durability: recoverable }\n",
            "        engine: rabbitmq\n",
          ),
          {
            platform: (platform) =>
              platform.replace('    schedule: "15 3 * * *"\n', ""),
          },
        ),
      ),
    ).toStrictEqual(["E_DURABILITY_POLICY_INCOMPLETE"]);
    expect(
      codesOf(
        resolve(
          holding(
            "          - { claim: queue, mountAt: /q, size: 20Gi, durability: recoverable }\n",
            "        engine: rabbitmq\n",
          ),
          { platform: (platform) => platform.replace("    retain: 14\n", "") },
        ),
      ),
    ).toStrictEqual(["E_DURABILITY_POLICY_INCOMPLETE"]);
  });

  it("holds a Process to the node its bound claim is on, from the ClusterState snapshot", () => {
    const result = resolveIntentSet(
      [
        { name: "platform/platform.intent.yml", text: PLATFORM },
        ...FOUNDATION.map((file) =>
          file.name === "platform/cluster-state.yml"
            ? {
                ...file,
                text: file.text.replace(
                  "bindings: []",
                  "bindings:\n  - { claim: cache, node: enschede-pi-1 }\n  - { claim: elsewhere, node: frankfurt-contabo-1 }",
                ),
              }
            : file,
        ),
        {
          name: "minimal/notes.project.yml",
          text:
            HEADER +
            holding(
              "          - { claim: cache, mountAt: /cache, size: 2Gi, durability: reconstructible }\n",
            ),
        },
      ],
      {
        hash: sha256Hasher,
        schemaPackageIntegrity: `sha256:${"0".repeat(64)}`,
      },
    );
    const placement = result.ok
      ? result.value.projects.find(({ project }) => project === "notes")
          ?.applications[0]?.processes[0]?.placement
      : undefined;

    expect([placement?.boundTo, placement?.from]).toStrictEqual([
      "enschede-pi-1",
      "cluster-state",
    ]);
  });

  it("refuses a backup method the images lock does not hold, at the engine that names it", () => {
    const result = resolve(one(serving("notes-api")), {
      platform: (platform) =>
        platform.replace(
          "rabbitmq: { backup: rabbitmq-backup, surface: management }",
          "rabbitmq: { backup: unlocked, surface: management }",
        ),
    });

    expect(
      result.ok
        ? []
        : result.diagnostics.map(
            ({ code, path, message, hint }) =>
              `${code} ${path} ${message}. ${hint}`,
          ),
    ).toStrictEqual([
      "E_UNLOCKED_IMAGE /engines/rabbitmq/backup the images lock holds no entry for unlocked. Lock the alias, or name one the images lock holds.",
    ]);
  });

  it("refuses a Vault policy job image the images lock does not hold, at the job that names it", () => {
    const result = resolve(one(serving("notes-api")), {
      platform: (platform) =>
        platform.replace("image: vault-policy", "image: unlocked"),
    });

    expect(
      result.ok
        ? []
        : result.diagnostics.map(
            ({ code, path, message, hint }) =>
              `${code} ${path} ${message}. ${hint}`,
          ),
    ).toStrictEqual([
      "E_UNLOCKED_IMAGE /policyJob/image the images lock holds no entry for unlocked. Lock the alias, or name one the images lock holds.",
    ]);
  });
});

// REQ-049 (docs/requirements.md): the Vault policy job is derived where the
// platform names it and a Secret Store answers.
describe("the Vault policy job", () => {
  const set = (platform?: (text: string) => string) => {
    const result = resolve(
      one(serving("notes-api")),
      platform === undefined ? {} : { platform },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.value;
  };
  const job = (platform?: (text: string) => string) => set(platform).policyJob;

  it("runs in the Secret Store's namespace as its own identity, on the locked image, and reaches the Secret Store and the cluster's DNS", () => {
    expect(job()).toStrictEqual({
      identity: "vault-policy",
      namespace: "secrets-system",
      image:
        "ghcr.io/jorisjonkers-dev/delivery/vault-policy@sha256:c5e7a9b1d3f5c7e9a1b3d5f7c9e1a3b5d7f9c1e3a5b7d9f1c3e5a7b9d1f3c5e7",
      uid: 65532,
      gid: 65532,
      role: "policy-admin",
      address: "http://vault.secrets-system.svc.cluster.local:8200",
      memory: "64Mi",
      cpu: "10m",
      deadline: "120s",
      eligibleNodes: [
        "enschede-t1000-1",
        "enschede-rx7900xtx-1",
        "enschede-gtx-960m-1",
        "frankfurt-contabo-1",
      ],
      egress: [
        {
          rule: "secret-store",
          namespace: "secrets-system",
          process: "vault",
          port: 8200,
        },
        { rule: "cluster-dns", namespace: "kube-system", port: 53 },
      ],
    });
  });

  it("is derived by nothing where the platform names no job, or no Secret Store to write into", () => {
    expect(
      job((platform) => platform.replace(/\npolicyJob:\n( {2}.*\n)+/, "\n")),
    ).toBeUndefined();
    // Not a job that is undefined: no job at all.
    expect(
      Object.keys(
        set((platform) => platform.replace("secretStore: vault\n", "")),
      ),
      // What the set does derive is where Flux's events go: the worked
      // platform names a Reporter.
    ).toStrictEqual(["projects", "events"]);
  });

  it("lands on no node that holds an sdcard medium, and on none too small for what it asks for", () => {
    expect(
      job((platform) => platform.replace("memory: 64Mi", "memory: 20Gi"))
        ?.eligibleNodes,
    ).toStrictEqual([
      "enschede-t1000-1",
      "enschede-rx7900xtx-1",
      "frankfurt-contabo-1",
    ]);
    expect(
      job((platform) => platform.replace("cpu: 10m", "cpu: 30000m"))
        ?.eligibleNodes,
    ).toStrictEqual(["enschede-t1000-1", "enschede-rx7900xtx-1"]);
    // A node whose allocatable equals the request holds it.
    expect(
      job((platform) => platform.replace("memory: 64Mi", "memory: 15872Mi"))
        ?.eligibleNodes,
    ).toContain("enschede-gtx-960m-1");
    expect(
      job((platform) => platform.replace("cpu: 10m", "cpu: 15500m"))
        ?.eligibleNodes,
    ).toContain("frankfurt-contabo-1");
  });

  it("states its deadline in seconds, whatever unit the platform wrote", () => {
    expect(
      job((platform) => platform.replace("deadline: 120s", "deadline: 3m"))
        ?.deadline,
    ).toBe("180s");
  });
});

describe("an edge resolved against the union and the register", () => {
  const PLATFORM = {
    providers: [
      { name: "relay", address: "relay.example", surfaces: { smtp: 25 } },
      {
        name: "stalwart",
        address: "mail.example",
        surfaces: { imap: 993, smtp: 587 },
      },
    ],
  } as unknown as PlatformIntentDocument;

  it("takes the provider named, on the surface named, wherever it sits in the register", () => {
    expect(
      resolveEdge({ application: "stalwart", surface: "smtp" }, [], PLATFORM),
    ).toStrictEqual({
      application: "stalwart",
      surface: "smtp",
      address: "mail.example:587",
    });
  });

  it.each([
    [
      "a provider the register does not list",
      { application: "nowhere", surface: "smtp" },
      PLATFORM,
    ],
    [
      "a surface the provider does not list",
      { application: "relay", surface: "imap" },
      PLATFORM,
    ],
    [
      "a platform that keeps no register",
      { application: "stalwart", surface: "smtp" },
      {} as PlatformIntentDocument,
    ],
  ])(
    "is an internal failure for %s, which the union's references refuse first",
    (_, edge, platform) => {
      expect(() => resolveEdge(edge, [], platform)).toThrow(
        `${edge.application}.${edge.surface}: no provider in the union`,
      );
    },
  );
});
