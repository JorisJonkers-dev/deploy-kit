// RULE-045 (docs/architecture-rules.md), value by value: each adapter spells
// what the projection holds and nothing else
// (spec/v1/30-deliverables.md#how-each-adapter-spells-the-projection), read off
// variants of minimal's resolved projection.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  kustomizationsFor,
  renderKubernetes,
} from "../../src/adapters/kubernetes/render.ts";
import { renderNetworking } from "../../src/adapters/networking/render.ts";
import { renderPrometheus } from "../../src/adapters/prometheus/render.ts";
import { wholeSeconds } from "../../src/adapters/shared/durations.ts";
import { renderTraefik } from "../../src/adapters/traefik/render.ts";
import { collisions } from "../../src/application/render-intent-set.ts";
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

type Application = ResolvedProject["applications"][number];
type Process = Application["processes"][number];

/** minimal with its one Application, and that Application's one Process, edited. */
/** A field set to `undefined` is removed, as an absent optional field is. */
type Edit<T> = (value: T) => Readonly<Record<string, unknown>>;

const without = <T>(value: T, edit: Readonly<Record<string, unknown>>): T =>
  Object.fromEntries(
    Object.entries({ ...value, ...edit }).filter(
      ([, field]) => field !== undefined,
    ),
  ) as T;

function edited(
  application: Edit<Application> = () => ({}),
  process: Edit<Process> = () => ({}),
): ResolvedProject {
  const project = minimal();
  const [only] = project.applications;
  if (only === undefined) throw new Error("minimal holds no Application");
  const [first] = only.processes;
  if (first === undefined) throw new Error("minimal holds no Process");
  return {
    ...project,
    applications: [
      {
        ...without(only, application(only)),
        processes: [without(first, process(first))],
      },
    ],
  };
}

const objectsAt = (
  deliverables: readonly { path: string; objects: readonly unknown[] }[],
  suffix: string,
) => deliverables.find(({ path }) => path.endsWith(suffix))?.objects ?? [];

describe("the kubernetes adapter", () => {
  it("stops at a Process it does not spell yet, rather than rendering it wrongly", () => {
    expect(() =>
      renderKubernetes(edited(undefined, () => ({ lifecycle: "job" }))),
    ).toThrow(
      "notes-api: a job Process that switches blue-green is not rendered yet",
    );
    expect(() =>
      renderKubernetes(edited(undefined, () => ({ switchover: "stop-start" }))),
    ).toThrow(
      "notes-api: a application Process that switches stop-start is not rendered yet",
    );
    expect(() =>
      renderKubernetes(
        edited(undefined, () => ({
          switchover: undefined,
        })),
      ),
    ).toThrow("switches nothing is not rendered yet");
    expect(() =>
      renderKubernetes(
        edited(undefined, () => ({
          writablePaths: [{ path: "/tmp", size: "64Mi" }],
        })),
      ),
    ).toThrow("notes-api: a writable path is not rendered yet");
    expect(() =>
      renderKubernetes(edited(undefined, () => ({ surfaces: undefined }))),
    ).toThrow(
      "notes-api: a blue-green Process that serves no surface is not rendered yet",
    );
  });

  it("writes no readiness probe for a Process that publishes none", () => {
    const [deployment] = objectsAt(
      renderKubernetes(edited(undefined, () => ({ readiness: undefined }))),
      "workload.yaml",
    ) as {
      spec: { template: { spec: { containers: Record<string, unknown>[] } } };
    }[];

    expect(
      deployment?.spec.template.spec.containers[0]?.["readinessProbe"],
    ).toBeUndefined();
  });

  it("spells a tcp probe as a socket, and writes no env or probe the Process lacks", () => {
    const [deployment] = objectsAt(
      renderKubernetes(
        edited(undefined, () => ({
          readiness: {
            tcp: 8080,
            period: "10s",
            timeout: "5s",
            failures: 3,
          },
          liveness: undefined,
          startup: undefined,
          environment: undefined,
        })),
      ),
      "workload.yaml",
    ) as {
      spec: { template: { spec: { containers: Record<string, unknown>[] } } };
    }[];
    const [container] = deployment?.spec.template.spec.containers ?? [];

    expect(container?.["readinessProbe"]).toStrictEqual({
      tcpSocket: { port: 8080 },
      periodSeconds: 10,
      timeoutSeconds: 5,
      failureThreshold: 3,
      initialDelaySeconds: 0,
    });
    expect(Object.keys(container ?? {}).sort()).toStrictEqual([
      "image",
      "name",
      "ports",
      "readinessProbe",
      "resources",
      "securityContext",
    ]);
  });
});

describe("the networking adapter", () => {
  it("admits every edge's peers, and writes no ingress where nothing reaches the Process", () => {
    const [policy] = objectsAt(
      renderNetworking(
        edited(undefined, () => ({
          ingress: undefined,
          dependencies: [
            {
              application: "otel-collector",
              surface: "otlp",
              address:
                "otel-collector.observability-system.svc.cluster.local:4317",
              peers: [
                {
                  namespace: "observability-system",
                  process: "otel-collector",
                  port: 4317,
                },
              ],
            },
            {
              application: "stalwart",
              surface: "smtp",
              address: "10.0.0.12:25",
            },
          ],
        })),
      ),
      "notes/notes/networkpolicy.yaml",
    ) as { spec: Record<string, unknown> }[];

    expect(policy?.spec["ingress"]).toBeUndefined();
    expect((policy?.spec["egress"] as unknown[])[0]).toStrictEqual({
      to: [
        {
          namespaceSelector: {
            matchLabels: {
              "kubernetes.io/metadata.name": "observability-system",
            },
          },
          podSelector: {
            matchLabels: { "app.kubernetes.io/instance": "otel-collector" },
          },
        },
      ],
      ports: [{ protocol: "TCP", port: 4317 }],
    });
    expect(policy?.spec["egress"]).toHaveLength(2);
  });

  it("selects a Process within an egress peer's namespace where the peer names one", () => {
    const [policy] = objectsAt(
      renderNetworking(
        edited(undefined, () => ({
          egress: [
            {
              rule: "secret-store",
              namespace: "secrets-system",
              process: "vault",
              port: 8200,
            },
          ],
        })),
      ),
      "notes/notes/networkpolicy.yaml",
    ) as { spec: Record<string, unknown> }[];

    expect(policy?.spec["egress"]).toStrictEqual([
      {
        to: [
          {
            namespaceSelector: {
              matchLabels: { "kubernetes.io/metadata.name": "secrets-system" },
            },
            podSelector: {
              matchLabels: { "app.kubernetes.io/instance": "vault" },
            },
          },
        ],
        ports: [
          { protocol: "UDP", port: 8200 },
          { protocol: "TCP", port: 8200 },
        ],
      },
    ]);
  });

  it("writes only the baseline where the projection admits nothing else", () => {
    const [policy] = objectsAt(
      renderNetworking(
        edited(undefined, () => ({
          egress: undefined,
          ingress: undefined,
        })),
      ),
      "notes/notes/networkpolicy.yaml",
    ) as { spec: Record<string, unknown> }[];

    expect(policy?.spec["egress"]).toStrictEqual([]);
  });
});

describe("the prometheus adapter", () => {
  it("renders no monitor for an Application that declares no observability", () => {
    expect(
      renderPrometheus(edited(() => ({ scrape: undefined }))),
    ).toStrictEqual([]);
  });

  it("stops at a scraped Process that is not blue-green, whose ServiceMonitor waits on its slice", () => {
    expect(() =>
      renderPrometheus(edited(undefined, () => ({ switchover: "stop-start" }))),
    ).toThrow(
      "a ServiceMonitor for a Process that switches stop-start is not rendered yet",
    );
    expect(() =>
      renderPrometheus(
        edited(undefined, () => ({
          switchover: undefined,
        })),
      ),
    ).toThrow("switches nothing is not rendered yet");
  });
});

describe("the traefik adapter", () => {
  type Exposure = NonNullable<Application["exposure"]>[number];
  const exposed = (edit: (exposure: Exposure) => Partial<Exposure>) =>
    renderTraefik(
      edited(({ exposure }) => ({
        exposure: (exposure ?? []).map((one) => ({ ...one, ...edit(one) })),
      })),
    );
  const routeOf = (deliverables: ReturnType<typeof renderTraefik>) =>
    (
      deliverables[0]?.objects[0] as
        { spec: Record<string, unknown> } | undefined
    )?.spec;

  it("spells a plain listener and no certificates as the web entry point and no TLS block", () => {
    const spec = routeOf(
      exposed(() => ({ listener: "plain", certificates: "none" })),
    );

    expect(spec?.["entryPoints"]).toStrictEqual(["web"]);
    expect(spec?.["tls"]).toBeUndefined();
  });

  it("spells an exact path, forward-auth and an unprofiled baseline, each in the proxy's namespace", () => {
    const spec = routeOf(
      exposed(({ routes }) => ({
        routes: routes.map((route) => ({
          ...route,
          match: "exact" as const,
          middleware: [
            { kind: "forward-auth" as const, endpoint: "http://auth" },
            { kind: "security-headers" as const },
          ],
        })),
      })),
    );
    const [route] = spec?.["routes"] as Record<string, unknown>[];

    expect(route?.["match"]).toBe(
      "Host(`notes.jorisjonkers.dev`) && Path(`/`)",
    );
    expect(route?.["middlewares"]).toStrictEqual([
      { name: "forward-auth", namespace: "edge-system" },
      { name: "security-headers", namespace: "edge-system" },
    ]);
  });

  it("stops at a redirect, whose Middleware waits on its slice", () => {
    expect(() =>
      exposed(({ routes }) => ({
        routes: routes.map((route) => ({
          ...route,
          middleware: [{ kind: "redirect" as const, redirectTo: "/elsewhere" }],
        })),
      })),
    ).toThrow("a redirect Middleware is not rendered yet");
  });

  it("renders no route for an Application that exposes nothing", () => {
    expect(
      renderTraefik(edited(() => ({ exposure: undefined }))),
    ).toStrictEqual([]);
  });
});

describe("what the render assembly and the shared helpers refuse", () => {
  it("names every path two Deliverables claim, and the adapters claiming it", () => {
    expect(
      collisions([
        { path: "apps/a/x.yaml", adapter: "kubernetes", objects: [] },
        { path: "apps/a/x.yaml", adapter: "networking", objects: [] },
        { path: "apps/a/y.yaml", adapter: "kubernetes", objects: [] },
      ]),
    ).toStrictEqual([
      {
        code: "E_PATH_COLLISION",
        path: "",
        message: "apps/a/x.yaml is claimed by kubernetes and networking",
        hint: "Every path has one owner: the plan assigns each adapter's paths from its default path.",
      },
    ]);
  });

  it("reads whole seconds, minutes and hours, and stops at anything finer", () => {
    expect(["60s", "10m", "1h"].map(wholeSeconds)).toStrictEqual([
      60, 600, 3600,
    ]);
    expect(() => wholeSeconds("500ms")).toThrow(
      "500ms: not a duration in whole seconds",
    );
    expect(() => wholeSeconds("x60s")).toThrow(
      "not a duration in whole seconds",
    );
  });
});

describe("the kustomizations", () => {
  it("lists each directory's files and each Application's directory, and neither a policy nor an unapplied directory", () => {
    const listed = Object.fromEntries(
      kustomizationsFor([
        "apps/notes/namespace.yaml",
        "apps/notes/networkpolicy.yaml",
        "apps/notes/notes/workload.yaml",
        "apps/notes/notes/networkpolicy.yaml",
        "apps/notes/notes/deeper/nested.yaml",
        "apps/edge/public-frankfurt/notes-public.yaml",
        "xapps/notes/stray.yaml",
        "x/apps/notes/sub/deep.yaml",
      ]).map(({ path, objects }) => [
        path,
        (objects[0] as unknown as { resources: string[] }).resources,
      ]),
    );

    expect(listed).toStrictEqual({
      "apps/notes/kustomization.yaml": ["namespace.yaml", "notes"],
      "apps/notes/notes/kustomization.yaml": ["workload.yaml"],
      "apps/notes/notes/deeper/kustomization.yaml": ["nested.yaml"],
      "apps/edge/public-frankfurt/kustomization.yaml": ["notes-public.yaml"],
      "xapps/notes/kustomization.yaml": ["stray.yaml"],
      "x/apps/notes/sub/kustomization.yaml": ["deep.yaml"],
    });
  });
});
