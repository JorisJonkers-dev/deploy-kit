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
  readClusterState,
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
  "secrets/secrets.project.yml",
].map((name): AuthoredFile => ({ name, text: text(name) }));

const PLATFORM = text("platform/platform.intent.yml");
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
        .map((entry) => `${entry.name}=${"value" in entry ? entry.value : ""}`),
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
      ).secrets?.[0]?.destination,
    ).toBe("notes-api-team-secret-data-token");
  });

  it("carries a file grant's mount and mode", () => {
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
      "apps-vso-secrets",
    ]);
    // One Process holding a grant is enough.
    expect(
      application(`${granted(SELF)}${serving("notes-worker")}`).reconcileAfter,
    ).toStrictEqual(["apps-vso-secrets"]);
    expect(
      application(one(serving("notes-api"))).reconcileAfter,
    ).toBeUndefined();
  });

  it("stops at a grant under a platform that names no Secret Store", () => {
    expect(() =>
      resolve(granted(SELF), {
        platform: (document) => document.replace("secretStore: vault\n", ""),
      }),
    ).toThrow(
      "a grant under a platform that names no Secret Store is not checked yet",
    );
  });

  it.each([
    ["a path no grant names", "${secret:secret/data/notes/other#token}"],
    [
      "a key the grant does not list",
      "${secret:secret/data/notes/token#other}",
    ],
  ])("stops at a placeholder naming %s", (_, placeholder) => {
    expect(() =>
      resolve(granted(ENV), bound(`TOKEN=${placeholder}\n`)),
    ).toThrow("TOKEN: a placeholder no env grant of the Process holds is");
  });

  it.each([
    ["no grant at all", "", ""],
    [
      "a grant on another engine",
      "        secrets:\n          - { engine: database, role: notes, delivery: self, rotation: {tolerates: reload} }\n",
      "",
    ],
  ])("stops at a placeholder on a Process holding %s", (_, block) => {
    expect(() =>
      resolve(
        one(serving("notes-api", block)),
        bound("TOKEN=${secret:secret/data/notes/token#token}\n"),
      ),
    ).toThrow("TOKEN: a placeholder no env grant of the Process holds is");
  });

  it("stops at a placeholder naming a grant the Process reads itself", () => {
    expect(() =>
      resolve(
        granted(SELF),
        bound("TOKEN=${secret:secret/data/notes/token#token}\n"),
      ),
    ).toThrow("TOKEN: a placeholder no env grant of the Process holds is");
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
    expect(() =>
      resolve(one(serving("notes-api", ASSET)), {
        env: [{ name: "other/config/notes.yml", text: "a: 1\n" }],
      }),
    ).toThrow(
      "config/notes.yml: an Asset whose file is not read beside its project is refused, which is not checked yet",
    );
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

describe("what has not landed yet", () => {
  it("stops at a grant on an engine other than kv, whose derivation lands in its own slice", () => {
    expect(() =>
      resolve(
        one(
          serving(
            "notes-api",
            "        secrets:\n          - { engine: database, role: notes, delivery: self, rotation: {tolerates: reload} }\n",
          ),
        ),
      ),
    ).toThrow("notes-api: a database grant is not resolved yet");
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
  const holding = (volumes: string, engine = "") =>
    one(
      serving("notes-store", `${engine}        volumes:\n${volumes}`).replace(
        "cutover: continuous",
        "cutover: interrupted",
      ),
    );

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
  });

  it("stops at a backup holding the off-cluster credential under a platform that names no Secret Store", () => {
    expect(() =>
      resolve(
        holding(
          "          - { claim: keep, mountAt: /k, size: 1Gi, durability: irreplaceable }\n",
          "        engine: files\n",
        ),
        {
          platform: (document) => document.replace("secretStore: vault\n", ""),
        },
      ),
    ).toThrow(
      "a grant under a platform that names no Secret Store is not checked yet",
    );
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
        },
      ],
    ]);
  });

  it("stops at a class the platform derives a backup for with no schedule or retention", () => {
    expect(() =>
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
    ).toThrow(
      "the recoverable policy derives a backup, and names no schedule and retention",
    );
    expect(() =>
      resolve(
        holding(
          "          - { claim: queue, mountAt: /q, size: 20Gi, durability: recoverable }\n",
          "        engine: rabbitmq\n",
        ),
        { platform: (platform) => platform.replace("    retain: 14\n", "") },
      ),
    ).toThrow("names no schedule and retention");
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
          "rabbitmq: { backup: rabbitmq-backup }",
          "rabbitmq: { backup: unlocked }",
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
});
