// REQ-040 (docs/requirements.md) and RULE-034 (docs/architecture-rules.md): the composed union renders, at the use-case
// seam, to each project's share of the tree and the estate-scoped share, and
// minimal's equal their committed trees byte for byte, every file attributed
// to one adapter. Rendering twice from the same inputs writes the same bytes.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseAllDocuments } from "yaml";
import {
  renderIntentSet,
  resolveIntentSet,
  serialize,
  serializeYaml,
  sha256Hasher,
  type AuthoredFile,
  type RenderedArtifact,
} from "../../src/index.ts";
import { ADAPTERS, type Adapter } from "../../src/adapters/registry.ts";
import { renderKubernetes } from "../../src/adapters/kubernetes/render.ts";
import {
  collisions,
  renderResolvedSet,
} from "../../src/application/render-intent-set.ts";
import type { ResolvedProject } from "../../src/model/resolution.ts";
import type { Canary } from "../../src/objects/custom.ts";

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

const SET = [
  "platform/platform.intent.yml",
  "platform/node-contract.yml",
  "platform/images.lock.yml",
  "platform/cluster-state.yml",
  "minimal/notes.project.yml",
  "minimal/env/notes-api/base.env",
  "delivery/delivery.project.yml",
  "edge/edge.project.yml",
  "observability/observability.project.yml",
  "observability/rules/platform.yaml",
  "secrets/secrets.project.yml",
  "identity/identity.project.yml",
  "mail/mail.project.yml",
  "utility/utility.project.yml",
  "agents/agents.project.yml",
  "observability/env/grafana/base.env",
  "data/data.project.yml",
  "data/env/postgres/base.env",
  "data/config/postgresql.conf",
  "data/config/garage.toml",
  "data/env/garage/base.env",
  "data/dashboards/rabbitmq.json",
];

/** The knowledge platform's project file and one env file per Process. */
const KNOWLEDGE_PLATFORM = [
  "knowledge-platform/knowledge-platform.project.yml",
  ...[
    "docling-serve",
    "hindsight-api",
    "hindsight-worker",
    "hindsight-control-plane",
    "hindsight-tei-embedding",
    "basic-memory",
    "karakeep",
  ].map((process) => `knowledge-platform/env/${process}/base.env`),
];

const OPTIONS = {
  hash: sha256Hasher,
  schemaPackageIntegrity:
    "sha256:5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b",
  serialize,
  projects: ["notes"],
};

function files(
  edits: Readonly<Record<string, (text: string) => string>> = {},
): AuthoredFile[] {
  return SET.map((name) => ({
    name,
    text: (edits[name] ?? ((same: string) => same))(text(name)),
  }));
}

function render(
  edits?: Readonly<Record<string, (text: string) => string>>,
  projects: readonly string[] = ["notes"],
): readonly RenderedArtifact[] {
  const result = renderIntentSet(files(edits), { ...OPTIONS, projects });
  if (!result.ok)
    throw new Error(JSON.stringify(result.diagnostics.map(({ code }) => code)));
  return result.value;
}

/** Every file under a committed tree, by its path relative to the tree. */
function committed(tree: string): Record<string, string> {
  const root = join(EXAMPLES, tree);
  const walk = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  return Object.fromEntries(
    walk(root).map((path) => [
      relative(root, path),
      readFileSync(path, "utf8"),
    ]),
  );
}

const asTree = (
  artifact: RenderedArtifact | undefined,
): Record<string, string> =>
  Object.fromEntries(
    (artifact?.files ?? []).map(({ path, text: body }) => [path, body]),
  );

const artifact = (artifacts: readonly RenderedArtifact[], name: string) =>
  artifacts.find((candidate) => candidate.name === name);

describe("renderIntentSet", () => {
  // REQ-065 (docs/requirements.md): minimal's Process mounts the worked
  // library, so its tree carries the placement, the group and the volume.
  it("renders minimal's share of the tree to its committed tree, byte for byte", () => {
    expect(asTree(artifact(render(), "notes"))).toStrictEqual(
      committed("minimal/rendered"),
    );
  });

  it("renders data's share of the tree to its committed tree, byte for byte", () => {
    expect(asTree(artifact(render(undefined, ["data"]), "data"))).toStrictEqual(
      committed("data/rendered"),
    );
  });

  // REQ-113 (docs/requirements.md): platform-postgres moving from 16 to 17,
  // the worked Move, renders its frozen source beside its target, its step
  // Jobs and its move identity, and equals its committed tree.
  it("renders platform-postgres moving from 16 to 17 to its committed tree, byte for byte", () => {
    const result = renderIntentSet(
      [
        ...files({
          "platform/cluster-state.yml": (body) =>
            `${body}instances:\n  - {application: platform-postgres, instance: postgres, version: 16.4.0, namespace: data-system, node: enschede-t1000-1}\n`,
          "data/data.project.yml": (body) =>
            body.replace(
              "      - name: postgres\n",
              "      - name: postgres\n        rollback: forward-only # the worked Move: 16 to 17, which postgres's method cannot reverse\n",
            ),
        }),
        ...KNOWLEDGE_PLATFORM.map((name) => ({ name, text: text(name) })),
      ],
      { ...OPTIONS, projects: ["data"] },
    );
    if (!result.ok)
      throw new Error(
        JSON.stringify(result.diagnostics.map(({ code }) => code)),
      );
    const prefix = "apps/data/platform-postgres/";
    const tree = Object.fromEntries(
      Object.entries(asTree(artifact(result.value, "data")))
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, body]) => [path.slice(prefix.length), body]),
    );

    expect(tree).toStrictEqual(committed("data/moving"));
  });

  it("renders a Process ClusterState records under another name under it, its backups copying that Instance's claims", () => {
    const tree = asTree(
      artifact(
        render(
          {
            "platform/cluster-state.yml": (body) =>
              `${body}instances:\n  - {application: platform-postgres, instance: postgres, name: postgres-aaaaaaaaaaaa, version: 17.2.0, namespace: data-system, node: enschede-t1000-1}\n`,
          },
          ["data"],
        ),
        "data",
      ),
    );
    const at = (file: string) =>
      tree[`apps/data/platform-postgres/${file}`] ?? "";

    expect(at("workload.yaml")).toContain("name: postgres-aaaaaaaaaaaa");
    expect(at("pvc.yaml")).toContain("name: postgres-data-aaaaaaaaaaaa");
    expect(at("backup.yaml")).toContain(
      "claimName: postgres-data-aaaaaaaaaaaa",
    );
  });

  it("renders nothing estate-scoped for both but the platform's Human Grants, each holding its own routes", () => {
    expect(
      Object.keys(
        asTree(artifact(render(undefined, ["notes", "data"]), "_estate")),
      ),
    ).toStrictEqual(Object.keys(committed("platform/rendered")));
  });

  // REQ-080 (docs/requirements.md): each Human Grant the Platform document
  // declares renders one ClusterRoleBinding of its built-in role to its group,
  // cluster-wide and estate-scoped, in every render whatever it holds.
  describe("the Human Grants", () => {
    it("render, estate-scoped, to the platform's committed tree, byte for byte", () => {
      expect(asTree(artifact(render(undefined, []), "_estate"))).toStrictEqual(
        committed("platform/rendered"),
      );
    });

    it("render one binding per grant, of its role to its group as the API server sees it", () => {
      const tree = asTree(
        artifact(
          render(
            {
              "platform/platform.intent.yml": (document) =>
                document.replace(
                  "    reason: the platform owner",
                  "    reason: readers\n  - group: oidc:k8s-viewers\n    clusterRole: view\n    reason: the platform owner",
                ),
            },
            [],
          ),
          "_estate",
        ),
      );
      const bindings = parseAllDocuments(
        tree["estate/human-grants/clusterrolebindings.yaml"] ?? "",
      ).map((document) => document.toJS() as Record<string, unknown>);

      expect(bindings).toStrictEqual([
        expect.objectContaining({
          metadata: {
            name: "human:oidc:k8s-admin:cluster-admin",
            labels: { "app.kubernetes.io/managed-by": "deploy-kit" },
          },
          roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: "cluster-admin",
          },
          subjects: [
            {
              apiGroup: "rbac.authorization.k8s.io",
              kind: "Group",
              name: "oidc:k8s-admin",
            },
          ],
        }),
        expect.objectContaining({
          metadata: {
            name: "human:oidc:k8s-viewers:view",
            labels: { "app.kubernetes.io/managed-by": "deploy-kit" },
          },
          roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: "view",
          },
          subjects: [
            {
              apiGroup: "rbac.authorization.k8s.io",
              kind: "Group",
              name: "oidc:k8s-viewers",
            },
          ],
        }),
      ]);
    });

    it("render nothing where the platform declares none", () => {
      expect(
        artifact(
          render(
            {
              "platform/platform.intent.yml": (document) =>
                document
                  .replace(/\nhumanGrants:\n( {2}.*\n)+/, "\n")
                  .replace(/\npriority:\n( {2}.*\n)+/, "\n"),
            },
            ["notes"],
          ),
          "_estate",
        ),
      ).toBeUndefined();
    });
  });

  // REQ-052 (docs/requirements.md): auth's render carries its migration Jobs,
  // its autoscaler and its disruption budget, and equals its committed tree.
  it("renders auth's share of the tree and its estate-scoped share to its committed tree, byte for byte", () => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        "auth/auth.project.yml",
        "auth/env/auth-api/base.env",
        "auth/migration-proof.yml",
      ].map((name) => ({ name, text: text(name) })),
      { ...OPTIONS, projects: ["auth"] },
    );
    const artifacts = result.ok ? result.value : [];

    expect({
      ...asTree(artifact(artifacts, "auth")),
      ...asTree(artifact(artifacts, "_estate")),
    }).toStrictEqual({
      ...committed("auth/rendered"),
      ...committed("platform/rendered"),
    });
  });

  // REQ-111 (docs/requirements.md): a Stable Address is delivered with every
  // Project that resolves it, even where another one rendered elsewhere does too.
  it("delivers a Stable Address one rendered Project resolves, though another Project resolves it as well", () => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        "auth/auth.project.yml",
        "auth/env/auth-api/base.env",
        "auth/migration-proof.yml",
        ...KNOWLEDGE_PLATFORM,
      ].map((name) => ({ name, text: text(name) })),
      { ...OPTIONS, projects: ["auth"] },
    );
    const estate = asTree(artifact(result.ok ? result.value : [], "_estate"));

    expect(estate["estate/stable-addresses/services.yaml"]).toContain(
      "name: platform-postgres-postgres",
    );
  });

  // documents of the render it belongs to, and is named by their digest.
  describe("the Vault policy job", () => {
    // A self grant needs its Process to wire its own Vault client.
    const CLIENT = {
      "data/env/postgres/base.env": (text: string) =>
        `${text}VAULT_ROLE=\${identity:vaultRole}\n`,
    };

    /** The paths of one Project's share of a render of `projects`. */
    const share = (
      projects: readonly string[],
      name: string,
      edits?: Readonly<Record<string, (text: string) => string>>,
    ) => Object.keys(asTree(artifact(render(edits, projects), name)));
    const jobFiles = (paths: readonly string[]) =>
      paths.filter(
        (path) =>
          path.includes("/vault-policy/") && !path.includes("/policies/"),
      );

    it("is rendered beside the documents it writes, with its own policy and an index that applies it", () => {
      expect(jobFiles(share(["notes", "data"], "data"))).toStrictEqual([
        "apps/data/vault-policy/configmap.yaml",
        "apps/data/vault-policy/cronjob.yaml",
        "apps/data/vault-policy/job.yaml",
        "apps/data/vault-policy/kustomization.yaml",
        "apps/data/vault-policy/networkpolicy.yaml",
        "apps/data/vault-policy/serviceaccount.yaml",
      ]);
    });

    it("moves only its own Project when that Project's grant changes, and nothing estate-scoped", () => {
      const both = (
        edits?: Readonly<Record<string, (text: string) => string>>,
      ) =>
        renderIntentSet(
          [
            ...SET.filter((name) => !name.startsWith("minimal/")),
            "auth/auth.project.yml",
            "auth/env/auth-api/base.env",
            "auth/migration-proof.yml",
          ].map((name) => ({
            name,
            text: (edits?.[name] ?? ((same: string) => same))(text(name)),
          })),
          { ...OPTIONS, projects: ["auth", "data"] },
        );
      const before = both();
      const after = both({
        ...CLIENT,
        "data/data.project.yml": (document) =>
          document.replace(
            "          - path: secret/data/platform/postgres/exporter\n            keys: [datasource]",
            "          - path: secret/data/data-system/exporter\n            keys: [{ name: token, generate: {} }]\n            access: read\n            delivery: self\n            rotation: {tolerates: restart}\n          - path: secret/data/platform/postgres/exporter\n            keys: [datasource]",
          ),
      });
      if (!before.ok || !after.ok) throw new Error("the set does not render");

      expect(asTree(artifact(after.value, "auth"))).toStrictEqual(
        asTree(artifact(before.value, "auth")),
      );
      expect(asTree(artifact(after.value, "data"))).not.toStrictEqual(
        asTree(artifact(before.value, "data")),
      );
      expect(
        Object.keys(asTree(artifact(after.value, "_estate"))).filter((path) =>
          path.startsWith("estate/vso-secrets/"),
        ),
      ).toStrictEqual([]);
    });

    it("is not rendered where the render holds no document for it to write", () => {
      expect(jobFiles(share(["notes"], "notes"))).toStrictEqual([]);
    });

    it("is not rendered where the platform names no job, though the documents are", () => {
      const paths = share(["data"], "data", {
        "platform/platform.intent.yml": (document) =>
          document.replace(/\npolicyJob:\n( {2}.*\n)+/, "\n"),
      });

      expect(jobFiles(paths)).toStrictEqual([]);
      expect(paths.filter((path) => path.includes("/policies/"))).toHaveLength(
        12,
      );
    });

    it("is handed the location a generated key adopts its value from", () => {
      const adopting = (document: string) =>
        document.replace(
          "          - path: secret/data/platform/postgres/exporter\n            keys: [datasource]",
          '          - path: secret/data/data-system/exporter\n            keys: [{ name: datasource, generate: { adopt: "secret/data/platform/postgres/exporter#datasource" } }]\n            access: read\n            delivery: self\n            rotation: {tolerates: restart}\n          - path: secret/data/platform/postgres/exporter\n            keys: [datasource]',
        );
      const tree = asTree(
        artifact(
          render({ ...CLIENT, "data/data.project.yml": adopting }, ["data"]),
          "data",
        ),
      );

      expect(
        JSON.parse(
          tree["apps/data/vault-policy/policies/data-system.generated.json"] ??
            "null",
        ),
      ).toStrictEqual({
        keys: [
          {
            path: "secret/data/data-system/exporter",
            key: "datasource",
            bytes: 32,
            encoding: "hex",
            adopt: {
              path: "secret/data/platform/postgres/exporter",
              key: "datasource",
            },
          },
        ],
      });
    });

    it("is handed each Project's generated keys, once each, with their defaults filled in", () => {
      const generating = (document: string) =>
        document.replace(
          "          - path: secret/data/platform/postgres/exporter\n            keys: [datasource]",
          "          - path: secret/data/data-system/exporter\n            keys: [{ name: token, generate: { encoding: base64url } }, { name: key, generate: {} }]\n            access: read\n            delivery: self\n            rotation: {tolerates: restart}\n          - path: secret/data/data-system/a\n            keys: [{ name: x, generate: {} }, { name: b, generate: {} }]\n            access: read\n            delivery: self\n            rotation: {tolerates: restart}\n          - path: secret/data/data-system/m\n            keys: [{ name: c, generate: {} }, { name: d, generate: {} }]\n            access: read\n            delivery: self\n            rotation: {tolerates: restart}\n          - path: secret/data/platform/postgres/exporter\n            keys: [datasource]",
        );
      const tree = asTree(
        artifact(
          render({ ...CLIENT, "data/data.project.yml": generating }, ["data"]),
          "data",
        ),
      );

      expect(
        JSON.parse(
          tree["apps/data/vault-policy/policies/data-system.generated.json"] ??
            "null",
        ),
      ).toStrictEqual({
        keys: [
          {
            path: "secret/data/data-system/a",
            key: "b",
            bytes: 32,
            encoding: "hex",
          },
          {
            path: "secret/data/data-system/a",
            key: "x",
            bytes: 32,
            encoding: "hex",
          },
          {
            path: "secret/data/data-system/exporter",
            key: "key",
            bytes: 32,
            encoding: "hex",
          },
          {
            path: "secret/data/data-system/exporter",
            key: "token",
            bytes: 32,
            encoding: "base64url",
          },
          {
            path: "secret/data/data-system/m",
            key: "c",
            bytes: 32,
            encoding: "hex",
          },
          {
            path: "secret/data/data-system/m",
            key: "d",
            bytes: 32,
            encoding: "hex",
          },
        ],
      });
      expect(tree["apps/data/vault-policy/configmap.yaml"]).toContain(
        "data-system.generated.json",
      );
    });

    it("runs again every hour, from the same documents", () => {
      const tree = asTree(artifact(render(undefined, ["data"]), "data"));
      const job = tree["apps/data/vault-policy/job.yaml"] ?? "";
      const cron = tree["apps/data/vault-policy/cronjob.yaml"] ?? "";
      const named = /name: (vault-policy-[0-9a-f]{12})\n/.exec(job)?.[1];

      expect(cron).toContain("kind: CronJob\n");
      expect(cron).toContain('schedule: "@hourly"\n');
      expect(cron).toContain("concurrencyPolicy: Forbid\n");
      expect(cron).toContain(`name: ${String(named)}\n`);
    });

    it("is recreated when the compiler alone changes its pod template, which a Job never lets an update change", () => {
      const tree = asTree(artifact(render(undefined, ["data"]), "data"));
      const job = tree["apps/data/vault-policy/job.yaml"] ?? "";
      const cron = tree["apps/data/vault-policy/cronjob.yaml"] ?? "";

      expect(job).toContain(
        "  annotations:\n    kustomize.toolkit.fluxcd.io/force: Enabled\n",
      );
      expect(cron).not.toContain("kustomize.toolkit.fluxcd.io/force");
    });

    it("is named by the digest of the documents, each under its file name, and of what the pod runs with", () => {
      const digested: unknown[] = [];
      const result = renderIntentSet(files(), {
        ...OPTIONS,
        projects: ["data"],
        hash: (value) => {
          digested.push(value);
          return sha256Hasher(value);
        },
      });
      if (!result.ok) throw new Error("data does not render");
      const job = asTree(artifact(result.value, "data"))[
        "apps/data/vault-policy/job.yaml"
      ];
      // The last value hashed is the one the job is named for.
      const named = digested.at(-1) as {
        documents: Record<string, unknown>;
      } & Record<string, unknown>;

      expect(Object.keys(named).sort()).toStrictEqual([
        "cpu",
        "deadline",
        "documents",
        "eligibleNodes",
        "gid",
        "image",
        "memory",
        "uid",
      ]);
      expect(Object.keys(named.documents)).toStrictEqual([
        "data-system-asset-sync.policy.json",
        "data-system-asset-sync.role.json",
        "data-system-garage.policy.json",
        "data-system-garage.role.json",
        "data-system-mongo-backup.policy.json",
        "data-system-mongo-backup.role.json",
        "data-system-postgres-backup.policy.json",
        "data-system-postgres-backup.role.json",
        "data-system-postgres.policy.json",
        "data-system-postgres.role.json",
        "data-system-rabbitmq-backup.policy.json",
        "data-system-rabbitmq-backup.role.json",
      ]);
      expect(named.documents["data-system-postgres.role.json"]).toStrictEqual({
        bound_service_account_names: ["postgres"],
        bound_service_account_namespaces: ["data-system"],
        token_policies: ["data-system-postgres"],
      });
      expect(job).toContain(
        `name: vault-policy-${sha256Hasher(named).slice("sha256:".length, "sha256:".length + 12)}\n`,
      );
    });

    it("is a new Job when its image changes and its documents do not", () => {
      const nameOf = (lock: (text: string) => string) =>
        /name: (vault-policy-[0-9a-f]{12})\n/.exec(
          asTree(
            artifact(
              render({ "platform/images.lock.yml": lock }, ["data"]),
              "data",
            ),
          )["apps/data/vault-policy/job.yaml"] ?? "",
        )?.[1];
      const bumped = (text: string) =>
        text.replace(
          /(\n {2}vault-policy:[^\n]*\n(?: {4}[^\n]*\n)*? {4}digest: "?sha256:)[0-9a-f]/,
          (_, head: string, digit: string) =>
            `${head}${digit === "0" ? "1" : "0"}`,
        );

      expect(bumped(text("platform/images.lock.yml"))).not.toBe(
        text("platform/images.lock.yml"),
      );
      expect(nameOf(bumped)).not.toBe(nameOf((same) => same));
    });
  });

  // REQ-057 (docs/requirements.md): the Release Gate is handed what its
  // checks request and what they must stay under through the Canary's
  // webhooks, and nothing about a Project is configured on the gate.
  describe("a Canary's webhooks", () => {
    const PROJECT = "minimal/notes.project.yml";
    const PLATFORM = "platform/platform.intent.yml";
    /** The Canary of notes-api: its Flagger analysis, and each webhook's metadata. */
    const canary = (
      edits?: Readonly<Record<string, (text: string) => string>>,
    ) => {
      const body = asTree(artifact(render(edits), "notes"))[
        "apps/notes/notes/canary.yaml"
      ] as string;
      const { spec } = parseAllDocuments(body)
        .map(
          (document) =>
            document.toJSON() as {
              kind: string;
              spec: {
                analysis: Record<string, unknown> & {
                  webhooks: (Record<string, string> & {
                    metadata: Record<string, string>;
                  })[];
                };
              };
            },
        )
        .find(({ kind }) => kind === "Canary") as {
        spec: {
          analysis: Record<string, unknown> & {
            webhooks: (Record<string, string> & {
              metadata: Record<string, string>;
            })[];
          };
        };
      };
      return {
        analysis: spec.analysis,
        asks: spec.analysis.webhooks.map(({ name, type, url }) => ({
          name,
          type,
          url,
        })),
        metadata: spec.analysis.webhooks.map(({ metadata }) => metadata),
      };
    };
    const route =
      "{ path: /, match: prefix, process: notes-api, surface: http }";

    // REQ-117 (docs/requirements.md): the fourth question, `rollback`, is
    // asked at the gate's own path, so a release that can no longer pass
    // rolls back rather than waits.
    it("ask the gate its four questions, each at its own path, the last whether to roll back", () => {
      const gate = "http://release-gate.delivery-system.svc.cluster.local:8080";

      expect(canary().asks).toStrictEqual([
        {
          name: "may-start",
          type: "confirm-rollout",
          url: `${gate}/may-start`,
        },
        { name: "checks", type: "rollout", url: `${gate}/checks` },
        {
          name: "may-promote",
          type: "confirm-promotion",
          url: `${gate}/may-promote`,
        },
        { name: "rollback", type: "rollback", url: `${gate}/rollback` },
      ]);
    });

    it("carry every Route's path, the readiness path, the public hostname and the platform's thresholds, the same on all four", () => {
      const { analysis, metadata } = canary();

      expect(metadata).toHaveLength(4);
      for (const carried of metadata)
        expect(carried).toStrictEqual({
          application: "notes",
          process: "notes-api",
          revision: metadata[0]?.["revision"],
          paths: "/",
          readiness: "/healthz/ready",
          hostnames: "notes.jorisjonkers.dev",
          errorRate: "1%",
          latency: "500ms",
        });
      // Flagger is given its cadence and no threshold of the gate's.
      expect(Object.keys(analysis)).toStrictEqual([
        "interval",
        "iterations",
        "threshold",
        "webhooks",
      ]);
    });

    it("carry the thresholds the Platform document states", () => {
      const [carried] = canary({
        [PLATFORM]: (platform) =>
          platform
            .replace("errorRate: 1%", "errorRate: 2.5%")
            .replace("latency: 500ms", "latency: 2s"),
      }).metadata;

      expect(carried?.["errorRate"]).toBe("2.5%");
      expect(carried?.["latency"]).toBe("2s");
    });

    it("list each path once, in order, whatever order the Routes are authored in", () => {
      const [carried] = canary({
        [PROJECT]: (project) =>
          project.replace(
            `          - ${route}\n`,
            [
              `          - ${route.replace("path: /,", "path: /b,")}\n`,
              `          - ${route}\n`,
              `          - ${route.replace("path: /,", "path: /a,")}\n`,
              `          - ${route.replace("path: /,", "path: /b/exact,").replace("prefix", "exact")}\n`,
            ].join(""),
          ),
      }).metadata;

      expect(carried?.["paths"]).toBe("/ /a /b /b/exact");
      expect(carried?.["hostnames"]).toBe("notes.jorisjonkers.dev");
    });

    it("carry the hostname of a Route the internet reaches signed in, and none for one it does not reach", () => {
      const as = (audience: string) =>
        canary({
          [PROJECT]: (project) =>
            project.replace("audience: anonymous", `audience: ${audience}`),
        }).metadata[0];

      expect(as("authenticated")?.["hostnames"]).toBe("notes.jorisjonkers.dev");
      const lan = as("lan") as Record<string, string>;
      expect("hostnames" in lan).toBe(false);
      // The path is still the gate's to request, on the Canary service.
      expect(lan["paths"]).toBe("/");
    });

    // On the rendered object, not its YAML: a key that holds nothing is
    // dropped when the file is written, and must not be there to drop.
    describe("as the adapter renders them", () => {
      /** The notes Project resolved, and each webhook's metadata of the Canary rendered from it. */
      const resolvedNotes = (
        edits?: Readonly<Record<string, (text: string) => string>>,
      ): ResolvedProject => {
        const result = resolveIntentSet(files(edits), OPTIONS);
        if (!result.ok)
          throw new Error(
            JSON.stringify(result.diagnostics.map(({ code }) => code)),
          );
        return result.value.projects.find(
          ({ project }) => project === "notes",
        ) as ResolvedProject;
      };
      const metadataOf = (project: ResolvedProject) =>
        renderKubernetes(project)
          .flatMap(({ objects }) => objects)
          .filter(
            (object): object is Canary =>
              (object as { kind?: string }).kind === "Canary",
          )
          .flatMap(({ spec }) => spec.analysis.webhooks)
          .map(({ metadata }) => metadata);
      const KEYS = [
        "application",
        "process",
        "revision",
        "paths",
        "readiness",
        "hostnames",
        "errorRate",
        "latency",
      ];

      it("hold every key for a member with a Route the internet reaches", () => {
        const metadata = metadataOf(resolvedNotes());

        expect(metadata).toHaveLength(4);
        for (const carried of metadata)
          expect(Object.keys(carried)).toStrictEqual(KEYS);
      });

      it("hold no readiness key for a member whose readiness is a port that opens", () => {
        const [carried] = metadataOf(
          resolvedNotes({
            [PROJECT]: (project) =>
              project.replace(
                "readiness: { path: /healthz/ready, port: 8080 }",
                "readiness: { tcp: 8080 }",
              ),
          }),
        );

        expect(Object.keys(carried ?? {})).toStrictEqual(
          KEYS.filter((key) => key !== "readiness"),
        );
      });

      it("hold no readiness key for a Process that is no member of the gate", () => {
        const notes = resolvedNotes();
        const [application] = notes.applications;
        const gate = application?.releaseGate as NonNullable<
          ResolvedProject["applications"][number]["releaseGate"]
        >;
        // Another Process holds the gate, as one declaring no probes leaves it to.
        const unwaited: ResolvedProject = {
          ...notes,
          applications: [
            {
              ...(application as ResolvedProject["applications"][number]),
              releaseGate: {
                ...gate,
                members: gate.members.map((member) => ({
                  ...member,
                  process: "another",
                })),
              },
            },
          ],
        };
        const [carried] = metadataOf(unwaited);

        expect(Object.keys(carried ?? {})).toStrictEqual(
          KEYS.filter((key) => key !== "readiness"),
        );
      });

      it("hold no paths and no hostnames key for a Process no Route reaches", () => {
        const notes = resolvedNotes();
        const [application] = notes.applications;
        const { exposure: _exposure, ...unexposed } =
          application as ResolvedProject["applications"][number];
        const [carried] = metadataOf({ ...notes, applications: [unexposed] });

        expect(Object.keys(carried ?? {})).toStrictEqual(
          KEYS.filter((key) => key !== "paths" && key !== "hostnames"),
        );
      });
    });

    it("carry no readiness path for a member whose readiness is a port that opens", () => {
      const [carried] = canary({
        [PROJECT]: (project) =>
          project.replace(
            "readiness: { path: /healthz/ready, port: 8080 }",
            "readiness: { tcp: 8080 }",
          ),
      }).metadata;

      expect(carried === undefined || "readiness" in carried).toBe(false);
      expect(carried?.["paths"]).toBe("/");
    });
  });

  it("renders the same bytes twice from the same inputs, in one module and in a fresh one", async () => {
    vi.resetModules();
    const fresh = await import("../../src/index.ts");
    const again = fresh.renderIntentSet(files(), {
      ...OPTIONS,
      serialize: fresh.serialize,
      hash: fresh.sha256Hasher,
    });

    expect(render()).toStrictEqual(render());
    expect(again.ok && again.value).toStrictEqual(render());
  });

  it("differs from the committed tree when one authored field moves", () => {
    expect(
      asTree(
        artifact(
          render({
            "minimal/notes.project.yml": (document) =>
              document.replace("memory: 256Mi", "memory: 512Mi"),
          }),
          "notes",
        ),
      ),
    ).not.toStrictEqual(committed("minimal/rendered"));
  });

  it("attributes every file to the one adapter that owns its kind", () => {
    expect(
      Object.fromEntries(
        (artifact(render(), "notes")?.files ?? []).map(({ path, adapter }) => [
          path,
          adapter,
        ]),
      ),
    ).toStrictEqual({
      "apps/notes/kustomization.yaml": "kubernetes",
      "apps/notes/libraries.yaml": "kubernetes",
      "apps/notes/namespace.yaml": "kubernetes",
      "apps/notes/networkpolicy.yaml": "networking",
      "apps/notes/notes/canary.yaml": "kubernetes",
      "apps/notes/notes/configmap.yaml": "kubernetes",
      "apps/notes/notes/kustomization.yaml": "kubernetes",
      "apps/notes/notes/networkpolicy.yaml": "networking",
      "apps/notes/notes/podmonitor.yaml": "prometheus",
      "apps/notes/notes/route-public.yaml": "traefik",
      "apps/notes/notes/serviceaccount.yaml": "kubernetes",
      "apps/notes/notes/workload.yaml": "kubernetes",
      "apps/notes/rollout-events/alert.yaml": "kubernetes",
      "apps/notes/rollout-events/kustomization.yaml": "kubernetes",
      "apps/notes/rollout-events/provider.yaml": "kubernetes",
    });
  });

  it("renders only the projects it is asked for, and what is estate-scoped", () => {
    expect(render(undefined, []).map(({ name }) => name)).toStrictEqual([
      "_estate",
    ]);
  });

  it("refuses the set before rendering where resolution refuses it", () => {
    const result = renderIntentSet(
      files({
        "minimal/notes.project.yml": (document) =>
          document.replace("image: notes-api", "image: unlocked"),
      }),
      OPTIONS,
    );

    expect(
      result.ok ? [] : result.diagnostics.map(({ code }) => code),
    ).toStrictEqual(["E_UNLOCKED_IMAGE"]);
  });

  it("refuses a render in which two adapters claim one path, before anything is serialized", () => {
    let serialized = 0;
    const claims = (name: string) => ({
      name,
      defaultPath: "apps/<project>/claimed.yaml",
      render: () => [
        { path: "apps/notes/claimed.yaml", adapter: name, objects: [] },
      ],
    });
    const result = renderIntentSet(files(), {
      ...OPTIONS,
      adapters: [claims("one"), claims("two")],
      serialize: () => {
        serialized += 1;
        return "";
      },
    });

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, message }) => `${code} ${message}`),
    ).toStrictEqual([
      "E_PATH_COLLISION apps/notes/claimed.yaml is claimed by one and two",
    ]);
    expect(serialized).toBe(0);
  });

  it("refuses two Projects whose documents claim one Vault name, though each lands in its own share", () => {
    // `a-system` + `system-c` and `a-system-system` + `c` are one name in
    // Vault, and each Project's writer may write it.
    const document = (project: string) => ({
      path: `apps/${project}/vault-policy/policies/a-system-system-c.policy.json`,
      adapter: "vault-policy",
      objects: [],
    });

    expect(collisions([document("a"), document("a-system")])).toStrictEqual([
      {
        code: "E_PATH_COLLISION",
        path: "",
        message:
          "the Vault name a-system-system-c.policy.json is claimed by apps/a/vault-policy/policies/a-system-system-c.policy.json and apps/a-system/vault-policy/policies/a-system-system-c.policy.json",
        hint: "Rename an Application or a Process: a Vault name is its namespace and its identity, and a hyphen does not keep two of them apart.",
      },
    ]);
  });

  // REQ-048 (docs/requirements.md): the delivery machinery renders, rolling
  // and ungated, with the API access each of its Processes declares.
  it("renders the delivery machinery's share of the tree to its committed tree, byte for byte", () => {
    expect(
      asTree(artifact(render(undefined, ["delivery"]), "delivery")),
    ).toStrictEqual(committed("delivery/rendered"));
  });

  // spec/v1/17-sign-in.md: the sign-in provider's share renders every Client
  // object, the gated Client's derived /.auth/ route, the provider's write and
  // the native Client's read on the client secret, and equals its committed tree.
  // REQ-087 (docs/requirements.md): the edge Project renders the shared
  // Middlewares every route names, once per tier proxy's namespace.
  it("renders the edge project's share of the tree to its committed tree, byte for byte", () => {
    expect(asTree(artifact(render(undefined, ["edge"]), "edge"))).toStrictEqual(
      committed("edge/rendered"),
    );
  });

  // REQ-086 (docs/requirements.md): a route's redirect renders as its own
  // RedirectRegex Middleware, which the route names.
  it("renders the mail project's share of the tree to its committed tree, byte for byte", () => {
    expect(asTree(artifact(render(undefined, ["mail"]), "mail"))).toStrictEqual(
      committed("mail/rendered"),
    );
  });

  // REQ-105 (docs/requirements.md): a Process that serves DNS resolves
  // through the platform's upstream nameservers, never the cluster's DNS.
  // REQ-107 (docs/requirements.md): a spawn template derives its pods' rules,
  // labels and policy, and hands its Process the image and labels.
  it("renders the agents project's share of the tree to its committed tree, byte for byte", () => {
    expect(
      asTree(artifact(render(undefined, ["agents"]), "agents")),
    ).toStrictEqual(committed("agents/rendered"));
  });

  it("renders the utility project's share of the tree to its committed tree, byte for byte", () => {
    expect(
      asTree(artifact(render(undefined, ["utility"]), "utility")),
    ).toStrictEqual(committed("utility/rendered"));
  });

  it("renders the identity project's share of the tree to its committed tree, byte for byte", () => {
    expect(
      asTree(artifact(render(undefined, ["identity"]), "identity")),
    ).toStrictEqual(committed("identity/rendered"));
  });

  // REQ-053 (docs/requirements.md): the knowledge platform, fleet-infra's
  // replacement for knowledge-system, renders with its file grant, its sidecars
  // and its in-project edges, and equals its committed tree.
  it("renders the knowledge platform's share of the tree and its estate-scoped share to its committed tree, byte for byte", () => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        ...KNOWLEDGE_PLATFORM,
      ].map((name) => ({ name, text: text(name) })),
      { ...OPTIONS, projects: ["knowledge-platform"] },
    );
    const artifacts = result.ok ? result.value : [];

    expect({
      ...asTree(artifact(artifacts, "knowledge-platform")),
      ...asTree(artifact(artifacts, "_estate")),
    }).toStrictEqual({
      ...committed("knowledge-platform/rendered"),
      ...committed("platform/rendered"),
    });
  });

  it("orders the tree whatever order the adapters hand it out in", () => {
    const reversed = ADAPTERS.map((adapter) => ({
      ...adapter,
      render: (project: Parameters<typeof adapter.render>[0]) =>
        adapter.render(project).reverse(),
    })).reverse();
    const result = renderIntentSet(files(), { ...OPTIONS, adapters: reversed });

    expect(result.ok && result.value).toStrictEqual(render());
  });

  it("hands out each artifact's files in path order, and the artifacts by name", () => {
    const artifacts = render();
    const paths = (name: string) =>
      artifact(artifacts, name)?.files.map(({ path }) => path) ?? [];

    expect(artifacts.map(({ name }) => name)).toStrictEqual([
      "_estate",
      "notes",
    ]);
    expect(paths("notes")).toStrictEqual([
      "apps/notes/kustomization.yaml",
      "apps/notes/libraries.yaml",
      "apps/notes/namespace.yaml",
      "apps/notes/networkpolicy.yaml",
      "apps/notes/notes/canary.yaml",
      "apps/notes/notes/configmap.yaml",
      "apps/notes/notes/kustomization.yaml",
      "apps/notes/notes/networkpolicy.yaml",
      "apps/notes/notes/podmonitor.yaml",
      "apps/notes/notes/route-public.yaml",
      "apps/notes/notes/serviceaccount.yaml",
      "apps/notes/notes/workload.yaml",
      "apps/notes/rollout-events/alert.yaml",
      "apps/notes/rollout-events/kustomization.yaml",
      "apps/notes/rollout-events/provider.yaml",
    ]);
  });

  // deploy-kit#602: only a member's pods carry the label the gate's policy
  // reaches; a blue-green Process that publishes no readiness is no member.
  it("labels a gate member's pods for the Release Gate, and no other Process's", () => {
    const worker = `    processes:
      - name: notes-worker
        lifecycle: application
        image: notes-api
        runtime: node
        provides: { http: 8081 }
        placement: { memory: 64Mi, cpu: 10m }
        probes: none
        startupBudget: 20s
        cutover: continuous
`;
    const tree = asTree(
      artifact(
        render({
          "minimal/notes.project.yml": (document) =>
            document.replace("    processes:\n", worker),
        }),
        "notes",
      ),
    );
    const podLabels = Object.fromEntries(
      parseAllDocuments(tree["apps/notes/notes/workload.yaml"] ?? "")
        .map((document) => document.toJS() as unknown)
        .filter(
          (
            object,
          ): object is {
            kind: string;
            metadata: { name: string };
            spec: {
              template: { metadata: { labels: Record<string, string> } };
            };
          } => (object as { kind?: string } | null)?.kind === "Deployment",
        )
        .map(({ metadata, spec }) => [
          metadata.name,
          spec.template.metadata.labels,
        ]),
    );
    const member = "gated.deploy-kit.jorisjonkers.dev/release-gate";

    expect(Object.keys(podLabels).sort()).toStrictEqual([
      "notes-api",
      "notes-worker",
    ]);
    expect(podLabels["notes-api"]?.[member]).toBe("true");
    expect(podLabels["notes-worker"]?.[member]).toBeUndefined();
  });

  it("puts a path under estate/ in the _estate artifact, and a Project named for an estate directory in its own", () => {
    const result = renderIntentSet(files(), {
      ...OPTIONS,
      adapters: [
        {
          name: "probe",
          defaultPath: "apps/<project>/x.yaml",
          render: () => [
            {
              path: "apps/notes/estate/edge/x.yaml",
              adapter: "probe",
              objects: [],
            },
            { path: "estate/edge/lan/x.yaml", adapter: "probe", objects: [] },
            { path: "apps/edge/proxy/x.yaml", adapter: "probe", objects: [] },
          ],
        },
      ],
      serialize: () => "",
    });

    expect(
      result.ok &&
        result.value.map(({ name, files: held }) => [
          name,
          held.map(({ path }) => path),
        ]),
    ).toStrictEqual([
      [
        "_estate",
        [
          "estate/edge/lan/kustomization.yaml",
          "estate/edge/lan/x.yaml",
          "estate/human-grants/clusterrolebindings.yaml",
          "estate/human-grants/kustomization.yaml",
          "estate/priority-classes/kustomization.yaml",
          "estate/priority-classes/priorityclasses.yaml",
        ],
      ],
      [
        "edge",
        [
          "apps/edge/kustomization.yaml",
          "apps/edge/proxy/kustomization.yaml",
          "apps/edge/proxy/x.yaml",
        ],
      ],
      [
        "notes",
        [
          "apps/notes/estate/edge/kustomization.yaml",
          "apps/notes/estate/edge/x.yaml",
          "apps/notes/kustomization.yaml",
          "apps/notes/rollout-events/alert.yaml",
          "apps/notes/rollout-events/kustomization.yaml",
          "apps/notes/rollout-events/provider.yaml",
        ],
      ],
    ]);
  });

  it("writes every object of a file as its own document after the one header line", () => {
    expect(
      serializeYaml([
        {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: { name: "a", labels: {} },
        },
        {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: { name: "b", labels: {} },
        },
      ]),
    ).toBe(
      "# GENERATED. Never hand-edit.\n---\napiVersion: v1\nkind: Namespace\nmetadata:\n  name: a\n  labels: {}\n---\napiVersion: v1\nkind: Namespace\nmetadata:\n  name: b\n  labels: {}\n",
    );
  });

  it("quotes a string a YAML 1.1 reader takes for a boolean, as the Kubernetes API reads YAML", () => {
    const written = serializeYaml([
      {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: { name: "a", namespace: "n", labels: {} },
        data: { a: "on", b: "off", c: "yes", d: "no", e: "plain" },
      },
    ]);
    expect(written).toContain(
      '  a: "on"\n  b: "off"\n  c: "yes"\n  d: "no"\n  e: plain\n',
    );
  });

  it("writes a JSON document a ConfigMap carries in its canonical form, and leaves a string as it is", () => {
    const configMap = (json: unknown) =>
      serializeYaml([
        {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: { name: "a", namespace: "n", labels: {} },
          data: { "a.json": { json }, "b.conf": "port = 1\n" },
        },
      ]);

    expect(configMap({ b: [2, "it's"], a: { d: true, c: "30s" } })).toBe(
      '# GENERATED. Never hand-edit.\n---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: a\n  namespace: "n"\n  labels: {}\ndata:\n  a.json: |\n    {"a":{"c":"30s","d":true},"b":[2,"it\'s"]}\n  b.conf: |\n    port = 1\n',
    );
    // The order a value's keys were built in decides nothing.
    expect(configMap({ a: { c: "30s", d: true }, b: [2, "it's"] })).toBe(
      configMap({ b: [2, "it's"], a: { d: true, c: "30s" } }),
    );
  });
});

// REQ-061 (docs/requirements.md): the database catalog of the estate path's
// projects is applied beside its datastore, by the engine's method, with a
// login the render names and Vault rights it writes for the method alone.
describe("the database catalog", () => {
  const PLATFORM = "platform/platform.intent.yml";
  const LOCK = "platform/images.lock.yml";
  /** The estate-scoped files of a render of the knowledge platform. */
  const AUTH = [
    "auth/auth.project.yml",
    "auth/env/auth-api/base.env",
    "auth/migration-proof.yml",
  ];
  const set = (
    edits: Readonly<Record<string, (text: string) => string>>,
    more: readonly string[],
  ) =>
    [
      ...SET.filter((name) => !name.startsWith("minimal/")),
      ...KNOWLEDGE_PLATFORM,
      ...more,
    ].map((name) => ({
      name,
      text: (edits[name] ?? ((same: string) => same))(text(name)),
    }));
  const estate = (
    edits: Readonly<Record<string, (text: string) => string>> = {},
    projects: readonly string[] = ["knowledge-platform"],
    more: readonly string[] = [],
  ): Record<string, string> => {
    const result = renderIntentSet(set(edits, more), { ...OPTIONS, projects });
    if (!result.ok)
      throw new Error(
        JSON.stringify(result.diagnostics.map(({ code }) => code)),
      );
    return asTree(artifact(result.value, "_estate"));
  };
  const CATALOG = "estate/vso-secrets/postgres-catalog.yaml";
  const catalogOf = (tree: Record<string, string>) =>
    JSON.parse(
      /catalog\.json: \|\n {4}(.*)\n/.exec(tree[CATALOG] ?? "")?.[1] ?? "null",
    ) as { admin: unknown; databases: unknown[] } | null;

  it("names each estate-path project that reads the datastore, and signs in with the old path's login", () => {
    const catalog = catalogOf(estate());

    expect(catalog?.databases).toStrictEqual([
      {
        name: "knowledge-platform_db",
        owner: "knowledge-platform-owner",
        data: "knowledge-platform-data",
      },
    ]);
    expect(catalog?.admin).toStrictEqual({
      path: "secret/data/platform/postgres",
      user: "postgres.user",
      password: "postgres.password",
    });
  });

  // deploy-kit#572: the method reaches the datastore as every consumer does,
  // so the datastore's consumer rule admits it.
  it("labels the method's Job and CronJob pods with the datastore surface's consumer label", () => {
    const labels = parseAllDocuments(estate()[CATALOG] ?? "")
      .map((document) => document.toJS() as Record<string, unknown>)
      .flatMap((object) => {
        const spec = object["spec"] as
          | {
              template?: { metadata: { labels: Record<string, string> } };
              jobTemplate?: {
                spec: {
                  template: { metadata: { labels: Record<string, string> } };
                };
              };
            }
          | undefined;
        const template =
          spec?.template ?? spec?.jobTemplate?.spec.template ?? undefined;
        return template === undefined
          ? []
          : [[object["kind"], template.metadata.labels]];
      });

    expect(labels.map(([kind]) => kind)).toStrictEqual(["Job", "CronJob"]);
    for (const [, carried] of labels)
      expect(carried).toMatchObject({
        "consumes.deploy-kit.jorisjonkers.dev/platform-postgres.postgres":
          "true",
      });
  });

  it("leaves out a project still on the old path, and renders nothing for no reader", () => {
    const legacy = estate({
      [PLATFORM]: (document) =>
        document
          .replace(
            "legacy: [auth, data, knowledge, notes]",
            "legacy: [auth, data, knowledge, knowledge-platform, notes]",
          )
          .replace(
            "estate: [agents, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
            "estate: [agents, delivery, edge, identity, mail, observability, secrets, utility]",
          ),
    });

    expect(
      Object.keys(legacy).filter((path) => path.includes("catalog")),
    ).toStrictEqual([]);
  });

  it("renders nothing where the engine names no catalog method, or the old path names no login", () => {
    const noMethod = estate({
      [PLATFORM]: (document) =>
        document.replace(", catalog: postgres-catalog,", ","),
    });
    const noLogin = estate({
      [PLATFORM]: (document) =>
        document.replace(/\n {6}admin: \{[^}]*\}\n/, "\n"),
    });

    for (const tree of [noMethod, noLogin])
      expect(
        Object.keys(tree).filter((path) => path.includes("postgres-catalog")),
      ).toStrictEqual([]);
  });

  /** The platform with the datastore's own Project on the estate path, and no old-path location. */
  const MOVED = {
    [PLATFORM]: (document: string) =>
      document
        .replace(
          "legacy: [auth, data, knowledge, notes]",
          "legacy: [auth, knowledge, notes]",
        )
        .replace(
          "estate: [agents, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
          "estate: [agents, data, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
        )
        .replace(/\n {2}serving:\n( {4}.*\n| {6}.*\n)+/, "\n"),
  };
  /** One artifact of a render of the given projects. */
  const share = (
    edits: Readonly<Record<string, (text: string) => string>>,
    projects: readonly string[],
    name: string,
  ): Record<string, string> => {
    const result = renderIntentSet(set(edits, []), { ...OPTIONS, projects });
    if (!result.ok)
      throw new Error(
        JSON.stringify(result.diagnostics.map(({ code }) => code)),
      );
    return asTree(artifact(result.value, name));
  };
  const OWNED = "apps/data/platform-postgres/postgres-catalog.yaml";

  it("signs in with the derived login once the datastore is on the estate path", () => {
    const moved = share(MOVED, ["data", "knowledge-platform"], "data");

    expect(
      JSON.parse(
        /catalog\.json: \|\n {4}(.*)\n/.exec(moved[OWNED] ?? "")?.[1] ?? "null",
      ),
    ).toMatchObject({
      admin: {
        path: "secret/data/data/postgres/catalog",
        user: "user",
        password: "password",
      },
    });
  });

  // spec/v1/16-dependencies.md#the-mesh-tunnel: the method's pods are in its
  // datastore's namespace, so they reach the datastore and the Secret Store
  // through the mesh where the Platform document enrols that Project.
  it("admits the tunnel port beside every peer but DNS in an enrolled datastore Project's method", () => {
    const policyOf = (enrolled: boolean) =>
      parseAllDocuments(
        share(
          {
            [PLATFORM]: (document: string) => {
              const moved = MOVED[PLATFORM](document);
              return enrolled
                ? moved.replace(
                    "\nhardening:",
                    "\nmesh:\n  enrolled: [data]\nhardening:",
                  )
                : moved;
            },
          },
          ["data", "knowledge-platform"],
          "data",
        )["apps/data/platform-postgres/postgres-catalog-networkpolicy.yaml"] ??
          "",
      )
        .map((document) => document.toJS() as unknown)
        .filter((document) => document !== null) as {
        spec: { egress: { ports: { protocol: string; port: number }[] }[] };
      }[];

    expect(
      policyOf(true)[0]?.spec.egress.map(({ ports }) =>
        ports.map(({ port }) => port),
      ),
    ).toStrictEqual([
      [5432, 15008],
      [8200, 15008],
      [53, 53],
    ]);
    expect(
      policyOf(false)[0]?.spec.egress.map(({ ports }) =>
        ports.map(({ port }) => port),
      ),
    ).toStrictEqual([[5432], [8200], [53, 53]]);
  });

  it("is applied from the datastore's own Project once that Project is on the estate path, and from no estate-scoped unit", () => {
    const owner = share(MOVED, ["data", "knowledge-platform"], "data");
    const estateScoped = share(
      MOVED,
      ["data", "knowledge-platform"],
      "_estate",
    );

    expect(
      Object.keys(owner).filter((path) => path.includes("catalog")),
    ).toStrictEqual([
      "apps/data/platform-garage/garage-catalog-networkpolicy.yaml",
      "apps/data/platform-garage/garage-catalog.yaml",
      "apps/data/platform-postgres/postgres-catalog-networkpolicy.yaml",
      OWNED,
      "apps/data/vault-policy/policies/data-system-garage-catalog.policy.json",
      "apps/data/vault-policy/policies/data-system-garage-catalog.role.json",
      "apps/data/vault-policy/policies/data-system-postgres-catalog.policy.json",
      "apps/data/vault-policy/policies/data-system-postgres-catalog.role.json",
    ]);
    expect(owner["apps/data/platform-postgres/kustomization.yaml"]).toContain(
      "  - postgres-catalog.yaml\n",
    );
    // The name the model-driven implementation derives from the same catalog and method.
    expect(owner[OWNED]).toContain("  name: postgres-catalog-565e7844099d\n");
    expect(
      Object.keys(estateScoped).filter((path) =>
        path.startsWith("estate/vso-secrets/"),
      ),
    ).toStrictEqual([]);
  });

  it("hands the datastore's own catalog identity to its own Project's Vault policy job", () => {
    const owner = share(MOVED, ["data", "knowledge-platform"], "data");

    expect(owner["apps/data/vault-policy/configmap.yaml"]).toContain(
      "data-system-postgres-catalog.policy.json",
    );
  });

  it("stops a render whose catalogs the old path runs sit in two namespaces, since one estate-scoped job writes one namespace's names", () => {
    const result = resolveIntentSet(set({}, []), OPTIONS);
    if (!result.ok) throw new Error("the set does not resolve");
    const [legacy] = result.value.catalogJobs ?? [];
    if (legacy === undefined) throw new Error("no catalog method");
    const second = {
      ...legacy,
      identity: "other-catalog",
      namespace: "other-system",
      role: "other-system-other-catalog",
    };

    expect(() =>
      renderResolvedSet(
        {
          ...result.value,
          catalogJobs: [legacy, second],
        },
        { ...OPTIONS, projects: ["knowledge-platform"] },
      ),
    ).toThrow(
      "catalogs the old path runs in data-system and other-system: one estate-scoped policy job writes one namespace's names",
    );
  });

  it("writes an old-path catalog from the estate in its own namespace, beside a catalog its datastore's Project applies itself", () => {
    const result = resolveIntentSet(set(MOVED, []), OPTIONS);
    if (!result.ok) throw new Error("the set does not resolve");
    const [owned] = result.value.catalogJobs ?? [];
    if (owned === undefined) throw new Error("no catalog method");
    const legacy = {
      ...owned,
      identity: "other-catalog",
      namespace: "other-system",
      role: "other-system-other-catalog",
    };
    const rendered = renderResolvedSet(
      { ...result.value, catalogJobs: [owned, legacy] },
      { ...OPTIONS, projects: ["data", "knowledge-platform"] },
    );
    if (!rendered.ok) throw new Error("the set does not render");

    expect(
      asTree(artifact(rendered.value, "_estate"))[
        "estate/vso-secrets/serviceaccount.yaml"
      ],
    ).toContain("  namespace: other-system\n");
  });

  it("is not rendered by a render that holds only a reader, once the datastore's own Project is on the estate path", () => {
    const result = renderIntentSet(set(MOVED, []), {
      ...OPTIONS,
      projects: ["knowledge-platform"],
    });
    if (!result.ok) throw new Error("the set does not render");

    expect(
      result.value
        .flatMap(({ files }) => files.map(({ path }) => path))
        .filter((path) => path.includes("catalog")),
    ).toStrictEqual([]);
  });

  it("is handed to the Vault policy job, and is never listed by an index for its policy", () => {
    const tree = estate();

    expect(tree["estate/vso-secrets/configmap.yaml"]).toContain(
      "data-system-postgres-catalog.policy.json",
    );
    expect(tree["estate/vso-secrets/kustomization.yaml"]).not.toContain(
      "networkpolicy",
    );
  });

  it("is recreated when the compiler alone changes its pod template, and its hourly copy is not", () => {
    const documents = (estate()[CATALOG] ?? "").split("---\n");
    const job = documents.find((document) => document.includes("kind: Job\n"));
    const cron = documents.find((document) =>
      document.includes("kind: CronJob\n"),
    );

    expect(job).toContain(
      "  annotations:\n    kustomize.toolkit.fluxcd.io/force: Enabled\n",
    );
    expect(cron).toBeDefined();
    expect(cron).not.toContain("kustomize.toolkit.fluxcd.io/force");
  });

  it("is a new Job when its method's image changes", () => {
    const nameOf = (tree: Record<string, string>) =>
      /name: (postgres-catalog-[0-9a-f]{12})\n/.exec(tree[CATALOG] ?? "")?.[1];
    const bumped = estate({
      [LOCK]: (document) =>
        document.replace(
          "sha256:7e9a1c3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c",
          "sha256:0e9a1c3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c",
        ),
    });

    expect(nameOf(bumped)).toMatch(/^postgres-catalog-/);
    expect(nameOf(bumped)).not.toBe(nameOf(estate()));
  });

  it("renders where the render holds one project of its catalog, which names every reader in name order", () => {
    // auth reads the same datastore, and its files are read after the knowledge platform's.
    const both = {
      [PLATFORM]: (document: string) =>
        document
          .replace(
            "legacy: [auth, data, knowledge, notes]",
            "legacy: [data, knowledge, notes]",
          )
          .replace(
            "estate: [agents, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
            "estate: [agents, auth, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
          ),
    };
    const tree = estate(both, ["knowledge-platform"], AUTH);

    expect(catalogOf(tree)?.databases).toStrictEqual([
      { name: "auth_db", owner: "auth-owner", data: "auth-data" },
      {
        name: "knowledge-platform_db",
        owner: "knowledge-platform-owner",
        data: "knowledge-platform-data",
      },
    ]);
  });

  it("is not rendered where the render holds no project its catalog names, and is where it holds one of several", () => {
    const files = (tree: Record<string, string>) =>
      Object.keys(tree).filter((path) => path.includes("catalog"));

    expect(files(estate({}, ["delivery"]))).toStrictEqual([]);
    // Composition never renders a Project the old path still delivers, so no
    // render holds the datastore's own Project beside it.
    expect(files(estate({}, ["delivery", "knowledge-platform"]))).toContain(
      CATALOG,
    );
  });

  it("derives no method for an engine whose entry names no surface, or a legacy datastore whose ledger states no location", () => {
    const resolved = (
      edits: Readonly<Record<string, (text: string) => string>>,
    ) => {
      const result = resolveIntentSet(set(edits, []), OPTIONS);
      if (!result.ok)
        throw new Error(
          JSON.stringify(result.diagnostics.map(({ code }) => code)),
        );
      // The object store's catalog is the bucket catalog's to test.
      const jobs = (result.value.catalogJobs ?? []).filter(
        ({ identity }) => identity === "postgres-catalog",
      );
      return jobs.length === 0 ? undefined : jobs;
    };
    const noSurface = {
      [PLATFORM]: (document: string) =>
        document.replace(" surface: postgres, catalog:", " catalog:"),
    };
    const noServing = {
      [PLATFORM]: (document: string) =>
        document.replace(/\n {2}serving:\n( {4}.*\n| {6}.*\n)+/, "\n"),
    };
    const noReader = {
      [PLATFORM]: (document: string) =>
        document
          .replace(
            "legacy: [auth, data, knowledge, notes]",
            "legacy: [auth, data, knowledge, knowledge-platform, notes]",
          )
          .replace(
            "estate: [agents, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
            "estate: [agents, delivery, edge, identity, mail, observability, secrets, utility]",
          ),
    };

    const otherLocation = {
      [PLATFORM]: (document: string) =>
        document.replace(
          "application: platform-postgres",
          "application: elsewhere",
        ),
    };
    const noJob = {
      [PLATFORM]: (document: string) =>
        document.replace(/\npolicyJob:\n( {2}.*\n)+/, "\n"),
    };

    expect(resolved({})).toHaveLength(1);
    expect(resolved(otherLocation)).toBeUndefined();
    expect(resolved(noJob)).toBeUndefined();
    expect(resolved(noSurface)).toBeUndefined();
    expect(resolved(noServing)).toBeUndefined();
    expect(resolved(noReader)).toBeUndefined();
  });

  it("names the Secret Store connection after the datastore's Process, so two datastores of one engine never share it", () => {
    const renamed = set({}, []).map((file) =>
      file.name === "data/data.project.yml"
        ? {
            ...file,
            text: file.text
              .replace("      - name: postgres\n", "      - name: pg\n")
              .replace("        process: postgres", "        process: pg"),
          }
        : file.name === "data/env/postgres/base.env"
          ? { ...file, name: "data/env/pg/base.env" }
          : file,
    );
    const result = resolveIntentSet(renamed, OPTIONS);
    if (!result.ok)
      throw new Error(
        JSON.stringify(
          result.diagnostics.map(({ code, path }) => ({ code, path })),
        ),
      );

    expect(result.value.catalogJobs?.[0]?.catalog).toMatchObject({
      connection: "pg",
    });
  });

  it("finds the datastore's own location among the ledger's, and reaches it, the store and DNS", () => {
    const others = {
      [PLATFORM]: (document: string) =>
        document.replace(
          "  serving:\n",
          "  serving:\n    - application: elsewhere\n      namespace: other-system\n      admin: { path: secret/data/other, user: u, password: p }\n",
        ),
    };
    const result = resolveIntentSet(set(others, []), OPTIONS);
    const job = result.ok ? result.value.catalogJobs?.[0] : undefined;

    expect(job?.catalog.admin.path).toBe("secret/data/platform/postgres");
    expect(job?.egress.map(({ rule }) => rule)).toStrictEqual([
      "datastore",
      "secret-store",
      "cluster-dns",
    ]);
  });

  it("refuses a catalog method the images lock does not hold", () => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        ...KNOWLEDGE_PLATFORM,
      ].map((name) => ({
        name,
        text:
          name === PLATFORM
            ? text(name).replace(
                "catalog: postgres-catalog",
                "catalog: unlocked",
              )
            : text(name),
      })),
      { ...OPTIONS, projects: ["knowledge-platform"] },
    );

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      expect.objectContaining({
        code: "E_UNLOCKED_IMAGE",
        path: "/engines/postgres/catalog",
      }),
    ]);
  });
});

// spec/v1/16-dependencies.md#the-bucket-catalog
describe("the bucket catalog", () => {
  const PLATFORM = "platform/platform.intent.yml";
  const KP = "knowledge-platform/knowledge-platform.project.yml";
  const render = (
    edits: Readonly<Record<string, (text: string) => string>> = {},
    projects: readonly string[] = ["knowledge-platform"],
  ) => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        ...KNOWLEDGE_PLATFORM,
      ].map((name) => ({
        name,
        text: (edits[name] ?? ((same: string) => same))(text(name)),
      })),
      { ...OPTIONS, projects },
    );
    if (!result.ok)
      throw new Error(
        JSON.stringify(result.diagnostics.map(({ code }) => code)),
      );
    return result.value;
  };
  const catalogIn = (tree: Record<string, string>, path: string): unknown =>
    JSON.parse(
      /catalog\.json: \|\n {4}(.*)\n/.exec(tree[path] ?? "")?.[1] ?? "null",
    );
  const ESTATE = "estate/vso-secrets/garage-catalog.yaml";
  const OWNED = "apps/data/platform-garage/garage-catalog.yaml";
  /** A second edge of the project, naming one bucket again and one more. */
  const TWO_EDGES = {
    [KP]: (document: string) =>
      document.replace(
        "          - { application: hindsight-embedding, surface: embeddings }\n",
        "          - { application: hindsight-embedding, surface: embeddings }\n          - { application: platform-garage, surface: s3, buckets: [litestream, assets] }\n",
      ),
  };

  it("names each estate-path project's key and its buckets, and signs in with the old path's token", () => {
    expect(
      catalogIn(asTree(artifact(render(TWO_EDGES), "_estate")), ESTATE),
    ).toStrictEqual({
      admin: { path: "secret/data/platform/garage", token: "admin-token" },
      host: "garage.data-system.svc.cluster.local",
      keys: [
        {
          buckets: [
            "knowledge-platform-assets",
            "knowledge-platform-litestream",
          ],
          name: "knowledge-platform",
          path: "secret/data/knowledge-platform/garage/s3",
        },
      ],
      port: 3903,
    });
  });

  it("names one key per project, in name order", () => {
    const keys = catalogIn(
      asTree(
        artifact(
          render({
            "mail/mail.project.yml": (document) =>
              document.replace(
                "      - name: stalwart\n",
                "      - name: stalwart\n        dependsOn:\n          - { application: platform-garage, surface: s3, buckets: [archive] }\n",
              ),
          }),
          "_estate",
        ),
      ),
      ESTATE,
    ) as { keys: { name: string; buckets: string[] }[] };

    expect(keys.keys.map(({ name, buckets }) => [name, buckets])).toStrictEqual(
      [
        ["knowledge-platform", ["knowledge-platform-assets"]],
        ["mail", ["mail-archive"]],
      ],
    );
  });

  it("names in each store only the buckets edges into that store give, and no store no reader names", () => {
    const resolve = (
      edits: Readonly<Record<string, (text: string) => string>>,
    ) => {
      const result = resolveIntentSet(
        [
          ...SET.filter((name) => !name.startsWith("minimal/")),
          ...KNOWLEDGE_PLATFORM,
        ].map((name) => ({
          name,
          text: (edits[name] ?? ((same: string) => same))(text(name)),
        })),
        OPTIONS,
      );
      if (!result.ok)
        throw new Error(
          JSON.stringify(result.diagnostics.map(({ code }) => code)),
        );
      return (result.value.catalogJobs ?? [])
        .filter(({ identity }) => identity === "garage-catalog")
        .map(({ namespace, catalog }) => [
          namespace,
          "keys" in catalog
            ? catalog.keys.map(({ name, buckets }) => [name, buckets])
            : [],
        ]);
    };
    const edge = (store: string, bucket: string) =>
      `        dependsOn:\n          - { application: ${store}, surface: s3, buckets: [${bucket}] }\n`;
    // A second store in mail, under the same Process name as data's.
    const store = `  - id: mail-garage
    processes:
      - name: garage
        lifecycle: application
        image: garage
        runtime: none
        engine: s3
        provides: { s3: 3900, admin: 3903 }
        placement: { memory: 256Mi, cpu: 50m }
        probes: { readiness: { tcp: 3900 } }
        startupBudget: 60s
        cutover: interrupted
        volumes:
          - { claim: mail-garage-data, mountAt: /var/lib/garage/data, size: 1Gi, durability: recoverable }
`;

    expect(
      resolve({
        "mail/mail.project.yml": (document) =>
          document.replace(
            "      - name: stalwart\n",
            `      - name: stalwart\n${edge("platform-garage", "archive")}          - { application: mail-garage, surface: s3, buckets: [spool] }\n`,
          ) + store,
        "utility/utility.project.yml": (document) =>
          document.replace(
            "      - name: adguard\n",
            `      - name: adguard\n${edge("platform-garage", "backups")}`,
          ),
      }),
    ).toStrictEqual([
      ["mail-system", [["mail", ["mail-spool"]]]],
      [
        "data-system",
        [
          ["knowledge-platform", ["knowledge-platform-assets"]],
          ["mail", ["mail-archive"]],
          ["utility", ["utility-backups"]],
        ],
      ],
    ]);
    expect(
      resolve({
        [PLATFORM]: (document) =>
          document
            .replace(
              "legacy: [auth, data, knowledge, notes]",
              "legacy: [auth, data, knowledge, knowledge-platform, notes]",
            )
            .replace(
              "estate: [agents, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
              "estate: [agents, delivery, edge, identity, mail, observability, secrets, utility]",
            ),
      }),
    ).toStrictEqual([]);
  });

  it("grants each Process naming buckets read on its project's key, once per store", () => {
    const tree = asTree(artifact(render(TWO_EDGES), "knowledge-platform"));
    const policy = (process: string) =>
      Object.keys(
        (
          JSON.parse(
            tree[
              `apps/knowledge-platform/vault-policy/policies/knowledge-platform-system-${process}.policy.json`
            ] ?? "{}",
          ) as { path: Record<string, unknown> }
        ).path,
      ).filter((path) => path.includes("/garage/"));

    for (const process of ["karakeep", "hindsight-api"])
      expect(policy(process)).toStrictEqual([
        "secret/data/knowledge-platform/garage/s3",
        "secret/metadata/knowledge-platform/garage/s3",
      ]);
    expect(policy("hindsight-worker")).toStrictEqual([]);
  });

  it("signs in with the derived token once the store's Project is on the estate path", () => {
    const moved = {
      [PLATFORM]: (document: string) =>
        document
          .replace(
            "legacy: [auth, data, knowledge, notes]",
            "legacy: [auth, knowledge, notes]",
          )
          .replace(
            "estate: [agents, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
            "estate: [agents, data, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
          )
          .replace(/\n {2}serving:\n( {4}.*\n| {6}.*\n)+/, "\n"),
    };
    const tree = asTree(
      artifact(render(moved, ["data", "knowledge-platform"]), "data"),
    );

    expect(catalogIn(tree, OWNED)).toMatchObject({
      admin: { path: "secret/data/data/garage/catalog", token: "token" },
    });
  });

  it("is applied by no method where the engine names none, the old path's login is a user's, or no reader is on the estate path", () => {
    const garage = (
      edits: Readonly<Record<string, (text: string) => string>>,
    ) =>
      Object.keys(asTree(artifact(render(edits), "_estate"))).filter((path) =>
        path.includes("garage-catalog"),
      );

    expect(garage({})).toContain(ESTATE);
    expect(
      garage({
        [PLATFORM]: (document) =>
          document.replace(
            ", catalog: garage-catalog, catalogSurface: admin }",
            " }",
          ),
      }),
    ).toStrictEqual([]);
    expect(
      garage({
        [PLATFORM]: (document) =>
          document.replace(
            "admin: { path: secret/data/platform/garage, token: admin-token }",
            "admin: { path: secret/data/platform/garage, user: u, password: p }",
          ),
      }),
    ).toStrictEqual([]);
    expect(
      garage({
        [PLATFORM]: (document) =>
          document
            .replace(
              "legacy: [auth, data, knowledge, notes]",
              "legacy: [auth, data, knowledge, knowledge-platform, notes]",
            )
            .replace(
              "estate: [agents, delivery, edge, identity, knowledge-platform, mail, observability, secrets, utility]",
              "estate: [agents, delivery, edge, identity, mail, observability, secrets, utility]",
            ),
      }),
    ).toStrictEqual([]);
  });

  it("applies the catalog over the engine's surface where its entry names no catalog surface", () => {
    const tree = asTree(
      artifact(
        render({
          [PLATFORM]: (document) =>
            document.replace(
              "catalog: garage-catalog, catalogSurface: admin }",
              "surface: admin, catalog: garage-catalog }",
            ),
        }),
        "_estate",
      ),
    );

    expect(catalogIn(tree, ESTATE)).toMatchObject({ port: 3903 });
  });
});

describe("one owner per ServiceAccount", () => {
  it("refuses a Process named like another Process's derived identity", () => {
    // valkey holds no grant, so no Vault document of its name collides: only
    // the account would, and the account is what a Vault role binds.
    const result = renderIntentSet(
      files({
        "data/data.project.yml": (document) =>
          document.replace(
            "      - name: valkey\n",
            "      - name: postgres-backup\n",
          ),
      }),
      { ...OPTIONS, projects: ["data"] },
    );

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      {
        code: "E_PATH_COLLISION",
        path: "",
        message:
          "the ServiceAccount data-system/postgres-backup is claimed by apps/data/platform-postgres/serviceaccount.yaml and apps/data/platform-valkey/serviceaccount.yaml",
        hint: "Rename the Process: a derived identity's name is its Process's with -backup, -migration or -catalog, so no Process may carry one.",
      },
    ]);
  });
});

// REQ-062 (docs/requirements.md): an edge to a database derives its Process's
// credential, and one delivered to the environment is a dynamic secret its
// variables read.
describe("the credential an edge derives", () => {
  const rendered = () => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        ...KNOWLEDGE_PLATFORM,
      ].map((name) => ({ name, text: text(name) })),
      { ...OPTIONS, projects: ["knowledge-platform"] },
    );
    return asTree(
      result.ok ? artifact(result.value, "knowledge-platform") : undefined,
    );
  };

  it("is a dynamic secret of the owner role where the Application migrates itself, read as variables", () => {
    const tree = rendered();
    const vso = tree["apps/knowledge-platform/hindsight/vso.yaml"] ?? "";
    const workload =
      tree["apps/knowledge-platform/hindsight/workload.yaml"] ?? "";

    expect(vso).toContain("kind: VaultDynamicSecret\n");
    expect(vso).toContain(
      "  mount: database\n  path: creds/knowledge-platform-owner\n",
    );
    expect(workload).toContain(
      "- name: PGUSER\n              valueFrom:\n                secretKeyRef:\n                  name: hindsight-api-database-creds-knowledge-platform-owner\n                  key: username\n",
    );
  });

  // REQ-066 (docs/requirements.md): an edge's credential delivered to a file is
  // a dynamic secret the Process reads as two files under its directory.
  it("is a dynamic secret mounted as its username and password files where the edge delivers it to a file", () => {
    const tree = rendered();
    const vso = tree["apps/knowledge-platform/hindsight/vso.yaml"] ?? "";
    const workload =
      tree["apps/knowledge-platform/hindsight/workload.yaml"] ?? "";

    expect(vso).toContain(
      "  name: hindsight-worker-database-creds-knowledge-platform-owner\n",
    );
    expect(workload).toContain(
      "- name: secret-hindsight-worker-database-creds-knowledge-platform-owner\n              mountPath: /run/secrets/database\n              readOnly: true\n",
    );
    expect(workload).toContain(
      "- name: secret-hindsight-worker-database-creds-knowledge-platform-owner\n          secret:\n            secretName: hindsight-worker-database-creds-knowledge-platform-owner\n            items:\n              - key: username\n                path: username\n              - key: password\n                path: password\n            defaultMode: 256\n",
    );
  });
});

// REQ-067 (docs/requirements.md): every static secret polls at one derived
// interval, keeps the data a restart needs, and restarts what consumes it.
describe("a static secret the operator syncs", () => {
  const vso = (application = "hindsight"): string => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        ...KNOWLEDGE_PLATFORM,
      ].map((name) => ({ name, text: text(name) })),
      { ...OPTIONS, projects: ["knowledge-platform"] },
    );
    return (
      asTree(
        result.ok ? artifact(result.value, "knowledge-platform") : undefined,
      )[`apps/knowledge-platform/${application}/vso.yaml`] ?? ""
    );
  };

  it("polls every ten minutes", () => {
    expect(vso()).toContain("  refreshAfter: 10m\n");
    expect(vso()).not.toContain("refreshAfter: 1h");
  });

  it("keeps the HMAC of its data, which a restart needs", () => {
    expect(vso()).toContain("  hmacSecretData: true\n");
  });

  // basic-memory's deploy key is a file whose rotation tolerates a reload.
  it("names the workload that consumes it as its restart target, whatever the rotation says", () => {
    expect(vso("basic-memory")).toContain(
      "  rolloutRestartTargets:\n    - kind: Deployment\n      name: basic-memory\n",
    );
  });
});

// A grant a release removes stays synced until the release promotes
// (spec/v1/55-delivery.md#a-removed-grant-outlives-its-release): Flux keeps a
// gated Application's sync objects, and the Release Gate sweeps those of an
// older revision once the Application serves the new one.
describe("the sync objects of a gated Application", () => {
  const documents = (application: string): Record<string, unknown>[] => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        ...KNOWLEDGE_PLATFORM,
      ].map((name) => ({ name, text: text(name) })),
      { ...OPTIONS, projects: ["knowledge-platform"] },
    );
    const file =
      asTree(
        result.ok ? artifact(result.value, "knowledge-platform") : undefined,
      )[`apps/knowledge-platform/${application}/vso.yaml`] ?? "";
    return parseAllDocuments(file).map(
      (document) => document.toJSON() as Record<string, unknown>,
    );
  };
  const annotationsOf = (object: Record<string, unknown>) =>
    (object["metadata"] as { annotations?: Record<string, string> })
      .annotations;

  it("are kept by Flux and carry the revision that rendered them", () => {
    const { revision } = JSON.parse(
      text("knowledge-platform/expected/resolved.hindsight.json"),
    ) as { revision: string };
    const objects = documents("hindsight");

    expect(objects.map(({ kind }) => kind)).toContain("VaultAuth");
    expect(objects.map(annotationsOf)).toStrictEqual(
      objects.map(() => ({
        "estate.jorisjonkers.dev/revision": revision,
        "kustomize.toolkit.fluxcd.io/prune": "disabled",
      })),
    );
  });

  it("are pruned as usual where nothing gates the Application", () => {
    expect(documents("basic-memory").map(annotationsOf)).toStrictEqual([
      undefined,
      undefined,
    ]);
  });
});

describe("the Vault Agent injector", () => {
  it("is asked for nothing in any committed rendered tree", () => {
    const trees = readdirSync(EXAMPLES).filter((example) => {
      try {
        return statSync(join(EXAMPLES, example, "rendered")).isDirectory();
      } catch {
        return false;
      }
    });
    const annotated = trees.flatMap((example) =>
      Object.entries(committed(`${example}/rendered`))
        .filter(([, body]) => body.includes("vault.hashicorp.com/agent-inject"))
        .map(([path]) => `${example}/rendered/${path}`),
    );
    expect(trees.length).toBeGreaterThan(0);
    expect(annotated).toStrictEqual([]);
  });
});

// REQ-078 (docs/requirements.md): a scheduled Process renders a CronJob at its
// own schedule that never runs twice at once and skips a run more than 300
// seconds late, around the pod any other Process gets, with its grants, edges
// and placement; a rotated value restarts nothing, since the next run reads it.
describe("a scheduled Process", () => {
  const SYNC = "apps/data/asset-sync";
  const tree = (
    edits?: Readonly<Record<string, (text: string) => string>>,
  ): Record<string, string> =>
    asTree(artifact(render(edits, ["data"]), "data"));
  const objects = (body: string | undefined) =>
    parseAllDocuments(body ?? "").map(
      (doc) => doc.toJS() as Record<string, unknown>,
    );
  const withEdge = (document: string) =>
    document.replace(
      "        image: asset-sync\n",
      "        image: asset-sync\n        dependsOn:\n          - { application: platform-valkey, surface: redis }\n",
    );

  // REQ-095 (docs/requirements.md): a parked schedule starts no run.
  it("suspends its CronJob while parked, and only then", () => {
    const suspendOf = (
      edits?: Readonly<Record<string, (text: string) => string>>,
    ) =>
      (
        objects(tree(edits)[`${SYNC}/workload.yaml`])[0]?.["spec"] as Record<
          string,
          unknown
        >
      )["suspend"];

    expect(suspendOf()).toBeUndefined();
    expect(
      suspendOf({
        "data/data.project.yml": (document) =>
          document.replace(
            "        image: asset-sync\n",
            "        image: asset-sync\n        parked: {reason: Paused.}\n",
          ),
      }),
    ).toBe(true);
  });

  it("renders a CronJob that forbids a second run and skips a late one, and nothing that serves", () => {
    const rendered = tree();
    const [cronJob] = objects(rendered[`${SYNC}/workload.yaml`]);
    const spec = cronJob?.["spec"] as {
      jobTemplate: { spec: { template: { spec: Record<string, unknown> } } };
    } & Record<string, unknown>;

    expect(cronJob?.["kind"]).toBe("CronJob");
    expect(spec["schedule"]).toBe("*/15 * * * *");
    expect(spec["concurrencyPolicy"]).toBe("Forbid");
    expect(spec["startingDeadlineSeconds"]).toBe(300);
    expect(spec.jobTemplate.spec.template.spec["restartPolicy"]).toBe(
      "OnFailure",
    );
    expect(
      Object.keys(rendered)
        .filter((path) => path.startsWith(`${SYNC}/`))
        .sort(),
    ).toStrictEqual([
      `${SYNC}/kustomization.yaml`,
      `${SYNC}/networkpolicy.yaml`,
      `${SYNC}/serviceaccount.yaml`,
      `${SYNC}/vso.yaml`,
      `${SYNC}/workload.yaml`,
    ]);
  });

  it("runs the pod any Process gets: its identity, its placement, its posture and its grant's file", () => {
    const [cronJob] = objects(tree()[`${SYNC}/workload.yaml`]);
    const pod = (
      cronJob?.["spec"] as {
        jobTemplate: { spec: { template: { spec: Record<string, unknown> } } };
      }
    ).jobTemplate.spec.template.spec;

    expect(pod["serviceAccountName"]).toBe("asset-sync");
    expect(JSON.stringify(pod["affinity"])).toContain("frankfurt-contabo-1");
    expect(pod["securityContext"]).toMatchObject({ runAsNonRoot: true });
    expect(JSON.stringify(pod["volumes"])).toContain(
      "asset-sync-platform-garage-web-key",
    );
  });

  it("restarts nothing when its grant's value changes", () => {
    const synced = objects(tree()[`${SYNC}/vso.yaml`]).find(
      ({ kind }) => kind === "VaultStaticSecret",
    );

    expect(synced?.["spec"]).not.toHaveProperty("rolloutRestartTargets");
  });

  it("reaches the provider of an edge it declares, as any Process does", () => {
    const egressOf = (rendered: Record<string, string>) =>
      JSON.stringify(
        objects(rendered[`${SYNC}/networkpolicy.yaml`])[0]?.["spec"],
      );

    expect(egressOf(tree())).not.toContain("valkey");
    expect(egressOf(tree({ "data/data.project.yml": withEdge }))).toContain(
      "valkey",
    );
  });
});

// REQ-069 (docs/requirements.md): a Process that declares internet egress
// reaches every public IPv4 address and nothing private, the tailnet,
// link-local or loopback, on every port; one that declares none reaches none.
describe("internet egress", () => {
  const policy = (
    application: string,
    process = application,
  ): Record<string, unknown> => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        ...KNOWLEDGE_PLATFORM,
      ].map((name) => ({ name, text: text(name) })),
      { ...OPTIONS, projects: ["knowledge-platform"] },
    );
    const tree = asTree(
      result.ok ? artifact(result.value, "knowledge-platform") : undefined,
    );
    return parseAllDocuments(
      tree[`apps/knowledge-platform/${application}/networkpolicy.yaml`] ?? "",
    )
      .map((doc) => doc.toJS() as Record<string, unknown>)
      .find(
        (doc) => (doc["metadata"] as { name: string }).name === process,
      ) as Record<string, unknown>;
  };
  const internet = (doc: Record<string, unknown>) =>
    (doc["spec"] as { egress: Record<string, unknown>[] }).egress.filter(
      (rule) => JSON.stringify(rule).includes("0.0.0.0/0"),
    );

  it("admits public IPv4 on every port, except the private, tailnet, link-local and loopback ranges", () => {
    expect(internet(policy("karakeep"))).toStrictEqual([
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
    ]);
  });

  it("admits nothing beyond the cluster for a Process that declares none", () => {
    expect(internet(policy("hindsight", "hindsight-api"))).toStrictEqual([]);
  });
});

// Spec chapter 10, the label set: each container's software version, from the
// images lock, on the pod template that runs it.
describe("each container's software version", () => {
  const LOCK = "platform/images.lock.yml";
  const versioned = (alias: string, version: string) => (document: string) =>
    document.replace(
      new RegExp(`(\\n  ${alias}:\\n(?: {4}.*\\n)*? {4}version: )".*"`),
      `$1"${version}"`,
    );
  const knowledgePlatform = (
    edits: Readonly<Record<string, (text: string) => string>> = {},
  ) => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        ...KNOWLEDGE_PLATFORM,
      ].map((name) => ({
        name,
        text: (edits[name] ?? ((same: string) => same))(text(name)),
      })),
      { ...OPTIONS, projects: ["knowledge-platform"] },
    );
    if (!result.ok)
      throw new Error(
        JSON.stringify(result.diagnostics.map(({ code }) => code)),
      );
    return result.value;
  };
  const documents = (tree: Record<string, string>, path: string) =>
    parseAllDocuments(tree[path] ?? "").map(
      (doc) => doc.toJS() as Record<string, unknown>,
    );
  type Template = { metadata: { annotations?: Record<string, string> } };
  const deploymentTemplate = (tree: Record<string, string>, path: string) =>
    (
      documents(tree, path).find(({ kind }) => kind === "Deployment") as {
        spec: { template: Template };
      }
    ).spec.template;
  const cronJobTemplate = (tree: Record<string, string>, path: string) =>
    (
      documents(tree, path).find(({ kind }) => kind === "CronJob") as {
        spec: { jobTemplate: { spec: { template: Template } } };
      }
    ).spec.jobTemplate.spec.template;
  const jobTemplates = (tree: Record<string, string>, path: string) =>
    documents(tree, path)
      .filter(({ kind }) => kind === "Job")
      .map(({ spec }) => (spec as { template: Template }).template);

  it("annotates the Process's container, its VPN and its sidecars with the version the lock records", () => {
    const tree = asTree(artifact(knowledgePlatform(), "knowledge-platform"));

    expect(
      deploymentTemplate(tree, "apps/knowledge-platform/karakeep/workload.yaml")
        .metadata.annotations,
    ).toStrictEqual({
      "image.jorisjonkers.dev/chrome": "124.0.6367.78",
      "image.jorisjonkers.dev/karakeep": "0.33.2",
      "image.jorisjonkers.dev/meilisearch": "v1.41.0",
      "image.jorisjonkers.dev/vpn": "v3.40.0",
    });
  });

  it("refuses a lock entry that records no version, at its alias, before anything renders", () => {
    const result = renderIntentSet(
      files({
        [LOCK]: (document) =>
          document.replace(
            /(\n {2}karakeep-chrome:\n(?: {4}.*\n)*?) {4}version: .*\n/,
            "$1",
          ),
      }),
      OPTIONS,
    );

    expect(
      result.ok
        ? []
        : result.diagnostics.map(
            ({ code, document, path }) => `${code} ${String(document)} ${path}`,
          ),
    ).toStrictEqual([
      "E_IMAGE_VERSION_MISSING platform/images.lock.yml /images/karakeep-chrome",
    ]);
  });

  it("annotates a backup's pod with its method's version", () => {
    const tree = asTree(artifact(knowledgePlatform(), "knowledge-platform"));

    expect(
      cronJobTemplate(tree, "apps/knowledge-platform/karakeep/backup.yaml")
        .metadata.annotations,
    ).toStrictEqual({ "image.jorisjonkers.dev/backup": "1.2.0" });
  });

  it("annotates a migration's pods with its runner's version", () => {
    const result = renderIntentSet(
      [
        ...SET.filter((name) => !name.startsWith("minimal/")),
        "auth/auth.project.yml",
        "auth/env/auth-api/base.env",
        "auth/migration-proof.yml",
      ].map((name) => ({
        name,
        text:
          name === LOCK
            ? versioned("auth-migration", "0.2.0")(text(name))
            : text(name),
      })),
      { ...OPTIONS, projects: ["auth"] },
    );
    const tree = asTree(artifact(result.ok ? result.value : [], "auth"));
    const templates = jobTemplates(tree, "apps/auth/auth/migration.yaml");

    expect(templates.length).toBeGreaterThan(0);
    expect(templates.map(({ metadata }) => metadata.annotations)).toStrictEqual(
      templates.map(() => ({ "image.jorisjonkers.dev/migration": "0.2.0" })),
    );
  });

  it("annotates the Vault policy job's pods with its image's version", () => {
    const tree = asTree(
      artifact(
        render({ [LOCK]: versioned("vault-policy", "0.9.0") }, [
          "notes",
          "data",
        ]),
        "data",
      ),
    );

    expect(
      [
        ...jobTemplates(tree, "apps/data/vault-policy/job.yaml"),
        cronJobTemplate(tree, "apps/data/vault-policy/cronjob.yaml"),
      ].map(({ metadata }) => metadata.annotations),
    ).toStrictEqual([
      { "image.jorisjonkers.dev/vault-policy": "0.9.0" },
      { "image.jorisjonkers.dev/vault-policy": "0.9.0" },
    ]);
  });

  it("annotates a database catalog's pod with its method's version", () => {
    const tree = asTree(
      artifact(
        knowledgePlatform({ [LOCK]: versioned("postgres-catalog", "1.0.1") }),
        "_estate",
      ),
    );

    expect(
      jobTemplates(tree, "estate/vso-secrets/postgres-catalog.yaml").map(
        ({ metadata }) => metadata.annotations,
      ),
    ).toStrictEqual([{ "image.jorisjonkers.dev/postgres-catalog": "1.0.1" }]);
  });

  it("adds nothing to a digest's move but the annotation on the pod template that runs it, whose release moves anyway", () => {
    const moved = (version: boolean) =>
      asTree(
        artifact(
          render({
            [LOCK]: (document) => {
              const digest = document.replace(
                "sha256:9c1e5a4b7d2f8e3a6b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a",
                "sha256:0c1e5a4b7d2f8e3a6b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a",
              );
              return version
                ? digest.replace('version: "1.4.0"', 'version: "1.5.0"')
                : digest;
            },
          }),
          "notes",
        ),
      );
    const before = asTree(artifact(render(), "notes"));
    const digestOnly = moved(false);
    const both = moved(true);
    const changed = (tree: Record<string, string>) =>
      Object.keys(tree).filter((path) => tree[path] !== before[path]);
    const lines = (tree: Record<string, string>) =>
      (tree["apps/notes/notes/workload.yaml"] ?? "").split("\n");

    expect(changed(both)).toStrictEqual(changed(digestOnly));
    expect(
      lines(both).filter((line) => !lines(digestOnly).includes(line)),
    ).toStrictEqual(["        image.jorisjonkers.dev/notes-api: 1.5.0"]);
  });

  it("accepts any version on an engine whose platform entry names no move method", () => {
    const result = renderIntentSet(
      files({
        [LOCK]: versioned("postgres", "14-vectorchord0.4.3"),
        "platform/platform.intent.yml": (document) =>
          document.replace(
            ", move: {image: postgres-move, breaksOn: major, reverse: never}",
            "",
          ),
      }),
      { ...OPTIONS, projects: ["data"] },
    );

    expect(result.ok).toBe(true);
  });

  it("accepts an engine's image whose version is major.minor.patch", () => {
    const result = renderIntentSet(
      files({ [LOCK]: versioned("postgres", "17.2.0") }),
      { ...OPTIONS, projects: ["data"] },
    );

    expect(result.ok).toBe(true);
  });

  it("accepts any version on an image no engine runs", () => {
    const result = renderIntentSet(
      files({
        [LOCK]: (document) =>
          document.replace('version: "1.4.0"', 'version: "2024.10"'),
      }),
      OPTIONS,
    );

    expect(result.ok).toBe(true);
  });
});

// REQ-075 (docs/requirements.md) and deploy-kit#383: a pod off the host
// network binds any port without a capability, so a Process that listens
// below 1024 composes under the one posture, adding nothing to it.
describe("a Process that listens below 1024", () => {
  type Container = {
    name: string;
    ports: { containerPort: number }[];
    securityContext: { capabilities: Record<string, unknown> };
  };
  type Pod = {
    securityContext: Record<string, unknown>;
    containers: Container[];
  };

  const lowPort = {
    "minimal/notes.project.yml": (document: string) =>
      document
        .replace(/http: 8080 #.*\n/, "http: 80\n")
        .replaceAll("port: 8080 }", "port: 80 }"),
  };
  const pod = (): Pod => {
    const body = asTree(artifact(render(lowPort), "notes"))[
      "apps/notes/notes/workload.yaml"
    ] as string;
    const deployment = parseAllDocuments(body)
      .map(
        (document) =>
          document.toJSON() as {
            kind: string;
            spec: { template: { spec: Pod } };
          },
      )
      .find(({ kind }) => kind === "Deployment");
    return (deployment as { spec: { template: { spec: Pod } } }).spec.template
      .spec;
  };

  it("composes, its container listening on the port it declares", () => {
    const [container] = pod().containers;
    expect(container?.ports).toStrictEqual([
      { name: "http", containerPort: 80 },
    ]);
  });

  it("drops every capability and adds none, and sets no sysctl", () => {
    const { securityContext, containers } = pod();
    expect(containers[0]?.securityContext.capabilities).toStrictEqual({
      drop: ["ALL"],
    });
    expect(securityContext).not.toHaveProperty("sysctls");
  });
});

// REQ-082 (docs/requirements.md): every monitor the render writes carries the
// label set the Platform document's `monitors` names, beside its own labels,
// which win where a key is both; a platform that names none adds none.
describe("the monitoring stack's selector", () => {
  const PLATFORM = "platform/platform.intent.yml";
  const LABELS = "  labels:\n    release: metrics-stack\n";
  const monitorLabels = (
    edit?: (document: string) => string,
  ): Record<string, string> => {
    const tree = asTree(
      artifact(render(edit === undefined ? {} : { [PLATFORM]: edit }), "notes"),
    );
    const [monitor] = parseAllDocuments(
      tree["apps/notes/notes/podmonitor.yaml"] ?? "",
    ).map((document) => document.toJS() as Record<string, unknown>);
    return (monitor?.["metadata"] as { labels: Record<string, string> }).labels;
  };

  it("is carried by every monitor beside the render's own labels", () => {
    expect(monitorLabels()).toStrictEqual({
      release: "metrics-stack",
      "app.kubernetes.io/name": "notes-api",
      "app.kubernetes.io/instance": "notes-api",
      "app.kubernetes.io/part-of": "notes",
      "app.kubernetes.io/managed-by": "deploy-kit",
      "app.kubernetes.io/component": "node",
    });
  });

  it("never replaces a label the render writes", () => {
    expect(
      monitorLabels((document) =>
        document.replace(
          LABELS,
          `${LABELS}    app.kubernetes.io/managed-by: someone-else\n`,
        ),
      )["app.kubernetes.io/managed-by"],
    ).toBe("deploy-kit");
  });

  it("adds nothing where the platform names no labels", () => {
    expect(
      monitorLabels((document) => document.replace(LABELS, "")),
    ).not.toHaveProperty("release");
  });
});

// REQ-087 (docs/requirements.md): the shared Middlewares ship with the routes
// that name them, so a render without the traefik adapter writes none.
describe("the shared Middlewares, by adapter", () => {
  const paths = (adapters: readonly Adapter[]) => {
    const result = renderIntentSet(files(), {
      ...OPTIONS,
      projects: ["edge"],
      adapters,
    });
    return result.ok
      ? (artifact(result.value, "edge")?.files ?? []).map(({ path }) => path)
      : [];
  };

  it("render with the traefik adapter alone", () => {
    expect(paths(ADAPTERS.filter(({ name }) => name === "traefik"))).toContain(
      "apps/edge/traefik-lan/middlewares.yaml",
    );
  });

  it("render with no traefik adapter not at all", () => {
    expect(
      paths(ADAPTERS.filter(({ name }) => name !== "traefik")),
    ).not.toContain("apps/edge/traefik-lan/middlewares.yaml");
  });
});

// REQ-085 (docs/requirements.md): every route rendered for a tier carries the
// ingress class the tier's proxy admits, so it reaches that proxy alone.
describe("a route's ingress class", () => {
  const classOf = (edit?: (document: string) => string): unknown => {
    const tree = asTree(
      artifact(
        render(edit === undefined ? {} : { "minimal/notes.project.yml": edit }),
        "notes",
      ),
    );
    const [route] = parseAllDocuments(
      tree["apps/notes/notes/route-public.yaml"] ?? "",
    ).map((document) => document.toJS() as Record<string, unknown>);
    return (route?.["metadata"] as { annotations?: Record<string, string> })
      .annotations?.["kubernetes.io/ingress.class"];
  };

  // REQ-094 (docs/requirements.md): a route on a tier that publishes its
  // names carries the DNS controller's annotations; one on the LAN none.
  it("carries the tier's DNS target and proxying, where the tier publishes", () => {
    const annotationsOf = (edit?: (document: string) => string) => {
      const tree = asTree(
        artifact(
          render(
            edit === undefined ? {} : { "minimal/notes.project.yml": edit },
          ),
          "notes",
        ),
      );
      const [route] = parseAllDocuments(
        tree["apps/notes/notes/route-public.yaml"] ?? "",
      ).map((document) => document.toJS() as Record<string, unknown>);
      return (route?.["metadata"] as { annotations: Record<string, string> })
        .annotations;
    };

    expect(annotationsOf()).toStrictEqual({
      "kubernetes.io/ingress.class": "traefik-public",
      "external-dns.alpha.kubernetes.io/target": "ingress.jorisjonkers.dev",
      "external-dns.alpha.kubernetes.io/cloudflare-proxied": "true",
    });
    expect(
      annotationsOf((document) =>
        document.replace(
          "audience: anonymous # selects the tier that carries it",
          "audience: lan",
        ),
      ),
    ).toStrictEqual({ "kubernetes.io/ingress.class": "traefik-lan" });
  });

  it("is the tier's that carries the exposure's audience", () => {
    expect(classOf()).toBe("traefik-public");
    expect(
      classOf((document) =>
        document.replace(
          "audience: anonymous # selects the tier that carries it",
          "audience: lan",
        ),
      ),
    ).toBe("traefik-lan");
  });
});
// REQ-089 (docs/requirements.md): replicas spread across nodes repel each
// other within one revision, and need a node each.
describe("replicas spread across nodes", () => {
  const WHOAMI = "identity/identity.project.yml";
  const workload = (edit?: (document: string) => string) => {
    const tree = asTree(
      artifact(
        render(edit === undefined ? {} : { [WHOAMI]: edit }, ["identity"]),
        "identity",
      ),
    );
    const [deployment] = parseAllDocuments(
      tree["apps/identity/whoami/workload.yaml"] ?? "",
    ).map((document) => document.toJS() as Record<string, unknown>);
    return JSON.stringify(deployment);
  };

  it("repel each other on the hostname within one revision", () => {
    expect(workload()).toContain(
      '"podAntiAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":[{"labelSelector":{"matchLabels":{"app.kubernetes.io/instance":"whoami"}},"matchLabelKeys":["pod-template-hash"],"topologyKey":"kubernetes.io/hostname"}]}',
    );
  });

  it("may share a node without `across`", () => {
    expect(
      workload((document) => document.replace("          across: node\n", "")),
    ).not.toContain("podAntiAffinity");
  });

  it("are refused where fewer nodes can hold them than their count", () => {
    expect(() =>
      workload((document) =>
        document.replace(
          "replicas:\n          count: 2",
          "replicas:\n          count: 40",
        ),
      ),
    ).toThrow("E_PLACEMENT_UNSATISFIABLE");
    expect(() =>
      workload((document) =>
        document
          .replace(
            "replicas:\n          count: 2",
            "replicas:\n          count: 40",
          )
          .replace("          across: node\n", ""),
      ),
    ).not.toThrow();
  });
});

describe("replicas spread across too few nodes", () => {
  const refusals = (edit: (document: string) => string) => {
    const result = renderIntentSet(
      files({ "identity/identity.project.yml": edit }),
      { ...OPTIONS, projects: ["identity"] },
    );
    return result.ok
      ? []
      : result.diagnostics.map(({ code, path, message, hint }) => ({
          code,
          path,
          message,
          hint,
        }));
  };
  const counted = (document: string) =>
    document.replace(
      "replicas:\n          count: 2",
      "replicas:\n          count: 40",
    );

  it("names how many nodes can hold the Process", () => {
    const [refusal, ...rest] = refusals(counted);

    expect(rest).toStrictEqual([]);
    expect(refusal?.code).toBe("E_PLACEMENT_UNSATISFIABLE");
    expect(refusal?.path).toMatch(/\/processes\/0\/replicas$/);
    expect(refusal?.message).toMatch(
      /^whoami keeps 40 replicas on different nodes, and \d+ can hold it$/,
    );
    expect(refusal?.hint).toBe(
      "Lower the count, relax a placement dimension, or drop `across`.",
    );
  });

  it("holds as many replicas as eligible nodes, and tells how to fit more", () => {
    const [refusal] = refusals(counted);
    const nodes = Number(
      /and (\d+) can hold it/.exec(refusal?.message ?? "")?.[1],
    );
    const fitted = (count: number) => (document: string) =>
      document.replace(
        "replicas:\n          count: 2",
        `replicas:\n          count: ${String(count)}`,
      );

    expect(nodes).toBeGreaterThan(1);
    expect(refusals(fitted(nodes))).toStrictEqual([]);
    expect(refusals(fitted(nodes + 1))).toHaveLength(1);
  });

  it("leaves a Process no node can hold to the placement's own refusal", () => {
    const placed = refusals((document) =>
      counted(document).replace(
        /(name: whoami\n(?:.*\n)*?\s+memory: )\S+/,
        "$164Gi",
      ),
    );

    expect(placed.map(({ path }) => path.split("/").pop())).toStrictEqual([
      "placement",
    ]);
  });
});

// REQ-092 (docs/requirements.md): each dashboard file ships as one
// GrafanaDashboard in its Application's namespace and its Project's folder.
describe("a shipped dashboard", () => {
  const FILE = "data/dashboards/rabbitmq.json";
  const dashboardOf = (edit?: (document: string) => string) => {
    const tree = asTree(
      artifact(
        render(edit === undefined ? {} : { [FILE]: edit }, ["data"]),
        "data",
      ),
    );
    const [dashboard] = parseAllDocuments(
      tree["apps/data/platform-rabbitmq/dashboards.yaml"] ?? "",
    ).map((document) => document.toJS() as Record<string, unknown>);
    return dashboard as {
      metadata: { name: string; namespace: string };
      spec: Record<string, unknown>;
    };
  };

  it("selects the Platform's Grafana, in the Project's folder, its inputs mapped", () => {
    const { metadata, spec } = dashboardOf();

    expect(metadata).toMatchObject({
      name: "platform-rabbitmq-rabbitmq",
      namespace: "data-system",
    });
    expect({ ...spec, json: undefined }).toStrictEqual({
      instanceSelector: { matchLabels: { dashboards: "grafana" } },
      allowCrossNamespaceImport: true,
      folder: "data",
      json: undefined,
      datasources: [
        { inputName: "DS_PROMETHEUS", datasourceName: "prometheus" },
      ],
    });
  });

  it("maps no data source where the file declares no input, and names itself for its uid", () => {
    const { metadata, spec } = dashboardOf(
      () =>
        '{"__inputs": [{"name": "DS_LOKI", "type": "panel"}, {"name": 7, "type": "datasource"}], "uid": "Broker_Overview", "title": "Broker", "panels": []}\n',
    );

    expect(metadata.name).toBe("platform-rabbitmq-broker-overview");
    expect(spec).not.toHaveProperty("datasources");
    expect(spec["json"]).toContain('"uid": "Broker_Overview"');
  });
});

// REQ-090 (docs/requirements.md): the edge's forward-auth Middleware asks the
// Process of the provider its tier names, and hands on the headers it lists.
describe("the forward-auth Middleware", () => {
  const forwardAuth = (edit?: (document: string) => string) => {
    const tree = asTree(
      artifact(
        render(
          edit === undefined ? {} : { "platform/platform.intent.yml": edit },
          ["edge"],
        ),
        "edge",
      ),
    );
    return parseAllDocuments(
      tree["apps/edge/traefik-lan/middlewares.yaml"] ?? "",
    )
      .map((document) => document.toJS() as Record<string, unknown>)
      .find(
        (document) =>
          (document["metadata"] as { name: string }).name === "forward-auth",
      )?.["spec"];
  };

  it("asks the provider's Process at the path the tier names", () => {
    expect(forwardAuth()).toStrictEqual({
      forwardAuth: {
        address:
          "http://identity-http.estate-system.svc.cluster.local:8080/gate/forward",
        trustForwardHeader: true,
      },
    });
  });

  it("hands on the response headers the tier lists", () => {
    expect(
      forwardAuth((document) =>
        document.replace(
          "path: /gate/forward}",
          "path: /gate/forward, responseHeaders: [X-User-Id, X-User-Roles]}",
        ),
      ),
    ).toStrictEqual({
      forwardAuth: {
        address:
          "http://identity-http.estate-system.svc.cluster.local:8080/gate/forward",
        trustForwardHeader: true,
        authResponseHeaders: ["X-User-Id", "X-User-Roles"],
      },
    });
  });

  // REQ-111 (docs/requirements.md): the edge asks the provider's Stable
  // Address, and only the Stable Address follows where the provider runs.
  it("asks the provider's Stable Address, which follows the provider where the handover ledger says the old path runs it", () => {
    const legacy = (document: string) =>
      document
        .replace(
          "legacy: [auth, data, knowledge, notes]",
          "legacy: [auth, data, identity, knowledge, notes]",
        )
        .replace(
          "estate: [agents, delivery, edge, identity, ",
          "estate: [agents, delivery, edge, ",
        )
        .replace(
          "  serving:\n",
          "  serving:\n    - application: identity\n      namespace: auth-system\n      instance: auth-api\n",
        );
    const address = (
      forwardAuth(legacy) as { forwardAuth: { address: string } }
    ).forwardAuth.address;
    const estate = asTree(
      artifact(
        render({ "platform/platform.intent.yml": legacy }, ["edge"]),
        "_estate",
      ),
    );

    expect(address).toBe(
      "http://identity-http.estate-system.svc.cluster.local:8080/gate/forward",
    );
    expect(estate["estate/stable-addresses/services.yaml"]).toContain(
      "  name: identity-http\n",
    );
    expect(estate["estate/stable-addresses/services.yaml"]).toContain(
      "externalName: auth-api.auth-system.svc.cluster.local\n",
    );
  });
});

// REQ-096 (docs/requirements.md): a Process's priority class follows from
// what it is: a datastore's the data class, the foundation's and a critical
// Application's the critical class, any other none.
describe("a Process's priority class", () => {
  const priorityOf = (project: string, path: string) => {
    const tree = asTree(artifact(render(undefined, [project]), project));
    const [workload] = parseAllDocuments(tree[path] ?? "").map(
      (document) => document.toJS() as Record<string, unknown>,
    );
    return JSON.stringify(workload).match(/"priorityClassName":"([^"]+)"/)?.[1];
  };

  it("is the data class for a datastore", () => {
    expect(
      priorityOf("data", "apps/data/platform-postgres/workload.yaml"),
    ).toBe("platform-data");
  });

  it("is the critical class for the foundation", () => {
    expect(priorityOf("edge", "apps/edge/traefik-public/workload.yaml")).toBe(
      "platform-critical-app",
    );
  });

  it("is none for any other Process", () => {
    expect(
      priorityOf("notes", "apps/notes/notes/workload.yaml"),
    ).toBeUndefined();
  });
});
// REQ-081 (docs/requirements.md): an Application exposed on a pool-kind L4
// Address renders, per Process and address, one load balancer that requests the
// pool and keeps the client's address, carrying each port a client dials to the
// surface's own port; the Process is held to the pool's site, and its policy
// admits any address on those ports.
describe("an L4 exposure", () => {
  const DATA = "data/data.project.yml";
  const BROKER = "apps/data/platform-rabbitmq";
  const EXPOSED =
    "      - {address: lan-mqtt, port: 1883, protocol: tcp, process: rabbitmq, surface: mqtt}\n";
  const documents = (body: string | undefined) =>
    parseAllDocuments(body ?? "").map(
      (document) => document.toJS() as Record<string, unknown>,
    );
  const named = (body: string | undefined, name: string) =>
    documents(body).find(
      (document) => (document["metadata"] as { name: string }).name === name,
    );
  const data = (edit?: (document: string) => string) =>
    asTree(
      artifact(
        render(edit === undefined ? {} : { [DATA]: edit }, ["data"]),
        "data",
      ),
    );

  it("renders a load balancer on the pool that keeps the client's address", () => {
    expect(
      named(data()[`${BROKER}/service.yaml`], "rabbitmq-lan-mqtt"),
    ).toStrictEqual({
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: "rabbitmq-lan-mqtt",
        namespace: "data-system",
        labels: {
          "app.kubernetes.io/name": "rabbitmq",
          "app.kubernetes.io/instance": "rabbitmq",
          "app.kubernetes.io/part-of": "platform-rabbitmq",
          "app.kubernetes.io/managed-by": "deploy-kit",
          "app.kubernetes.io/component": "none",
        },
        annotations: { "metallb.io/address-pool": "lan-mqtt" },
      },
      spec: {
        type: "LoadBalancer",
        externalTrafficPolicy: "Local",
        selector: { "app.kubernetes.io/instance": "rabbitmq" },
        ports: [
          { name: "tcp-1883", port: 1883, protocol: "TCP", targetPort: 1883 },
        ],
      },
    });
  });

  it("carries TCP and UDP on one address in one Service, a client's port apart from the container's", () => {
    const tree = data((document) =>
      document.replace(
        EXPOSED,
        `${EXPOSED}      - {address: lan-mqtt, port: 53, protocol: udp, process: rabbitmq, surface: mqtt}\n`,
      ),
    );
    const service = named(tree[`${BROKER}/service.yaml`], "rabbitmq-lan-mqtt");

    expect((service?.["spec"] as { ports: unknown[] }).ports).toStrictEqual([
      { name: "udp-53", port: 53, protocol: "UDP", targetPort: 1883 },
      { name: "tcp-1883", port: 1883, protocol: "TCP", targetPort: 1883 },
    ]);
    const policy = named(tree[`${BROKER}/networkpolicy.yaml`], "rabbitmq");
    expect(
      (policy?.["spec"] as { ingress: unknown[] }).ingress.filter((rule) =>
        JSON.stringify(rule).includes("0.0.0.0/0"),
      ),
    ).toStrictEqual([
      {
        from: [{ ipBlock: { cidr: "0.0.0.0/0" } }],
        ports: [{ protocol: "UDP", port: 1883 }],
      },
      {
        from: [{ ipBlock: { cidr: "0.0.0.0/0" } }],
        ports: [{ protocol: "TCP", port: 1883 }],
      },
    ]);
  });

  it("renders one Service per address in name order, and TCP before UDP on one port", () => {
    // A spare one-address pool of its own: lan-dns is utility's resolver's.
    const tree = asTree(
      artifact(
        render(
          {
            [DATA]: (document) =>
              document.replace(
                EXPOSED,
                `      - {address: lan-mqtt, port: 1883, protocol: udp, process: rabbitmq, surface: mqtt}\n${EXPOSED}      - {address: lan-aux, port: 1883, protocol: tcp, process: rabbitmq, surface: mqtt}\n      - {address: lan-aux, port: 1883, protocol: udp, process: rabbitmq, surface: mqtt}\n`,
              ),
            "platform/platform.intent.yml": (document) =>
              document.replace(
                "\nl4Addresses:\n",
                "\nl4Addresses:\n  lan-aux:\n    kind: pool\n    site: enschede\n    range: 192.168.0.96/32\n",
              ),
          },
          ["data"],
        ),
        "data",
      ),
    );
    const services = documents(tree[`${BROKER}/service.yaml`]).filter(
      (document) =>
        (document["spec"] as { type?: string }).type === "LoadBalancer",
    );

    expect(
      services.map((service) => [
        (service["metadata"] as { name: string }).name,
        (service["spec"] as { ports: { name: string }[] }).ports.map(
          ({ name }) => name,
        ),
      ]),
    ).toStrictEqual([
      ["rabbitmq-lan-aux", ["tcp-1883", "udp-1883"]],
      ["rabbitmq-lan-mqtt", ["tcp-1883", "udp-1883"]],
    ]);
  });

  it("admits any address on the surface's own port, and nothing more", () => {
    const policy = named(data()[`${BROKER}/networkpolicy.yaml`], "rabbitmq");
    const ingress = (policy?.["spec"] as { ingress: unknown[] }).ingress;

    expect(
      ingress.filter((rule) => JSON.stringify(rule).includes("0.0.0.0/0")),
    ).toStrictEqual([
      {
        from: [{ ipBlock: { cidr: "0.0.0.0/0" } }],
        ports: [{ protocol: "TCP", port: 1883 }],
      },
    ]);
  });

  it("holds the Process to the pool's site", () => {
    const workload = named(data()[`${BROKER}/workload.yaml`], "rabbitmq");

    expect(JSON.stringify(workload)).toContain("enschede-t1000-1");
    expect(JSON.stringify(workload)).not.toContain("frankfurt");
  });

  it("refuses a placement that contradicts the pool's site, naming the site", () => {
    const result = renderIntentSet(
      files({
        [DATA]: (document) =>
          document.replace(
            "          memory: 2Gi       # the broker",
            "          site: frankfurt\n          memory: 2Gi       # the broker",
          ),
      }),
      { ...OPTIONS, projects: ["data"] },
    );

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, message, hint }) => ({
            code,
            message,
            hint,
          })),
    ).toStrictEqual([
      {
        code: "E_PLACEMENT_UNSATISFIABLE",
        message:
          "no node in the node contract on enschede, the site of each pool rabbitmq is exposed on, can hold it",
        hint: "Relax a placement dimension, or expose the Process on a pool of the site it is placed on.",
      },
    ]);
  });
});

// REQ-097 (docs/requirements.md): an exposure on a node-kind L4 Address renders
// a host port on the Process, the client's port on the node to the surface's
// own, and holds the Process to that node; it renders no load balancer.
describe("an exposure on a node address", () => {
  const MAIL = "mail/mail.project.yml";
  const SMTP =
    "      - { address: mail-node, port: 25, protocol: tcp, process: stalwart, surface: smtp }\n";
  const workloadOf = (edit?: (document: string) => string) =>
    parseAllDocuments(
      asTree(
        artifact(
          render(edit === undefined ? {} : { [MAIL]: edit }, ["mail"]),
          "mail",
        ),
      )["apps/mail/stalwart/workload.yaml"] ?? "",
    )
      .map((document) => document.toJS() as Record<string, unknown>)
      .find(({ kind }) => kind === "Deployment") as {
      spec: {
        template: {
          spec: {
            containers: { ports: unknown[] }[];
            affinity: unknown;
          };
        };
      };
    };

  it("puts the client's port on the surface's own port as a host port", () => {
    expect(workloadOf().spec.template.spec.containers[0]?.ports).toStrictEqual([
      { name: "http", containerPort: 8080 },
      { name: "smtp", containerPort: 25, hostPort: 25 },
      { name: "imaps", containerPort: 993, hostPort: 993 },
    ]);
  });

  it("adds a port of its own where the client's port or protocol is not the surface's", () => {
    const ports = workloadOf((document) =>
      document.replace(
        SMTP,
        `${SMTP}      - { address: mail-node, port: 587, protocol: tcp, process: stalwart, surface: smtp }\n      - { address: mail-node, port: 25, protocol: udp, process: stalwart, surface: smtp }\n`,
      ),
    ).spec.template.spec.containers[0]?.ports;

    expect(ports).toStrictEqual([
      { name: "http", containerPort: 8080 },
      { name: "smtp", containerPort: 25, hostPort: 25 },
      { name: "imaps", containerPort: 993, hostPort: 993 },
      { name: "udp-25", containerPort: 25, hostPort: 25, protocol: "UDP" },
      { name: "tcp-587", containerPort: 25, hostPort: 587, protocol: "TCP" },
    ]);
  });

  it("refuses a placement no node of the address can meet, naming the node", () => {
    const result = renderIntentSet(
      files({
        [MAIL]: (document) =>
          document.replace(
            "          memory: 512Mi",
            "          site: enschede\n          memory: 512Mi",
          ),
      }),
      { ...OPTIONS, projects: ["mail"] },
    );

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, message, hint }) => ({
            code,
            message,
            hint,
          })),
    ).toStrictEqual([
      {
        code: "E_PLACEMENT_UNSATISFIABLE",
        message:
          "no node of frankfurt-contabo-1, the node of each node address stalwart is exposed on, can hold it",
        hint: "Relax a placement dimension, or expose the Process on the address of a node that can hold it.",
      },
    ]);
  });

  it("holds the Process to the node, and renders no load balancer", () => {
    expect(workloadOf().spec.template.spec.affinity).toStrictEqual({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                {
                  key: "kubernetes.io/hostname",
                  operator: "In",
                  values: ["frankfurt-contabo-1"],
                },
              ],
            },
          ],
        },
      },
    });
    const tree = asTree(artifact(render(undefined, ["mail"]), "mail"));
    expect(
      Object.values(tree).some((body) => body.includes("LoadBalancer")),
    ).toBe(false);
  });
});

// REQ-099 (docs/requirements.md): a tier's proxy is exposed on the L4 Address
// the tier names, on the ports its listener derives, as any exposure on that
// address renders: host ports on a node address, a load balancer on a pool.
describe("a tier's proxy", () => {
  const edge = () => asTree(artifact(render(undefined, ["edge"]), "edge"));
  const objectsOf = (path: string) =>
    parseAllDocuments(edge()[path] ?? "").map(
      (document) => document.toJS() as Record<string, unknown>,
    );

  it("listens on the node address of a tls tier, on 80 and 443", () => {
    const [workload] = objectsOf("apps/edge/traefik-public/workload.yaml") as {
      spec: {
        template: {
          spec: { containers: { ports: unknown[] }[]; affinity: unknown };
        };
      };
    }[];
    expect(workload?.spec.template.spec.containers[0]?.ports).toStrictEqual([
      { name: "web", containerPort: 8000 },
      { name: "websecure", containerPort: 8443 },
      { name: "admin", containerPort: 8080 },
      { name: "tcp-80", containerPort: 8000, hostPort: 80, protocol: "TCP" },
      { name: "tcp-443", containerPort: 8443, hostPort: 443, protocol: "TCP" },
    ]);
    expect(JSON.stringify(workload?.spec.template.spec.affinity)).toContain(
      '"values":["frankfurt-contabo-1"]',
    );
  });

  it("issues an acme tier's certificate through a resolver named for the tier", () => {
    const [workload] = objectsOf("apps/edge/traefik-public/workload.yaml") as {
      spec: { template: { spec: { containers: { args: string[] }[] } } };
    }[];
    expect(
      workload?.spec.template.spec.containers[0]?.args.filter((arg) =>
        arg.startsWith("--certificatesresolvers."),
      ),
    ).toStrictEqual([
      "--certificatesresolvers.public-frankfurt.acme.email=hostmaster@jorisjonkers.dev",
      "--certificatesresolvers.public-frankfurt.acme.storage=/acme/public-frankfurt.json",
      "--certificatesresolvers.public-frankfurt.acme.dnschallenge.provider=cloudflare",
    ]);
    const [lan] = objectsOf("apps/edge/traefik-lan/workload.yaml") as {
      spec: { template: { spec: { containers: { args: string[] }[] } } };
    }[];
    expect(
      lan?.spec.template.spec.containers[0]?.args.some((arg) =>
        arg.startsWith("--certificatesresolvers."),
      ),
    ).toBe(false);
  });

  it("keeps an acme tier's state on its own claim, reads the DNS token, and reaches out", () => {
    const [workload] = objectsOf("apps/edge/traefik-public/workload.yaml") as {
      spec: {
        template: {
          spec: {
            containers: { volumeMounts: unknown[] }[];
            volumes: unknown[];
          };
        };
      };
    }[];
    const pod = workload?.spec.template.spec;
    expect(pod?.volumes).toContainEqual({
      name: "acme",
      persistentVolumeClaim: { claimName: "acme" },
    });
    expect(pod?.containers[0]?.volumeMounts).toContainEqual({
      name: "acme",
      mountPath: "/acme",
    });
    expect(JSON.stringify(pod?.containers[0])).toContain(
      '{"name":"CF_DNS_API_TOKEN","valueFrom":{"secretKeyRef":{"name":"traefik-public-platform-cloudflare","key":"CF_DNS_API_TOKEN"}}}',
    );
    expect(edge()["apps/edge/traefik-public/networkpolicy.yaml"]).toContain(
      "0.0.0.0/0",
    );
  });

  it("listens on the pool of a plain tier, on 80", () => {
    const service = objectsOf("apps/edge/traefik-lan/service.yaml").find(
      ({ metadata }) =>
        (metadata as { name: string }).name === "traefik-lan-lan-edge",
    );
    expect(service?.["spec"]).toStrictEqual({
      type: "LoadBalancer",
      externalTrafficPolicy: "Local",
      selector: { "app.kubernetes.io/instance": "traefik-lan" },
      ports: [{ name: "tcp-80", port: 80, protocol: "TCP", targetPort: 8000 }],
    });
  });
});

// REQ-100 (docs/requirements.md): a route takes its TLS from its tier: on an
// acme tier the resolver named for the tier, on a tls tier that issues none the
// certificate the proxy already holds, and on a plain tier none at all.
describe("a route's TLS", () => {
  const tlsOf = (edit?: (platform: string) => string) => {
    const tree = asTree(
      artifact(
        render(
          edit === undefined ? {} : { "platform/platform.intent.yml": edit },
          ["data"],
        ),
        "data",
      ),
    );
    return Object.fromEntries(
      ["route-management", "route-lan"].map((route) => [
        route,
        (
          parseAllDocuments(
            tree[`apps/data/platform-rabbitmq/${route}.yaml`] ?? "",
          )[0]?.toJS() as { spec: { tls?: unknown } }
        ).spec.tls,
      ]),
    );
  };

  it("names its acme tier's own resolver, and none on a plain tier", () => {
    expect(tlsOf()).toStrictEqual({
      "route-management": { certResolver: "public-frankfurt" },
      "route-lan": undefined,
    });
  });

  it("terminates TLS with no resolver on a tls tier that issues none", () => {
    expect(
      tlsOf((platform) =>
        platform
          .replace(
            "listener: plain\n    certificates: none",
            "listener: tls\n    certificates: none",
          )
          // The LAN proxy provides no websecure, so the tier names no address.
          .replace(/\n {4}address: lan-edge[^\n]*/, ""),
      )["route-lan"],
    ).toStrictEqual({});
  });
});
// REQ-091 (docs/requirements.md): a tier's proxy takes its static
// configuration from the model: entry points from its surfaces, the CRD
// provider filtered on its tier's ingress class, ping and metrics on `admin`.
describe("the edge proxy's static configuration", () => {
  const argsOf = (
    application: string,
    edit?: (document: string) => string,
    platform?: (document: string) => string,
  ): unknown => {
    const tree = asTree(
      artifact(
        render(
          {
            ...(edit === undefined ? {} : { "edge/edge.project.yml": edit }),
            ...(platform === undefined
              ? {}
              : { "platform/platform.intent.yml": platform }),
          },
          ["edge"],
        ),
        "edge",
      ),
    );
    const [workload] = parseAllDocuments(
      tree[`apps/edge/${application}/workload.yaml`] ?? "",
    ).map((document) => document.toJS() as Record<string, unknown>);
    const spec = workload?.["spec"] as {
      template: { spec: { containers: { args?: string[] }[] } };
    };
    return spec.template.spec.containers[0]?.args;
  };

  it("serves TLS on websecure, and admits only its tier's class", () => {
    expect(argsOf("traefik-public")).toStrictEqual([
      "--entryPoints.web.address=:8000/tcp",
      "--entryPoints.websecure.address=:8443/tcp",
      "--entryPoints.websecure.http.tls=true",
      "--entryPoints.traefik.address=:8080/tcp",
      "--ping=true",
      "--ping.entryPoint=traefik",
      "--metrics.prometheus=true",
      "--metrics.prometheus.entryPoint=traefik",
      "--providers.kubernetescrd=true",
      "--providers.kubernetescrd.ingressClass=traefik-public",
      "--providers.kubernetescrd.allowCrossNamespace=true",
      "--providers.kubernetescrd.allowEmptyServices=true",
      "--certificatesresolvers.public-frankfurt.acme.email=hostmaster@jorisjonkers.dev",
      "--certificatesresolvers.public-frankfurt.acme.storage=/acme/public-frankfurt.json",
      "--certificatesresolvers.public-frankfurt.acme.dnschallenge.provider=cloudflare",
      "--log.format=json",
      "--accesslog=true",
      "--accesslog.format=json",
    ]);
  });

  it("opens no websecure entry point where the Process provides none", () => {
    expect(argsOf("traefik-lan")).toStrictEqual([
      "--entryPoints.web.address=:8000/tcp",
      "--entryPoints.traefik.address=:8080/tcp",
      "--ping=true",
      "--ping.entryPoint=traefik",
      "--metrics.prometheus=true",
      "--metrics.prometheus.entryPoint=traefik",
      "--providers.kubernetescrd=true",
      "--providers.kubernetescrd.ingressClass=traefik-lan",
      "--providers.kubernetescrd.allowCrossNamespace=true",
      "--providers.kubernetescrd.allowEmptyServices=true",
      "--log.format=json",
      "--accesslog=true",
      "--accesslog.format=json",
    ]);
  });

  it("serves TLS only where the tier terminates it and the Process provides websecure", () => {
    const tlsOn = (args: unknown) =>
      (args as string[]).includes("--entryPoints.websecure.http.tls=true");
    // A tls tier whose proxy provides no websecure opens no TLS entry point.
    expect(
      tlsOn(
        argsOf(
          "traefik-public",
          (document) => document.replace("          websecure: 8443\n", ""),
          // A tier whose proxy lacks websecure names no address it listens on.
          (document) =>
            document.replace(/\n {4}address: edge-frankfurt[^\n]*/, ""),
        ),
      ),
    ).toBe(false);
    // A plain tier's proxy that provides websecure serves it without TLS.
    expect(
      tlsOn(
        argsOf("traefik-lan", (document) =>
          document.replace(
            "          web: 8000\n          admin: 8080\n",
            "          web: 8000\n          websecure: 8443\n          admin: 8080\n",
          ),
        ),
      ),
    ).toBe(false);
  });

  it("asks no ping or metrics where the Process provides no admin surface", () => {
    const args = argsOf("traefik-lan", (document) =>
      document.replace(
        "          web: 8000\n          admin: 8080\n",
        "          web: 8000\n",
      ),
    ) as string[];

    expect(args).toStrictEqual([
      "--entryPoints.web.address=:8000/tcp",
      "--providers.kubernetescrd=true",
      "--providers.kubernetescrd.ingressClass=traefik-lan",
      "--providers.kubernetescrd.allowCrossNamespace=true",
      "--providers.kubernetescrd.allowEmptyServices=true",
      "--log.format=json",
      "--accesslog=true",
      "--accesslog.format=json",
    ]);
  });
});

// REQ-098 (docs/requirements.md): the Node Agents render to the node artifact,
// each a DaemonSet held to the nodes its facts name, with the privileges the
// catalog fixes; the speaker announces each pool from the nodes of its site.
describe("the Node Agents", () => {
  const tree = () => asTree(artifact(render(undefined, ["node"]), "node"));
  const objectsOf = (path: string) =>
    parseAllDocuments(tree()[path] ?? "").map(
      (document) => document.toJS() as Record<string, unknown>,
    );

  it("render the node artifact to its committed tree, byte for byte", () => {
    expect(tree()).toStrictEqual(committed("node/rendered"));
  });

  it("time-slice each GPU into four shares, of which gpu-metrics holds one", () => {
    const [config] = objectsOf("apps/node/gpu-device/configmap.yaml") as {
      data: { "config.yaml": string };
    }[];
    expect(
      parseAllDocuments(config?.data["config.yaml"] ?? "")[0]?.toJS(),
    ).toStrictEqual({
      version: "v1",
      sharing: {
        timeSlicing: {
          resources: [{ name: "nvidia.com/gpu", replicas: 4 }],
        },
      },
    });
    const [metrics] = objectsOf("apps/node/gpu-metrics/workload.yaml") as {
      spec: { template: { spec: { containers: { resources: unknown }[] } } };
    }[];
    expect(metrics?.spec.template.spec.containers[0]?.resources).toStrictEqual({
      requests: { memory: "256Mi", cpu: "50m" },
      limits: { memory: "256Mi", "nvidia.com/gpu": "1" },
    });
  });

  it("announce each pool from the nodes of its site, and assign none unasked", () => {
    const pools = objectsOf("apps/node/l4-speaker/pools.yaml");
    expect(
      pools.map(({ kind, metadata, spec }) => ({
        kind,
        name: (metadata as { name: string }).name,
        spec,
      })),
    ).toStrictEqual([
      {
        kind: "IPAddressPool",
        name: "lan-dns",
        spec: { addresses: ["192.168.0.98/32"], autoAssign: false },
      },
      {
        kind: "L2Advertisement",
        name: "lan-dns",
        spec: {
          ipAddressPools: ["lan-dns"],
          nodeSelectors: [
            {
              matchExpressions: [
                {
                  key: "kubernetes.io/hostname",
                  operator: "In",
                  values: [
                    "enschede-t1000-1",
                    "enschede-rx7900xtx-1",
                    "enschede-gtx-960m-1",
                    "enschede-pi-1",
                    "enschede-pi-2",
                    "enschede-pi-3",
                  ],
                },
              ],
            },
          ],
        },
      },
      expect.objectContaining({ kind: "IPAddressPool", name: "lan-edge" }),
      expect.objectContaining({ kind: "L2Advertisement", name: "lan-edge" }),
      expect.objectContaining({ kind: "IPAddressPool", name: "lan-mqtt" }),
      expect.objectContaining({ kind: "L2Advertisement", name: "lan-mqtt" }),
    ]);
  });

  it("run the speaker on the host network with NET_RAW alone", () => {
    const [speaker] = objectsOf("apps/node/l4-speaker/workload.yaml") as {
      kind: string;
      spec: {
        template: {
          spec: {
            hostNetwork?: boolean;
            containers: { securityContext: unknown }[];
          };
        };
      };
    }[];
    expect(speaker?.kind).toBe("DaemonSet");
    expect(speaker?.spec.template.spec.hostNetwork).toBe(true);
    expect(
      speaker?.spec.template.spec.containers[0]?.securityContext,
    ).toStrictEqual({
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: { add: ["NET_RAW"], drop: ["ALL"] },
    });
  });
});

// REQ-093 (docs/requirements.md): the monitoring stack carries the estate's
// alert rules and its one routing of every alert.
describe("the monitoring stack's alerting", () => {
  const tree = () =>
    asTree(artifact(render(undefined, ["observability"]), "observability"));
  const objectsAt = (path: string) =>
    parseAllDocuments(tree()[path] ?? "").map(
      (document) => document.toJS() as Record<string, unknown>,
    );

  it("renders the observability project's share of the tree to its committed tree, byte for byte", () => {
    expect(tree()).toStrictEqual(committed("observability/rendered"));
  });

  it("renders a rule-group file as one PrometheusRule of its groups", () => {
    const [rule] = objectsAt(
      "apps/observability/prometheus/alertrules.yaml",
    ) as {
      kind: string;
      metadata: { name: string };
      spec: { groups: { name: string }[] };
    }[];

    expect(rule?.kind).toBe("PrometheusRule");
    expect(rule?.metadata.name).toBe("prometheus-platform");
    expect(rule?.spec.groups.map(({ name }) => name)).toStrictEqual([
      "platform",
    ]);
  });

  it("routes each severity to its receiver, its webhook read from the Secret its grant lands in", () => {
    const [config] = objectsAt(
      "apps/observability/alertmanager/alertmanagerconfig.yaml",
    ) as { spec: Record<string, unknown> }[];

    expect(config?.spec).toStrictEqual({
      route: {
        receiver: "null",
        groupBy: ["alertname", "namespace"],
        groupWait: "1m",
        groupInterval: "5m",
        repeatInterval: "12h",
        routes: [
          {
            matchers: [{ name: "severity", value: "critical" }],
            receiver: "discord",
            repeatInterval: "4h",
          },
          {
            matchers: [{ name: "severity", value: "warning" }],
            receiver: "discord",
            repeatInterval: "12h",
          },
        ],
      },
      receivers: [
        { name: "null" },
        {
          name: "discord",
          discordConfigs: [
            {
              apiURL: {
                name: "alertmanager-platform-alertmanager-discord",
                key: "webhook-url",
              },
              sendResolved: true,
            },
          ],
        },
      ],
    });
    expect(Object.keys(tree())).toContain(
      "apps/observability/alertmanager/vso.yaml",
    );
  });
});

// REQ-101 (docs/requirements.md): the foundation renders as declared
// Applications and derived agents alone: no admission webhook, no chart hook
// Job and no aggregated role anywhere in a rendered tree, and the log collector
// reads pod logs through the API as one ordinary copy.
describe("the declared foundation", () => {
  const renderedFiles = (dir: string): string[] =>
    readdirSync(dir, { recursive: true, encoding: "utf8" })
      .map((name) => join(dir, name))
      .filter((path) => path.includes("/rendered/") && path.endsWith(".yaml"));

  it("renders no webhook, chart hook or aggregated role in any tree", () => {
    const found = renderedFiles(EXAMPLES).filter((path) =>
      /kind: (Mutating|Validating)WebhookConfiguration|helm\.sh\/hook|aggregate-to-/.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(found).toStrictEqual([]);
  });

  it("reads every pod's log through the API, as one copy with no host privilege", () => {
    const tree = asTree(
      artifact(render(undefined, ["observability"]), "observability"),
    );
    const objects = Object.entries(tree)
      .filter(([path]) => path.startsWith("apps/observability/alloy/"))
      .flatMap(([, body]) =>
        parseAllDocuments(body).map(
          (document) => document.toJS() as Record<string, unknown>,
        ),
      );
    expect(objects.some(({ kind }) => kind === "DaemonSet")).toBe(false);
    const role = objects.find(({ kind }) => kind === "ClusterRole") as
      { rules: { resources: string[] }[] } | undefined;
    expect(role?.rules.flatMap(({ resources }) => resources)).toContain(
      "pods/log",
    );
    expect(JSON.stringify(objects)).not.toContain("hostNetwork");
  });
});

// REQ-118 (docs/requirements.md): the metrics stack scrapes Flux's
// controllers where the Platform document records their metrics, and reaches
// every scrape port, and nothing more, through its own policy.
describe("the metrics stack's scrapes", () => {
  const METRICS = "    metrics: {port: 8080, path: /metrics}\n";
  const tree = (
    edits?: Readonly<Record<string, (text: string) => string>>,
  ): Record<string, string> =>
    asTree(artifact(render(edits, ["observability"]), "observability"));
  const objectsAt = (files: Record<string, string>, path: string) =>
    parseAllDocuments(files[path] ?? "").map(
      (document) => document.toJS() as Record<string, unknown>,
    );
  type Policy = {
    metadata: { name: string };
    spec: {
      egress?: {
        to: { namespaceSelector?: unknown; podSelector?: unknown }[];
        ports: { protocol: string; port: number }[];
      }[];
    };
  };
  const egressOf = (files: Record<string, string>, application: string) =>
    (
      objectsAt(
        files,
        `apps/observability/${application}/networkpolicy.yaml`,
      ) as Policy[]
    ).find(({ metadata }) => metadata.name === application)?.spec.egress ?? [];
  const peers = (files: Record<string, string>, application: string) =>
    egressOf(files, application).map(({ to }) => to[0]);

  it("renders one PodMonitor of Flux's controllers in the metrics stack's own namespace, by their label and port number, at the platform's cadence", () => {
    expect(
      objectsAt(tree(), "apps/observability/prometheus/flux-podmonitor.yaml"),
    ).toStrictEqual([
      {
        apiVersion: "monitoring.coreos.com/v1",
        kind: "PodMonitor",
        metadata: {
          name: "flux-controllers",
          namespace: "observability-system",
          labels: {
            release: "metrics-stack",
            "app.kubernetes.io/part-of": "prometheus",
            "app.kubernetes.io/managed-by": "deploy-kit",
          },
        },
        spec: {
          jobLabel: "app",
          selector: { matchLabels: { "app.kubernetes.io/part-of": "flux" } },
          namespaceSelector: { matchNames: ["flux-system"] },
          podMetricsEndpoints: [
            {
              portNumber: 8080,
              path: "/metrics",
              interval: "30s",
              scrapeTimeout: "10s",
            },
          ],
        },
      },
    ]);
  });

  it("admits the metrics stack to every scrape port where its Process runs, and to Flux's controllers on the recorded port alone", () => {
    const egress = egressOf(tree(), "prometheus");

    expect(
      egress.map(({ to, ports }) => [to[0], ports.map(({ port }) => port)]),
    ).toStrictEqual([
      [
        {
          namespaceSelector: {
            matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
          },
        },
        [53, 53],
      ],
      ...[
        ["data-system", "postgres", 9187],
        ["data-system", "rabbitmq", 15692],
        ["delivery-system", "release-gate", 8080],
        ["notes-system", "notes-api", 8080],
      ].map(([namespace, instance, port]) => [
        {
          namespaceSelector: {
            matchLabels: { "kubernetes.io/metadata.name": namespace },
          },
          podSelector: {
            matchLabels: { "app.kubernetes.io/instance": instance },
          },
        },
        [port, port],
      ]),
      [
        {
          namespaceSelector: {
            matchLabels: { "kubernetes.io/metadata.name": "flux-system" },
          },
          podSelector: {
            matchLabels: { "app.kubernetes.io/part-of": "flux" },
          },
        },
        [8080, 8080],
      ],
    ]);
  });

  it("gives no other Process of the observability project a scrape's egress", () => {
    for (const application of ["alertmanager", "otel-collector", "loki"])
      expect(peers(tree(), application)).toStrictEqual([
        {
          namespaceSelector: {
            matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
          },
        },
      ]);
  });

  it("renders no Flux monitor and admits no Flux controller where the Platform document records no metrics", () => {
    const unrecorded = tree({
      "platform/platform.intent.yml": (platform) =>
        platform.replace(METRICS, ""),
    });

    expect(
      Object.keys(unrecorded).filter((path) => path.includes("flux")),
    ).toStrictEqual([]);
    expect(
      peers(unrecorded, "prometheus").filter((peer) =>
        JSON.stringify(peer).includes("flux"),
      ),
    ).toStrictEqual([]);
  });
});
