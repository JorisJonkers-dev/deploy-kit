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
import type { NetworkPolicy } from "../../src/objects/kubernetes.ts";
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

/** A VPN as the resolution writes it beside an attached Process. */
const VPN = {
  image: "docker.io/qmcgaw/gluetun@sha256:" + "7".repeat(64),
  memory: "128Mi",
  cpu: "50m",
  forwardedPort: true,
  environment: [
    { name: "FIREWALL_INPUT_PORTS", value: "8080" },
    { name: "VPN_PORT_FORWARDING", value: "on" },
  ],
  credential: {
    path: "secret/data/platform/vpn",
    access: "read" as const,
    delivery: "env" as const,
    destination: "notes-api-vpn-platform-vpn",
  },
};

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
      "agents/agents.project.yml",
      "agents/env/hermes/base.env",
      "agents/config/hermes/config.yaml",
      "utility/utility.project.yml",
      "utility/config/adguard/AdGuardHome.yaml",
      "edge/edge.project.yml",
      "observability/observability.project.yml",
      "observability/rules/platform.yaml",
      "secrets/secrets.project.yml",
      "secrets/config/vault.hcl",
      "identity/identity.project.yml",
      "observability/env/grafana/base.env",
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
        // minimal's library mount and VPN attachment, with the internet
        // egress the attachment derives, and its L4 exposure, with the `ssh`
        // surface it reaches, stay out unless an edit puts them back, so each
        // variant holds one thing to spell.
        processes: [
          without(first, {
            libraries: undefined,
            vpn: undefined,
            internetEgress: undefined,
            l4Exposure: undefined,
            surfaces: first.surfaces?.filter(({ name }) => name !== "ssh"),
            ...process(first),
          }),
        ],
      },
    ],
  };
}

const objectsAt = (
  deliverables: readonly { path: string; objects: readonly unknown[] }[],
  suffix: string,
) => deliverables.find(({ path }) => path.endsWith(suffix))?.objects ?? [];

describe("the kubernetes adapter", () => {
  it("holds a Process to the node its volume is bound to, and otherwise to every node eligible for it, by name", () => {
    const nodesOf = (project: ResolvedProject): unknown =>
      renderKubernetes(project)
        .flatMap(({ objects }) => objects)
        .flatMap((object) =>
          "kind" in object && object.kind === "Deployment"
            ? [
                object.spec.template.spec.affinity?.nodeAffinity
                  .requiredDuringSchedulingIgnoredDuringExecution
                  .nodeSelectorTerms,
              ]
            : [],
        );
    const placed = (placement: Process["placement"]) =>
      nodesOf(edited(undefined, () => ({ placement })));
    const term = (values: readonly string[]) => [
      [
        {
          matchExpressions: [
            { key: "kubernetes.io/hostname", operator: "In", values },
          ],
        },
      ],
    ];

    expect(placed({ eligibleNodes: ["a", "b"] })).toStrictEqual(
      term(["a", "b"]),
    );
    expect(
      placed({
        eligibleNodes: ["a", "b"],
        boundTo: "b",
        from: "cluster-state",
      }),
    ).toStrictEqual(term(["b"]));
  });

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
      {
        group: "core",
        objects: ["configmaps", "pods"],
        verbs: ["get"],
        scope: "cluster",
      },
      {
        group: "flagger.app",
        objects: ["canaries"],
        verbs: ["get", "list"],
        scope: "cluster",
      },
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

  // REQ-106 (docs/requirements.md): an api rule's scope is its Process's
  // namespace or the cluster, and renders a Role or a ClusterRole to match.
  it("binds a namespace-scoped rule to a Role in the Process's namespace, and a cluster-scoped one to a ClusterRole", () => {
    const rendered = renderKubernetes(
      edited(undefined, () => ({
        api: {
          ...API,
          rules: [
            {
              group: "core",
              objects: ["configmaps"],
              verbs: ["create", "update"],
              scope: "namespace",
            },
            {
              group: "batch",
              objects: ["jobs"],
              verbs: ["patch"],
              scope: "cluster",
            },
          ],
        },
      })),
    );
    const objects = objectsAt(rendered, "notes/rbac.yaml") as {
      kind: string;
      metadata: { name: string; namespace?: string };
      rules?: unknown[];
      roleRef?: unknown;
    }[];

    expect(
      objects.map(({ kind, metadata }) => [
        kind,
        metadata.name,
        metadata.namespace,
      ]),
    ).toStrictEqual([
      ["Role", "notes-api", "notes-system"],
      ["RoleBinding", "notes-api", "notes-system"],
      ["ClusterRole", "notes-system-notes-api", undefined],
      ["ClusterRoleBinding", "notes-system-notes-api", undefined],
    ]);
    expect(objects[0]?.rules).toStrictEqual([
      {
        apiGroups: [""],
        resources: ["configmaps"],
        verbs: ["create", "update"],
      },
    ]);
    expect(objects[1]?.roleRef).toStrictEqual({
      apiGroup: "rbac.authorization.k8s.io",
      kind: "Role",
      name: "notes-api",
    });
    expect(objects[2]?.rules).toStrictEqual([
      { apiGroups: ["batch"], resources: ["jobs"], verbs: ["patch"] },
    ]);
  });

  it("renders no ClusterRole for a Process whose every rule is namespace-scoped", () => {
    const kinds = (
      objectsAt(
        renderKubernetes(
          edited(undefined, () => ({
            api: {
              ...API,
              rules: API.rules.map((rule) => ({
                ...rule,
                scope: "namespace" as const,
              })),
            },
          })),
        ),
        "notes/rbac.yaml",
      ) as { kind: string }[]
    ).map(({ kind }) => kind);

    expect(kinds).toStrictEqual(["Role", "RoleBinding"]);
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
    // A Process that holds no rule still reaches the API, and renders no RBAC.
    const reaching = edited(undefined, () => ({ api: { ...API, rules: [] } }));
    expect(egressOf(reaching).at(-1)).toStrictEqual(range);
    expect(
      renderKubernetes(reaching).map(({ path }) => path.split("/").at(-1)),
    ).not.toContain("rbac.yaml");
  });

  // REQ-105 (docs/requirements.md): a Process that serves DNS resolves
  // through the nameservers it is handed, never the cluster's DNS.
  it("resolves a Process through the nameservers it is handed, and any other through the cluster's DNS", () => {
    const dnsOf = (project: ReturnType<typeof edited>) =>
      renderKubernetes(project)
        .flatMap(({ objects }) => objects)
        .flatMap((object) => {
          const pod = (
            object as {
              spec?: { template?: { spec?: Record<string, unknown> } };
            }
          ).spec?.template?.spec;
          return pod === undefined
            ? []
            : [{ policy: pod["dnsPolicy"], config: pod["dnsConfig"] }];
        });

    expect(
      dnsOf(
        edited(undefined, () => ({
          nameservers: ["9.9.9.10", "149.112.112.10"],
        })),
      ),
    ).toStrictEqual([
      {
        policy: "None",
        config: { nameservers: ["9.9.9.10", "149.112.112.10"] },
      },
    ]);
    expect(dnsOf(edited())).toStrictEqual([
      { policy: undefined, config: undefined },
    ]);
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

  describe("a library mount", () => {
    const LIBRARY = {
      library: "media",
      claim: "library-media",
      volume: "notes-system-media",
      node: "enschede-t1000-1",
      path: "/srv/media",
      gid: 3001,
      mountAt: "/attachments",
      access: "read" as const,
    };
    const podOf = (project: ResolvedProject) =>
      (
        objectsAt(renderKubernetes(project), "workload.yaml") as {
          spec: {
            template: {
              spec: {
                securityContext: Record<string, unknown>;
                containers: { volumeMounts?: unknown[] }[];
                volumes?: unknown[];
              };
            };
          };
        }[]
      )[0]?.spec.template.spec;
    const CACHE = {
      claim: "cache",
      mountAt: "/cache",
      size: "2Gi",
      durability: "reconstructible",
    };

    it("mounts the library's claim below its subPath, read-only for a read mount, one volume for both", () => {
      const pod = podOf(
        edited(undefined, () => ({
          libraries: [
            { ...LIBRARY, subPath: "Photos" },
            {
              ...LIBRARY,
              mountAt: "/inbox",
              subPath: "Inbox",
              access: "write",
            },
          ],
        })),
      );

      expect(pod?.containers[0]?.volumeMounts).toStrictEqual([
        {
          name: "library-media",
          mountPath: "/attachments",
          subPath: "Photos",
          readOnly: true,
        },
        { name: "library-media", mountPath: "/inbox", subPath: "Inbox" },
      ]);
      expect(pod?.volumes).toStrictEqual([
        {
          name: "library-media",
          persistentVolumeClaim: { claimName: "library-media" },
        },
      ]);
    });

    it("mounts the whole library where the mount names no subPath", () => {
      const pod = podOf(edited(undefined, () => ({ libraries: [LIBRARY] })));

      expect(pod?.containers[0]?.volumeMounts).toStrictEqual([
        { name: "library-media", mountPath: "/attachments", readOnly: true },
      ]);
    });

    it("runs the pod with each library's group once, in order, and no fsGroup though it holds a claim", () => {
      const library = (name: string, gid: number) => ({
        ...LIBRARY,
        library: name,
        claim: `library-${name}`,
        volume: `notes-system-${name}`,
        gid,
      });
      const pod = podOf(
        edited(undefined, () => ({
          volumes: [CACHE],
          libraries: [
            library("media", 3001),
            library("books", 2001),
            library("photos", 3001),
          ],
        })),
      );

      expect(pod?.securityContext["supplementalGroups"]).toStrictEqual([
        2001, 3001,
      ]);
      expect(pod?.securityContext).not.toHaveProperty("fsGroup");
      expect(
        podOf(edited(undefined, () => ({ volumes: [CACHE] })))?.securityContext,
      ).not.toHaveProperty("supplementalGroups");
    });

    it("writes, once per library the project mounts, the local volume held to its node and the claim bound to it, neither ever pruned", () => {
      const project = edited(undefined, () => ({
        libraries: [LIBRARY, { ...LIBRARY, mountAt: "/again" }],
      }));
      const metadata = {
        labels: { "app.kubernetes.io/managed-by": "deploy-kit" },
        annotations: { "kustomize.toolkit.fluxcd.io/prune": "disabled" },
      };

      expect(renderKubernetes(project).map(({ path }) => path)).toContain(
        "apps/notes/libraries.yaml",
      );
      expect(
        objectsAt(renderKubernetes(project), "libraries.yaml"),
      ).toStrictEqual([
        {
          apiVersion: "v1",
          kind: "PersistentVolume",
          metadata: { name: "notes-system-media", ...metadata },
          spec: {
            capacity: { storage: "1Gi" },
            volumeMode: "Filesystem",
            accessModes: ["ReadWriteOnce"],
            persistentVolumeReclaimPolicy: "Retain",
            storageClassName: "",
            claimRef: { namespace: "notes-system", name: "library-media" },
            local: { path: "/srv/media" },
            nodeAffinity: {
              required: {
                nodeSelectorTerms: [
                  {
                    matchExpressions: [
                      {
                        key: "kubernetes.io/hostname",
                        operator: "In",
                        values: ["enschede-t1000-1"],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
        {
          apiVersion: "v1",
          kind: "PersistentVolumeClaim",
          metadata: {
            name: "library-media",
            namespace: "notes-system",
            ...metadata,
          },
          spec: {
            storageClassName: "",
            volumeName: "notes-system-media",
            accessModes: ["ReadWriteOnce"],
            resources: { requests: { storage: "1Gi" } },
          },
        },
      ]);
    });

    it("writes the libraries of every Application of the project, in name order", () => {
      const project = edited(undefined, () => ({
        libraries: [
          {
            ...LIBRARY,
            library: "photos",
            claim: "library-photos",
            volume: "notes-system-photos",
          },
        ],
      }));
      const [only] = project.applications;
      const second = {
        ...(only as Application),
        id: "second",
        processes: (only as Application).processes.map((process) => ({
          ...process,
          libraries: [LIBRARY],
        })),
      };
      const names = objectsAt(
        renderKubernetes({
          ...project,
          applications: [only as Application, second],
        }),
        "libraries.yaml",
      ).map(
        (object) => (object as { metadata: { name: string } }).metadata.name,
      );

      expect(names).toStrictEqual([
        "notes-system-media",
        "library-media",
        "notes-system-photos",
        "library-photos",
      ]);
    });
  });

  describe("a VPN attachment", () => {
    const podOf = (forwardedPort: boolean) =>
      (
        objectsAt(
          renderKubernetes(
            edited(undefined, () => ({
              vpn: { ...VPN, forwardedPort },
            })),
          ),
          "workload.yaml",
        ) as {
          spec: {
            template: {
              spec: {
                initContainers?: Record<string, unknown>[];
                containers: { volumeMounts?: unknown[] }[];
                volumes?: unknown[];
              };
            };
          };
        }[]
      )[0]?.spec.template.spec;

    it("runs the VPN as a native sidecar before the Process, as root with the two network capabilities, reading its own Secret", () => {
      const [vpn] = podOf(true)?.initContainers ?? [];

      expect(vpn).toMatchObject({
        name: "vpn",
        restartPolicy: "Always",
        envFrom: [{ secretRef: { name: "notes-api-vpn-platform-vpn" } }],
        resources: {
          requests: { memory: "128Mi", cpu: "50m" },
          limits: { memory: "128Mi" },
        },
        securityContext: {
          runAsNonRoot: false,
          runAsUser: 0,
          runAsGroup: 0,
          capabilities: { add: ["NET_ADMIN", "NET_RAW"] },
        },
        startupProbe: {
          exec: { command: ["/gluetun-entrypoint", "healthcheck"] },
          periodSeconds: 5,
          timeoutSeconds: 5,
          failureThreshold: 60,
        },
        volumeMounts: [{ name: "vpn", mountPath: "/run/vpn" }],
      });
      expect(vpn?.env).toStrictEqual(VPN.environment);
    });

    it("shares the forwarded port read-only with a Process that receives one, and with no other", () => {
      const forwarded = podOf(true);
      const egressOnly = podOf(false);

      expect(forwarded?.containers[0]?.volumeMounts).toContainEqual({
        name: "vpn",
        mountPath: "/run/vpn",
        readOnly: true,
      });
      expect(egressOnly?.containers[0]?.volumeMounts ?? []).not.toContainEqual(
        expect.objectContaining({ name: "vpn" }),
      );
      expect(egressOnly?.volumes).toContainEqual({
        name: "vpn",
        emptyDir: { sizeLimit: "1Mi" },
      });
    });

    it("adds no sidecar and no volume to a Process that does not attach", () => {
      const pod = (
        objectsAt(renderKubernetes(edited()), "workload.yaml") as {
          spec: { template: { spec: Record<string, unknown> } };
        }[]
      )[0]?.spec.template.spec;

      expect(pod).not.toHaveProperty("initContainers");
      expect(pod?.["volumes"] ?? []).not.toContainEqual(
        expect.objectContaining({ name: "vpn" }),
      );
    });
  });

  it("writes no Service for a stop-start Process that serves nothing, and no file with nothing in it", () => {
    // An Application none of whose Processes switches blue-green carries no gate.
    // With no exposure it has no external checks either.
    const rendered = renderKubernetes(
      edited(
        () => ({ releaseGate: undefined, exposure: undefined }),
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
      objectsAt(renderKubernetes(project), "notes/configmap.yaml")[0],
    ).toStrictEqual({
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
    });
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
      ["notes-external-checks", undefined],
      ["notes-api-settings-0a1b2c3d", true],
    ]);
  });

  // REQ-150 (docs/requirements.md): an Application's external checks, one per
  // route, in a ConfigMap of its own namespace that the checker gathers by
  // its sixth label (spec/v1/14-platform-intent.md#the-foundation-is-declared).
  describe("an Application's external checks", () => {
    const checksOf = (project: ResolvedProject): unknown[] =>
      (
        objectsAt(renderKubernetes(project), "notes/configmap.yaml") as {
          metadata: { name: string };
        }[]
      ).filter(({ metadata }) => metadata.name === "notes-external-checks");

    it("checks each route on its host and path, failing on a 5xx or no answer", () => {
      expect(checksOf(minimal())).toStrictEqual([
        {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: "notes-external-checks",
            namespace: "notes-system",
            labels: {
              "app.kubernetes.io/part-of": "notes",
              "app.kubernetes.io/managed-by": "deploy-kit",
              "estate.jorisjonkers.dev/external-checks": "true",
            },
          },
          data: {
            "notes-external-checks.yaml": {
              json: {
                endpoints: [
                  {
                    name: "notes-public-1",
                    group: "notes",
                    url: "https://notes.jorisjonkers.dev/",
                    conditions: ["[STATUS] < 500"],
                  },
                ],
              },
            },
          },
        },
      ]);
    });

    it("numbers the checks per exposure in route order, over http on a plain listener", () => {
      const project = edited((only) => {
        const [public_] = only.exposure ?? [];
        if (public_ === undefined) throw new Error("minimal has no exposure");
        const [route] = public_.routes;
        if (route === undefined) throw new Error("minimal has no route");
        return {
          exposure: [
            public_,
            {
              ...public_,
              name: "lan",
              host: "notes.lan",
              listener: "plain",
              routes: [route, { ...route, path: "/api", match: "exact" }],
            },
          ],
        };
      });

      expect(
        (
          checksOf(project) as {
            data: Record<string, { json: { endpoints: unknown[] } }>;
          }[]
        )[0]?.data["notes-external-checks.yaml"]?.json.endpoints,
      ).toStrictEqual([
        {
          name: "notes-public-1",
          group: "notes",
          url: "https://notes.jorisjonkers.dev/",
          conditions: ["[STATUS] < 500"],
        },
        {
          name: "notes-lan-1",
          group: "notes",
          url: "http://notes.lan/",
          conditions: ["[STATUS] < 500"],
        },
        {
          name: "notes-lan-2",
          group: "notes",
          url: "http://notes.lan/api",
          conditions: ["[STATUS] < 500"],
        },
      ]);
    });

    it("renders none for an Application with no exposure, and the label on no other object", () => {
      expect(checksOf(edited(() => ({ exposure: undefined })))).toStrictEqual(
        [],
      );
      const labelled = renderKubernetes(minimal())
        .flatMap(({ objects }) => objects)
        .filter(
          (object) =>
            "metadata" in object &&
            "estate.jorisjonkers.dev/external-checks" in object.metadata.labels,
        )
        .map((object) => ("metadata" in object ? object.metadata.name : ""));

      expect(labelled).toStrictEqual(["notes-external-checks"]);
    });
  });

  // spec/v1/17-sign-in.md#the-client: one cluster-scoped Client per
  // Application that declares one, named by the Application Id. REQ-151
  // (docs/requirements.md): its back-channel logout URI after its redirects.
  it("writes an Application's Client, cluster-scoped and named for it, every field in the chapter's order", () => {
    const rendered = renderKubernetes(
      edited(() => ({
        client: {
          signIn: "native" as const,
          host: "notes.jorisjonkers.dev",
          launchUrl: "https://notes.jorisjonkers.dev/",
          iconUrl: "https://notes.jorisjonkers.dev/favicon.svg",
          redirectUris: ["https://notes.jorisjonkers.dev/callback"],
          backChannelLogoutUri: "https://notes.jorisjonkers.dev/logout",
          credential: "secret" as const,
          secretPath: "secret/data/notes-system/notes/client",
          roles: ["user", "writer"],
          label: "Notes",
          description: "Everything written down",
        },
      })),
    );
    const [client] = objectsAt(rendered, "/notes/client.yaml");

    expect(JSON.stringify(client)).toBe(
      JSON.stringify({
        apiVersion: "identity.jorisjonkers.dev/v1",
        kind: "Client",
        metadata: {
          name: "notes",
          labels: {
            "app.kubernetes.io/part-of": "notes",
            "app.kubernetes.io/managed-by": "deploy-kit",
          },
        },
        spec: {
          signIn: "native",
          host: "notes.jorisjonkers.dev",
          launchUrl: "https://notes.jorisjonkers.dev/",
          iconUrl: "https://notes.jorisjonkers.dev/favicon.svg",
          redirectUris: ["https://notes.jorisjonkers.dev/callback"],
          backChannelLogoutUri: "https://notes.jorisjonkers.dev/logout",
          credential: "secret",
          secretPath: "secret/data/notes-system/notes/client",
          roles: ["user", "writer"],
          label: "Notes",
          description: "Everything written down",
        },
      }),
    );
  });

  it("writes only the fields a Client holds, so a token Client carries no tile", () => {
    const [client] = objectsAt(
      renderKubernetes(
        edited(() => ({
          client: {
            signIn: "token" as const,
            host: "notes.jorisjonkers.dev",
            roles: ["user"],
          },
        })),
      ),
      "/notes/client.yaml",
    ) as { spec: Record<string, unknown> }[];

    expect(Object.keys(client?.spec ?? {})).toStrictEqual([
      "signIn",
      "host",
      "roles",
    ]);
  });

  it("writes no Client for an Application that declares none", () => {
    expect(
      renderKubernetes(edited()).map(({ path }) => path.split("/").at(-1)),
    ).not.toContain("client.yaml");
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
  // spec/v1/16-dependencies.md#the-mesh-tunnel: the kubelet's probes reach
  // an enrolled Process from one rewritten address, on each port it probes.
  describe("in an enrolled namespace", () => {
    const MESH = {
      dataplane: "ambient" as const,
      tunnelPort: 15008,
      probeSource: "169.254.7.127/32",
    };
    const probeRules = (process: Edit<Process>) => {
      const [policy] = objectsAt(
        renderNetworking(edited(() => ({ mesh: MESH }), process)),
        "notes/notes/networkpolicy.yaml",
      ) as NetworkPolicy[];
      return (policy?.spec.ingress ?? []).filter(({ from }) =>
        from.some((peer) => "ipBlock" in peer),
      );
    };

    it("admits the probes on the one port a Process probes for readiness alone", () => {
      expect(
        probeRules(() => ({ liveness: undefined, startup: undefined })),
      ).toStrictEqual([
        {
          from: [{ ipBlock: { cidr: "169.254.7.127/32" } }],
          ports: [{ protocol: "TCP", port: 8080 }],
        },
      ]);
    });

    it("admits no probe address to a Process the kubelet does not probe", () => {
      expect(
        probeRules(() => ({
          readiness: undefined,
          liveness: undefined,
          startup: undefined,
        })),
      ).toStrictEqual([]);
    });
  });

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

  it("admits the nameservers a Process that serves DNS resolves through, on UDP and TCP port 53, and none for any other", () => {
    const egressOf = (project: ReturnType<typeof edited>) =>
      (
        objectsAt(
          renderNetworking(project),
          "notes/notes/networkpolicy.yaml",
        ) as { spec: { egress: unknown[] } }[]
      )[0]?.spec.egress ?? [];
    const upstream = {
      to: [
        { ipBlock: { cidr: "9.9.9.10/32" } },
        { ipBlock: { cidr: "149.112.112.10/32" } },
      ],
      ports: [
        { protocol: "UDP", port: 53 },
        { protocol: "TCP", port: 53 },
      ],
    };

    expect(
      egressOf(
        edited(undefined, () => ({
          nameservers: ["9.9.9.10", "149.112.112.10"],
        })),
      ),
    ).toContainEqual(upstream);
    expect(egressOf(edited())).not.toContainEqual(upstream);
  });

  // REQ-107 (docs/requirements.md): a spawn template's pods get a policy of
  // their own, selected by the label every one of them carries.
  it("writes a policy for each spawn template's pods: reached by its Process alone, reaching the DNS, its edges and the internet", () => {
    const policies = objectsAt(
      renderNetworking(
        edited(undefined, () => ({
          spawns: [
            {
              name: "runner",
              image: "ghcr.io/example/runner@sha256:00",
              uid: 1000,
              gid: 1000,
              memory: "256Mi",
              cpu: "100m",
              selector: "notes-api-runner",
              surfaces: [{ name: "http", port: 8090 }],
              consumes: ["notes-store.store"],
              dependencies: [
                {
                  application: "notes-store",
                  surface: "store",
                  address: "notes-store.notes-system.svc.cluster.local:7000",
                  peers: [
                    {
                      namespace: "notes-system",
                      process: "notes-store",
                      port: 7000,
                    },
                  ],
                },
              ],
              egress: [
                { rule: "cluster-dns", namespace: "kube-system", port: 53 },
              ],
              internetEgress: { reason: "it clones repositories" },
            },
          ],
        })),
      ),
      "notes/notes/networkpolicy.yaml",
    ) as { metadata: { name: string }; spec: Record<string, unknown> }[];
    const runner = policies.find(
      ({ metadata }) => metadata.name === "notes-api-runner",
    );
    const own = policies.find(({ metadata }) => metadata.name === "notes-api");
    // A template that serves nothing is reached by nothing, so the Process's
    // own policy reaches none of its pods.
    const silent = objectsAt(
      renderNetworking(
        edited(undefined, () => ({
          spawns: [
            {
              name: "runner",
              image: "ghcr.io/example/runner@sha256:00",
              uid: 1000,
              gid: 1000,
              memory: "256Mi",
              cpu: "100m",
              selector: "notes-api-runner",
              egress: [
                { rule: "cluster-dns", namespace: "kube-system", port: 53 },
              ],
            },
          ],
        })),
      ),
      "notes/notes/networkpolicy.yaml",
    ) as { metadata: { name: string }; spec: Record<string, unknown> }[];
    const plain = objectsAt(
      renderNetworking(edited()),
      "notes/notes/networkpolicy.yaml",
    ) as { metadata: { name: string }; spec: Record<string, unknown> }[];
    const specOf = (
      rendered: typeof plain,
      name: string,
    ): Record<string, unknown> | undefined =>
      rendered.find(({ metadata }) => metadata.name === name)?.spec;
    expect(specOf(silent, "notes-api")?.["egress"]).toStrictEqual(
      specOf(plain, "notes-api")?.["egress"],
    );
    // Its pods are reached by nothing, and reach the DNS alone.
    expect(specOf(silent, "notes-api-runner")).toStrictEqual({
      podSelector: {
        matchLabels: {
          "deploy-kit.jorisjonkers.dev/spawned-from": "notes-api-runner",
        },
      },
      policyTypes: ["Ingress", "Egress"],
      egress: [
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
    });

    // The Process reaches its template's pods on the surfaces they serve.
    expect((own?.spec["egress"] as unknown[] | undefined) ?? []).toContainEqual(
      {
        to: [
          {
            namespaceSelector: {
              matchLabels: { "kubernetes.io/metadata.name": "notes-system" },
            },
            podSelector: {
              matchLabels: {
                "deploy-kit.jorisjonkers.dev/spawned-from": "notes-api-runner",
              },
            },
          },
        ],
        ports: [{ protocol: "TCP", port: 8090 }],
      },
    );

    expect(runner?.spec).toStrictEqual({
      podSelector: {
        matchLabels: {
          "deploy-kit.jorisjonkers.dev/spawned-from": "notes-api-runner",
        },
      },
      policyTypes: ["Ingress", "Egress"],
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": "notes-system" },
              },
              podSelector: {
                matchLabels: { "app.kubernetes.io/instance": "notes-api" },
              },
            },
          ],
          ports: [{ protocol: "TCP", port: 8090 }],
        },
      ],
      egress: [
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": "notes-system" },
              },
              podSelector: {
                matchLabels: { "app.kubernetes.io/instance": "notes-store" },
              },
            },
          ],
          ports: [{ protocol: "TCP", port: 7000 }],
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
          to: [
            {
              ipBlock: {
                cidr: "0.0.0.0/0",
                except: [
                  "10.0.0.0/8",
                  "172.16.0.0/12",
                  "192.168.0.0/16",
                  "100.64.0.0/10",
                  "169.254.0.0/16",
                  "127.0.0.0/8",
                ],
              },
            },
          ],
        },
      ],
    });
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

  it.each(["stop-start", "rolling"] as const)(
    "scrapes a %s Process through a ServiceMonitor, on the surface the scrape names",
    (switchover) => {
      const rendered = renderPrometheus(
        edited(undefined, () => ({ switchover })),
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
        selector: {
          matchLabels: { "app.kubernetes.io/instance": "notes-api" },
        },
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
    },
  );

  it("stops at a scraped Process that switches nothing, whose monitor waits on its slice", () => {
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

  // REQ-086 (docs/requirements.md): a route's redirect is a RedirectRegex
  // Middleware of its own, keeping the request's scheme and host.
  it("spells a redirect as a Middleware of the route's own, to the path on the same host", () => {
    const [deliverable] = exposed(({ routes }) => ({
      routes: routes.map((route) => ({
        ...route,
        middleware: [
          { kind: "security-headers" as const },
          { kind: "redirect" as const, redirectTo: "/admin/" },
        ],
      })),
    }));
    const [route] = routeOf([deliverable] as ReturnType<
      typeof renderTraefik
    >)?.["routes"] as Record<string, unknown>[];

    expect(route?.["middlewares"]).toStrictEqual([
      { name: "security-headers", namespace: "edge-system" },
      { name: "notes-public-1-redirect", namespace: "notes-system" },
    ]);
    expect(deliverable?.objects[1]).toStrictEqual({
      apiVersion: "traefik.io/v1alpha1",
      kind: "Middleware",
      metadata: {
        name: "notes-public-1-redirect",
        namespace: "notes-system",
        labels: {
          "app.kubernetes.io/part-of": "notes",
          "app.kubernetes.io/managed-by": "deploy-kit",
        },
      },
      spec: {
        redirectRegex: {
          regex: "^(https?://[^/]+)(/.*)?$",
          replacement: "${1}/admin/",
          permanent: false,
        },
      },
    });
  });

  // REQ-073 (docs/requirements.md): a route's rate limit is a Middleware of
  // its own, counting a client by the address its tier says.
  const limited = (clientAddress: "connection" | "cloudflare") =>
    exposed(({ routes }) => ({
      routes: routes.map((route) => ({
        ...route,
        middleware: [
          { kind: "security-headers" as const },
          {
            kind: "rate-limit" as const,
            allowance: 10,
            per: "1h",
            burst: 10,
            clientAddress,
          },
        ],
      })),
    }));

  it("spells a rate limit as a Middleware of the route's own, beside its IngressRoute in the Application's namespace", () => {
    const [deliverable] = limited("connection");
    const [route] = routeOf([deliverable] as ReturnType<
      typeof renderTraefik
    >)?.["routes"] as Record<string, unknown>[];

    expect(route?.["middlewares"]).toStrictEqual([
      { name: "security-headers", namespace: "edge-system" },
      { name: "notes-public-1-rate-limit", namespace: "notes-system" },
    ]);
    expect(deliverable?.objects[1]).toStrictEqual({
      apiVersion: "traefik.io/v1alpha1",
      kind: "Middleware",
      metadata: {
        name: "notes-public-1-rate-limit",
        namespace: "notes-system",
        labels: {
          "app.kubernetes.io/part-of": "notes",
          "app.kubernetes.io/managed-by": "deploy-kit",
        },
      },
      spec: { rateLimit: { average: 10, period: "1h", burst: 10 } },
    });
  });

  it("counts a client behind Cloudflare by the address Cloudflare forwards", () => {
    const [deliverable] = limited("cloudflare");

    expect(
      (deliverable?.objects[1] as { spec: { rateLimit: unknown } }).spec
        .rateLimit,
    ).toStrictEqual({
      average: 10,
      period: "1h",
      burst: 10,
      sourceCriterion: { requestHeaderName: "CF-Connecting-IP" },
    });
  });

  it("renders no route for an Application that exposes nothing", () => {
    expect(
      renderTraefik(edited(() => ({ exposure: undefined }))),
    ).toStrictEqual([]);
  });

  // spec/v1/17-sign-in.md#what-the-edge-derives: a gated Client's /.auth/
  // route is the Gate's, served by the Service its forward-auth endpoint names.
  it("serves the Gate's own route from the Service the forward-auth endpoint names, in that Service's namespace", () => {
    const spec = routeOf(
      exposed(({ routes }) => ({
        routes: [
          ...routes,
          {
            path: "/.auth/",
            match: "prefix" as const,
            gate: {
              name: "identity",
              namespace: "identity-system",
              port: 8080,
            },
            audience: "authenticated" as const,
            precedence: 1,
            middleware: [{ kind: "security-headers" as const }],
          },
        ],
      })),
    );
    const [, gate] = spec?.["routes"] as Record<string, unknown>[];

    expect(gate).toStrictEqual({
      kind: "Rule",
      match: "Host(`notes.jorisjonkers.dev`) && PathPrefix(`/.auth/`)",
      priority: 999,
      middlewares: [{ name: "security-headers", namespace: "edge-system" }],
      services: [
        { name: "identity", namespace: "identity-system", port: 8080 },
      ],
    });
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
        hint: "Every path has one owner: an adapter writes only below the directories the shared path helpers give it.",
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
        allowPrivilegeEscalation: false,
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

  it("syncs the VPN's credential to the Secret only the VPN container reads", () => {
    const vpn = VPN;
    const [, secret] = objectsAt(
      renderVso(
        edited(
          () => ({ secretStore: STORE }),
          () => ({ vpn }),
        ),
      ),
      "vso.yaml",
    ) as {
      metadata: { name: string };
      spec: { path: string; destination: { name: string } };
    }[];

    expect([
      secret?.metadata.name,
      secret?.spec.path,
      secret?.spec.destination.name,
    ]).toStrictEqual([
      "notes-api-vpn-platform-vpn",
      "platform/vpn",
      "notes-api-vpn-platform-vpn",
    ]);
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
          { path: "transit/keys/notes-jwt", allows: ["read"] },
        ],
      }),
      "policy.json",
    );

    expect(document).toStrictEqual({
      path: {
        "transit/sign/notes-jwt": { capabilities: ["update"] },
        "transit/keys/notes-jwt/rotate": { capabilities: ["update"] },
        "transit/keys/notes-jwt": { capabilities: ["read"] },
      },
    });
  });

  it("lets an attached Process's identity read the VPN's credential, for the VPN container beside it", () => {
    const vpn = VPN;
    const [document] = objectsAt(
      renderVaultPolicy(edited(undefined, () => ({ vpn }))),
      "policy.json",
    );

    expect(document).toStrictEqual({
      path: {
        "secret/data/platform/vpn": { capabilities: ["read"] },
        "secret/metadata/platform/vpn": { capabilities: ["read"] },
      },
    });
  });

  it("writes an identity's documents under the name Vault holds them by, and binds the role to that policy", () => {
    const rendered = policy(GRANT);

    expect(rendered.map(({ path }) => path)).toStrictEqual([
      "apps/notes/vault-policy/policies/notes-system-notes-api.policy.json",
      "apps/notes/vault-policy/policies/notes-system-notes-api.role.json",
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
        "apps/notes/vault-policy/policies/a-system-system-c.policy.json is claimed by vault-policy and vault-policy",
      ],
      [
        "E_PATH_COLLISION",
        "apps/notes/vault-policy/policies/a-system-system-c.role.json is claimed by vault-policy and vault-policy",
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
    consumes: ["platform-postgres.postgres"],
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
        // The runner reaches the datastore as every consumer does, by the
        // label of the surface the Application's edge names.
        metadata: {
          labels: {
            ...LABELS,
            "consumes.deploy-kit.jorisjonkers.dev/platform-postgres.postgres":
              "true",
          },
        },
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
                // The runner's home is the scratch it writes to.
                { name: "HOME", value: "/tmp" },
              ],
              resources: {
                requests: { memory: "256Mi", cpu: "100m" },
                limits: { memory: "256Mi" },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
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
      "apps/notes/vault-policy/policies/notes-system-notes-migration.policy.json",
      "apps/notes/vault-policy/policies/notes-system-notes-migration.role.json",
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

// REQ-114 (docs/requirements.md): a sidecar mounts the Process's volumes it
// names, and an init step runs after the VPN starts and before the Process.
describe("a sidecar, as the kubernetes adapter spells it", () => {
  const SIDE = {
    image: "ghcr.io/example/side@sha256:00",
    memory: "32Mi",
    cpu: "10m",
  };
  const pod = () => {
    const [workload] = objectsAt(
      renderKubernetes(
        edited(undefined, () => ({
          vpn: VPN,
          volumes: [
            {
              claim: "notes-data",
              mountAt: "/data",
              size: "1Gi",
              durability: "reconstructible" as const,
            },
          ],
          sidecars: [
            {
              name: "clone",
              ...SIDE,
              init: true as const,
              volumes: [{ claim: "notes-data", mountAt: "/work" }],
            },
            { name: "sync", ...SIDE },
          ],
        })),
      ),
      "notes/workload.yaml",
    ) as {
      spec: {
        template: {
          spec: {
            initContainers: { name: string; volumeMounts?: unknown[] }[];
            containers: { name: string; volumeMounts?: unknown[] }[];
          };
        };
      };
    }[];
    return workload?.spec.template.spec;
  };

  it("runs an init step after the VPN starts and before the Process, and the rest beside it", () => {
    expect(pod()?.initContainers.map(({ name }) => name)).toStrictEqual([
      "vpn",
      "clone",
    ]);
    expect(pod()?.containers.map(({ name }) => name)).toStrictEqual([
      "notes-api",
      "sync",
    ]);
  });

  it("mounts the volumes a sidecar names where it says, and none it does not", () => {
    const [, clone] = pod()?.initContainers ?? [];
    const [, sync] = pod()?.containers ?? [];

    expect(clone?.volumeMounts?.[0]).toStrictEqual({
      name: "notes-data",
      mountPath: "/work",
    });
    expect(JSON.stringify(sync?.volumeMounts ?? [])).not.toContain(
      "notes-data",
    );
  });
});

// REQ-113 (docs/requirements.md): an open Move renders its frozen source
// beside its target, each selecting its own pods under its Process's label,
// and its step Jobs as the move identity; an Instance recorded under another
// name renders under it.
describe("a Move, as the adapters spell it", () => {
  const TAG = "0123456789ab";
  const STORE = "http://vault.secrets-system.svc.cluster.local:8200";
  const SELF = "notes-system";
  const MOVE = {
    triggers: ["version" as const],
    source: {
      instance: "notes-api",
      version: "1.3.0",
      namespace: SELF,
      node: "enschede-t1000-1",
    },
    target: {
      image: "ghcr.io/example/notes-api@sha256:00",
      version: "1.4.0",
      namespace: SELF,
      nodes: ["enschede-t1000-1", "enschede-2"],
    },
    method: {
      image: "ghcr.io/example/notes-move@sha256:11",
      imageVersion: "1.0.0",
      uid: 999,
      gid: 998,
      port: 8080,
      credential: {
        path: "secret/data/notes/notes-api/move",
        access: "read" as const,
        delivery: "self" as const,
      },
      egress: [
        {
          rule: "datastore" as const,
          namespace: SELF,
          process: "notes-api",
          port: 8080,
        },
        { rule: "cluster-dns" as const, namespace: "kube-system", port: 53 },
      ],
    },
    identity: "notes-api-move",
    flips: ["notes-http", "notes-metrics"],
    reversible: true,
    bounds: { timeout: "300s", retention: "7d", memory: "64Mi", cpu: "50m" },
    server: [{ cidr: "10.43.0.1/32", port: 443 }],
  };
  const VOLUME = {
    claim: "notes-data",
    mountAt: "/data",
    size: "1Gi",
    durability: "reconstructible" as const,
  };
  const moving = (move: object = {}, process: object = {}) =>
    edited(
      () => ({
        revision: `sha256:${TAG}${"0".repeat(52)}`,
        secretStore: STORE,
      }),
      // An engine stops before it starts again: Flagger switches no Service of it.
      () => ({
        switchover: "stop-start" as const,
        volumes: [VOLUME],
        move: { ...MOVE, ...move },
        ...process,
      }),
    );
  interface Rendered {
    kind: string;
    metadata: { name: string; annotations?: Record<string, string> };
    spec: Record<string, unknown> & {
      selector?: unknown;
      template?: {
        metadata: { labels: Record<string, string> };
        spec: Record<string, unknown>;
      };
    };
  }
  const at = (project: ResolvedProject, file: string) =>
    objectsAt(renderKubernetes(project), `notes/${file}`) as Rendered[];
  const TARGET = `notes-api-${TAG}`;

  it("renders the source created once, beside a target named by the release, each selecting its own pods", () => {
    const [source, target] = at(moving(), "workload.yaml");

    expect(source?.metadata.name).toBe("notes-api");
    // The source stays on the node its data is bound to.
    expect(JSON.stringify(source?.spec.template?.spec["affinity"])).toContain(
      "enschede-t1000-1",
    );
    expect(
      JSON.stringify(source?.spec.template?.spec["affinity"]),
    ).not.toContain("enschede-2");
    expect(source?.metadata.annotations).toStrictEqual({
      "kustomize.toolkit.fluxcd.io/ssa": "IfNotPresent",
    });
    expect(source?.spec.selector).toStrictEqual({
      matchLabels: {
        "app.kubernetes.io/name": "notes-api",
        "app.kubernetes.io/instance": "notes-api",
      },
    });
    expect(target?.metadata).not.toHaveProperty("annotations");
    expect(target?.metadata.name).toBe(TARGET);
    expect(target?.spec.selector).toStrictEqual({
      matchLabels: {
        "app.kubernetes.io/name": TARGET,
        "app.kubernetes.io/instance": "notes-api",
      },
    });
    expect(target?.spec.template?.metadata.labels).toMatchObject({
      "app.kubernetes.io/name": TARGET,
      "app.kubernetes.io/instance": "notes-api",
    });
    expect(JSON.stringify(target?.spec.template?.spec["affinity"])).toContain(
      "enschede-2",
    );
    expect(
      at(moving(), "service.yaml").map(({ metadata, spec }) => [
        metadata.name,
        spec.selector,
      ]),
    ).toStrictEqual([
      [
        "notes-api",
        {
          "app.kubernetes.io/name": "notes-api",
          "app.kubernetes.io/instance": "notes-api",
        },
      ],
      [
        TARGET,
        {
          "app.kubernetes.io/name": TARGET,
          "app.kubernetes.io/instance": "notes-api",
        },
      ],
    ]);
    expect(
      at(moving(), "pvc.yaml").map(({ metadata }) => metadata.name),
    ).toStrictEqual(["notes-data", `notes-data-${TAG}`]);
  });

  it("renders the target as the gate recorded it, and alone where its source runs in another namespace", () => {
    expect(
      at(
        moving({
          target: { ...MOVE.target, instance: "notes-api-aaaaaaaaaaaa" },
        }),
        "workload.yaml",
      ).map(({ metadata }) => metadata.name),
    ).toStrictEqual(["notes-api", "notes-api-aaaaaaaaaaaa"]);
    expect(
      at(
        moving({
          source: { ...MOVE.source, namespace: "old-system" },
          target: { ...MOVE.target, instance: "notes-api" },
        }),
        "workload.yaml",
      ).map(({ metadata }) => metadata.name),
    ).toStrictEqual(["notes-api"]);
  });

  it("renders the workload of an Application moving out of its Project created once", () => {
    const [departing] = at(
      edited(() => ({ departing: true as const })),
      "workload.yaml",
    );
    const [staying] = at(edited(), "workload.yaml");

    expect(departing?.metadata.annotations).toStrictEqual({
      "kustomize.toolkit.fluxcd.io/ssa": "IfNotPresent",
    });
    expect(staying?.metadata).not.toHaveProperty("annotations");
  });

  it("renders a Process under the name ClusterState records its Instance by", () => {
    const named = edited(undefined, () => ({
      switchover: "stop-start" as const,
      instance: "notes-api-aaaaaaaaaaaa",
      volumes: [VOLUME],
    }));

    expect(
      at(named, "workload.yaml").map(({ metadata, spec }) => [
        metadata.name,
        spec.selector,
      ]),
    ).toStrictEqual([
      [
        "notes-api-aaaaaaaaaaaa",
        {
          matchLabels: {
            "app.kubernetes.io/name": "notes-api-aaaaaaaaaaaa",
            "app.kubernetes.io/instance": "notes-api",
          },
        },
      ],
    ]);
    expect(at(named, "workload.yaml")[0]?.metadata).not.toHaveProperty(
      "annotations",
    );
    expect(
      at(named, "service.yaml").map(({ metadata }) => metadata.name),
    ).toStrictEqual(["notes-api-aaaaaaaaaaaa"]);
    // One that holds no claim renders none under any name.
    expect(
      at(
        edited(undefined, () => ({
          switchover: "stop-start" as const,
          instance: "notes-api-aaaaaaaaaaaa",
        })),
        "workload.yaml",
      ).map(({ metadata }) => metadata.name),
    ).toStrictEqual(["notes-api-aaaaaaaaaaaa"]);
    expect(
      at(named, "pvc.yaml").map(({ metadata }) => metadata.name),
    ).toStrictEqual(["notes-data-aaaaaaaaaaaa"]);
  });

  it("mounts each Instance's own claim in the sidecars that name it", () => {
    const SIDE = {
      image: "ghcr.io/example/side@sha256:00",
      memory: "32Mi",
      cpu: "10m",
    };
    const pods = at(
      moving(
        {},
        {
          sidecars: [
            {
              name: "backup",
              ...SIDE,
              volumes: [{ claim: "notes-data", mountAt: "/backup" }],
            },
            { name: "sync", ...SIDE },
          ],
        },
      ),
      "workload.yaml",
    ).map(({ spec }) => {
      const pod = spec.template?.spec as {
        volumes: { name: string }[];
        containers: { name: string; volumeMounts?: { name: string }[] }[];
      };
      const mounted = (name: string) =>
        (
          pod.containers.find((container) => container.name === name)
            ?.volumeMounts ?? []
        )
          .map(({ name: volume }) => volume)
          .filter((volume) => volume.startsWith("notes-data"));
      return [
        pod.volumes
          .map(({ name }) => name)
          .filter((name) => name.startsWith("notes-data")),
        mounted("backup"),
        mounted("sync"),
      ];
    });

    expect(pods).toStrictEqual([
      [["notes-data"], ["notes-data"], []],
      [[`notes-data-${TAG}`], [`notes-data-${TAG}`], []],
    ]);
  });

  it("renders one suspended Job per step as the move identity, which may update the Stable Addresses it flips alone", () => {
    const objects = at(moving(), "move.yaml");
    const jobs = objects.filter(({ kind }) => kind === "Job");
    const env = (job: Rendered | undefined) =>
      (
        (
          job?.spec.template?.spec["containers"] as {
            env: { name: string; value: string }[];
          }[]
        )[0]?.env ?? []
      ).map(({ name, value }) => [name, value]);

    expect(objects.map(({ kind }) => kind).slice(0, 3)).toStrictEqual([
      "ServiceAccount",
      "Role",
      "RoleBinding",
    ]);
    expect(objects[1]).toMatchObject({
      metadata: {
        name: "notes-system-notes-api-move",
        namespace: "estate-system",
      },
      rules: [
        {
          apiGroups: [""],
          resources: ["services"],
          resourceNames: ["notes-http", "notes-metrics"],
          verbs: ["get", "update", "patch"],
        },
      ],
    });
    expect(jobs.map(({ metadata }) => metadata.name)).toStrictEqual(
      [
        "start",
        "sync",
        "lag",
        "fence",
        "final-lag",
        "flip",
        "unfence",
        "reverse",
      ].map((step) => `notes-api-move-${step}-${TAG}`),
    );
    expect(jobs.map((job) => env(job)[0]?.[1])).toStrictEqual([
      "start",
      "sync",
      "lag",
      "fence",
      "lag",
      "flip",
      "unfence",
      "reverse",
    ]);
    expect(env(jobs[0])).toStrictEqual([
      ["MOVE_STEP", "start"],
      ["MOVE_SOURCE_HOST", "notes-api.notes-system.svc.cluster.local"],
      ["MOVE_TARGET_HOST", `${TARGET}.notes-system.svc.cluster.local`],
      ["MOVE_PORT", "8080"],
      ["MOVE_FLIPS", "notes-http,notes-metrics"],
      ["MOVE_FLIP_NAMESPACE", "estate-system"],
      ["VAULT_ADDR", STORE],
      ["VAULT_ROLE", "notes-system-notes-api-move"],
      ["VAULT_CREDENTIALS_PATH", "secret/data/notes/notes-api/move"],
    ]);
    expect(jobs[0]?.spec).toMatchObject({ suspend: true, backoffLimit: 0 });
    expect(jobs[0]?.metadata.annotations).toStrictEqual({
      "kustomize.toolkit.fluxcd.io/ssa": "IfNotPresent",
    });
    expect(jobs[0]?.spec.template?.spec).toMatchObject({
      serviceAccountName: "notes-api-move",
      automountServiceAccountToken: true,
      restartPolicy: "Never",
      securityContext: { runAsUser: 999, runAsGroup: 998 },
    });
  });

  it("renders no reverse step for a Move that cannot be rolled back, no permission where it flips nothing, and no step where it carries no data", () => {
    const kinds = (move: object) =>
      at(moving(move), "move.yaml").map(({ kind, metadata }) =>
        kind === "Job" ? metadata.name.split("-")[3] : kind,
      );

    expect(kinds({ reversible: false })).not.toContain("reverse");
    expect(kinds({ flips: [] }).slice(0, 2)).toStrictEqual([
      "ServiceAccount",
      "start",
    ]);
    expect(
      renderKubernetes(moving({ method: undefined })).filter(({ path }) =>
        path.endsWith("move.yaml"),
      ),
    ).toStrictEqual([]);
  });

  it("admits the move Jobs and each Instance to the other on the method's surface, and polices the Jobs", () => {
    const policies = (project: ResolvedProject) =>
      objectsAt(
        renderNetworking(project),
        "notes/notes/networkpolicy.yaml",
      ) as {
        metadata: { name: string };
        spec: Record<string, unknown>;
      }[];
    const [own, identity] = policies(moving()).filter(({ metadata }) =>
      ["notes-api", "notes-api-move"].includes(metadata.name),
    );
    const peer = (instance: string) => ({
      namespaceSelector: {
        matchLabels: { "kubernetes.io/metadata.name": SELF },
      },
      podSelector: { matchLabels: { "app.kubernetes.io/instance": instance } },
    });

    expect(own?.spec["ingress"]).toContainEqual({
      from: [peer("notes-api-move"), peer("notes-api")],
      ports: [{ protocol: "TCP", port: 8080 }],
    });
    expect(own?.spec["egress"]).toContainEqual({
      to: [peer("notes-api")],
      ports: [{ protocol: "TCP", port: 8080 }],
    });
    expect(identity?.spec).toStrictEqual({
      podSelector: {
        matchLabels: { "app.kubernetes.io/instance": "notes-api-move" },
      },
      policyTypes: ["Ingress", "Egress"],
      egress: [
        { to: [peer("notes-api")], ports: [{ protocol: "TCP", port: 8080 }] },
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
          to: [{ ipBlock: { cidr: "10.43.0.1/32" } }],
          ports: [{ protocol: "TCP", port: 443 }],
        },
      ],
    });
    expect(
      policies(moving({ method: undefined })).map(
        ({ metadata }) => metadata.name,
      ),
    ).not.toContain("notes-api-move");
  });

  it("writes the move identity's role and policy, on the credential its method logs in with", () => {
    expect(JSON.stringify(renderVaultPolicy(moving()))).toContain(
      "notes-system-notes-api-move",
    );
    expect(JSON.stringify(renderVaultPolicy(moving()))).toContain(
      "secret/data/notes/notes-api/move",
    );
  });
});
