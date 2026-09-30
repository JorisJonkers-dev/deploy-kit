// REQ-039 (docs/requirements.md), derivation by derivation: each mechanic
// chapter 20 derives, read off a notes project written for it and resolved
// through the use-case with the worked foundation and pinned inputs.
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
import { eligibleNodes } from "../../src/model/eligibility.ts";
import {
  readImagesLock,
  readNodeContract,
} from "../../src/read/pinned-inputs.ts";
import { resolveApplication } from "../../src/resolve/application.ts";
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
].map((name): AuthoredFile => ({ name, text: text(name) }));

const PLATFORM = text("platform/platform.intent.yml");

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
  readonly env?: readonly AuthoredFile[];
}

function resolve(applications: string, options: Options = {}) {
  return resolveIntentSet(
    [
      {
        name: "platform/platform.intent.yml",
        text: (options.platform ?? ((same: string) => same))(PLATFORM),
      },
      ...FOUNDATION,
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

  it("rolls the delivery machinery, and gates none of it", () => {
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

    expect(resolved.processes.map(({ deadline }) => deadline)).toStrictEqual([
      "1800s",
      "10800s",
      "1s",
    ]);
    expect(resolved.releaseGate?.deadline).toBe("10800s");
    expect(resolved.processes[2]?.cutover).toBeUndefined();
  });

  it("gives a Process with no budget the substrate's deadline and no startup probe", () => {
    const resolved = processOf(
      one(serving("notes-api").replace("        startupBudget: 20s\n", "")),
    );

    expect(resolved.deadline).toBe("600s");
    expect(resolved.startup).toBeUndefined();
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
    ).toStrictEqual({ path: "/live", port: 8080, period: "5s", failures: 5 });
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
    });
  });

  it("stops at a blue/green Application no member of which publishes readiness, which is refused before it is gated", () => {
    expect(() =>
      resolve(
        one(
          serving("notes-api").replace(
            "        probes:\n          readiness: { path: /ready, port: 8080 }\n          liveness: { path: /live, port: 8080 }\n",
            "        probes: none\n",
          ),
        ),
      ),
    ).toThrow("whose Processes publish no readiness");
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
        .map(({ name, value }) => `${name}=${value}`),
    ).toStrictEqual(["A=base", "B=production", "C=production"]);
  });

  it("resolves an identity placeholder to the Process's own derived facts", () => {
    const resolved = processOf(one(serving("notes-api")), {
      env: [
        env(
          "notes-api/base.env",
          "NS=${identity:namespace}\nROLE=${identity:vaultRole}\n",
        ),
      ],
    });

    expect(
      resolved.environment?.filter(({ name }) => ["NS", "ROLE"].includes(name)),
    ).toStrictEqual([
      { name: "NS", value: "notes-system" },
      { name: "ROLE", value: "notes-api" },
    ]);
  });

  it("stops at a placeholder whose derivation has not landed, rather than writing a wrong value", () => {
    expect(() =>
      resolve(one(serving("notes-api")), {
        env: [env("notes-api/base.env", "URL=${exposure:notes.app#url}\n")],
      }),
    ).toThrow("URL: a exposure placeholder is not resolved yet");
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

  it("hands no collector endpoint where the platform names no collector", () => {
    expect(
      processOf(one(serving("notes-api")), {
        platform: (platform) =>
          platform.replace(/\ntelemetry:\n {2}collector: [^\n]*\n/, "\n"),
      }).environment?.map(({ name }) => name),
    ).toStrictEqual(["DEPLOYMENT_ENVIRONMENT", "OTEL_SERVICE_NAME", "PORT"]);
  });

  it("mounts the identity token only where a grant is delivered to the Process itself", () => {
    expect(
      processOf(
        one(
          serving(
            "notes-api",
            "        secrets:\n          - { engine: database, role: notes, delivery: self }\n",
          ),
        ),
      ).identityToken,
    ).toBe(true);
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

  it("stops at an edge the union and the register cannot resolve, rather than writing no address", () => {
    expect(() =>
      resolve(
        consumer("          - { application: stalwart, surface: imap }\n"),
      ),
    ).toThrow("stalwart.imap: no provider in the union");
    expect(() =>
      resolve(
        consumer("          - { application: notes-worker, surface: http }\n"),
      ),
    ).toThrow("notes-worker.http: no provider in the union");
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

describe("what has not landed yet", () => {
  it.each([
    [
      "a volume",
      "        volumes:\n          - { claim: c, mountAt: /data, size: 1Gi, durability: reconstructible }\n",
    ],
    [
      "a kv grant",
      "        secrets:\n          - { path: notes/token, keys: [token], access: read, delivery: self }\n",
    ],
    [
      "an Asset",
      "        assets:\n          - { from: config/notes.yml, mountAt: /etc/notes.yml }\n",
    ],
  ])("stops at %s, whose derivation lands in its own slice", (what, block) => {
    expect(() =>
      resolve(
        one(
          serving("notes-api", block).replace(
            "cutover: continuous",
            "cutover: interrupted",
          ),
        ),
      ),
    ).toThrow(`notes-api: ${what} is not resolved yet`);
  });

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

  it("stops at a managed migration, whose runner block waits on its own slice", () => {
    const managed = `  - id: notes
    migration: { changelog: db/changelog.yml }
    processes:
${serving("notes-api", "        dependsOn:\n          - { application: notes-db, surface: postgres }\n")}  - id: notes-db
    processes:
      - name: notes-db
        lifecycle: application
        image: notes-api
        runtime: none
        engine: postgres
        provides: { postgres: 5432 }
        placement: { memory: 64Mi, cpu: 10m }
        volumes:
          - { claim: notes-db, mountAt: /var/lib/postgresql, size: 1Gi, durability: recoverable }
        probes:
          readiness: { tcp: 5432 }
          liveness: { tcp: 5432 }
        startupBudget: 20s
        cutover: interrupted
`;

    expect(() => resolve(managed)).toThrow(
      "notes: a managed migration is not resolved yet",
    );
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
    if (!parsed.ok || !platform.ok || !lock.ok || !contract.ok)
      throw new Error("the worked inputs did not read");
    const [application] = parsed.value.effective.applications;
    if (application === undefined) throw new Error("no Application");

    const resolved = resolveApplication(application, {
      platform: platform.value.document,
      contract: contract.value,
      lock: lock.value,
      project: "notes",
      union: [parsed.value.effective],
      projectOf: new Map([["notes", "notes"]]),
      hash: sha256Hasher,
      collector: undefined,
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
      )?.value,
    ).toBe("http://otel-collector.observability-system.svc.cluster.local:4317");
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
    expect(eligibleNodes(process({}), contract)).toStrictEqual([
      "bare",
      "two-cards",
    ]);
    expect(
      eligibleNodes(
        process({ memory: "64Mi", cpu: "100m" }, "continuous"),
        contract,
      ),
    ).toStrictEqual([]);
    expect(
      eligibleNodes(
        process({ memory: "64Mi", cpu: "50m" }, "continuous"),
        contract,
      ),
    ).toStrictEqual(["bare", "two-cards"]);
  });

  it("refuses a node that publishes no capability, card or disk to a Process that asks for one", () => {
    expect(
      eligibleNodes(process({ capabilities: ["x"] }), contract),
    ).toStrictEqual([]);
    expect(
      eligibleNodes(process({ gpu: { class: "x", memory: "1Gi" } }), contract),
      // Only one of two-cards' cards is large enough, and one is.
    ).toStrictEqual(["two-cards"]);
    expect(
      eligibleNodes(process({ disk: { media: ["ssd"] } }), contract),
    ).toStrictEqual([]);
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
    expect(() =>
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
    ).toThrow("stalwart.smtp: no provider in the union");
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
    expect(resolved.releaseGate?.deadline).toBe("60s");
  });
});

describe("what the review found", () => {
  it("orders the secrets-provisioning unit before an Application that holds any grant", () => {
    expect(
      application(
        one(
          serving(
            "notes-api",
            "        secrets:\n          - { engine: database, role: notes, delivery: self }\n",
          ) + serving("notes-web"),
        ),
      ).reconcileAfter,
    ).toStrictEqual(["apps-vso-secrets"]);
  });

  it("stops at a Runtime Profile key written in an env file, rather than rendering it twice", () => {
    expect(() =>
      resolve(one(serving("notes-api")), {
        env: [{ name: "minimal/env/notes-api/base.env", text: "PORT=9000\n" }],
      }),
    ).toThrow(
      "PORT: a Runtime Profile key written in an env file is a build error",
    );
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
