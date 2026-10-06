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
    ).toThrow(
      "notes-api: a file grant other than one key at a mode, below a directory, is not rendered yet",
    );
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

  // REQ-048 (docs/requirements.md): a Process that holds admitted API access
  // renders its ClusterRole, its binding and its egress to the API.
  const API = {
    reason: "it reads what the cluster holds",
    rules: [
      { group: "core", objects: ["configmaps", "pods"], verbs: ["get"] },
      { group: "flagger.app", objects: ["canaries"], verbs: ["get", "list"] },
    ],
    server: [{ cidr: "10.43.0.1/32", port: 443 }],
  } as const;

  it("replaces a rolling Process pod by pod under its own count and never a pod more, with a Service and no Canary", () => {
    const rendered = renderKubernetes(
      edited(undefined, () => ({ switchover: "rolling", replicas: 2 })),
    );
    const [deployment] = objectsAt(rendered, "workload.yaml") as {
      spec: { replicas: number; strategy: unknown };
    }[];

    expect(deployment?.spec.replicas).toBe(2);
    expect(deployment?.spec.strategy).toStrictEqual({
      type: "RollingUpdate",
      rollingUpdate: { maxSurge: 0, maxUnavailable: 1 },
    });
    expect(
      (objectsAt(rendered, "service.yaml") as { kind: string }[]).map(
        ({ kind }) => kind,
      ),
    ).toStrictEqual(["Service"]);
    expect(rendered.map(({ path }) => path.split("/").at(-1))).not.toContain(
      "canary.yaml",
    );
  });

  it("binds a Process that holds API access to a ClusterRole of its declared rules, the core group spelled as Kubernetes spells it", () => {
    const rendered = renderKubernetes(edited(undefined, () => ({ api: API })));
    const metadata = {
      name: "notes-system-notes-api",
      labels: {
        "app.kubernetes.io/name": "notes-api",
        "app.kubernetes.io/instance": "notes-api",
        "app.kubernetes.io/part-of": "notes",
        "app.kubernetes.io/managed-by": "deploy-kit",
        "app.kubernetes.io/component": "node",
      },
    };

    expect(objectsAt(rendered, "notes/rbac.yaml")).toStrictEqual([
      {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: "ClusterRole",
        metadata,
        rules: [
          {
            apiGroups: [""],
            resources: ["configmaps", "pods"],
            verbs: ["get"],
          },
          {
            apiGroups: ["flagger.app"],
            resources: ["canaries"],
            verbs: ["get", "list"],
          },
        ],
      },
      {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: "ClusterRoleBinding",
        metadata,
        roleRef: {
          apiGroup: "rbac.authorization.k8s.io",
          kind: "ClusterRole",
          name: "notes-system-notes-api",
        },
        subjects: [
          {
            kind: "ServiceAccount",
            name: "notes-api",
            namespace: "notes-system",
          },
        ],
      },
    ]);
    // A Process that holds none renders no RBAC at all.
    expect(
      renderKubernetes(edited()).map(({ path }) => path.split("/").at(-1)),
    ).not.toContain("rbac.yaml");
  });

  it("admits where the Kubernetes API answers, by address, for a Process that holds access to it, and for no other", () => {
    const egressOf = (project: ReturnType<typeof edited>) =>
      (
        objectsAt(
          renderNetworking(project),
          "notes/notes/networkpolicy.yaml",
        ) as {
          spec: { egress: unknown[] };
        }[]
      )[0]?.spec.egress ?? [];
    const range = {
      to: [{ ipBlock: { cidr: "10.43.0.1/32" } }],
      ports: [{ protocol: "TCP", port: 443 }],
    };

    expect(
      egressOf(edited(undefined, () => ({ api: API }))).at(-1),
    ).toStrictEqual(range);
    expect(egressOf(edited())).not.toContainEqual(range);
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

  it("writes one policy for the one identity every backup of a Process runs as, admitting what all of them need, each peer once", () => {
    const here = { cidr: "203.0.113.0/24", port: 443 };
    const there = { cidr: "198.51.100.7/32", port: 8443 };

    // The first backup keeps its copies in the cluster; the others copy
    // off-cluster, one of them to a second range as well.
    expect(
      policies([
        volume("cache"),
        volume("data", { egress: [DNS] }),
        volume("more", { egress: [DNS], destinations: [here] }),
        volume("most", { egress: [DNS], destinations: [here, there] }),
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
          {
            to: [{ ipBlock: { cidr: "203.0.113.0/24" } }],
            ports: [{ protocol: "TCP", port: 443 }],
          },
          {
            to: [{ ipBlock: { cidr: "198.51.100.7/32" } }],
            ports: [{ protocol: "TCP", port: 8443 }],
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
        "estate/edge/public-frankfurt/notes-public.yaml",
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
      "estate/edge/public-frankfurt/kustomization.yaml": ["notes-public.yaml"],
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

  describe("a file grant", () => {
    const FILE = {
      ...GRANT,
      delivery: "file" as const,
      destination: "notes-api-notes-key",
      mountAt: "/run/secrets/notes/id_ed25519",
      fileMode: "0400",
    };
    const pod = (file: Record<string, unknown> = FILE) =>
      (
        objectsAt(
          renderKubernetes(
            edited(undefined, () => ({
              secrets: [GRANT, file],
              sidecars: [
                {
                  name: "sync",
                  image: "x@sha256:0",
                  memory: "32Mi",
                  cpu: "5m",
                },
              ],
            })),
          ),
          "workload.yaml",
        ) as {
          spec: {
            template: {
              spec: {
                containers: { volumeMounts?: unknown[]; env?: unknown[] }[];
                volumes?: unknown[];
              };
            };
          };
        }[]
      )[0]?.spec.template.spec;

    it("projects its one key as the file at its place, at its mode, beside the other grants", () => {
      expect(pod()?.volumes).toContainEqual({
        name: "secret-notes-api-notes-key",
        secret: {
          secretName: "notes-api-notes-key",
          items: [{ key: "token", path: "id_ed25519" }],
          defaultMode: 0o400,
        },
      });
    });

    it("mounts the file's directory read-only into the Process and every sidecar, so a rotation reaches it", () => {
      const mount = {
        name: "secret-notes-api-notes-key",
        mountPath: "/run/secrets/notes",
        readOnly: true,
      };

      expect(
        pod()?.containers.map(({ volumeMounts }) => volumeMounts),
      ).toStrictEqual([expect.arrayContaining([mount]), [mount]]);
    });

    it("puts nothing of it in the environment", () => {
      expect(JSON.stringify(pod()?.containers[0]?.env)).not.toContain(
        "notes-api-notes-key",
      );
    });

    it.each([
      ["no key", { keys: undefined }],
      ["two keys", { keys: ["a", "b"] }],
      ["no mode", { fileMode: undefined }],
      ["no place", { mountAt: undefined }],
      ["a place directly in /", { mountAt: "/id_ed25519" }],
      ["a relative place", { mountAt: "run/id_ed25519" }],
    ])("stops at one with %s, rather than placing it wrongly", (_, edit) => {
      expect(() => pod({ ...FILE, ...edit })).toThrow(
        "notes-api: a file grant other than one key at a mode, below a directory, is not rendered yet",
      );
    });
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
      "estate/vso-secrets/policies/notes-system-notes-api.policy.json",
      "estate/vso-secrets/policies/notes-system-notes-api.role.json",
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
        "estate/vso-secrets/policies/a-system-system-c.policy.json is claimed by vault-policy and vault-policy",
      ],
      [
        "E_PATH_COLLISION",
        "estate/vso-secrets/policies/a-system-system-c.role.json is claimed by vault-policy and vault-policy",
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

describe("what a migration plan and a count above one render", () => {
  const STORE = "http://vault.secrets-system.svc.cluster.local:8200";
  const PLAN = {
    runner: "ghcr.io/x/notes-migration@sha256:aa",
    uid: 1001,
    gid: 1002,
    nonTransactional: false,
    identity: "notes-migration",
    deadline: "10m",
    memory: "256Mi",
    cpu: "100m",
    scratch: "64Mi",
    database: {
      host: "postgres.data-system.svc",
      port: 5432,
      name: "notes_db",
    },
    credential: {
      engine: "database" as const,
      delivery: "self" as const,
      paths: [{ path: "database/creds/notes-owner", allows: ["read"] }],
    },
    egress: [
      {
        rule: "datastore" as const,
        namespace: "data-system",
        process: "postgres",
        port: 5432,
      },
      {
        rule: "secret-store" as const,
        namespace: "secrets-system",
        process: "vault",
        port: 8200,
      },
      { rule: "cluster-dns" as const, namespace: "kube-system", port: 53 },
    ],
  };
  const SERVING = `sha256:${"b".repeat(64)}`;
  const migrating = (plan: object = {}) =>
    edited(() => ({
      revision: `sha256:0123456789abcdef${"0".repeat(48)}`,
      secretStore: STORE,
      migration: { ...PLAN, ...plan },
    }));
  const LABELS = {
    "app.kubernetes.io/name": "notes-migration",
    "app.kubernetes.io/instance": "notes-migration",
    "app.kubernetes.io/part-of": "notes",
    "app.kubernetes.io/managed-by": "deploy-kit",
    "app.kubernetes.io/component": "none",
  };
  const job = (name: string, args: readonly string[]) => ({
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace: "notes-system",
      labels: LABELS,
      annotations: { "kustomize.toolkit.fluxcd.io/ssa": "IfNotPresent" },
    },
    spec: {
      suspend: true,
      backoffLimit: 0,
      activeDeadlineSeconds: 600,
      template: {
        metadata: { labels: LABELS },
        spec: {
          serviceAccountName: "notes-migration",
          automountServiceAccountToken: true,
          restartPolicy: "Never",
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1001,
            runAsGroup: 1002,
            seccompProfile: { type: "RuntimeDefault" },
          },
          containers: [
            {
              name: "migration",
              image: "ghcr.io/x/notes-migration@sha256:aa",
              args,
              env: [
                { name: "DATABASE_HOST", value: "postgres.data-system.svc" },
                { name: "DATABASE_PORT", value: "5432" },
                { name: "DATABASE_NAME", value: "notes_db" },
                { name: "VAULT_ADDR", value: STORE },
                { name: "VAULT_ROLE", value: "notes-system-notes-migration" },
                {
                  name: "VAULT_CREDENTIALS_PATH",
                  value: "database/creds/notes-owner",
                },
              ],
              resources: {
                requests: { memory: "256Mi", cpu: "100m" },
                limits: { memory: "256Mi" },
              },
              securityContext: {
                readOnlyRootFilesystem: true,
                capabilities: { drop: ["ALL"] },
              },
              volumeMounts: [{ name: "scratch", mountPath: "/tmp" }],
            },
          ],
          volumes: [{ name: "scratch", emptyDir: { sizeLimit: "64Mi" } }],
        },
      },
    },
  });

  it("renders the migration identity and the up Job named by the revision's tag, suspended and created once", () => {
    expect(
      objectsAt(renderKubernetes(migrating()), "notes/notes/migration.yaml"),
    ).toStrictEqual([
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: "notes-migration",
          namespace: "notes-system",
          labels: LABELS,
        },
      },
      job("notes-migration-0123456789ab", ["up", "0123456789ab"]),
    ]);
  });

  it("renders the down Job to the tag of the revision the release was proven against, and none on a first release", () => {
    const [, , down, ...more] = objectsAt(
      renderKubernetes(migrating({ testedAgainst: SERVING })),
      "notes/notes/migration.yaml",
    );

    expect(down).toStrictEqual(
      job("notes-migration-down-0123456789ab", ["down", "bbbbbbbbbbbb"]),
    );
    expect(more).toStrictEqual([]);
  });

  it("renders no migration file for an Application that moves no schema", () => {
    expect(
      renderKubernetes(edited()).filter(({ path }) =>
        path.endsWith("migration.yaml"),
      ),
    ).toStrictEqual([]);
  });

  it("gives the migration identity a policy of its own: what its plan admits, DNS on both protocols, and nothing in", () => {
    const policies = objectsAt(
      renderNetworking(migrating()),
      "notes/notes/networkpolicy.yaml",
    );

    expect(policies.slice(1)).toStrictEqual([
      {
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: {
          name: "notes-migration",
          namespace: "notes-system",
          labels: LABELS,
        },
        spec: {
          podSelector: {
            matchLabels: { "app.kubernetes.io/instance": "notes-migration" },
          },
          policyTypes: ["Ingress", "Egress"],
          egress: [
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      "kubernetes.io/metadata.name": "data-system",
                    },
                  },
                  podSelector: {
                    matchLabels: { "app.kubernetes.io/instance": "postgres" },
                  },
                },
              ],
              ports: [{ protocol: "TCP", port: 5432 }],
            },
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      "kubernetes.io/metadata.name": "secrets-system",
                    },
                  },
                  podSelector: {
                    matchLabels: { "app.kubernetes.io/instance": "vault" },
                  },
                },
              ],
              ports: [{ protocol: "TCP", port: 8200 }],
            },
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      "kubernetes.io/metadata.name": "kube-system",
                    },
                  },
                },
              ],
              ports: [
                { protocol: "UDP", port: 53 },
                { protocol: "TCP", port: 53 },
              ],
            },
          ],
        },
      },
    ]);
    expect(
      objectsAt(renderNetworking(edited()), "notes/notes/networkpolicy.yaml"),
    ).toHaveLength(1);
  });

  it("writes the migration identity's owner credential as its own policy and role, and syncs nothing for it", () => {
    const rendered = renderVaultPolicy(migrating());

    expect(rendered.map(({ path }) => path)).toStrictEqual([
      "estate/vso-secrets/policies/notes-system-notes-migration.policy.json",
      "estate/vso-secrets/policies/notes-system-notes-migration.role.json",
    ]);
    expect(rendered.flatMap(({ objects }) => objects)).toStrictEqual([
      { path: { "database/creds/notes-owner": { capabilities: ["read"] } } },
      {
        bound_service_account_names: ["notes-migration"],
        bound_service_account_namespaces: ["notes-system"],
        token_policies: ["notes-system-notes-migration"],
      },
    ]);
    expect(
      renderVso(migrating()).filter(({ path }) => path.endsWith("vso.yaml")),
    ).toStrictEqual([]);
  });

  const SCALED_LABELS = {
    "app.kubernetes.io/name": "notes-api",
    "app.kubernetes.io/instance": "notes-api",
    "app.kubernetes.io/part-of": "notes",
    "app.kubernetes.io/managed-by": "deploy-kit",
    "app.kubernetes.io/component": "node",
  };
  const budget = (matchLabels: object) => ({
    apiVersion: "policy/v1",
    kind: "PodDisruptionBudget",
    metadata: {
      name: "notes-api",
      namespace: "notes-system",
      labels: SCALED_LABELS,
    },
    spec: { maxUnavailable: 1, selector: { matchLabels } },
  });

  it("holds a blue-green Process's count in an autoscaler the Canary names, and budgets its primary", () => {
    const rendered = renderKubernetes(
      edited(undefined, () => ({ replicas: 3 })),
    );
    const [canary, autoscaler, ...more] = objectsAt(
      rendered,
      "canary.yaml",
    ) as [{ spec: { autoscalerRef?: unknown } }, ...unknown[]];

    expect(canary.spec.autoscalerRef).toStrictEqual({
      apiVersion: "autoscaling/v2",
      kind: "HorizontalPodAutoscaler",
      name: "notes-api",
    });
    expect(autoscaler).toStrictEqual({
      apiVersion: "autoscaling/v2",
      kind: "HorizontalPodAutoscaler",
      metadata: {
        name: "notes-api",
        namespace: "notes-system",
        labels: SCALED_LABELS,
      },
      spec: {
        scaleTargetRef: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          name: "notes-api",
        },
        minReplicas: 3,
        maxReplicas: 3,
      },
    });
    expect(more).toStrictEqual([]);
    expect(objectsAt(rendered, "pdb.yaml")).toStrictEqual([
      budget({ "app.kubernetes.io/name": "notes-api-primary" }),
    ]);
  });

  it("leaves a Process Flagger does not switch its own count, with no autoscaler, and budgets its own pods", () => {
    const rendered = renderKubernetes(
      edited(
        () => ({ releaseGate: undefined }),
        () => ({
          replicas: 2,
          switchover: "stop-start",
          cutover: "interrupted",
        }),
      ),
    );

    expect(
      rendered.filter(({ path }) => path.endsWith("canary.yaml")),
    ).toStrictEqual([]);
    expect(
      (
        objectsAt(rendered, "workload.yaml") as { spec: { replicas: number } }[]
      ).map(({ spec }) => spec.replicas),
    ).toStrictEqual([2]);
    expect(objectsAt(rendered, "pdb.yaml")).toStrictEqual([
      budget({ "app.kubernetes.io/instance": "notes-api" }),
    ]);
  });

  it("renders neither an autoscaler nor a budget at the one derived replica", () => {
    const rendered = renderKubernetes(edited());
    const [canary, ...more] = objectsAt(rendered, "canary.yaml") as [
      { spec: object },
      ...unknown[],
    ];

    expect(Object.keys(canary.spec)).not.toContain("autoscalerRef");
    expect(more).toStrictEqual([]);
    expect(
      rendered.filter(({ path }) => path.endsWith("pdb.yaml")),
    ).toStrictEqual([]);
  });
});
