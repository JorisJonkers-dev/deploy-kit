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
import { renderVaultPolicy } from "../../src/adapters/vault-policy/render.ts";
import { renderVso } from "../../src/adapters/vso/render.ts";
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
      "secrets/secrets.project.yml",
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
      renderKubernetes(edited(undefined, () => ({ switchover: "rolling" }))),
    ).toThrow(
      "notes-api: a application Process that switches rolling is not rendered yet",
    );
    expect(() =>
      renderKubernetes(
        edited(undefined, () => ({
          switchover: undefined,
        })),
      ),
    ).toThrow("switches nothing is not rendered yet");
    expect(() =>
      renderKubernetes(edited(undefined, () => ({ surfaces: undefined }))),
    ).toThrow(
      "notes-api: a blue-green Process that serves no surface is not rendered yet",
    );
    expect(() =>
      renderKubernetes(
        edited(undefined, () => ({
          secrets: [
            {
              path: "secret/data/notes/key",
              access: "read",
              delivery: "file",
              destination: "notes-api-notes-key",
              mountAt: "/run/key",
            },
          ],
        })),
      ),
    ).toThrow("notes-api: a file grant is not rendered yet");
  });

  const stopStart = () =>
    renderKubernetes(
      edited(undefined, () => ({
        switchover: "stop-start",
        cutover: "interrupted",
        replicas: 1,
        volumes: [
          {
            claim: "cache",
            mountAt: "/cache",
            size: "2Gi",
            durability: "reconstructible",
          },
        ],
      })),
    );

  it("replaces a stop-start Process in place, keeps its count, and gives it a Service and no Canary", () => {
    const rendered = stopStart();
    const [deployment] = objectsAt(rendered, "workload.yaml") as {
      spec: {
        replicas: number;
        strategy: unknown;
        template: {
          spec: Record<string, unknown> & {
            containers: Record<string, unknown>[];
          };
        };
      };
    }[];

    expect(deployment?.spec.replicas).toBe(1);
    expect(deployment?.spec.strategy).toStrictEqual({ type: "Recreate" });
    expect(deployment?.spec.template.spec["volumes"]).toStrictEqual([
      { name: "cache", persistentVolumeClaim: { claimName: "cache" } },
    ]);
    expect(
      (
        deployment?.spec.template.spec["securityContext"] as Record<
          string,
          unknown
        >
      )["fsGroup"],
    ).toBe(1000);
    expect(
      deployment?.spec.template.spec.containers[0]?.["volumeMounts"],
    ).toStrictEqual([{ name: "cache", mountPath: "/cache" }]);
    expect(objectsAt(rendered, "service.yaml")).toStrictEqual([
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "notes-api",
          namespace: "notes-system",
          labels: {
            "app.kubernetes.io/name": "notes-api",
            "app.kubernetes.io/instance": "notes-api",
            "app.kubernetes.io/part-of": "notes",
            "app.kubernetes.io/managed-by": "deploy-kit",
            "app.kubernetes.io/component": "node",
          },
        },
        spec: {
          selector: { "app.kubernetes.io/instance": "notes-api" },
          ports: [{ name: "http", port: 8080, targetPort: "http" }],
        },
      },
    ]);
    expect(rendered.map(({ path }) => path.split("/").at(-1))).not.toContain(
      "canary.yaml",
    );
  });

  it("claims each volume ReadWriteOnce at its size, and writes no pruning guard on one nothing backs up", () => {
    expect(objectsAt(stopStart(), "pvc.yaml")).toStrictEqual([
      {
        apiVersion: "v1",
        kind: "PersistentVolumeClaim",
        metadata: {
          name: "cache",
          namespace: "notes-system",
          labels: {
            "app.kubernetes.io/name": "notes-api",
            "app.kubernetes.io/instance": "notes-api",
            "app.kubernetes.io/part-of": "notes",
            "app.kubernetes.io/managed-by": "deploy-kit",
            "app.kubernetes.io/component": "node",
          },
        },
        spec: {
          accessModes: ["ReadWriteOnce"],
          resources: { requests: { storage: "2Gi" } },
        },
      },
    ]);
  });

  it("writes no Service for a stop-start Process that serves nothing, and no file with nothing in it", () => {
    // An Application none of whose Processes switches blue-green carries no gate.
    const rendered = renderKubernetes(
      edited(
        () => ({ releaseGate: undefined }),
        () => ({ switchover: "stop-start", surfaces: undefined }),
      ),
    );

    expect(
      rendered.map(({ path }) => path.split("/").at(-1)).sort(),
    ).toStrictEqual(["namespace.yaml", "serviceaccount.yaml", "workload.yaml"]);
  });

  it("hands the Release Gate a gated Application's inputs in a ConfigMap named for it, which stays mutable", () => {
    const project = minimal();
    const [application] = project.applications;

    expect(
      objectsAt(renderKubernetes(project), "notes/configmap.yaml"),
    ).toStrictEqual([
      {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
          name: "notes-release-gate",
          namespace: "notes-system",
          labels: {
            "app.kubernetes.io/part-of": "notes",
            "app.kubernetes.io/managed-by": "deploy-kit",
          },
        },
        data: { "releaseGate.json": { json: application?.releaseGate } },
      },
    ]);
  });

  it("writes the gate's inputs before the Assets of the Application's Processes", () => {
    const rendered = renderKubernetes(
      edited(undefined, () => ({
        assets: [
          {
            name: "notes-api-settings-0a1b2c3d",
            from: "config/settings.toml",
            mountAt: "/etc/notes/settings.toml",
            content: "mode = 'lite'\n",
          },
        ],
      })),
    );

    expect(
      (
        objectsAt(rendered, "notes/configmap.yaml") as {
          metadata: { name: string };
          immutable?: true;
        }[]
      ).map(({ metadata, immutable }) => [metadata.name, immutable]),
    ).toStrictEqual([
      ["notes-release-gate", undefined],
      ["notes-api-settings-0a1b2c3d", true],
    ]);
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

describe("the networking adapter, for a backup identity", () => {
  const PLAN = {
    schedule: "45 2 * * *",
    retain: 90,
    method: "ghcr.io/x/postgres-backup@sha256:aa",
    uid: 999,
    gid: 999,
    identity: "notes-api-backup",
    claim: "data-backup",
  };
  const volume = (claim: string, backup?: object) => ({
    claim,
    mountAt: `/${claim}`,
    size: "1Gi",
    durability: "irreplaceable" as const,
    ...(backup === undefined ? {} : { backup: { ...PLAN, ...backup } }),
  });
  const policies = (volumes: readonly unknown[]) =>
    (
      objectsAt(
        renderNetworking(edited(undefined, () => ({ volumes }))),
        // The Application's file, after its Process's own policy.
        "notes/notes/networkpolicy.yaml",
      ) as {
        metadata: { name: string; labels: unknown };
        spec: {
          podSelector: unknown;
          policyTypes: unknown;
          ingress?: unknown;
          egress: unknown;
        };
      }[]
    ).slice(1);
  const DNS = { rule: "cluster-dns", namespace: "kube-system", port: 53 };

  it("admits it to the Process it dumps, the cluster's DNS and each range of the destination, and nothing to it", () => {
    const [policy, ...others] = policies([
      volume("data", {
        egress: [
          {
            rule: "datastore",
            namespace: "notes-system",
            process: "notes-api",
            port: 5432,
          },
          DNS,
        ],
        destinations: [
          { cidr: "203.0.113.0/24", port: 443 },
          { cidr: "198.51.100.7/32", port: 8443 },
        ],
      }),
    ]);

    expect(others).toStrictEqual([]);
    expect(policy).toStrictEqual({
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: "notes-api-backup",
        namespace: "notes-system",
        labels: {
          "app.kubernetes.io/name": "notes-api-backup",
          "app.kubernetes.io/instance": "notes-api-backup",
          "app.kubernetes.io/part-of": "notes",
          "app.kubernetes.io/managed-by": "deploy-kit",
          "app.kubernetes.io/component": "none",
        },
      },
      spec: {
        podSelector: {
          matchLabels: { "app.kubernetes.io/instance": "notes-api-backup" },
        },
        policyTypes: ["Ingress", "Egress"],
        egress: [
          {
            to: [
              {
                namespaceSelector: {
                  matchLabels: {
                    "kubernetes.io/metadata.name": "notes-system",
                  },
                },
                podSelector: {
                  matchLabels: { "app.kubernetes.io/instance": "notes-api" },
                },
              },
            ],
            ports: [{ protocol: "TCP", port: 5432 }],
          },
          {
            to: [
              {
                namespaceSelector: {
                  matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
                },
              },
            ],
            ports: [
              { protocol: "UDP", port: 53 },
              { protocol: "TCP", port: 53 },
            ],
          },
          {
            to: [{ ipBlock: { cidr: "203.0.113.0/24" } }],
            ports: [{ protocol: "TCP", port: 443 }],
          },
          {
            to: [{ ipBlock: { cidr: "198.51.100.7/32" } }],
            ports: [{ protocol: "TCP", port: 8443 }],
          },
        ],
      },
    });
  });

  it("writes one policy for the one identity every backup of a Process runs as, and none where nothing is backed up", () => {
    expect(
      policies([
        volume("cache"),
        volume("data", { egress: [DNS] }),
        volume("more", { egress: [DNS], claim: "more-backup" }),
      ]).map(({ metadata, spec }) => [metadata.name, spec.egress]),
    ).toStrictEqual([
      [
        "notes-api-backup",
        [
          {
            to: [
              {
                namespaceSelector: {
                  matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
                },
              },
            ],
            ports: [
              { protocol: "UDP", port: 53 },
              { protocol: "TCP", port: 53 },
            ],
          },
        ],
      ],
    ]);
    expect(policies([volume("cache")])).toStrictEqual([]);
  });
});

describe("the prometheus adapter", () => {
  it("renders no monitor for an Application that declares no observability", () => {
    expect(
      renderPrometheus(edited(() => ({ scrape: undefined }))),
    ).toStrictEqual([]);
  });

  it("scrapes a stop-start Process through a ServiceMonitor, on the surface the scrape names", () => {
    const rendered = renderPrometheus(
      edited(undefined, () => ({ switchover: "stop-start" })),
    );

    expect(rendered.map(({ path }) => path)).toStrictEqual([
      "apps/notes/notes/servicemonitor.yaml",
    ]);
    const [monitor] = (rendered[0]?.objects ?? []) as readonly {
      apiVersion: string;
      kind: string;
    }[];
    expect([monitor?.apiVersion, monitor?.kind]).toStrictEqual([
      "monitoring.coreos.com/v1",
      "ServiceMonitor",
    ]);
    expect(
      (rendered[0]?.objects[0] as { spec: unknown } | undefined)?.spec,
    ).toStrictEqual({
      jobLabel: "app.kubernetes.io/instance",
      selector: { matchLabels: { "app.kubernetes.io/instance": "notes-api" } },
      namespaceSelector: { matchNames: ["notes-system"] },
      endpoints: [
        {
          port: "http",
          path: "/metrics",
          interval: "30s",
          scrapeTimeout: "10s",
        },
      ],
    });
  });

  it("stops at a scraped Process that switches rolling or nothing, whose monitor waits on its slice", () => {
    expect(() =>
      renderPrometheus(edited(undefined, () => ({ switchover: "rolling" }))),
    ).toThrow(
      "a monitor for a Process that switches rolling is not rendered yet",
    );
    expect(() =>
      renderPrometheus(edited(undefined, () => ({ switchover: undefined }))),
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

const GRANT = {
  path: "secret/data/notes/token",
  keys: ["token"],
  access: "read" as const,
  delivery: "env" as const,
  destination: "notes-api-notes-token",
  restartTargets: ["notes-api"],
};
const SELF = {
  path: "secret/data/notes/self",
  access: "read" as const,
  delivery: "self" as const,
};
const STORE = "http://vault.secrets-system.svc.cluster.local:8200";

/** A backed-up volume of class `durability`, its plan as resolution derives it. */
const backedUp = (claim: string, credential: boolean) => ({
  claim,
  mountAt: `/${claim}`,
  size: "1Gi",
  durability: "recoverable" as const,
  backup: {
    schedule: "15 3 * * *",
    retain: 14,
    method: "ghcr.io/jorisjonkers-dev/platform/file-backup@sha256:0",
    uid: 1000,
    gid: 1000,
    identity: "notes-api-backup",
    claim: `${claim}-backup`,
    ...(credential
      ? {
          credential: {
            path: "secret/data/platform/backup/off-cluster",
            access: "read" as const,
            delivery: "env" as const,
            destination: "notes-api-backup-platform-backup-off-cluster",
          },
        }
      : {}),
  },
});

describe("the kubernetes adapter, for what data holds", () => {
  it("names a writable path's volume for the path, every run of other characters one `-`", () => {
    const [deployment] = objectsAt(
      renderKubernetes(
        edited(undefined, () => ({
          writablePaths: [{ path: "/var/run.-d", size: "64Mi" }],
        })),
      ),
      "workload.yaml",
    ) as { spec: { template: { spec: { volumes: unknown[] } } } }[];

    expect(deployment?.spec.template.spec.volumes).toStrictEqual([
      { name: "writable-var-run-d", emptyDir: { sizeLimit: "64Mi" } },
    ]);
  });

  it("stops at a file grant among others", () => {
    expect(() =>
      renderKubernetes(
        edited(undefined, () => ({
          secrets: [GRANT, { ...GRANT, delivery: "file", mountAt: "/run/k" }],
        })),
      ),
    ).toThrow("notes-api: a file grant is not rendered yet");
  });

  it("gives a sidecar no variables where the Process has none", () => {
    const [deployment] = objectsAt(
      renderKubernetes(
        edited(undefined, () => ({
          environment: undefined,
          sidecars: [
            {
              name: "exporter",
              image: "x@sha256:0",
              memory: "32Mi",
              cpu: "5m",
            },
          ],
        })),
      ),
      "workload.yaml",
    ) as { spec: { template: { spec: { containers: unknown[] } } } }[];

    expect(deployment?.spec.template.spec.containers[1]).toStrictEqual({
      name: "exporter",
      image: "x@sha256:0",
      resources: {
        requests: { memory: "32Mi", cpu: "5m" },
        limits: { memory: "32Mi" },
      },
      securityContext: {
        readOnlyRootFilesystem: true,
        capabilities: { drop: ["ALL"] },
      },
    });
  });

  it("runs every backup of one Process as its one backup identity", () => {
    const accounts = objectsAt(
      renderKubernetes(
        edited(undefined, () => ({
          switchover: "stop-start",
          volumes: [backedUp("a", false), backedUp("b", false)],
        })),
      ),
      "serviceaccount.yaml",
    ) as { metadata: { name: string } }[];

    expect(accounts.map(({ metadata }) => metadata.name)).toStrictEqual([
      "notes-api",
      "notes-api-backup",
    ]);
  });
});

describe("the vso adapter", () => {
  const vso = (secrets: readonly unknown[]) =>
    renderVso(
      edited(
        () => ({ secretStore: STORE }),
        () => ({ secrets }),
      ),
    );

  it("restarts a blue-green Process's primary, which is what serves", () => {
    const [, secret] = objectsAt(vso([GRANT]), "vso.yaml") as {
      spec: { rolloutRestartTargets: unknown };
    }[];

    expect(secret?.spec.rolloutRestartTargets).toStrictEqual([
      { kind: "Deployment", name: "notes-api-primary" },
    ]);
  });

  it("syncs only what a grant delivers env or file, and nothing for a Process that reads its own", () => {
    expect(
      (objectsAt(vso([SELF, GRANT]), "vso.yaml") as { kind: string }[]).map(
        ({ kind }) => kind,
      ),
    ).toStrictEqual(["VaultAuth", "VaultStaticSecret"]);
    expect(vso([SELF]).map(({ path }) => path)).toStrictEqual([
      "apps/notes/vaultconnection.yaml",
    ]);
  });

  it("authenticates as the identity's ServiceAccount, for the role that carries its namespace", () => {
    const [auth] = objectsAt(vso([GRANT]), "vso.yaml") as {
      spec: { kubernetes: unknown };
    }[];

    // The Secret Store has no namespaces: the role's name carries the one the
    // identity is unique in, and it is the policy's name too.
    expect(auth?.spec.kubernetes).toStrictEqual({
      role: "notes-system-notes-api",
      serviceAccount: "notes-api",
    });
  });

  it("stops at a grant outside the kv mount", () => {
    expect(() => vso([{ ...GRANT, path: "kv/secret/data/x" }])).toThrow(
      "kv/secret/data/x: a grant outside the secret mount is not rendered yet",
    );
  });
});

describe("the vault-policy adapter", () => {
  const policy = (grant: unknown) =>
    renderVaultPolicy(edited(undefined, () => ({ secrets: [grant] })));

  it("covers each path an engine grant derives, with what it may do there", () => {
    const [document] = objectsAt(
      policy({
        engine: "transit",
        delivery: "self",
        paths: [
          { path: "transit/sign/notes-jwt", allows: ["update"] },
          { path: "transit/keys/notes-jwt/rotate", allows: ["update"] },
        ],
      }),
      "policy.json",
    );

    expect(document).toStrictEqual({
      path: {
        "transit/sign/notes-jwt": { capabilities: ["update"] },
        "transit/keys/notes-jwt/rotate": { capabilities: ["update"] },
      },
    });
  });

  it("writes an identity's documents under the name Vault holds them by, and binds the role to that policy", () => {
    const rendered = policy(GRANT);

    expect(rendered.map(({ path }) => path)).toStrictEqual([
      "apps/vso-secrets/policies/notes-system-notes-api.policy.json",
      "apps/vso-secrets/policies/notes-system-notes-api.role.json",
    ]);
    expect(objectsAt(rendered, "role.json")).toStrictEqual([
      {
        bound_service_account_names: ["notes-api"],
        bound_service_account_namespaces: ["notes-system"],
        token_policies: ["notes-system-notes-api"],
      },
    ]);
  });

  it("makes two identities that derive one name claim one path, which the render refuses", () => {
    // A hyphen does not keep two hyphenated names apart: `a-system` + `system-c`
    // and `a-system-system` + `c` are one name, and so one role in Vault.
    const held = (namespace: string, name: string) =>
      renderVaultPolicy(
        edited(
          () => ({ namespace }),
          () => ({ name, identity: name, secrets: [GRANT] }),
        ),
      );
    const both = [
      ...held("a-system", "system-c"),
      ...held("a-system-system", "c"),
    ];

    expect(
      collisions(both).map(({ code, message }) => [code, message]),
    ).toStrictEqual([
      [
        "E_PATH_COLLISION",
        "apps/vso-secrets/policies/a-system-system-c.policy.json is claimed by vault-policy and vault-policy",
      ],
      [
        "E_PATH_COLLISION",
        "apps/vso-secrets/policies/a-system-system-c.role.json is claimed by vault-policy and vault-policy",
      ],
    ]);
  });

  it("stops at an access tier it does not spell yet, and at a grant outside the kv mount", () => {
    expect(() => policy({ ...GRANT, access: "custody" })).toThrow(
      "secret/data/notes/token: a custody grant is not rendered yet",
    );
    expect(() => policy({ ...GRANT, path: "kv/secret/data/x" })).toThrow(
      "kv/secret/data/x: a grant outside the kv mount is not rendered yet",
    );
  });
});
