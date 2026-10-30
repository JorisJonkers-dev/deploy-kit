// REQ-039 (docs/requirements.md), derivation by derivation: each mechanic
// chapter 20 derives, read off a notes project written for it and resolved
// through the use-case with the worked foundation and pinned inputs.
import { datastoreOf } from "../../src/resolve/database.ts";
import { edgesOfProject, resolveEdge } from "../../src/resolve/dependencies.ts";
import type { EffectiveProject } from "../../src/model/effective-intent.ts";
import type { PlatformIntentDocument } from "../../src/model/platform-intent.ts";
import { backedUp, dumpedSurfaceOf } from "../../src/model/backup.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
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
import {
  l4ExposuresOf,
  l4NodesOf,
  l4SitesOf,
} from "../../src/model/l4-addresses.ts";
import { tierExposuresOf } from "../../src/model/tier-proxy.ts";
import type { ApplicationDocument } from "../../src/model/project-intent.ts";

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

/** The observability project, whose Grafana is a Client of the sign-in provider. */
const OBSERVABILITY = "observability/observability.project.yml";
/** The agents project, of which the foundation needs what the platform admits. */
const AGENTS = "agents/agents.project.yml";
/**
 * The agents project as far as the Platform document names it: the
 * Applications it admits to the API, without hermes and agents-ui, whose
 * exposures, Client and grant no test here is about.
 */
const admitted = (project: string): string => {
  const document = parseYaml(project) as {
    applications: { id: string }[];
  };
  return stringifyYaml({
    ...document,
    applications: document.applications.filter(
      ({ id }) => id !== "hermes" && id !== "agents-ui",
    ),
  });
};
/** An Application's client block, which only a set that composes the provider holds. */
const CLIENT_BLOCK = /\n {4}client:\n(?: {6}.*\n)+/;
/** The observability project with no Client, for a set that signs nobody in. */
const unsigned = (project: string): string =>
  project.replace(CLIENT_BLOCK, "\n");

/** The foundation, its Grafana without the Client a set without sign-in cannot hold. */
const FOUNDATION = [
  "platform/node-contract.yml",
  "platform/images.lock.yml",
  "platform/cluster-state.yml",
  "delivery/delivery.project.yml",
  AGENTS,
  "utility/utility.project.yml",
  "utility/config/adguard/AdGuardHome.yaml",
  "edge/edge.project.yml",
  OBSERVABILITY,
  "observability/rules/platform.yaml",
  "secrets/secrets.project.yml",
  "secrets/config/vault.hcl",
].map((name): AuthoredFile => ({
  name,
  text:
    name === OBSERVABILITY
      ? unsigned(text(name))
      : name === AGENTS
        ? admitted(text(name))
        : text(name),
}));

/**
 * The sign-in provider's project, which a set composes only where it signs
 * people in, and the observability project whole, its Grafana a Client again.
 */
const IDENTITY = [
  "identity/identity.project.yml",
  OBSERVABILITY,
  "observability/env/grafana/base.env",
].map((name): AuthoredFile => ({ name, text: text(name) }));

/** The worked Platform document's sign-in, which names the provider IDENTITY declares. */
const SIGN_IN = /\nsignIn:\n(?: {2}.*\n)+/;

/** The worked Platform document, signing people in through the provider IDENTITY declares. */
const SIGNING_IN = text("platform/platform.intent.yml");
/** The worked Platform document with no sign-in, which a set without IDENTITY composes with. */
const PLATFORM = SIGNING_IN.replace(SIGN_IN, "\n");
/** data, for a Process whose edge reaches one of its Applications. */
const DATA = [
  "data/data.project.yml",
  "data/env/postgres/base.env",
  "data/config/postgresql.conf",
  "data/config/garage.toml",
  "data/env/garage/base.env",
  "data/dashboards/rabbitmq.json",
].map((name): AuthoredFile => ({ name, text: text(name) }));
const LOCK = parseYaml(text("platform/images.lock.yml")) as {
  images: Record<
    string,
    {
      repository: string;
      digest: string;
      uid: number;
      gid: number;
      version: string;
    }
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
  /** Whether the set signs people in: the platform names its provider, and the set composes it. */
  readonly signIn?: boolean;
  /** A change to a foundation file, by its name. */
  readonly foundation?: (name: string, text: string) => string;
  /** Files read beside the project: its env files, and its Asset files. */
  readonly env?: readonly AuthoredFile[];
  readonly lock?: (lock: string) => string;
  readonly contract?: (contract: string) => string;
}

/** The codes a resolution refused with, in the order it reported them. */
const codesOf = (result: ReturnType<typeof resolve>): string[] =>
  result.ok ? [] : result.diagnostics.map(({ code }) => code);

/** The codes of the refusals the notes project earns, beside the foundation's own. */
const notesCodesOf = (result: ReturnType<typeof resolve>): string[] =>
  result.ok
    ? []
    : result.diagnostics
        .filter(({ document }) => document === "minimal/notes.project.yml")
        .map(({ code }) => code);

function resolve(applications: string, options: Options = {}) {
  return resolveIntentSet(
    [
      {
        name: "platform/platform.intent.yml",
        text: (options.platform ?? ((same: string) => same))(
          options.signIn === true ? SIGNING_IN : PLATFORM,
        ),
      },
      ...FOUNDATION.filter(
        ({ name }) => options.signIn !== true || name !== OBSERVABILITY,
      ).map((file) =>
        file.name === "platform/images.lock.yml" && options.lock !== undefined
          ? { ...file, text: options.lock(file.text) }
          : file.name === "platform/node-contract.yml" &&
              options.contract !== undefined
            ? { ...file, text: options.contract(file.text) }
            : options.foundation === undefined
              ? file
              : { ...file, text: options.foundation(file.name, file.text) },
      ),
      ...(options.signIn === true ? IDENTITY : []),
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
          // This set holds no file of the provider's Project, so the step
          // names no endpoint; the composition, which holds it, does.
          { kind: "forward-auth" },
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

  it("bounds a route's rate last in its chain, with a burst of its whole allowance, counting a client behind Cloudflare by the address Cloudflare forwards", () => {
    const [exposure] =
      application(
        exposed(
          "          - { path: /register, match: exact, process: notes-api, surface: http, audience: anonymous, rateLimit: { requests: 10, per: 1h } }",
        ),
      ).exposure ?? [];

    expect(exposure?.routes[0]?.middleware).toStrictEqual([
      { kind: "security-headers" },
      {
        kind: "rate-limit",
        allowance: 10,
        per: "1h",
        burst: 10,
        clientAddress: "cloudflare",
      },
    ]);
  });

  it("counts a client by its connection's address on a tier clients reach directly", () => {
    const [exposure] =
      application(
        exposed(
          "          - { path: /register, match: exact, process: notes-api, surface: http, audience: lan, rateLimit: { requests: 5, per: 30s } }",
        ),
      ).exposure ?? [];

    expect(exposure?.routes[0]?.middleware?.at(-1)).toStrictEqual({
      kind: "rate-limit",
      allowance: 5,
      per: "30s",
      burst: 5,
      clientAddress: "connection",
    });
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

  it("reads every scope's file, the Process's own value where two set one", () => {
    const resolved = processOf(one(serving("notes-api")), {
      env: [
        env("_project/base.env", "A=project\nB=project\n"),
        env("notes-api/base.env", "B=process\nC=process\n"),
      ],
    });

    expect(
      resolved.environment
        ?.filter(({ name }) => name.length === 1)
        .map((entry) => `${entry.name}=${"value" in entry ? entry.value : ""}`)
        .sort(),
    ).toStrictEqual(["A=project", "B=process", "C=process"]);
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
      { name: "DB_HOST", value: "platform-postgres" },
      { name: "DB_PORT", value: "5432" },
      {
        name: "DB_URL",
        value: "platform-postgres/notes",
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
      imageVersion: "v3.40.0",
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
    expect(attachedApp.reconcileAfter).toContain("apps-secrets");
    expect(bare).not.toHaveProperty("secretStore");
    expect(bare.reconcileAfter ?? []).not.toContain("apps-secrets");
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

  it("orders a unit after another project's only through a required edge", () => {
    const after = (edge: string) =>
      projectNamed(projects(consumer(edge)), "notes").applications[0]
        ?.reconcileAfter;

    expect(
      after(
        "          - { application: otel-collector, surface: otlp, required: false }\n",
      ),
    ).toBeUndefined();
    expect(
      after(
        "          - { application: otel-collector, surface: otlp, required: true }\n",
      ),
    ).toStrictEqual(["apps-observability"]);
  });

  it("resolves an edge into another project to its alias, one into the same project to its Service, and one to an IP as it stands", () => {
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
        address: "otel-collector:4317",
        target: "otel-collector-otlp.estate-system.svc.cluster.local",
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
        address: "notes-worker:7000",
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

  // deploy-kit#546: an exposed Application follows the unit of the Project
  // that declares its tier's proxy, unless that Project is its own.
  it("follows no unit of its own when its own Project declares its tier's proxy", () => {
    const routed = projects(
      `  - id: notes
    exposure:
      - name: app
        host: notes.jorisjonkers.dev
        audience: anonymous
        routes:
          - { path: /, match: prefix, process: notes-api, surface: http }
    processes:
${serving("notes-api")}  - id: notes-proxy
    processes:
${serving("notes-proxy")}`,
      {
        platform: (platform) =>
          platform
            .replace(
              "traefik: edge/traefik-public",
              "traefik: notes/notes-proxy",
            )
            // notes-proxy serves no tier's surfaces, so the tier names no address.
            .replace(/\n {4}address: edge-frankfurt[^\n]*/, ""),
      },
    );

    expect(
      projectNamed(routed, "notes").applications[0]?.reconcileAfter ?? [],
    ).toStrictEqual([]);
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

// spec/v1/17-sign-in.md#credentials-and-placeholders: a client placeholder
// reads the Issuer the platform names and the Client's id, its Application's.
describe("a client placeholder", () => {
  it("resolves the Issuer and the Client's id, each with what follows it", () => {
    const signedIn = application(
      `  - id: notes
    exposure:
      - name: app
        host: notes.jorisjonkers.dev
        audience: authenticated
        routes:
          - { path: /, match: prefix, process: notes-api, surface: http }
    client:
      signIn: token
    processes:
${serving("notes-api")}`,
      {
        signIn: true,
        env: [
          {
            name: "minimal/env/notes-api/base.env",
            text: "ISSUER=${client:issuer}/.well-known/openid-configuration\nCLIENT_ID=${client:id}\n",
          },
        ],
      },
    );

    expect(
      signedIn.processes[0]?.environment?.filter(({ name }) =>
        ["ISSUER", "CLIENT_ID"].includes(name),
      ),
    ).toStrictEqual([
      { name: "CLIENT_ID", value: "notes" },
      {
        name: "ISSUER",
        value: "https://id.jorisjonkers.dev/.well-known/openid-configuration",
      },
    ]);
  });
});

// spec/v1/17-sign-in.md: what a Client derives, beyond the placeholders it
// answers: the edge its Sign-in Mode asks for, the Client object, its
// credential's grants, and the path the Release Gate asks anonymously.
describe("what a Client derives", () => {
  /** Application `notes` on an exposure of `audience`, its Client `client`, its Process `extra`. */
  const signingIn = (
    client: string,
    { audience = "authenticated", extra = "", routes = "" } = {},
  ) => `  - id: notes
    exposure:
      - name: app
        host: notes.jorisjonkers.dev
        audience: ${audience}
        contentPolicy: admin
        routes:
          - { path: /, match: prefix, process: notes-api, surface: http }
${routes}    client:
${client
  .trim()
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")}
    processes:
${serving("notes-api", extra)}`;
  const NATIVE = `signIn: native
label: Notes
description: Everything written down
iconPath: /favicon.svg
redirectPaths: [/auth/callback, /auth/silent]
protectedPath: /api/me
credential: secret
roles: [writer, admin]`;
  const GATED = "signIn: gated\nlabel: Notes";
  const FORWARD_AUTH = {
    kind: "forward-auth",
    endpoint:
      "http://identity-http.estate-system.svc.cluster.local:8080/gate/forward",
  };
  const BASELINE = { kind: "security-headers", contentPolicy: "admin" };
  const SECRET_PATH = "secret/data/notes-system/notes/client";
  /** The worked platform with its public tier carrying `internal` as well, which a token Client may sign in on. */
  const INTERNAL = {
    signIn: true,
    platform: (platform: string) =>
      platform.replace(
        "audiences: [anonymous, authenticated]",
        "audiences: [anonymous, authenticated, internal]",
      ),
  };
  const SIGNED_IN = { signIn: true };
  const CLIENT_SECRET = {
    signIn: true,
    env: [
      {
        name: "minimal/env/notes-api/base.env",
        text: "OIDC_CLIENT_SECRET=${client:secret}\n",
      },
    ],
  };

  describe("at the edge", () => {
    /** The address the Gate's own route on an exposure is served by. */
    const gateOf = (exposure: { routes: readonly object[] } | undefined) =>
      exposure?.routes.flatMap((route) =>
        "gate" in route ? [route.gate] : [],
      )[0];

    it("asks the tier's forward-auth on every route of a gated Client, and derives the Gate's own route to its address", () => {
      const [exposure] =
        application(
          signingIn(GATED, {
            routes:
              "          - { path: /health, match: exact, process: notes-api, surface: http, audience: anonymous }\n",
          }),
          SIGNED_IN,
        ).exposure ?? [];

      expect(exposure?.routes).toStrictEqual([
        {
          path: "/",
          match: "prefix",
          process: "notes-api",
          surface: "http",
          audience: "authenticated",
          precedence: 3,
          middleware: [FORWARD_AUTH, BASELINE],
        },
        {
          path: "/health",
          match: "exact",
          process: "notes-api",
          surface: "http",
          audience: "anonymous",
          precedence: 1,
          middleware: [BASELINE],
        },
        {
          path: "/.auth/",
          match: "prefix",
          gate: { name: "identity", namespace: "identity-system", port: 8080 },
          audience: "authenticated",
          precedence: 2,
          middleware: [BASELINE],
        },
      ]);
    });

    it.each([
      ["a native Client", NATIVE, "authenticated"],
      ["a token Client", "signIn: token", "authenticated"],
      ["a token Client on an internal exposure", "signIn: token", "internal"],
    ])(
      "asks no forward-auth and derives no route for %s, which signs people in itself",
      (_, client, audience) => {
        const [exposure] =
          application(signingIn(client, { audience }), INTERNAL).exposure ?? [];

        expect(
          exposure?.routes.map(({ path, middleware }) => [path, middleware]),
        ).toStrictEqual([["/", [BASELINE]]]);
      },
    );

    it("serves the Gate's own route from the Service of the tier's forward-auth provider", () => {
      const [exposure] =
        application(signingIn(GATED), { signIn: true }).exposure ?? [];

      expect(gateOf(exposure)).toStrictEqual({
        name: "identity",
        namespace: "identity-system",
        port: 8080,
      });
    });

    it("derives the Gate's own route only on the exposure a gated Client names", () => {
      const exposures =
        application(
          signingIn(`${GATED}\nexposure: app`).replace(
            "    client:\n",
            `      - name: admin
        host: admin.notes.jorisjonkers.dev
        audience: authenticated
        routes:
          - { path: /, match: prefix, process: notes-api, surface: http }
    client:
`,
          ),
          SIGNED_IN,
        ).exposure ?? [];

      expect(
        exposures.map(({ name, routes }) => [
          name,
          routes.map(({ path }) => path),
        ]),
      ).toStrictEqual([
        ["app", ["/", "/.auth/"]],
        ["admin", ["/"]],
      ]);
    });

    it("keeps forward-auth from the audience alone on an authenticated exposure no Client names", () => {
      const exposures =
        application(
          signingIn(`${NATIVE}\nexposure: app`).replace(
            "    client:\n",
            `      - name: admin
        host: admin.notes.jorisjonkers.dev
        audience: authenticated
        routes:
          - { path: /, match: prefix, process: notes-api, surface: http }
    client:
`,
          ),
          SIGNED_IN,
        ).exposure ?? [];

      expect(
        exposures.map(({ name, routes }) => [name, routes[0]?.middleware]),
      ).toStrictEqual([
        ["app", [BASELINE]],
        ["admin", [FORWARD_AUTH, { kind: "security-headers" }]],
      ]);
    });
  });

  describe("the Client", () => {
    it("names every path on its exposure's host, the user role first, and the derived credential path of a secret", () => {
      expect(
        application(signingIn(NATIVE), CLIENT_SECRET).client,
      ).toStrictEqual({
        signIn: "native",
        host: "notes.jorisjonkers.dev",
        launchUrl: "https://notes.jorisjonkers.dev/",
        iconUrl: "https://notes.jorisjonkers.dev/favicon.svg",
        redirectUris: [
          "https://notes.jorisjonkers.dev/auth/callback",
          "https://notes.jorisjonkers.dev/auth/silent",
        ],
        credential: "secret",
        secretPath: SECRET_PATH,
        roles: ["user", "writer", "admin"],
        label: "Notes",
        description: "Everything written down",
      });
    });

    // REQ-151 (docs/requirements.md).
    it("names a native Client's back-channel logout path on its exposure's host, and none where it declares none", () => {
      expect(
        application(
          signingIn(`${NATIVE}\nbackChannelLogoutPath: /auth/backchannel`),
          CLIENT_SECRET,
        ).client?.backChannelLogoutUri,
      ).toBe("https://notes.jorisjonkers.dev/auth/backchannel");
      expect(
        application(signingIn(NATIVE), CLIENT_SECRET).client,
      ).not.toHaveProperty("backChannelLogoutUri");
    });

    it("launches a gated Client at the path it names, and a PKCE Client holds no secret path", () => {
      expect(
        application(signingIn(`${GATED}\nlaunchPath: /home`), SIGNED_IN).client,
      ).toStrictEqual({
        signIn: "gated",
        host: "notes.jorisjonkers.dev",
        launchUrl: "https://notes.jorisjonkers.dev/home",
        roles: ["user"],
        label: "Notes",
      });
      expect(
        application(
          signingIn(NATIVE.replace("credential: secret", "credential: pkce")),
          SIGNED_IN,
        ).client,
      ).not.toHaveProperty("secretPath");
    });

    it("names a token Client's host and roles, and nothing a Launcher shows", () => {
      expect(
        application(
          signingIn("signIn: token\nroles: [writer]", { audience: "internal" }),
          INTERNAL,
        ).client,
      ).toStrictEqual({
        signIn: "token",
        host: "notes.jorisjonkers.dev",
        roles: ["user", "writer"],
      });
    });

    it("derives nothing for an Application that declares no client", () => {
      expect(application(one(serving("notes-api")))).not.toHaveProperty(
        "client",
      );
    });
  });

  describe("its credential", () => {
    it("reads the client secret from the derived path, delivered as a secret reference is, under a grant of its own", () => {
      const process = processOf(signingIn(NATIVE), CLIENT_SECRET);

      expect(
        process.environment?.find(({ name }) => name === "OIDC_CLIENT_SECRET"),
      ).toStrictEqual({
        name: "OIDC_CLIENT_SECRET",
        secret: { path: SECRET_PATH, key: "secret" },
      });
      expect(process.secrets).toStrictEqual([
        {
          path: SECRET_PATH,
          keys: ["id", "secret"],
          access: "read",
          delivery: "env",
          destination: "notes-api-notes-system-notes-client",
          restartTargets: ["notes-api"],
        },
      ]);
    });

    it("grants no read to a Process that does not reference the secret", () => {
      const resolved = application(signingIn(NATIVE), SIGNED_IN);

      expect(resolved.processes[0]?.secrets).toBeUndefined();
      expect(resolved.secretStore).toBeUndefined();
    });

    it("grants no read to a Process that references only the Client's id", () => {
      expect(
        processOf(signingIn(NATIVE), {
          signIn: true,
          env: [
            {
              name: "minimal/env/notes-api/base.env",
              text: "OIDC_CLIENT_ID=${client:id}\n",
            },
          ],
        }).secrets,
      ).toBeUndefined();
    });

    it("orders a reader after the Secret Store's Project, and syncs its grant through the store", () => {
      const resolved = application(signingIn(NATIVE), CLIENT_SECRET);

      expect(resolved.reconcileAfter).toContain("apps-secrets");
      expect(resolved.secretStore).toBe(
        "http://vault.secrets-system.svc.cluster.local:8200",
      );
      expect(resolved.processes[0]?.egress).toContainEqual(
        expect.objectContaining({ rule: "secret-store" }),
      );
    });

    it("grants the sign-in provider's Process write on every client secret, in path order, read by the Process itself", () => {
      const identity = projectNamed(
        projects(signingIn(NATIVE), CLIENT_SECRET),
        "identity",
      ).applications.find(({ id }) => id === "identity");
      const process = identity?.processes[0];

      expect(process?.secrets).toStrictEqual([
        {
          client: "notes",
          delivery: "self",
          paths: [{ path: SECRET_PATH, allows: ["create", "read", "update"] }],
        },
        {
          client: "grafana",
          delivery: "self",
          paths: [
            {
              path: "secret/data/observability-system/grafana/client",
              allows: ["create", "read", "update"],
            },
          ],
        },
      ]);
      expect(process?.identityToken).toBe(true);
      expect(process?.egress).toContainEqual(
        expect.objectContaining({ rule: "secret-store" }),
      );
      expect(identity?.reconcileAfter).toContain("apps-secrets");
    });
  });

  it("grants the provider the client secrets in path order, whatever order the Applications are declared in", () => {
    const alpha = `  - id: alpha
    exposure:
      - name: app
        host: alpha.jorisjonkers.dev
        audience: authenticated
        routes:
          - { path: /, match: prefix, process: alpha-api, surface: http }
    client:
      signIn: native
      label: Alpha
      redirectPaths: [/callback]
      protectedPath: /api/me
      credential: secret
    processes:
${serving("alpha-api")}`;
    const identity = projectNamed(
      projects(signingIn(NATIVE) + alpha, CLIENT_SECRET),
      "identity",
    ).applications.find(({ id }) => id === "identity");

    expect(
      identity?.processes[0]?.secrets?.map((grant) =>
        "client" in grant ? grant.client : undefined,
      ),
    ).toStrictEqual(["alpha", "notes", "grafana"]);
  });

  describe("the Release Gate's anonymous check", () => {
    it("is handed a native Client's protected path", () => {
      expect(
        application(signingIn(NATIVE), SIGNED_IN).releaseGate?.protectedPath,
      ).toBe("/api/me");
    });

    // deploy-kit#629: the member the edge would send the path to.
    it("is handed the member the longest Route of the Client's exposure takes the path to", () => {
      const protectedBy = (routes: string) =>
        application(
          signingIn(NATIVE, { routes, extra: serving("notes-web") }),
          SIGNED_IN,
        ).releaseGate?.protectedBy;
      const route = (path: string, match: string, process: string) =>
        `          - { path: ${path}, match: ${match}, process: ${process}, surface: http }\n`;

      expect(protectedBy("")).toBe("notes-api");
      expect(protectedBy(route("/api/", "prefix", "notes-web"))).toBe(
        "notes-web",
      );
      // An exact Route takes its own path only, and the longer one wins.
      expect(
        protectedBy(
          route("/api/", "prefix", "notes-web") +
            route("/api/me", "exact", "notes-api"),
        ),
      ).toBe("notes-api");
      expect(protectedBy(route("/api/m", "exact", "notes-web"))).toBe(
        "notes-api",
      );
      // The longer Route wins wherever it is declared, and a tie goes to the first.
      expect(
        protectedBy(
          route("/api/me", "exact", "notes-web") +
            route("/api/", "prefix", "notes-api"),
        ),
      ).toBe("notes-web");
      expect(
        protectedBy(
          route("/api/me", "prefix", "notes-web") +
            route("/api/me", "exact", "notes-api"),
        ),
      ).toBe("notes-web");
      // A redirect Route answers at the edge and reaches no Process.
      expect(
        protectedBy(
          "          - { path: /api/, match: prefix, process: notes-web, surface: http, redirectTo: https://notes.jorisjonkers.dev/ }\n",
        ),
      ).toBe("notes-api");
    });

    it("is handed no path for a Client that is not native", () => {
      expect(
        application(signingIn(GATED), SIGNED_IN).releaseGate,
      ).not.toHaveProperty("protectedPath");
    });
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
  // A self grant needs the Process to wire its own Vault client.
  const CLIENT = bound("VAULT_ROLE=${identity:vaultRole}\n");

  it("reads a self grant in the Process, mounting the token it authenticates with and syncing nothing", () => {
    const resolved = processOf(granted(SELF), CLIENT);

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
      processOf(applications, CLIENT).egress?.map((peer) =>
        peer.rule === "gate-members"
          ? peer.rule
          : `${peer.rule} ${peer.namespace} ${peer.process ?? "*"} ${String(peer.port)}`,
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
        ...FOUNDATION.filter(
          ({ name }) => name !== "secrets/secrets.project.yml",
        ),
        { name: "secrets/secrets.project.yml", text: secrets },
        { name: "minimal/notes.project.yml", text: HEADER + granted(SELF) },
        ...(CLIENT.env ?? []),
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
    expect(application(granted(SELF), CLIENT).secretStore).toBe(
      "http://vault.secrets-system.svc.cluster.local:8200",
    );
    // One Process holding a grant is enough.
    expect(
      application(`${granted(SELF)}${serving("notes-worker")}`, CLIENT)
        .secretStore,
    ).toBe("http://vault.secrets-system.svc.cluster.local:8200");
    expect(application(one(serving("notes-api"))).secretStore).toBeUndefined();
  });

  it("orders an Application holding a grant after the unit that materialises its credentials", () => {
    expect(application(granted(SELF), CLIENT).reconcileAfter).toStrictEqual([
      "apps-secrets",
    ]);
    // One Process holding a grant is enough.
    expect(
      application(`${granted(SELF)}${serving("notes-worker")}`, CLIENT)
        .reconcileAfter,
    ).toStrictEqual(["apps-secrets"]);
    expect(
      application(one(serving("notes-api"))).reconcileAfter,
    ).toBeUndefined();
  });

  it("orders no Application of the Project that runs the Secret Store after its own unit", () => {
    expect(
      application(granted(SELF), {
        ...CLIENT,
        platform: (document) =>
          document.replace(
            "secretStore: secrets/vault",
            "secretStore: notes/notes",
          ),
      }).reconcileAfter,
    ).toBeUndefined();
  });

  it("orders a datastore whose engine applies a catalog after the unit that writes its method's role, though it holds no grant", () => {
    const store = `      - name: store
        lifecycle: application
        image: notes-api
        runtime: none
        engine: postgres
        provides: { postgres: 5432 }
        placement: { memory: 64Mi, cpu: 10m }
        cutover: interrupted
        volumes: [{ claim: data, mountAt: /data, size: 1Gi, durability: recoverable }]
`;

    // One datastore Process among others is enough.
    expect(
      application(
        one(`${store}      - name: worker
        lifecycle: application
        image: notes-api
        runtime: node
        placement: { memory: 64Mi, cpu: 10m }
        cutover: interrupted
`),
      ).reconcileAfter,
    ).toStrictEqual(["apps-secrets"]);
    expect(
      application(one(store), {
        platform: (document) =>
          document.replace(/\npolicyJob:\n( {2}.*\n)+/, "\n"),
      }).reconcileAfter,
    ).toBeUndefined();
    expect(
      application(one(store), {
        platform: (document) =>
          document.replace(", catalog: postgres-catalog,", ","),
      }).reconcileAfter,
    ).toBeUndefined();
  });

  it("refuses a grant under a platform that names no Secret Store", () => {
    expect(
      notesCodesOf(
        resolve(granted(SELF), {
          ...CLIENT,
          platform: (document) =>
            // With no Secret Store, no tier issues through acme either.
            document
              .replace("secretStore: secrets/vault\n", "")
              .replace("certificates: acme", "certificates: none"),
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
          bound(
            "VAULT_ROLE=${identity:vaultRole}\nTOKEN=${secret:secret/data/notes/token#token}\n",
          ),
        ),
      ),
    ).toStrictEqual(["E_UNAUTHORISED_SECRET_REFERENCE"]);
  });

  it("refuses a placeholder naming a grant the Process reads itself", () => {
    expect(
      codesOf(
        resolve(
          granted(SELF),
          bound(
            "VAULT_ROLE=${identity:vaultRole}\nTOKEN=${secret:secret/data/notes/token#token}\n",
          ),
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
        imageVersion: LOCK.images["postgres-exporter"]?.version,
        memory: "32Mi",
        cpu: "5m",
      },
    ]);
  });
});

// REQ-124 (docs/requirements.md): a seeded Asset runs the platform's seeder,
// which a node must fit beside the Process, and lands only on a file below one
// of the Process's own volumes.
describe("a Process that seeds an Asset", () => {
  const VOLUME =
    "        volumes:\n          - { claim: notes-data, mountAt: /var/lib/notes, size: 1Gi, durability: reconstructible }\n";
  const seeding = (seedAt: string, extra = VOLUME) =>
    one(
      serving(
        "notes-api",
        `${extra}        assets:\n          - { from: config/notes.yml, seedAt: "${seedAt}" }\n`,
      ).replace("cutover: continuous", "cutover: interrupted"),
    );
  const SEEDED = seeding("/var/lib/notes/notes.yml");
  // A variable the application expands itself names no placeholder source.
  const CONTENT = "page-size: ${PAGE_SIZE}\n";
  const beside = (options: Options = {}): Options => ({
    ...options,
    env: [{ name: "minimal/config/notes.yml", text: CONTENT }],
  });
  const SEEDER = "seeder:\n  image: busybox\n  memory: 16Mi\n  cpu: 10m\n";
  const unnamed = (platform: string) => platform.replace(SEEDER, "");
  // AdGuard, in the foundation, seeds its config: without it nothing else does.
  const unseeded = (name: string, text: string) =>
    name === "utility/utility.project.yml"
      ? text.replace(/ {8}assets:\n {10}- \{ from: config\/adguard.*\n/, "")
      : text;
  /** The refusals the notes project earns, beside the foundation's own. */
  const notesOf = (result: ReturnType<typeof resolve>) =>
    result.ok
      ? []
      : result.diagnostics.filter(
          ({ document }) => document === "minimal/notes.project.yml",
        );

  it("runs the platform's seeder, pinned by digest, and carries the file as it is committed", () => {
    const process = processOf(SEEDED, beside());

    expect(process.seeder).toStrictEqual({
      image: `${LOCK.images["busybox"]?.repository ?? ""}@${LOCK.images["busybox"]?.digest ?? ""}`,
      imageVersion: "1.37.0",
      memory: "16Mi",
      cpu: "10m",
    });
    expect(process.assets).toStrictEqual([
      {
        name: `notes-api-notes-yml-${sha256Hasher(CONTENT).slice(7, 17)}`,
        from: "config/notes.yml",
        seedAt: "/var/lib/notes/notes.yml",
        content: CONTENT,
      },
    ]);
    // A Process that mounts its Assets, or has none, runs no seeder.
    expect(
      processOf(
        one(
          serving(
            "notes-api",
            "        assets:\n          - { from: config/notes.yml, mountAt: /etc/notes.yml }\n",
          ),
        ),
        beside(),
      ),
    ).not.toHaveProperty("seeder");
    expect(processOf(one(serving("notes-api")))).not.toHaveProperty("seeder");
  });

  it("asks a node to fit the seeder beside the Process", () => {
    const placed = (memory: string) =>
      processOf(
        SEEDED,
        beside({
          platform: (platform) =>
            platform.replace(SEEDER, SEEDER.replace("16Mi", memory)),
        }),
      ).placement.eligibleNodes;

    expect(placed("16Mi")).toContain("enschede-pi-2");
    // 4000Mi beside the Process's 64Mi no longer fits a 4096Mi Pi.
    expect(placed("4000Mi")).not.toContain("enschede-pi-2");
  });

  it("asks nothing of a platform that names no seeder, where nothing is seeded", () => {
    expect(
      codesOf(
        resolve(one(serving("notes-api")), {
          platform: unnamed,
          foundation: unseeded,
        }),
      ),
    ).toStrictEqual([]);
    // With it, the platform must name one.
    expect(
      codesOf(resolve(one(serving("notes-api")), { platform: unnamed })),
    ).toStrictEqual(["E_NO_SEEDER"]);
  });

  it("refuses a seeded Asset the platform names no seeder for, and a seeder the lock does not hold", () => {
    const unrun = resolve(SEEDED, beside({ platform: unnamed }));
    expect(notesCodesOf(unrun)).toStrictEqual(["E_NO_SEEDER"]);
    expect(notesOf(unrun)).toMatchObject([
      {
        path: "/applications/0/processes/0/assets/0/seedAt",
        message: "notes-api seeds an Asset, and the platform names no seeder",
        hint: "Name the seeder in the Platform document's `seeder`, or mount the Asset with `mountAt`.",
      },
    ]);

    const unlocked = resolve(
      SEEDED,
      beside({
        lock: (lock) => lock.replace("  busybox:\n", "  busybox-retired:\n"),
      }),
    );
    expect(codesOf(unlocked)).toStrictEqual(["E_UNLOCKED_IMAGE"]);
    expect(unlocked.ok ? [] : unlocked.diagnostics).toMatchObject([
      { path: "/seeder/image" },
    ]);
  });

  it.each([
    ["outside every volume", "/etc/notes.yml"],
    ["at the volume itself", "/var/lib/notes"],
    ["at the volume, written with a slash", "/var/lib/notes/"],
    ["out of the volume through ..", "/var/lib/notes/../notes.yml"],
    ["through .", "/var/lib/notes/./notes.yml"],
    [
      "in a directory that only shares the volume's prefix",
      "/var/lib/notes-other/notes.yml",
    ],
  ])("refuses a file seeded %s", (_, seedAt) => {
    const refused = resolve(seeding(seedAt), beside());

    expect(notesCodesOf(refused)).toStrictEqual(["E_SEED_OUTSIDE_VOLUME"]);
    expect(notesOf(refused)).toMatchObject([
      {
        path: "/applications/0/processes/0/assets/0/seedAt",
        message: `notes-api seeds ${seedAt}, which is a file below none of its volumes or writable paths`,
        hint: "Seed the Asset at a path below one of the Process's volumes or writable paths, or mount it with `mountAt`.",
      },
    ]);
  });

  it("refuses a seeded Asset on a Process with no volume, both refusals where the platform names no seeder", () => {
    expect(
      notesCodesOf(resolve(seeding("/var/lib/notes/notes.yml", ""), beside())),
    ).toStrictEqual(["E_SEED_OUTSIDE_VOLUME"]);
    expect(
      notesCodesOf(
        resolve(
          seeding("/var/lib/notes/notes.yml", ""),
          beside({ platform: unnamed }),
        ),
      ),
    ).toStrictEqual(["E_NO_SEEDER", "E_SEED_OUTSIDE_VOLUME"]);
  });

  it("accepts a file deeper below a volume, and a volume written with a slash", () => {
    expect(
      processOf(seeding("/var/lib/notes/conf/notes.yml"), beside()).assets?.[0],
    ).toMatchObject({ seedAt: "/var/lib/notes/conf/notes.yml" });
    expect(
      processOf(
        seeding(
          "/var/lib/notes/notes.yml",
          VOLUME.replace(
            "mountAt: /var/lib/notes,",
            "mountAt: /var/lib/notes/,",
          ),
        ),
        beside(),
      ).seeder,
    ).toBeDefined();
  });

  it("seeds onto a writable path, whichever level declares it, which the pod starts fresh", () => {
    const onPath = (process: string, above = "") =>
      `  - id: notes\n${above}    processes:\n${serving(
        "notes-api",
        `${process}        assets:\n          - { from: config/notes.yml, seedAt: /var/conf/notes.yml }\n`,
      )}`;

    expect(
      processOf(onPath("        writablePaths: [/var/conf]\n"), beside())
        .seeder,
    ).toBeDefined();
    expect(
      processOf(onPath("", "    writablePaths: [/var/conf]\n"), beside())
        .seeder,
    ).toBeDefined();
    expect(
      processOf(
        onPath("        writablePaths: [{ path: /var/conf, memory: 1Mi }]\n"),
        beside(),
      ).seeder,
    ).toBeDefined();
    expect(notesCodesOf(resolve(onPath(""), beside()))).toStrictEqual([
      "E_SEED_OUTSIDE_VOLUME",
    ]);
  });

  it("refuses an inherited seeded Asset where it is written, and lets the Process mount the same path instead", () => {
    const shared = (processAssets: string) =>
      `  - id: notes\n    assets:\n      - { from: config/notes.yml, seedAt: /etc/notes.yml }\n    processes:\n${serving("notes-api", processAssets)}`;

    const refused = resolve(shared(""), beside({ platform: unnamed }));
    expect(notesOf(refused)).toMatchObject([
      { code: "E_NO_SEEDER", path: "/applications/0/assets/0/seedAt" },
      {
        code: "E_SEED_OUTSIDE_VOLUME",
        path: "/applications/0/assets/0/seedAt",
      },
    ]);
    // The Process's own Asset at the path holds, and it seeds nothing.
    const mounted = processOf(
      shared(
        "        assets:\n          - { from: config/notes.yml, mountAt: /etc/notes.yml }\n",
      ),
      beside({ platform: unnamed, foundation: unseeded }),
    );
    expect(mounted).not.toHaveProperty("seeder");
    expect(mounted.assets?.[0]).toHaveProperty("mountAt", "/etc/notes.yml");
  });
});

describe("what an engine grant derives", () => {
  const holding = (grant: string) =>
    processOf(
      one(serving("notes-api", `        secrets:\n          - ${grant}\n`)),
      // A self grant needs the Process to wire its own Vault client.
      {
        env: [
          {
            name: "minimal/env/notes-api/base.env",
            text: "VAULT_ROLE=${identity:vaultRole}\n",
          },
        ],
      },
    );

  it("covers one path per transit operation, each the one Vault maps it to", () => {
    expect(
      holding(
        "{ engine: transit, key: notes-jwt, operations: [sign, verify, encrypt, decrypt, rotate, read], delivery: self, rotation: {tolerates: restart} }",
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
          { path: "transit/keys/notes-jwt", allows: ["read"] },
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
    `${lock.trimEnd()}\n  notes-migration:\n    repository: ghcr.io/jorisjonkers-dev/notes/notes-migration\n    digest: "sha256:${"7".repeat(64)}"\n    uid: 1000\n    gid: 1000\n    version: "1.0.0"\n`;
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
    consumes: ["platform-postgres.postgres"],
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
      runnerVersion: "1.0.0",
      uid: 1000,
      gid: 1000,
      nonTransactional: false,
      ...PLAN,
    });
    expect(
      migration([PROOF("  - { id: other, nonTransactional: true }\n")]),
    ).toStrictEqual({
      runner: `ghcr.io/jorisjonkers-dev/notes/notes-migration@sha256:${"7".repeat(64)}`,
      runnerVersion: "1.0.0",
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
          /uid: 1000\n {4}gid: 1000\n( {4}version: .*\n)$/,
          "uid: 1001\n    gid: 1002\n$1",
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
        ["apps-data", "apps-secrets"],
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
        // With no Secret Store, no tier issues through acme either.
        platform: (document) =>
          document
            .replace("secretStore: secrets/vault\n", "")
            .replace("certificates: acme", "certificates: none"),
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

  // deploy-kit#552: the runner reaches the datastore as every consumer does,
  // by the label of the surface its edge names, so no datastore's policy
  // names a migration identity.
  it("carries the consumer label of the surface its edge names, which the datastore admits as it admits every consumer", () => {
    const named = `${managed}${serving("postgres")}`;
    const all = projects(named, { lock: LOCKED, env: DATA });
    const ingress = projectNamed(all, "data")
      .applications.find(({ id }) => id === "platform-postgres")
      ?.processes.flatMap((process) => process.ingress ?? []);

    expect(migration()?.consumes).toStrictEqual(["platform-postgres.postgres"]);
    expect(ingress).toContainEqual({
      rule: "consumer",
      consumes: "platform-postgres.postgres",
      port: 5432,
    });
    expect(
      all.flatMap(({ applications }) =>
        applications.flatMap(({ processes }) =>
          processes.flatMap((process) => process.ingress ?? []),
        ),
      ),
    ).not.toContainEqual(
      expect.objectContaining({ process: "notes-migration" }),
    );
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
      runnerVersion: "1.0.0",
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

  // deploy-kit#586: the runner runs as the user the lock records, beside
  // runAsNonRoot, so a root migration image would never start.
  it("refuses a managed migration whose image runs as root, at the migration, naming the image", () => {
    const result = resolve(managed, {
      lock: (lock) =>
        LOCKED(lock).replace(
          /uid: 1000\n {4}gid: 1000\n {4}version: "1\.0\.0"\n$/,
          'uid: 0\n    gid: 0\n    version: "1.0.0"\n',
        ),
      env: DATA,
    });

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, document, path, message }) => ({
            code,
            document,
            path,
            message,
          })),
    ).toStrictEqual([
      {
        code: "E_IMAGE_RUNS_AS_ROOT",
        document: "minimal/notes.project.yml",
        path: "/applications/0/migration",
        message: `notes-migration is locked to ghcr.io/jorisjonkers-dev/notes/notes-migration@sha256:${"7".repeat(64)}, which runs as uid 0, and the posture runs it with runAsNonRoot, so the kubelet refuses the pod`,
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
    const observability = unsigned(text(OBSERVABILITY)).replace(
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
          name: "observability/rules/platform.yaml",
          text: text("observability/rules/platform.yaml"),
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
              platform.replace(/\nproviders:\n( {2}.*\n)+/, "\n"),
          },
        ),
      ),
    ).toStrictEqual(["E_UNRESOLVED_APPLICATION"]);
  });
});

describe("the edges of the derivations", () => {
  it("reads a wider scope's file where the Process has none of its own", () => {
    expect(
      processOf(one(serving("notes-api")), {
        env: [{ name: "minimal/env/_project/base.env", text: "ONLY=here\n" }],
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
                "audiences: [lan, authenticated]\n    forwardAuth: {provider: notes/notes, surface: http, path: /lan-forward}",
              ),
        },
      ).exposure ?? [];

    expect(exposure?.tier).toBe("public-frankfurt");
    expect(exposure?.routes[0]?.middleware?.[0]).toStrictEqual({
      kind: "forward-auth",
      endpoint:
        "http://notes-http.estate-system.svc.cluster.local:8080/lan-forward",
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

/** Every peer but the gate's own, which every member admits and its own block tests. */
const beyondTheGate = <T extends { readonly rule: string }>(
  peers: readonly T[] | undefined,
): T[] | undefined => peers?.filter(({ rule }) => rule !== "release-gate");

describe("the peers a policy admits", () => {
  const ingressOf = (all: ResolvedProject[], project: string, index = 0) =>
    beyondTheGate(
      projectNamed(all, project).applications[0]?.processes[index]?.ingress,
    );
  /** The peers a policy names by namespace and Process: every one but a consumer's. */
  const named = (all: ResolvedProject[], project: string, index = 0) =>
    ingressOf(all, project, index)?.filter(({ rule }) => rule !== "consumer");
  const consumer = (consumes: string, port: number) => ({
    rule: "consumer",
    consumes,
    port,
  });

  // deploy-kit#552: a surface admits the label of its consumers, whoever
  // they are, so the policy reads no consumer's edges.
  it("admits the consumer label of each of its surfaces, whether or not anything consumes it, and labels a consumer by the surfaces its edges reach", () => {
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
      consumer("notes.http", 8080),
    ]);
    expect(ingressOf(all, "notes", 1)).toStrictEqual([
      {
        rule: "tier-proxy",
        namespace: "edge-system",
        process: "traefik-public",
        port: 8080,
      },
      consumer("notes.http", 8080),
    ]);
    const [api, web] =
      projectNamed(all, "notes").applications[0]?.processes ?? [];
    const store = projectNamed(all, "notes").applications[1]?.processes[0];
    const other = projectNamed(all, "notes").applications[2]?.processes[0];
    expect(beyondTheGate(store?.ingress)).toStrictEqual([
      consumer("notes-store.store", 7000),
      consumer("notes-store.http", 8080),
    ]);
    expect(beyondTheGate(other?.ingress)).toStrictEqual([
      consumer("notes-other.store", 7000),
    ]);
    expect(api?.consumes).toStrictEqual(["notes-store.store"]);
    expect(web?.consumes).toBeUndefined();
  });

  it("labels a consumer by no edge to a Registered Unmanaged Surface, which reaches an address rather than a pod", () => {
    expect(
      processOf(
        one(
          serving(
            "notes-api",
            "        dependsOn:\n          - { application: stalwart, surface: smtp }\n",
          ),
        ),
      ).consumes,
    ).toBeUndefined();
  });

  it("admits the metrics stack only on the scraped Process, and every Process of the stack", () => {
    const all = projects(`  - id: notes
    observability:
      scrape: { process: notes-web, surface: http, path: /metrics }
    processes:
${serving("notes-api")}${serving("notes-web")}`);

    expect(named(all, "notes")).toStrictEqual([]);
    expect(named(all, "notes", 1)).toStrictEqual([
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
      named(
        projects(
          `  - id: notes
    observability:
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
    ).toStrictEqual([]);
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

    expect(
      beyondTheGate(api?.ingress)?.flatMap((peer) =>
        peer.rule === "consumer" ? [] : [peer.process],
      ),
    ).toStrictEqual(["traefik-public"]);
    expect(
      beyondTheGate(web?.ingress)?.flatMap((peer) =>
        peer.rule === "consumer" ? [] : [peer.process],
      ),
    ).toStrictEqual(["traefik-lan"]);
  });
});

// deploy-kit#602: the gate's own requests reach a member's new copy, and
// neither half names the other's Project.
describe("the Release Gate's own requests", () => {
  const fromTheGate = (port: number) => ({
    rule: "release-gate",
    namespace: "delivery-system",
    process: "release-gate",
    port,
  });
  const gated = (peers: readonly { readonly rule: string }[] | undefined) =>
    peers?.filter(({ rule }) => rule === "release-gate");

  it("admits the gate on the first surface of every member, and on no Process that is none", () => {
    const all = projects(`  - id: notes
    processes:
${serving("notes-api").replace("provides: { http: 8080 }", "provides: { web: 3000, http: 8080 }")}${serving("notes-web")}  - id: notes-batch
    processes:
${serving("notes-batch").replace("cutover: continuous", "cutover: interrupted")}`);
    const [api, web] =
      projectNamed(all, "notes").applications[0]?.processes ?? [];
    const batch = projectNamed(all, "notes").applications[1]?.processes[0];

    expect(gated(api?.ingress)).toStrictEqual([fromTheGate(3000)]);
    expect(gated(web?.ingress)).toStrictEqual([fromTheGate(8080)]);
    // A stop-start Process is no member: Flagger never switches it.
    expect(batch?.switchover).toBe("stop-start");
    expect(gated(batch?.ingress)).toStrictEqual([]);
  });

  it("reaches every member from the gate's own Processes, and from nothing else", () => {
    const all = projects(`  - id: notes
    processes:
${serving("notes-api")}`);
    const reaches = (project: string, id: string) =>
      projectNamed(all, project)
        .applications.find((candidate) => candidate.id === id)
        ?.processes.flatMap(({ egress }) =>
          (egress ?? []).filter(({ rule }) => rule === "gate-members"),
        );

    expect(reaches("delivery", "release-gate")).toStrictEqual([
      { rule: "gate-members" },
    ]);
    expect(reaches("delivery", "flagger")).toStrictEqual([]);
    expect(reaches("notes", "notes")).toStrictEqual([]);
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
      notesCodesOf(
        resolve(
          holding(
            "          - { claim: keep, mountAt: /k, size: 1Gi, durability: irreplaceable }\n",
            "        engine: files\n",
          ),
          {
            // With no Secret Store, no tier issues through acme either.
            platform: (document) =>
              document
                .replace("secretStore: secrets/vault\n", "")
                .replace("certificates: acme", "certificates: none"),
          },
        ),
      ),
    ).toStrictEqual(["E_NO_SECRET_STORE"]);
    // A backup that dumps its Process over the network logs in with a
    // credential the Secret Store holds; one that reads the volume does not.
    // One such Process is enough, beside one that holds nothing.
    const unstored = (engine: string) =>
      notesCodesOf(
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
              document
                .replace("secretStore: secrets/vault\n", "")
                .replace("certificates: acme", "certificates: none"),
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
          methodVersion: LOCK.images["rabbitmq-backup"]?.version,
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
          // REQ-104: where the copy goes, the key it is encrypted to, and
          // where under the destination this volume's copies are kept.
          offCluster: {
            destination: "s3://backup-storage/jorisjonkers-dev",
            recipient:
              "age1s6v5qrx3mgcgk37gscv8y6z43rssksdct5lx3xk5xrtptjndqvhsnhj7h8",
            path: "notes/notes-store/keep",
          },
          method:
            "ghcr.io/jorisjonkers-dev/platform/rabbitmq-backup@sha256:a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2",
          methodVersion: LOCK.images["rabbitmq-backup"]?.version,
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
    expect(admitted("files")).toStrictEqual([]);
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

  // REQ-110 (docs/requirements.md): the facts a Move is derived from.
  it("refuses a move method the images lock does not hold, at the engine that names it", () => {
    const result = resolve(one(serving("notes-api")), {
      platform: (platform) =>
        platform.replace(
          "move: {image: postgres-move,",
          "move: {image: unlocked,",
        ),
    });

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, path }) => `${code} ${path}`),
    ).toStrictEqual(["E_UNLOCKED_IMAGE /engines/postgres/move/image"]);
  });

  it("refuses a Process of an engine that moves whose image records no major.minor.patch version", () => {
    const store = (image: string) => `      - name: store
        lifecycle: application
        image: ${image}
        runtime: none
        engine: postgres
        provides: { postgres: 5432 }
        placement: { memory: 64Mi, cpu: 10m }
        cutover: interrupted
        volumes: [{ claim: data, mountAt: /data, size: 1Gi, durability: recoverable }]
`;
    const versioned = (version: string) => (lock: string) =>
      lock.replace(
        /(\n {2}notes-api:\n(?: {4}.*\n)*? {4}version: )"[^"]*"/,
        `$1"${version}"`,
      );
    const refused = (version: string) => {
      const result = resolve(one(store("notes-api")), {
        lock: versioned(version),
      });
      return result.ok
        ? []
        : result.diagnostics
            .filter(({ code }) => code === "E_ENGINE_VERSION_MISSING")
            .map(
              ({ document, path, message, hint }) =>
                `${document} ${path}: ${message} ${hint}`,
            );
    };

    expect(refused("16")).toStrictEqual([
      "minimal/notes.project.yml /applications/0/processes/0/image: notes-api records the version 16, and a Move of postgres reads major.minor.patch off it Lock the image from a release tagged major.minor.patch, so the lock records that version.",
    ]);
    expect(refused("16.4-alpine")).toHaveLength(1);
    // The whole version is major.minor.patch, each part any number of digits.
    expect(refused("16.4.0-alpine")).toHaveLength(1);
    expect(refused("v16.4.0")).toHaveLength(1);
    expect(refused("16.14.0")).toStrictEqual([]);
    expect(refused("16.4.10")).toStrictEqual([]);
    // An unlocked image reads no version: it is refused on its own.
    expect(
      codesOf(resolve(one(store("notes-unlocked")), { lock: versioned("16") })),
    ).not.toContain("E_ENGINE_VERSION_MISSING");
    expect(refused("16.4.0")).toStrictEqual([]);
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
  const set = (
    platform?: (text: string) => string,
    foundation?: (name: string, text: string) => string,
  ) => {
    const result = resolve(one(serving("notes-api")), {
      ...(platform === undefined ? {} : { platform }),
      ...(foundation === undefined ? {} : { foundation }),
    });
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
      imageVersion: "1.0.0",
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
        set(
          (platform) =>
            platform
              .replace("secretStore: secrets/vault\n", "")
              .replace(/\nmonitoring:\n( {2}.*\n)+/, "\n")
              // With no Secret Store, no tier issues through acme either.
              .replace("certificates: acme", "certificates: none"),
          // Without the monitoring stack, whose Alertmanager reads its
          // receivers' webhooks from the Secret Store, and so its rules; and
          // without Vault's off-cluster copy, whose credential it reads there.
          (name, text) =>
            name === "observability/observability.project.yml"
              ? text.replace(
                  "    alertRules:\n      - {from: rules/platform.yaml}\n",
                  "",
                )
              : name === "secrets/secrets.project.yml"
                ? text.replace(
                    "durability: irreplaceable\n        engine: files\n",
                    "durability: reconstructible\n",
                  )
                : text,
        ),
      ),
      // What the set does derive is where Flux's events go, since the worked
      // platform names a Reporter, the tiers' proxies, the groups it grants a
      // cluster role, its priority classes and each tier's forward-auth. The
      // catalogs' homes and the Node Agents are always there, and the homes
      // hold none.
    ).toStrictEqual([
      "projects",
      "catalogHomes",
      "events",
      "tierProxies",
      "stableAddresses",
      "nodeAgents",
      "humanGrants",
      "priority",
      "forwardAuths",
    ]);
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

  it("names an alias by the edges of the consumer's own project, and every edge it holds, only", () => {
    const union = [
      {
        project: "auth",
        applications: [
          {
            id: "auth",
            processes: [
              { dependsOn: [{ application: "stalwart", surface: "smtp" }] },
              {},
            ],
          },
        ],
      },
      {
        project: "mail",
        applications: [
          {
            id: "mail",
            processes: [
              { dependsOn: [{ application: "stalwart", surface: "imap" }] },
            ],
          },
        ],
      },
    ] as unknown as EffectiveProject[];

    expect(edgesOfProject(union, "auth")).toStrictEqual([
      { application: "stalwart", surface: "smtp" },
    ]);
  });

  it("takes the provider named, on the surface named, wherever it sits in the register", () => {
    expect(
      resolveEdge(
        { application: "stalwart", surface: "smtp" },
        [],
        PLATFORM,
        "auth",
      ),
    ).toStrictEqual({
      application: "stalwart",
      surface: "smtp",
      address: "stalwart:587",
      target: "stalwart-smtp.estate-system.svc.cluster.local",
    });
  });

  it("dials a provider whose address is an IP at that IP, with no alias", () => {
    const platform = {
      providers: [
        { name: "relay", address: "10.0.0.12", surfaces: { smtp: 25 } },
      ],
    } as unknown as PlatformIntentDocument;
    expect(
      resolveEdge(
        { application: "relay", surface: "smtp" },
        [],
        platform,
        "auth",
      ),
    ).toStrictEqual({
      application: "relay",
      surface: "smtp",
      address: "10.0.0.12:25",
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
      expect(() => resolveEdge(edge, [], platform, "auth")).toThrow(
        `${edge.application}.${edge.surface}: no provider in the union`,
      );
    },
  );
});

// REQ-039 (docs/requirements.md): what a gate member waits for before its new
// version starts, read off its own required edges into its own Project
// (spec/v1/55-delivery.md#release-order).
describe("what a member waits for in its own Project", () => {
  const edges = (...targets: string[]): string =>
    `        dependsOn:\n${targets.map((target) => `          - ${target}\n`).join("")}`;
  /** A Process that switches stop-start, providing `surfaces`. */
  const stopping = (name: string, surfaces = "{ http: 8080 }"): string =>
    serving(name)
      .replace("cutover: continuous", "cutover: interrupted")
      .replace("provides: { http: 8080 }", `provides: ${surfaces}`);
  const sibling = (id: string, processes: string): string =>
    `  - id: ${id}\n    processes:\n${processes}`;
  const consumer = (processes: string): string => sibling("notes", processes);
  const waitsFor = (applications: string, options?: Options) =>
    application(applications, options).releaseGate?.members.map(
      ({ process, waitsFor: providers }) => ({ process, providers }),
    );

  it("waits for a stop-start Process of another Application it requires, by Application and Process", () => {
    expect(
      waitsFor(
        consumer(
          serving(
            "notes-api",
            edges("{ application: notes-cache, surface: http }"),
          ),
        ) + sibling("notes-cache", stopping("notes-cache")),
      ),
    ).toStrictEqual([
      {
        process: "notes-api",
        providers: [{ application: "notes-cache", process: "notes-cache" }],
      },
    ]);
  });

  it("waits for nothing where no edge reaches a sibling, and carries no list then", () => {
    const resolved = application(
      consumer(serving("notes-api")) +
        sibling("notes-cache", stopping("notes-cache")),
    );

    expect(resolved.releaseGate?.members[0]).not.toHaveProperty("waitsFor");
  });

  it("does not wait for a blue-green sibling, whose old version keeps serving", () => {
    expect(
      waitsFor(
        consumer(
          serving(
            "notes-api",
            edges("{ application: notes-cache, surface: http }"),
          ),
        ) + sibling("notes-cache", serving("notes-cache")),
      ),
    ).toStrictEqual([{ process: "notes-api", providers: undefined }]);
  });

  it("does not wait on an edge marked required: false", () => {
    expect(
      waitsFor(
        consumer(
          serving(
            "notes-api",
            edges(
              "{ application: notes-cache, surface: http, required: false }",
            ),
          ),
        ) + sibling("notes-cache", stopping("notes-cache")),
      ),
    ).toStrictEqual([{ process: "notes-api", providers: undefined }]);
  });

  it("does not wait for a stop-start provider in another Project, which its Reconcile Unit orders", () => {
    const resolved = application(
      reaching(
        serving(
          "notes-api",
          edges("{ application: platform-postgres, surface: postgres }"),
        ),
      ),
      { env: DATA },
    );

    expect(resolved.reconcileAfter).toContain("apps-data");
    expect(resolved.releaseGate?.members[0]).not.toHaveProperty("waitsFor");
  });

  it("waits only for the Process that provides the surface its edge names, in the Application it names", () => {
    expect(
      waitsFor(
        consumer(
          serving(
            "notes-api",
            edges("{ application: notes-cache, surface: http }"),
          ),
        ) +
          sibling(
            "notes-cache",
            stopping("notes-cache") +
              stopping("notes-cache-admin", "{ admin: 9090 }"),
          ) +
          sibling("notes-other", stopping("notes-other")),
      ),
    ).toStrictEqual([
      {
        process: "notes-api",
        providers: [{ application: "notes-cache", process: "notes-cache" }],
      },
    ]);
  });

  it("does not wait for a job that provides the surface, since it serves nothing it starts", () => {
    expect(
      waitsFor(
        consumer(
          serving(
            "notes-api",
            edges("{ application: notes-cache, surface: http }"),
          ),
        ) +
          sibling(
            "notes-cache",
            stopping("notes-cache").replace(
              "lifecycle: application",
              "lifecycle: job",
            ),
          ),
      ),
    ).toStrictEqual([{ process: "notes-api", providers: undefined }]);
  });

  it("waits for a provider once however many of its surfaces it reaches, and names providers in order", () => {
    expect(
      waitsFor(
        consumer(
          serving(
            "notes-api",
            edges(
              "{ application: notes-store, surface: b }",
              "{ application: notes-cache, surface: admin }",
              "{ application: notes-store, surface: a }",
              "{ application: notes-cache, surface: http }",
            ),
          ),
        ) +
          sibling(
            "notes-cache",
            stopping("notes-cache", "{ http: 8080, admin: 9090 }"),
          ) +
          sibling(
            "notes-store",
            stopping("notes-store-b", "{ b: 8080 }") +
              stopping("notes-store-a", "{ a: 8080 }"),
          ),
      ),
    ).toStrictEqual([
      {
        process: "notes-api",
        providers: [
          { application: "notes-cache", process: "notes-cache" },
          { application: "notes-store", process: "notes-store-a" },
          { application: "notes-store", process: "notes-store-b" },
        ],
      },
    ]);
  });
});

// REQ-077 (docs/requirements.md): a `mongo` is backed up by the platform's
// mongo method over its own surface, and owns no databases, so an edge into it
// derives no catalog, no credential and no question about a schema.
describe("a mongo, the document store", () => {
  const store = (durability: string) =>
    processOf(
      one(
        serving(
          "notes-store",
          `        engine: mongo\n        volumes:\n          - { claim: documents, mountAt: /data/db, size: 1Gi, durability: ${durability} }\n`,
        )
          .replace("cutover: continuous", "cutover: interrupted")
          .replace("provides: { http: 8080 }", "provides: { mongo: 27017 }"),
      ),
    );

  it("is dumped by the mongo method over the surface the platform names, and admits that backup alone beside its consumers", () => {
    const resolved = store("recoverable");
    const [volume] = resolved.volumes ?? [];

    expect(volume?.backup?.method).toBe(
      `ghcr.io/jorisjonkers-dev/platform/mongo-backup@${LOCK.images["mongo-backup"]?.digest ?? ""}`,
    );
    expect(volume?.backup?.peer).toStrictEqual({
      host: "notes-store.notes-system.svc.cluster.local",
      port: 27017,
      credential: {
        path: "secret/data/notes/notes-store/backup",
        access: "read",
        delivery: "env",
        destination: "notes-store-backup-notes-notes-store-backup",
      },
    });
    expect(volume?.backup?.egress).toContainEqual({
      rule: "datastore",
      namespace: "notes-system",
      process: "notes-store",
      port: 27017,
    });
    expect(resolved.ingress).toContainEqual({
      rule: "backup",
      namespace: "notes-system",
      process: "notes-store-backup",
      port: 27017,
    });
  });

  it("is refused where the platform names no mongo method, and where that method's surface is not provided", () => {
    expect(
      codesOf(
        resolve(
          one(
            serving(
              "notes-store",
              "        engine: mongo\n        volumes:\n          - { claim: documents, mountAt: /data/db, size: 1Gi, durability: recoverable }\n",
            ).replace("cutover: continuous", "cutover: interrupted"),
          ),
          {
            platform: (document) =>
              document.replace(
                "  mongo: { backup: mongo-backup, surface: mongo }\n",
                "",
              ),
          },
        ),
      ),
    ).toStrictEqual(["E_NO_ENGINE_POLICY"]);
    expect(
      codesOf(
        resolve(
          one(
            serving(
              "notes-store",
              "        engine: mongo\n        volumes:\n          - { claim: documents, mountAt: /data/db, size: 1Gi, durability: recoverable }\n",
            ).replace("cutover: continuous", "cutover: interrupted"),
          ),
        ),
      ),
    ).toStrictEqual(["E_BACKUP_SURFACE_NOT_PROVIDED"]);
  });

  it("derives no database, credential or migration question for an edge into it", () => {
    const edge =
      "        dependsOn:\n          - { application: platform-mongo, surface: mongo }\n";
    const consumer = processOf(one(serving("notes-api", edge)), {
      env: DATA,
    });

    expect(consumer.secrets).toBeUndefined();
    expect(consumer.identityToken).toBe(false);
    expect(consumer.consumes).toStrictEqual(["platform-mongo.mongo"]);
    expect(
      application(one(serving("notes-api", edge)), { env: DATA }).migration,
    ).toBeUndefined();
  });
});

describe("a Process nothing reaches", () => {
  it("records no ingress at all, not an empty one", () => {
    const worker = `      - name: notes-worker
        lifecycle: application
        image: notes-api
        runtime: node
        placement: { memory: 64Mi, cpu: 10m }
        probes: none
        startupBudget: 20s
        cutover: interrupted
`;
    expect(processOf(one(worker))).not.toHaveProperty("ingress");
  });
});
// REQ-081 (docs/requirements.md): a Process is exposed by the entries that
// name it, and held to the site of each pool among them, once.
describe("a Process's L4 exposures", () => {
  const entry = (process: string, address: string) => ({
    address,
    port: 1883,
    protocol: "tcp" as const,
    process,
    surface: "mqtt",
  });
  const application = {
    l4Exposure: [
      entry("broker", "lan-mqtt"),
      entry("management", "lan-mqtt"),
      entry("broker", "lan-dns"),
    ],
  };
  const platform = {
    l4Addresses: {
      "lan-mqtt": {
        kind: "pool" as const,
        site: "enschede",
        range: "192.168.0.97/32",
      },
      "lan-dns": {
        kind: "pool" as const,
        site: "enschede",
        range: "192.168.0.98/32",
      },
    },
  };

  it("are the entries that name it, and no other Process's", () => {
    expect(l4ExposuresOf(application, "broker")).toStrictEqual([
      entry("broker", "lan-mqtt"),
      entry("broker", "lan-dns"),
    ]);
    expect(l4ExposuresOf({}, "broker")).toStrictEqual([]);
  });

  it("hold it to each pool's site once", () => {
    expect(
      l4SitesOf(l4ExposuresOf(application, "broker"), platform),
    ).toStrictEqual(["enschede"]);
  });

  // REQ-097: a node address holds the Process to its node, and to no site.
  it("hold it to each node address's node once, and a pool's node to none", () => {
    const onNodes = {
      l4Addresses: {
        ...platform.l4Addresses,
        "mail-smtp": { kind: "node" as const, node: "enschede-1" },
        "mail-imap": { kind: "node" as const, node: "enschede-1" },
      },
    };
    const exposures = [
      entry("broker", "mail-smtp"),
      entry("broker", "mail-imap"),
      entry("broker", "lan-mqtt"),
    ];
    expect(l4NodesOf(exposures, onNodes)).toStrictEqual(["enschede-1"]);
    expect(l4SitesOf(exposures, onNodes)).toStrictEqual(["enschede"]);
    expect(
      l4NodesOf(l4ExposuresOf(application, "broker"), platform),
    ).toStrictEqual([]);
    expect(l4SitesOf([entry("broker", "mail-smtp")], onNodes)).toStrictEqual(
      [],
    );
  });
});

// REQ-098 (docs/requirements.md): an agent the facts derive needs its catalog
// entry, and its images are ones the lock holds.
describe("the Node Agent catalog", () => {
  const notes = (options: Options) =>
    codesAndPaths(resolve(one(serving("notes-api")), options));
  const codesAndPaths = (result: ReturnType<typeof resolve>) =>
    result.ok
      ? []
      : result.diagnostics.map(({ code, path }) => ({ code, path }));

  it("refuses an agent the facts derive that the catalog holds no entry for", () => {
    expect(
      notes({
        platform: (platform) =>
          platform.replace(/\n {2}gpu-device: .*\n/, "\n"),
      }),
    ).toStrictEqual([
      { code: "E_NO_NODE_AGENT_POLICY", path: "/nodeAgents/gpu-device" },
    ]);
    expect(
      notes({
        platform: (platform) =>
          platform.replace(/\nnodeAgents:\n( {2}.*\n)+/, "\n"),
      }).map(({ path }) => path),
    ).toStrictEqual([
      "/nodeAgents/gpu-device",
      "/nodeAgents/gpu-metrics",
      "/nodeAgents/node-metrics",
      "/nodeAgents/l4-speaker",
    ]);
  });

  it("says which agent runs where, and what is missing", () => {
    const refused = resolve(one(serving("notes-api")), {
      platform: (platform) =>
        platform.replace(/\n {2}node-metrics: .*\n/, "\n"),
      lock: (lock) => lock.replace(/\n {2}dcgm-exporter:\n( {4}.*\n)+/, "\n"),
    });
    expect(
      refused.ok
        ? []
        : refused.diagnostics.map(({ message, hint }) => ({ message, hint })),
    ).toStrictEqual([
      {
        message:
          "node-metrics runs on enschede-t1000-1,enschede-rx7900xtx-1,enschede-gtx-960m-1,enschede-pi-1,enschede-pi-2,enschede-pi-3,frankfurt-contabo-1, and the catalog names no image for it",
        hint: "Declare `nodeAgents.node-metrics` in the Platform document: its image, memory and cpu.",
      },
      {
        message: "the images lock holds no entry for dcgm-exporter",
        hint: "Lock the alias, or name one the images lock holds.",
      },
    ]);
  });

  it("refuses the GPU agents where the platform names no runtime class for their cards", () => {
    const ungpued = (platform: string) =>
      platform.replace(/\ngpus:\n( {2}.*\n)+/, "\n");
    const refused = resolve(one(serving("notes-api")), { platform: ungpued });
    expect(
      refused.ok
        ? []
        : refused.diagnostics.map(({ code, path, message, hint }) => ({
            code,
            path,
            message,
            hint,
          })),
    ).toStrictEqual([
      {
        code: "E_NO_GPU_POLICY",
        path: "/gpus",
        message:
          "the GPU agents run on nvidia cards, and the platform names no runtime class for them",
        hint: "Add the vendor to the Platform document's `gpus`.",
      },
    ]);
    // With no nvidia card in the contract, no GPU agent runs, and none needs
    // it; the Platform document pins the contract it is read with.
    const amd = (contract: string) =>
      contract.replaceAll("vendor: nvidia", "vendor: amd");
    const contract = readNodeContract(
      parseYaml(amd(text("platform/node-contract.yml"))),
    );
    if (!contract.ok) throw new Error("the edited contract did not read");
    const pinned = sha256Hasher(contract.value);
    expect(
      notes({
        platform: (platform) =>
          ungpued(platform).replace(
            /nodeContract: "[^"]*"/,
            `nodeContract: "${pinned}"`,
          ),
        contract: amd,
      }),
    ).toStrictEqual([]);
  });

  it("refuses an agent's image, or its controller's, that the lock does not hold", () => {
    expect(
      notes({
        lock: (lock) =>
          lock
            .replace(/\n {2}node-exporter:\n( {4}.*\n)+/, "\n")
            .replace(/\n {2}metallb-controller:\n( {4}.*\n)+/, "\n"),
      }),
    ).toStrictEqual([
      { code: "E_UNLOCKED_IMAGE", path: "/nodeAgents/node-metrics/image" },
      {
        code: "E_UNLOCKED_IMAGE",
        path: "/nodeAgents/l4-speaker/controller/image",
      },
    ]);
  });
});

// REQ-093 (docs/requirements.md): a receiver's webhook is granted to the
// Alertmanager's first Process alone.
describe("a receiver's credential", () => {
  it("is granted to the Alertmanager's first Process, and no other", () => {
    const result = resolve(one(serving("notes-api")), {
      foundation: (name, text) =>
        name === "observability/observability.project.yml"
          ? text +
            `      - name: alertmanager-sidecar
        lifecycle: application
        image: alertmanager
        runtime: none
        provides: { admin: 9094 }
        placement: { memory: 64Mi, cpu: 10m }
        probes:
          readiness: { tcp: 9094 }
        startupBudget: 20s
        cutover: continuous
`
          : text,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    const alertmanager = result.value.projects
      .find(({ project }) => project === "observability")
      ?.applications.find(({ id }) => id === "alertmanager");
    const paths = alertmanager?.processes.map(({ name, secrets }) => [
      name,
      (secrets ?? []).map((grant) => ("path" in grant ? grant.path : "")),
    ]);

    expect(paths).toStrictEqual([
      ["alertmanager", ["secret/data/platform/alertmanager-discord"]],
      ["alertmanager-sidecar", []],
    ]);
  });
});

// REQ-097: a pool holds as many copies as the Process runs, and a blue/green
// switch, so neither refusal of a node's own address reaches a pool.
describe("a replicated Process on a pool", () => {
  it("is refused neither its replicas nor its continuous cutover", () => {
    const codes = codesOf(
      resolve(
        one(
          serving(
            "notes-api",
            "        replicas: { count: 2, reason: two copies serve while one restarts }\n",
          ),
        ).replace(
          "    processes:\n",
          "    l4Exposure:\n      - { address: lan-dns, port: 8080, protocol: tcp, process: notes-api, surface: http }\n    processes:\n",
        ),
      ),
    );
    expect(codes).not.toContain("E_NODE_ADDRESS_REPLICATED");
    expect(codes).not.toContain("E_CUTOVER_UNHONOURABLE");
  });
});

// REQ-112 (docs/requirements.md): a change an engine's data cannot follow in
// place derives a Move, refused where the set cannot carry it.
describe("a Move", () => {
  const store = (extra = "", engine = "postgres", surface = "postgres") =>
    one(`      - name: store
        lifecycle: application
        image: notes-api
        runtime: none
        engine: ${engine}
        provides: { ${surface}: 5432 }
        placement: { memory: 64Mi, cpu: 10m }
        cutover: interrupted
        volumes: [{ claim: data, mountAt: /data, size: 1Gi, durability: recoverable }]
${extra}`);
  const versioned = (version: string) => (lock: string) =>
    lock.replace(
      /(\n {2}notes-api:\n(?: {4}.*\n)*? {4}version: )"[^"]*"/,
      `$1"${version}"`,
    );
  const recorded =
    (instance: string, capturedAt?: string) => (name: string, body: string) =>
      name === "platform/cluster-state.yml"
        ? `${capturedAt === undefined ? body : body.replace(/capturedAt: "[^"]*"/, `capturedAt: "${capturedAt}"`)}instances:\n  - {application: notes, instance: store, ${instance}}\n`
        : body;
  const SOURCE =
    "version: 16.4.0, namespace: notes-system, node: enschede-t1000-1";
  const moving = (extra = "", instance = SOURCE, options: Options = {}) =>
    resolve(store(extra), {
      lock: versioned("17.2.0"),
      foundation: recorded(instance),
      ...options,
    });
  const codes = (result: ReturnType<typeof resolve>) => notesCodesOf(result);
  const AT = "/applications/0/processes/0";
  const refused = (result: ReturnType<typeof resolve>) =>
    result.ok
      ? []
      : result.diagnostics
          .filter(({ document }) => document === "minimal/notes.project.yml")
          .map(({ code, path, message, hint }) => ({
            code,
            path,
            message,
            hint,
          }));
  const moveOf = (result: ReturnType<typeof resolve>) =>
    result.ok
      ? result.value.projects.find(({ project }) => project === "notes")
          ?.applications[0]?.processes[0]?.move
      : undefined;

  it("is derived from a version change in the component its engine breaks on, acknowledged where it cannot be rolled back", () => {
    const move = moveOf(moving("        rollback: forward-only\n"));

    expect(move).toMatchObject({
      triggers: ["version"],
      source: {
        version: "16.4.0",
        namespace: "notes-system",
        node: "enschede-t1000-1",
      },
      target: { version: "17.2.0", namespace: "notes-system" },
      identity: "store-move",
      reversible: false,
      bounds: { timeout: "300s", retention: "7d" },
    });
    expect(move?.method?.image).toMatch(/postgres-move@sha256:/);
  });

  it("derives nothing from an image the lock does not hold, which is refused as unlocked", () => {
    expect(
      codes(
        resolve(store().replace("image: notes-api", "image: notes-unlocked"), {
          foundation: recorded(SOURCE),
        }),
      ),
    ).toStrictEqual(["E_UNLOCKED_IMAGE"]);
  });

  it("derives nothing where the Process resolves to what its active Instance is", () => {
    const result = resolve(store(), {
      lock: versioned("16.4.0"),
      foundation: recorded(SOURCE),
    });

    expect(codes(result)).toStrictEqual([]);
    expect(moveOf(result)).toBeUndefined();
  });

  it("is refused where it cannot be rolled back and nobody acknowledged it", () => {
    expect(refused(moving())).toStrictEqual([
      {
        code: "E_MOVE_IRREVERSIBLE",
        path: AT,
        message:
          "store moves from 16.4.0 to 17.2.0, and its method cannot replicate back, so a rollback would lose what was written after the fence",
        hint: "Write `rollback: forward-only` on the Process to accept it for this release, or move to a version the method can reverse.",
      },
    ]);
  });

  it("refuses an acknowledgement where no irreversible Move is derived", () => {
    expect(
      refused(
        resolve(store("        rollback: forward-only\n"), {
          lock: versioned("16.5.0"),
          foundation: recorded(SOURCE),
        }),
      ),
    ).toStrictEqual([
      {
        code: "E_FORWARD_ONLY_UNUSED",
        path: `${AT}/rollback`,
        message:
          "store acknowledges a Move that cannot be rolled back, and this release derives none",
        hint: "Remove `rollback: forward-only`: it acknowledges the one Move derived in its release, and no other.",
      },
    ]);
  });

  it("is refused for an engine that names no move method, naming each change", () => {
    // Its data is bound to a node its placement no longer admits, in a
    // namespace it no longer resolves to.
    const bound = (name: string, body: string) =>
      recorded("version: 1.4.0, namespace: other-system, node: gone-1")(
        name,
        body,
      ).replace("bindings: []", "bindings: [{claim: data, node: gone-1}]");

    expect(
      refused(
        resolve(store("", "rabbitmq", "management"), { foundation: bound }),
      ),
    ).toStrictEqual([
      {
        code: "E_MOVE_UNSUPPORTED",
        path: AT,
        message:
          "store changes its namespace and binding in a way its data cannot follow in place, and engine rabbitmq names no move method",
        hint: "Name a `move` method for the engine in the Platform document, or keep the Process where its data is.",
      },
    ]);
  });

  it("is refused under a platform that names no move policy", () => {
    expect(
      refused(
        moving("        rollback: forward-only\n", SOURCE, {
          platform: (document) =>
            document.replace(/\n {2}move:\n(?: {4}[^\n]*\n)+/, "\n"),
        }),
      ),
    ).toStrictEqual([
      {
        code: "E_NO_MOVE_POLICY",
        path: AT,
        message:
          "store derives a Move of its version, and the platform names no move policy to bound it",
        hint: "Add `delivery.move` with its `timeout` and `retention` to the Platform document.",
      },
    ]);
  });

  it("is refused where a second change comes while one is open", () => {
    expect(
      refused(
        moving(
          "        rollback: forward-only\n",
          `${SOURCE}, phase: lag, target: {name: store-0123456789ab, version: 17.1.0, namespace: notes-system}`,
        ),
      ),
    ).toStrictEqual([
      {
        code: "E_MOVE_OPEN",
        path: AT,
        message:
          "store changes again while its Move to 17.1.0 in notes-system is open",
        hint: "Let the open Move finish and its source retire before changing what it is moving.",
      },
    ]);
    // A Move open to another namespace is as open.
    expect(
      codes(
        moving(
          "        rollback: forward-only\n",
          `${SOURCE}, phase: sync, target: {name: store-0123456789ab, version: 17.2.0, namespace: storage-system}`,
        ),
      ),
    ).toStrictEqual(["E_MOVE_OPEN"]);
    // The same Move, still open, derives as it was, at its phase.
    expect(
      moveOf(
        moving(
          "        rollback: forward-only\n",
          `${SOURCE}, phase: lag, target: {name: store-0123456789ab, version: 17.2.0, namespace: notes-system}`,
        ),
      )?.phase,
    ).toBe("lag");
  });

  it("moves a Process with no engine that changes namespace, with no data to carry and nothing a rollback loses", () => {
    const move = moveOf(
      resolve(one(serving("store")), {
        foundation: recorded(
          "version: 1.4.0, namespace: old-system, node: enschede-t1000-1",
        ),
      }),
    );

    expect(move).toMatchObject({
      triggers: ["namespace"],
      target: { namespace: "notes-system" },
      reversible: true,
    });
    expect(move).not.toHaveProperty("method");
  });

  it("carries what its Jobs run, hold and reach, and what bounds them", () => {
    const move = moveOf(moving("        rollback: forward-only\n"));

    expect(move?.source.instance).toBe("store");
    // Beside its source, the target is named by the release that renders it.
    expect(move?.target).not.toHaveProperty("instance");
    expect(move?.bounds).toStrictEqual({
      timeout: "300s",
      retention: "7d",
      memory: "128Mi",
      cpu: "100m",
    });
    expect(move?.server?.length).toBeGreaterThan(0);
    expect(move?.method).toMatchObject({
      uid: expect.any(Number) as number,
      gid: expect.any(Number) as number,
      port: 5432,
      credential: {
        path: "secret/data/notes/store/move",
        access: "read",
        delivery: "self",
      },
    });
    expect(
      move?.method?.egress.map(({ rule, namespace, process, port }) => [
        rule,
        namespace,
        process,
        port,
      ]),
    ).toStrictEqual([
      ["datastore", "notes-system", "store", 5432],
      ["secret-store", "secrets-system", "vault", 8200],
      ["cluster-dns", "kube-system", undefined, 53],
    ]);
  });

  it("names the Secret Store for an Application whose Move logs in with a credential", () => {
    const storeOf = (result: ReturnType<typeof resolve>) =>
      result.ok
        ? result.value.projects.find(({ project }) => project === "notes")
            ?.applications[0]?.secretStore
        : undefined;

    // A volume nothing backs up holds no credential of its own.
    const unbacked = (version: string, extra = "") =>
      resolve(
        store(extra).replace(
          "durability: recoverable",
          "durability: reconstructible",
        ),
        { lock: versioned(version), foundation: recorded(SOURCE) },
      );
    const still = unbacked("16.4.0");

    expect(
      storeOf(unbacked("17.2.0", "        rollback: forward-only\n")),
    ).toBe("http://vault.secrets-system.svc.cluster.local:8200");
    expect(still.ok).toBe(true);
    expect(storeOf(still)).toBeUndefined();
  });

  it("names its target as the gate recorded it, and keeps the Process's name in a namespace of its own", () => {
    const recordedTarget = moveOf(
      moving(
        "        rollback: forward-only\n",
        `${SOURCE}, phase: sync, target: {name: store-0123456789ab, version: 17.2.0, namespace: notes-system}`,
      ),
    );
    const elsewhere = moveOf(
      resolve(store("        rollback: forward-only\n"), {
        lock: versioned("17.2.0"),
        foundation: recorded(
          "version: 16.4.0, namespace: old-system, node: enschede-t1000-1",
        ),
      }),
    );

    expect(recordedTarget?.target.instance).toBe("store-0123456789ab");
    expect(elsewhere?.target.instance).toBe("store");
    // Both Instances, wherever each runs, on the engine's surface.
    expect(
      elsewhere?.method?.egress
        .filter(({ rule }) => rule === "datastore")
        .map(({ namespace }) => namespace),
    ).toStrictEqual(["old-system", "notes-system"]);
  });

  it("serves under the target's name once its flip has held, and under the recorded one before", () => {
    const serving = (instance: string, capturedAt?: string) => {
      const result = resolve(store(), {
        lock: versioned("16.4.0"),
        foundation: recorded(instance, capturedAt),
      });
      return result.ok
        ? result.value.projects.find(({ project }) => project === "notes")
            ?.applications[0]?.processes[0]
        : undefined;
    };

    expect(serving(SOURCE)).not.toHaveProperty("instance");
    expect(serving(`name: store-aaaaaaaaaaaa, ${SOURCE}`)?.instance).toBe(
      "store-aaaaaaaaaaaa",
    );
    expect(
      serving(
        `${SOURCE}, phase: retire, flippedAt: "2026-09-01T00:00:00Z", target: {name: store-0123456789ab, version: 16.4.0, namespace: notes-system}`,
        "2026-09-30T00:00:00Z",
      )?.instance,
    ).toBe("store-0123456789ab");
  });

  it("retires once its flip has held past the retention, and derives nothing more", () => {
    const retired = resolve(store(), {
      lock: versioned("17.2.0"),
      foundation: recorded(
        `${SOURCE}, phase: retire, flippedAt: "2026-09-01T00:00:00Z"`,
        "2026-09-30T00:00:00Z",
      ),
    });

    expect(codes(retired)).toStrictEqual([]);
    expect(moveOf(retired)).toBeUndefined();
  });
});

// REQ-111 (docs/requirements.md): every surface an edge or a tier's
// forward-auth names derives a Stable Address targeting its active Instance.
describe("a Stable Address", () => {
  const consumer = `${one(
    serving(
      "notes-api",
      "        dependsOn:\n          - { application: notes-store, surface: store }\n",
    ),
  )}  - id: notes-store
    processes:
${serving("notes-store").replace("provides: { http: 8080 }", "provides: { store: 7000 }")}`;

  it("is derived for each surface an edge names, targeting where its Instance serves", () => {
    const result = resolve(consumer);
    const addresses = result.ok ? result.value.stableAddresses : [];

    expect(
      addresses.find(({ name }) => name === "notes-store-store"),
    ).toStrictEqual({
      name: "notes-store-store",
      target: "notes-store.notes-system.svc.cluster.local",
      port: 7000,
      consumers: ["notes"],
    });
  });

  it("targets where ClusterState records the surface's Instance serving, and its target once the flip has held", () => {
    const target = (instance: string) => {
      const result = resolve(consumer, {
        foundation: (name, body) =>
          name === "platform/cluster-state.yml"
            ? `${body}instances:\n  - {application: notes-store, instance: notes-store, ${instance}}\n`
            : body,
      });
      return (result.ok ? result.value.stableAddresses : []).find(
        ({ name }) => name === "notes-store-store",
      )?.target;
    };
    const SERVING =
      "version: 1.4.0, namespace: notes-system, node: enschede-t1000-1";
    const OPEN = `${SERVING}, phase: unfence, target: {name: notes-store-0123456789ab, version: 1.4.0, namespace: notes-system}`;

    expect(target(`name: notes-store-aaaaaaaaaaaa, ${SERVING}`)).toBe(
      "notes-store-aaaaaaaaaaaa.notes-system.svc.cluster.local",
    );
    expect(target(OPEN)).toBe("notes-store.notes-system.svc.cluster.local");
    expect(target(`${OPEN}, flippedAt: "2026-09-30T00:00:00Z"`)).toBe(
      "notes-store-0123456789ab.notes-system.svc.cluster.local",
    );
  });

  it("is not derived for a surface nothing names", () => {
    const result = resolve(consumer);

    expect(
      (result.ok ? result.value.stableAddresses : []).map(({ name }) => name),
    ).not.toContain("notes-api-http");
  });
});

// REQ-107 (docs/requirements.md): a Process creates pods only from a declared
// spawn template, which derives their rules, labels and policy.
describe("a spawn template", () => {
  // Creating pods in its own namespace is no privileged role.
  const admitted = (document: string): string =>
    document.replace(
      "  namespaceHolders: [",
      "  namespaceHolders: [notes/notes, ",
    );
  const SPAWNS = `        spawns:
          - name: runner
            image: notes-api
            placement: { memory: 256Mi, cpu: 100m }
            provides: { http: 8090 }
            dependsOn:
              - { application: notes-store, surface: store }
            egress: { to: internet, reason: it clones what it is asked to work on }
`;
  const project = `${one(serving("notes-api", SPAWNS))}  - id: notes-store
    processes:
${serving("notes-store").replace("provides: { http: 8080 }", "provides: { store: 7000 }")}`;
  const LOCKED = (() => {
    const notes = LOCK.images["notes-api"];
    return `${notes?.repository ?? ""}@${notes?.digest ?? ""}`;
  })();

  it("hands its Process the template's pinned image and every label its pods carry", () => {
    const environment = processOf(project, { platform: admitted }).environment;

    expect(
      environment?.filter(({ name }) => name.startsWith("SPAWN_")),
    ).toStrictEqual([
      { name: "SPAWN_RUNNER_IMAGE", value: LOCKED },
      {
        name: "SPAWN_RUNNER_LABELS",
        value:
          "deploy-kit.jorisjonkers.dev/spawned-from=notes-api-runner,consumes.deploy-kit.jorisjonkers.dev/notes-store.store=true",
      },
    ]);
  });

  it("names a template's variables with every character a variable cannot hold as `_`", () => {
    const names = processOf(
      project.replace("- name: runner", "- name: deep-runner.2"),
      {
        platform: admitted,
      },
    ).environment?.flatMap(({ name }) =>
      name.startsWith("SPAWN_") ? [name] : [],
    );

    expect(names).toStrictEqual([
      "SPAWN_DEEP_RUNNER_2_IMAGE",
      "SPAWN_DEEP_RUNNER_2_LABELS",
    ]);
  });

  it("derives the namespaced rules that create and remove its pods, beside any the Process declares", () => {
    const api = processOf(project, { platform: admitted }).api;

    // A Process that declares no api of its own holds them for its templates.
    expect(api?.reason).toBe("it creates the pods its spawn templates declare");
    expect(api?.rules).toStrictEqual([
      {
        group: "core",
        objects: ["pods"],
        verbs: ["get", "list", "watch", "create", "delete"],
        scope: "namespace",
      },
      {
        group: "core",
        objects: ["pods/log"],
        verbs: ["get"],
        scope: "namespace",
      },
    ]);
  });

  it("resolves what its pods run, request, serve and reach", () => {
    const [spawn] = processOf(project, { platform: admitted }).spawns ?? [];

    expect(spawn).toMatchObject({
      name: "runner",
      image: LOCKED,
      memory: "256Mi",
      cpu: "100m",
      selector: "notes-api-runner",
      surfaces: [{ name: "http", port: 8090 }],
      consumes: ["notes-store.store"],
      internetEgress: { reason: "it clones what it is asked to work on" },
    });
    expect(spawn?.dependencies?.[0]).toMatchObject({
      application: "notes-store",
      surface: "store",
      peers: [{ process: "notes-store", port: 7000 }],
    });
  });

  it("resolves a template that serves, reaches and asks for nothing to its pods alone", () => {
    const bare = SPAWNS.split("            provides:")[0] ?? "";
    const process = processOf(one(serving("notes-api", bare)), {
      platform: admitted,
    });

    expect(process.identityToken).toBe(true);
    expect(process.spawns).toStrictEqual([
      {
        name: "runner",
        image: LOCKED,
        imageVersion: LOCK.images["notes-api"]?.version,
        uid: 1000,
        gid: 1000,
        memory: "256Mi",
        cpu: "100m",
        selector: "notes-api-runner",
        egress: [{ rule: "cluster-dns", namespace: "kube-system", port: 53 }],
      },
    ]);
  });

  it("is refused an image the lock does not hold, at the template", () => {
    const result = resolve(
      project.replace(
        "            image: notes-api",
        "            image: notes-unlocked",
      ),
      { platform: admitted },
    );

    expect(
      result.ok ? [] : result.diagnostics.map(({ code, path }) => [code, path]),
    ).toContainEqual([
      "E_UNLOCKED_IMAGE",
      "/applications/0/processes/0/spawns/0/image",
    ]);
  });

  it("is refused an edge to an Application nothing declares, at the template", () => {
    const result = resolve(one(serving("notes-api", SPAWNS)), {
      platform: admitted,
    });

    expect(
      result.ok ? [] : result.diagnostics.map(({ code, path }) => [code, path]),
    ).toContainEqual([
      "E_UNRESOLVED_APPLICATION",
      "/applications/0/processes/0/spawns/0/dependsOn/0",
    ]);
  });

  it("is refused where the platform does not admit its Application to hold API access", () => {
    const result = resolve(project);

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, path, hint }) => ({
            code,
            path,
            hint,
          })),
    ).toStrictEqual([
      {
        code: "E_PROCESS_RBAC_GRANT",
        path: "/applications/0/processes/0/spawns",
        hint: "Name the Application in the Platform document's `apiAccess.holders` as `<project>/<application>`, under an id no other Application carries, or drop `spawns`.",
      },
    ]);
  });
});

// REQ-106 (docs/requirements.md): an api rule reaches the cluster unless it
// says its Process's namespace.
describe("a Process's Kubernetes API access", () => {
  const admitted = (document: string): string =>
    document.replace("  holders: [", "  holders: [notes/notes, ");
  const holding = (rules: string) =>
    processOf(
      one(
        serving(
          "notes-api",
          `        api:\n          reason: it reads what the cluster holds\n          rules:\n${rules}`,
        ),
      ),
      { platform: admitted },
    ).api?.rules.map(({ objects, scope }) => [objects.join(","), scope]);

  // Admitted to its own namespace alone: no privileged role.
  const local = (document: string): string =>
    document.replace(
      "  namespaceHolders: [",
      "  namespaceHolders: [notes/notes, ",
    );

  // REQ-108 (docs/requirements.md): a Process that reaches the API with its
  // users' own tokens holds nothing of its own, and mounts the token an
  // in-cluster client finds the API server by.
  it("reaches the API without holding a rule, and mounts the token that finds the API server", () => {
    const resolved = processOf(
      one(
        serving(
          "notes-api",
          "        api:\n          reason: it acts on the API with each signed-in user's own token\n",
        ),
      ),
      { platform: local },
    );

    expect(resolved.api?.rules).toStrictEqual([]);
    expect(resolved.api?.server).toStrictEqual([
      { cidr: "10.43.0.1/32", port: 443 },
    ]);
    expect(resolved.identityToken).toBe(true);
  });

  it("holds namespace rules under a platform that admits its Application to its namespace alone", () => {
    expect(
      processOf(
        one(
          serving(
            "notes-api",
            "        api:\n          reason: it keeps its sessions beside itself\n          rules:\n            - { group: core, objects: [configmaps], verbs: [create], scope: namespace }\n",
          ),
        ),
        { platform: local },
      ).api?.rules.map(({ scope }) => scope),
    ).toStrictEqual(["namespace"]);
  });

  it("refuses a rule that reaches the cluster, where the platform admits its Application to its namespace alone", () => {
    const refused = resolve(
      one(
        serving(
          "notes-api",
          "        api:\n          reason: it keeps its sessions beside itself\n          rules:\n            - { group: core, objects: [configmaps], verbs: [create], scope: namespace }\n            - { group: core, objects: [nodes, namespaces], verbs: [get] }\n",
        ),
      ),
      { platform: local },
    );

    expect(
      refused.ok
        ? []
        : refused.diagnostics
            .filter(({ document }) => document === "minimal/notes.project.yml")
            .map(({ code, path, message, hint }) => [
              code,
              path,
              message,
              hint,
            ]),
    ).toStrictEqual([
      [
        "E_PROCESS_RBAC_GRANT",
        "/applications/0/processes/0/api/rules/1",
        "notes-api asks the whole cluster for nodes, namespaces, and the platform admits the Application notes only to its own namespace",
        "Scope the rule `namespace`, or name the Application in the Platform document's `apiAccess.holders` instead of `namespaceHolders`.",
      ],
    ]);
  });

  it("reaches the cluster where a rule names no scope, and its namespace where it says so", () => {
    expect(
      holding(
        "            - { group: core, objects: [pods], verbs: [get] }\n            - { group: core, objects: [configmaps], verbs: [create], scope: namespace }\n",
      ),
    ).toStrictEqual([
      ["pods", "cluster"],
      ["configmaps", "namespace"],
    ]);
  });
});

// REQ-105 (docs/requirements.md): a Process that serves DNS resolves through
// the platform's upstream nameservers, never the cluster's own DNS.
describe("a Process that serves DNS", () => {
  const ON_53 =
    // lan-mqtt: the worked utility resolver holds lan-dns.
    "    l4Exposure:\n      - { address: lan-mqtt, port: 53, protocol: udp, process: notes-api, surface: dns }\n      - { address: lan-mqtt, port: 53, protocol: tcp, process: notes-api, surface: dns }\n    processes:\n";
  const servesDns = one(
    serving("notes-api").replace(
      "provides: { http: 8080 }",
      "provides: { http: 8080, dns: 5353 }",
    ),
  ).replace("    processes:\n", ON_53);
  // The worked Platform document names the upstream nameservers.
  const without = (document: string): string =>
    document.replace(
      /\n {2}upstreamNameservers: [^\n]*\n( {2}#[^\n]*\n)*/,
      "\n",
    );
  const rules = (process: ReturnType<typeof processOf>): string[] =>
    (process.egress ?? []).map(({ rule }) => rule);

  it("resolves names through the platform's upstream nameservers, and not the cluster's DNS", () => {
    const resolved = processOf(servesDns);

    expect(resolved.nameservers).toStrictEqual(["9.9.9.10", "149.112.112.10"]);
    expect(rules(resolved)).not.toContain("cluster-dns");
  });

  it("leaves a Process exposed on another port with the cluster's DNS", () => {
    const resolved = processOf(
      servesDns.replaceAll("port: 53,", "port: 5300,"),
    );

    expect(resolved).not.toHaveProperty("nameservers");
    expect(rules(resolved)).toContain("cluster-dns");
  });

  it("keeps every other peer its policy admits, the Secret Store's among them", () => {
    const grant =
      "        secrets:\n          - { path: secret/data/notes/key, keys: [key], access: read, delivery: file, mountAt: /run/key, fileMode: '0400', rotation: {tolerates: restart} }\n";
    const holding = one(
      serving("notes-api", grant).replace(
        "provides: { http: 8080 }",
        "provides: { http: 8080, dns: 5353 }",
      ),
    ).replace("    processes:\n", ON_53);

    expect(rules(processOf(holding))).toStrictEqual(["secret-store"]);
  });

  it("is refused at each Process's first entry on port 53, whatever comes before it", () => {
    const two = `  - id: notes
    l4Exposure:
      - { address: lan-dns, port: 53, protocol: udp, process: notes-dns, surface: dns }
      - { address: lan-mqtt, port: 8080, protocol: tcp, process: notes-api, surface: http }
      - { address: lan-mqtt, port: 53, protocol: udp, process: notes-api, surface: dns }
    processes:
${serving("notes-api").replace("provides: { http: 8080 }", "provides: { http: 8080, dns: 5353 }")}${serving("notes-dns").replace("provides: { http: 8080 }", "provides: { dns: 5353 }")}`;
    const result = resolve(two, { platform: without });

    expect(
      result.ok
        ? []
        : result.diagnostics
            .filter(
              ({ code, document }) =>
                code === "E_NO_UPSTREAM_NAMESERVERS" &&
                document === "minimal/notes.project.yml",
            )
            .map(({ path }) => path),
    ).toStrictEqual([
      "/applications/0/l4Exposure/0",
      "/applications/0/l4Exposure/2",
    ]);
  });

  it("is refused under a platform that names no upstream nameservers", () => {
    expect(
      notesCodesOf(resolve(servesDns, { platform: without })),
    ).toStrictEqual(["E_NO_UPSTREAM_NAMESERVERS"]);
  });
});

// REQ-091: only the Process of a tier's proxy that serves `web`, under a tier
// that names its class, carries the edge proxy's configuration; and a tier's
// forward-auth whose provider the set does not hold asks nothing.
describe("a tier's proxy, read from the set", () => {
  const resolved = (options: Options = {}) => {
    const result = resolve(one(serving("notes-api")), options);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.value;
  };
  const edgeProcesses = (options: Options = {}) =>
    projectNamed([...resolved(options).projects], "edge")
      .applications.find(({ id }) => id === "traefik-public")
      ?.processes.map(({ name, edgeProxy }) => [name, edgeProxy !== undefined]);

  it("asks no forward-auth provider the set does not hold", () => {
    expect(resolved().forwardAuths).toStrictEqual([]);
  });

  it("configures no proxy under a tier that names no class", () => {
    expect(
      edgeProcesses({
        platform: (platform) =>
          platform.replace(/\n {4}ingressClass: traefik-public[^\n]*/, ""),
        // Grafana's exposure is on that tier, and no proxy would admit it.
        foundation: (name, text) =>
          name === OBSERVABILITY
            ? text.replace(/\n {4}exposure:\n(?: {6}.*\n)+/, "\n")
            : text,
      }),
    ).toStrictEqual([["traefik-public", false]]);
  });

  it("configures the proxy's Process that serves web, and no other", () => {
    expect(
      edgeProcesses({
        foundation: (name, text) =>
          name === "edge/edge.project.yml"
            ? text.replace(
                "  - id: traefik-lan\n",
                `      - name: traefik-public-logs
        lifecycle: application
        image: traefik
        runtime: none
        placement: { memory: 32Mi, cpu: 10m }
        probes: none
        startupBudget: 20s
        cutover: continuous

  - id: traefik-lan\n`,
              )
            : text,
      }),
    ).toStrictEqual([
      ["traefik-public", true],
      ["traefik-public-logs", false],
    ]);
  });
});

// REQ-099 (docs/requirements.md): a tier names the L4 Address its proxy
// listens on, and its listener derives the ports: 80 to the proxy's `web`
// surface, and on a `tls` listener 443 to `websecure` as well.
describe("a tier's address", () => {
  const platform = parsePlatformIntent(PLATFORM);
  const edge = parseProjectIntent(text("edge/edge.project.yml"));
  if (!platform.ok || !edge.ok)
    throw new Error("the worked inputs did not read");
  const applicationNamed = (id: string) =>
    edge.value.document.applications.find(
      (application) => application.id === id,
    ) as ApplicationDocument;
  const entry = (
    address: string,
    port: number,
    process: string,
    surface: string,
  ) => ({
    address,
    port,
    protocol: "tcp" as const,
    process,
    surface,
  });

  it("derives 80 and 443 on a tls tier's proxy, and 80 alone on a plain one's", () => {
    expect(
      tierExposuresOf(
        platform.value.document,
        "edge",
        applicationNamed("traefik-public"),
      ),
    ).toStrictEqual([
      entry("edge-frankfurt", 80, "traefik-public", "web"),
      entry("edge-frankfurt", 443, "traefik-public", "websecure"),
    ]);
    expect(
      tierExposuresOf(
        platform.value.document,
        "edge",
        applicationNamed("traefik-lan"),
      ),
    ).toStrictEqual([entry("lan-edge", 80, "traefik-lan", "web")]);
  });

  /** notes-api provides both surfaces a tls tier's listener reaches. */
  const answering = serving("notes-api")
    .replace(
      "provides: { http: 8080 }",
      "provides: { web: 8000, websecure: 8443 }",
    )
    .replace(
      "readiness: { path: /ready, port: 8080 }",
      "readiness: { path: /ready, port: 8000 }",
    )
    .replace(
      "liveness: { path: /live, port: 8080 }",
      "liveness: { path: /live, port: 8000 }",
    );
  /** The public tier, an acme one, proxied by notes. */
  const proxiedByNotes = {
    platform: (document: string) =>
      document
        .replace("traefik: edge/traefik-public", "traefik: notes/notes")
        .replace(/\n {4}address: edge-frankfurt[^\n]*/, ""),
  };

  it("hands an acme proxy its DNS token beside its own variables, in name order", () => {
    const proxy = processOf(one(answering), proxiedByNotes);
    expect(proxy.environment?.map(({ name }) => name)).toStrictEqual([
      "CF_DNS_API_TOKEN",
      "DEPLOYMENT_ENVIRONMENT",
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "OTEL_SERVICE_NAME",
    ]);
  });

  it("derives an acme tier on the proxy's Process that answers it, and on no other Process of the proxy", () => {
    const [proxy, other] = application(
      one(`${answering}${serving("notes-worker")}`),
      proxiedByNotes,
    ).processes;
    const derived = (process: typeof proxy) => ({
      token: process?.environment?.some(
        ({ name }) => name === "CF_DNS_API_TOKEN",
      ),
      claim: process?.volumes?.some(({ claim }) => claim === "acme") ?? false,
    });
    expect(derived(proxy)).toStrictEqual({ token: true, claim: true });
    expect(derived(other)).toStrictEqual({ token: false, claim: false });
  });

  it("derives on an acme tier's proxy its resolver, claim, token and way out", () => {
    const proxy = projectNamed(
      projects(one(serving("notes-api"))),
      "edge",
    ).applications.find(({ id }) => id === "traefik-public")?.processes[0];
    expect(proxy?.edgeProxy).toStrictEqual({
      ingressClass: "traefik-public",
      tls: true,
      resolver: {
        name: "public-frankfurt",
        email: "hostmaster@jorisjonkers.dev",
        dnsProvider: "cloudflare",
        storage: "/acme/public-frankfurt.json",
      },
    });
    expect(proxy?.volumes?.find(({ claim }) => claim === "acme")).toMatchObject(
      {
        mountAt: "/acme",
        size: "16Mi",
        durability: "reconstructible",
      },
    );
    expect(proxy?.secrets).toContainEqual({
      path: "secret/data/platform/cloudflare",
      keys: ["CF_DNS_API_TOKEN"],
      access: "read",
      delivery: "env",
      destination: "traefik-public-platform-cloudflare",
      restartTargets: ["traefik-public"],
    });
    expect(proxy?.internetEgress).toStrictEqual({
      reason: "ACME issuance and its DNS challenge",
    });
  });

  it("refuses a port a tier derives on a node that another exposure dials there, at both", () => {
    const refused = resolve(
      one(
        serving("notes-api").replace(
          "cutover: continuous",
          "cutover: interrupted",
        ),
      ).replace(
        "    processes:\n",
        "    l4Exposure:\n      - { address: mail-node, port: 443, protocol: tcp, process: notes-api, surface: http }\n    processes:\n",
      ),
    );
    expect(
      refused.ok
        ? []
        : refused.diagnostics.map(({ code, document, path }) => ({
            code,
            document,
            path,
          })),
    ).toStrictEqual([
      {
        code: "E_NODE_PORT_TAKEN",
        document: "minimal/notes.project.yml",
        path: "/applications/0/l4Exposure/0",
      },
      {
        code: "E_NODE_PORT_TAKEN",
        document: "platform/platform.intent.yml",
        path: "/tiers/0/address",
      },
    ]);
  });

  it("derives nothing on an Application no tier names, or a tier with no address", () => {
    expect(
      tierExposuresOf(
        platform.value.document,
        "notes",
        applicationNamed("traefik-lan"),
      ),
    ).toStrictEqual([]);
    const unaddressed = parsePlatformIntent(
      PLATFORM.replace(/\n {4}address: lan-edge.*\n/, "\n"),
    );
    if (!unaddressed.ok) throw new Error("the edited platform did not read");
    expect(
      tierExposuresOf(
        unaddressed.value.document,
        "edge",
        applicationNamed("traefik-lan"),
      ),
    ).toStrictEqual([]);
  });

  it("derives nothing on a proxy whose Processes provide no surface its listener answers", () => {
    const proxy = applicationNamed("traefik-lan");
    expect(
      tierExposuresOf(platform.value.document, "edge", {
        ...proxy,
        processes: proxy.processes.map((process) => ({
          ...process,
          provides: { http: 8080 },
        })),
      }),
    ).toStrictEqual([]);
  });
});

// REQ-114 (docs/requirements.md): a sidecar mounts the Process's volumes it
// names, and one marked init runs to completion before the Process starts.
describe("a sidecar", () => {
  const STORING = `        cutover: interrupted
        volumes:
          - { claim: notes-data, mountAt: /data, size: 1Gi, durability: reconstructible }
        sidecars:
          - name: clone
            image: notes-api
            memory: 32Mi
            cpu: 10m
            init: true
            volumes: [{ claim: notes-data, mountAt: /work }]
          - name: sync
            image: notes-api
            memory: 32Mi
            cpu: 10m
`;
  const storing = (sidecars = STORING) =>
    one(
      serving("notes-api").replace("        cutover: continuous\n", sidecars),
    );

  it("carries the volumes it names, and whether it runs before the Process", () => {
    const [clone, sync] = processOf(storing()).sidecars ?? [];

    expect(clone).toMatchObject({
      name: "clone",
      init: true,
      volumes: [{ claim: "notes-data", mountAt: "/work" }],
    });
    expect(sync).not.toHaveProperty("init");
    expect(sync).not.toHaveProperty("volumes");
  });

  it("is refused a volume its Process does not declare", () => {
    const result = resolve(
      storing(
        STORING.replace(
          "claim: notes-data, mountAt: /work",
          "claim: elsewhere, mountAt: /work",
        ),
      ),
    );

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, path, message, hint }) => ({
            code,
            path,
            message,
            hint,
          })),
    ).toStrictEqual([
      {
        code: "E_UNKNOWN_SIDECAR_VOLUME",
        path: "/applications/0/processes/0/sidecars/0/volumes/0",
        message:
          "sidecar clone mounts elsewhere, and this Process declares no volume of that claim",
        hint: "Mount a claim the Process declares in its own `volumes`, or declare the volume on the Process.",
      },
    ]);
  });
});

// REQ-140 (docs/requirements.md): a sidecar mounts the Process's Assets it
// names, by the file each is read from, at a path of its own.
describe("a sidecar's Assets", () => {
  const MANIFEST = { name: "minimal/config/manifest.json", text: "{}\n" };
  const SHARED = { name: "minimal/config/ca.pem", text: "ca\n" };
  const SIDECAR = `        sidecars:
          - name: apply
            image: notes-api
            memory: 32Mi
            cpu: 10m
            assets:
              - { from: config/manifest.json, mountAt: /etc/apply/manifest.json }
`;
  const declaring = (assets: string, sidecar = SIDECAR) =>
    `  - id: notes
${assets}    processes:
${serving("notes-api", sidecar)}`;
  const holding = (assets: string, sidecar = SIDECAR) =>
    resolve(declaring(assets, sidecar), { env: [MANIFEST, SHARED] });
  const OWN = `    assets:
      - { from: config/ca.pem, mountAt: /etc/ssl/ca.pem }
`;
  const processHolding = (assets: string, sidecar?: string) =>
    processOf(declaring(assets, sidecar), { env: [MANIFEST, SHARED] });

  it("carries the Assets it names, beside the Process's own one ConfigMap of each", () => {
    const process = processHolding(
      "",
      `        assets:
          - { from: config/manifest.json, mountAt: /etc/apply/manifest.json }
${SIDECAR}`,
    );

    expect(process).toMatchObject({
      assets: [{ from: "config/manifest.json" }],
      sidecars: [
        {
          name: "apply",
          assets: [
            {
              from: "config/manifest.json",
              mountAt: "/etc/apply/manifest.json",
            },
          ],
        },
      ],
    });
  });

  it("mounts an Asset a level above the Process shares down to it", () => {
    const process = processHolding(
      OWN,
      SIDECAR.replace(
        "config/manifest.json, mountAt: /etc/apply/manifest.json",
        "config/ca.pem, mountAt: /etc/apply/ca.pem",
      ),
    );

    expect(process).toMatchObject({
      sidecars: [{ assets: [{ from: "config/ca.pem" }] }],
    });
  });

  it("is refused an Asset its Process does not hold, and one a lower level replaced at its path", () => {
    expect(
      [
        holding(OWN),
        holding(
          OWN,
          `        assets:
          - { from: config/manifest.json, mountAt: /etc/ssl/ca.pem }
${SIDECAR.replace("config/manifest.json, mountAt: /etc/apply/manifest.json", "config/ca.pem, mountAt: /etc/apply/ca.pem")}`,
        ),
      ].map((result) =>
        result.ok
          ? []
          : result.diagnostics.map(({ code, path, message, hint }) => ({
              code,
              path,
              message,
              hint,
            })),
      ),
    ).toStrictEqual([
      [
        {
          code: "E_UNKNOWN_SIDECAR_ASSET",
          path: "/applications/0/processes/0/sidecars/0/assets/0",
          message:
            "sidecar apply mounts config/manifest.json, and this Process holds no Asset read from it",
          hint: "Mount an Asset the Process holds, by its `from`, or declare the Asset on the Process.",
        },
      ],
      [
        {
          code: "E_UNKNOWN_SIDECAR_ASSET",
          path: "/applications/0/processes/0/sidecars/0/assets/0",
          message:
            "sidecar apply mounts config/ca.pem, and this Process holds no Asset read from it",
          hint: "Mount an Asset the Process holds, by its `from`, or declare the Asset on the Process.",
        },
      ],
    ]);
  });
});

// REQ-115 (docs/requirements.md): an Application declared by two Projects
// composes once, as the target of a Move from the Project holding its active
// Instance; the old Project renders the source until the Move retires it.
describe("an Application moving between Projects", () => {
  const STORE = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: store
owner: joris
applications:
  - id: notes
    processes:
${serving("notes-api")}`;
  const consumer = `  - id: notes-reader
    processes:
${serving("notes-reader", "        dependsOn:\n          - { application: notes, surface: http }\n")}`;
  const moving = (
    record: string | undefined,
    notes = one(serving("notes-api")),
    store = STORE,
    capturedAt?: string,
  ) =>
    resolve(notes, {
      platform: (document) =>
        document.replace("estate: [agents,", "estate: [agents, store,"),
      foundation: (name, body) =>
        name !== "platform/cluster-state.yml"
          ? body
          : `${capturedAt === undefined ? body : body.replace(/capturedAt: "[^"]*"/, `capturedAt: "${capturedAt}"`)}${record === undefined ? "" : `instances:\n  - {application: notes, instance: notes-api, version: 1.4.0, ${record}}\n`}`,
      env: [{ name: "store/store.project.yml", text: store }],
    });
  const OLD = "namespace: notes-system, node: enschede-t1000-1";
  const declared = (result: ReturnType<typeof resolve>, project: string) =>
    result.ok
      ? result.value.projects
          .find((candidate) => candidate.project === project)
          ?.applications.map(({ id, departing, processes }) => ({
            id,
            departing,
            triggers: processes[0]?.move?.triggers,
          }))
      : undefined;

  it("is a duplicate where no Instance settles which declaration it moves out of", () => {
    expect(codesOf(moving(undefined))).toStrictEqual([
      "E_DUPLICATE_APPLICATION_ID",
      "E_DUPLICATE_APPLICATION_ID",
    ]);
    expect(
      codesOf(moving("namespace: elsewhere-system, node: enschede-t1000-1")),
    ).toStrictEqual([
      "E_DUPLICATE_APPLICATION_ID",
      "E_DUPLICATE_APPLICATION_ID",
    ]);
  });

  it("composes once, as the target of a Move, while the old Project renders its source where it declares it", () => {
    const other = `  - id: notes-other
    processes:
${serving("notes-web")}`;
    const first = moving(OLD, `${one(serving("notes-api"))}${other}`);
    const second = moving(OLD, `${other}${one(serving("notes-api"))}`);

    expect(declared(first, "store")).toStrictEqual([
      { id: "notes", departing: undefined, triggers: ["namespace"] },
    ]);
    expect(declared(first, "notes")).toStrictEqual([
      { id: "notes", departing: true, triggers: undefined },
      { id: "notes-other", departing: undefined, triggers: undefined },
    ]);
    expect(declared(second, "notes")?.map(({ id }) => id)).toStrictEqual([
      "notes-other",
      "notes",
    ]);
  });

  it("is reached in both namespaces until the Move retires its source", () => {
    const result = moving(
      OLD,
      one(serving("notes-api")),
      `${STORE}${consumer}`,
    );
    const peers = result.ok
      ? result.value.projects
          .find(({ project }) => project === "store")
          ?.applications.find(({ id }) => id === "notes-reader")
          ?.processes[0]?.dependencies?.[0]?.peers?.map(
            ({ namespace }) => namespace,
          )
      : undefined;

    expect(peers).toStrictEqual(["store-system", "notes-system"]);
  });

  it("refuses the old Project that stops declaring it while the Move is open", () => {
    const result = moving(
      OLD,
      `  - id: notes-other
    processes:
${serving("notes-api")}`,
    );

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, document, path }) => [
            code,
            document,
            path,
          ]),
    ).toStrictEqual([
      ["E_MOVE_OPEN", "minimal/notes.project.yml", "/applications"],
    ]);
  });

  it("renders nothing of the old declaration once the source has retired", () => {
    const result = moving(
      `${OLD}, phase: retire, flippedAt: "2026-09-01T00:00:00Z", target: {name: notes-api, version: 1.4.0, namespace: store-system}`,
      `${one(serving("notes-api"))}  - id: notes-other
    processes:
${serving("notes-web")}`,
      STORE,
      "2026-09-30T00:00:00Z",
    );

    expect(declared(result, "notes")?.map(({ id }) => id)).toStrictEqual([
      "notes-other",
    ]);
    expect(declared(result, "store")).toStrictEqual([
      { id: "notes", departing: undefined, triggers: undefined },
    ]);
  });

  it("points a refusal of the old Project past the declaration it set aside", () => {
    const result = moving(
      OLD,
      `${one(serving("notes-api"))}  - id: notes-other
    processes:
${serving("notes-web", "        dependsOn:\n          - { application: nowhere, surface: http }\n")}`,
    );

    expect(
      result.ok ? [] : result.diagnostics.map(({ code, path }) => [code, path]),
    ).toContainEqual([
      "E_UNRESOLVED_APPLICATION",
      "/applications/1/processes/0/dependsOn/0",
    ]);
  });
});

// REQ-119 (docs/requirements.md): a Process and a sidecar carry the command
// and arguments they name, as written, and nothing in their place where they
// name none.
describe("what a Process runs", () => {
  it("carries the command and arguments a Process and its sidecar name, as written", () => {
    const process = processOf(
      one(
        serving(
          "notes-api",
          `        command: [/bin/notes]
        args: [serve, --port=8080, ""]
        sidecars:
          - name: exporter
            image: notes-api
            command: [/bin/export]
            args: [--listen=:9100]
            memory: 16Mi
            cpu: 5m
`,
        ),
      ),
    );

    expect([process.command, process.args]).toStrictEqual([
      ["/bin/notes"],
      ["serve", "--port=8080", ""],
    ]);
    expect(
      process.sidecars?.map(({ command, args }) => [command, args]),
    ).toStrictEqual([[["/bin/export"], ["--listen=:9100"]]]);
  });

  it("carries no command and no arguments where a Process names neither", () => {
    const process = processOf(one(serving("notes-api")));

    expect("command" in process || "args" in process).toBe(false);
  });

  it("refuses an empty list and an empty command word, by the schema", () => {
    for (const extra of [
      "        args: []\n",
      "        command: []\n",
      '        command: [""]\n',
    ])
      expect(
        codesOf(resolve(one(serving("notes-api", extra)))),
      ).not.toStrictEqual([]);
  });
});

// REQ-120 (docs/requirements.md): a writable path held in memory renders at its
// own size and counts toward the Process's memory and the node it needs.
describe("a writable path held in memory", () => {
  const held = (memory: string, placement = "64Mi") =>
    one(
      serving(
        "notes-api",
        `        writablePaths: [/tmp, { path: /dev/shm, memory: ${memory} }]\n`,
      ).replace("{ memory: 64Mi,", `{ memory: ${placement},`),
    );

  it("is sized by itself, and a path on disk at the platform's size", () => {
    expect(processOf(held("1Gi")).writablePaths).toStrictEqual([
      { path: "/tmp", size: "64Mi" },
      { path: "/dev/shm", size: "1Gi", medium: "memory" },
    ]);
  });

  it("adds its size to the Process's memory, in whole GiB where the sum is one", () => {
    expect(processOf(held("1Gi", "2Gi")).memory).toBe("3Gi");
    expect(processOf(held("512Mi")).memory).toBe("576Mi");
    expect(processOf(one(serving("notes-api"))).memory).toBe("64Mi");
  });

  it("counts toward eligibility, so a path no node can hold beside the Process places it nowhere", () => {
    expect(codesOf(resolve(held("1Ti")))).toContain(
      "E_PLACEMENT_UNSATISFIABLE",
    );
    expect(codesOf(resolve(held("1Gi")))).toStrictEqual([]);
  });

  it("is one declaration of its path, whichever form each level writes it in", () => {
    expect(
      codesOf(
        resolve(`  - id: notes
    writablePaths: [/dev/shm]
    processes:
${serving("notes-api", "        writablePaths: [{ path: /dev/shm, memory: 1Gi }]\n")}`),
      ),
    ).toContain("E_SHARED_DECLARATION_DUPLICATED");
  });
});
