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
import { ADAPTERS } from "../../src/adapters/registry.ts";
import { renderKubernetes } from "../../src/adapters/kubernetes/render.ts";
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
  "secrets/secrets.project.yml",
  "data/data.project.yml",
  "data/env/postgres/base.env",
  "data/config/postgresql.conf",
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

  it("renders the estate-scoped share of both to its committed tree, byte for byte", () => {
    expect(
      asTree(artifact(render(undefined, ["notes", "data"]), "_estate")),
    ).toStrictEqual(committed("_estate/rendered"));
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
    }).toStrictEqual(committed("auth/rendered"));
  });

  // documents of the render it belongs to, and is named by their digest.
  describe("the Vault policy job", () => {
    const estate = (
      projects: readonly string[],
      edits?: Readonly<Record<string, (text: string) => string>>,
    ) => Object.keys(asTree(artifact(render(edits, projects), "_estate")));
    const jobFiles = (paths: readonly string[]) =>
      paths.filter(
        (path) =>
          path.startsWith("estate/vso-secrets/") &&
          !path.includes("/policies/"),
      );

    it("is rendered beside the documents it writes, with its own policy and an index that applies it", () => {
      expect(jobFiles(estate(["notes", "data"]))).toStrictEqual([
        "estate/vso-secrets/configmap.yaml",
        "estate/vso-secrets/cronjob.yaml",
        "estate/vso-secrets/job.yaml",
        "estate/vso-secrets/kustomization.yaml",
        "estate/vso-secrets/networkpolicy.yaml",
        "estate/vso-secrets/serviceaccount.yaml",
      ]);
    });

    it("is not rendered where the render holds no document for it to write", () => {
      expect(jobFiles(estate(["notes"]))).toStrictEqual([]);
    });

    it("is not rendered where the platform names no job, though the documents are", () => {
      const paths = estate(["data"], {
        "platform/platform.intent.yml": (document) =>
          document.replace(/\npolicyJob:\n( {2}.*\n)+/, "\n"),
      });

      expect(jobFiles(paths)).toStrictEqual([]);
      expect(paths.filter((path) => path.includes("/policies/"))).toHaveLength(
        6,
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
          render({ "data/data.project.yml": adopting }, ["data"]),
          "_estate",
        ),
      );

      expect(
        JSON.parse(
          tree["estate/vso-secrets/policies/data-system.generated.json"] ??
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
          render({ "data/data.project.yml": generating }, ["data"]),
          "_estate",
        ),
      );

      expect(
        JSON.parse(
          tree["estate/vso-secrets/policies/data-system.generated.json"] ??
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
      expect(tree["estate/vso-secrets/configmap.yaml"]).toContain(
        "data-system.generated.json",
      );
    });

    it("runs again every hour, from the same documents", () => {
      const tree = asTree(artifact(render(undefined, ["data"]), "_estate"));
      const job = tree["estate/vso-secrets/job.yaml"] ?? "";
      const cron = tree["estate/vso-secrets/cronjob.yaml"] ?? "";
      const named = /name: (vault-policy-[0-9a-f]{12})\n/.exec(job)?.[1];

      expect(cron).toContain("kind: CronJob\n");
      expect(cron).toContain('schedule: "@hourly"\n');
      expect(cron).toContain("concurrencyPolicy: Forbid\n");
      expect(cron).toContain(`name: ${String(named)}\n`);
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
      const job = asTree(artifact(result.value, "_estate"))[
        "estate/vso-secrets/job.yaml"
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
              "_estate",
            ),
          )["estate/vso-secrets/job.yaml"] ?? "",
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
                  webhooks: { metadata: Record<string, string> }[];
                };
              };
            },
        )
        .find(({ kind }) => kind === "Canary") as {
        spec: {
          analysis: Record<string, unknown> & {
            webhooks: { metadata: Record<string, string> }[];
          };
        };
      };
      return {
        analysis: spec.analysis,
        metadata: spec.analysis.webhooks.map(({ metadata }) => metadata),
      };
    };
    const route =
      "{ path: /, match: prefix, process: notes-api, surface: http }";

    it("carry every Route's path, the readiness path, the public hostname and the platform's thresholds, the same on all three", () => {
      const { analysis, metadata } = canary();

      expect(metadata).toHaveLength(3);
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

        expect(metadata).toHaveLength(3);
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
      "apps/notes/notes/serviceaccount.yaml": "kubernetes",
      "apps/notes/notes/workload.yaml": "kubernetes",
    });
  });

  it("renders only the projects it is asked for", () => {
    expect(render(undefined, []).map(({ name }) => name)).toStrictEqual([]);
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

  // REQ-048 (docs/requirements.md): the delivery machinery renders, rolling
  // and ungated, with the API access each of its Processes declares.
  it("renders the delivery machinery's share of the tree to its committed tree, byte for byte", () => {
    expect(
      asTree(artifact(render(undefined, ["delivery"]), "delivery")),
    ).toStrictEqual(committed("delivery/rendered"));
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
    }).toStrictEqual(committed("knowledge-platform/rendered"));
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
      "apps/notes/notes/serviceaccount.yaml",
      "apps/notes/notes/workload.yaml",
    ]);
    expect(paths("_estate")).toStrictEqual([
      "estate/edge/public-frankfurt/kustomization.yaml",
      "estate/edge/public-frankfurt/notes-public.yaml",
      "estate/rollout-events/alert.yaml",
      "estate/rollout-events/kustomization.yaml",
      "estate/rollout-events/provider.yaml",
    ]);
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
          "estate/rollout-events/alert.yaml",
          "estate/rollout-events/kustomization.yaml",
          "estate/rollout-events/provider.yaml",
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

  it("leaves out a project still on the old path, and renders nothing for no reader", () => {
    const legacy = estate({
      [PLATFORM]: (document) =>
        document
          .replace(
            "legacy: [auth, data, knowledge, notes]",
            "legacy: [auth, data, knowledge, knowledge-platform, notes]",
          )
          .replace(
            "estate: [delivery, edge, knowledge-platform, observability, secrets]",
            "estate: [delivery, edge, observability, secrets]",
          ),
    });

    expect(
      Object.keys(legacy).filter((path) => path.includes("catalog")),
    ).toStrictEqual([]);
  });

  it("renders nothing where the engine names no catalog method, or the old path names no login", () => {
    const noMethod = estate({
      [PLATFORM]: (document) =>
        document.replace(", catalog: postgres-catalog }", " }"),
    });
    const noLogin = estate({
      [PLATFORM]: (document) =>
        document.replace(/\n {6}admin: \{[^}]*\}\n/, "\n"),
    });

    for (const tree of [noMethod, noLogin])
      expect(
        Object.keys(tree).filter((path) => path.includes("catalog")),
      ).toStrictEqual([]);
  });

  it("signs in with the derived login once the datastore is on the estate path", () => {
    const moved = estate({
      [PLATFORM]: (document) =>
        document
          .replace(
            "legacy: [auth, data, knowledge, notes]",
            "legacy: [auth, knowledge, notes]",
          )
          .replace(
            "estate: [delivery, edge, knowledge-platform, observability, secrets]",
            "estate: [data, delivery, edge, knowledge-platform, observability, secrets]",
          )
          .replace(/\n {2}serving:\n( {4}.*\n| {6}.*\n)+/, "\n"),
    });

    expect(catalogOf(moved)?.admin).toStrictEqual({
      path: "secret/data/data/postgres/catalog",
      user: "user",
      password: "password",
    });
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
            "estate: [delivery, edge, knowledge-platform, observability, secrets]",
            "estate: [auth, delivery, edge, knowledge-platform, observability, secrets]",
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

    expect(files(estate({}, ["data"]))).toStrictEqual([]);
    expect(files(estate({}, ["data", "knowledge-platform"]))).toContain(
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
      return result.value.catalogJobs;
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
            "estate: [delivery, edge, knowledge-platform, observability, secrets]",
            "estate: [delivery, edge, observability, secrets]",
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

    expect(result.value.catalogJobs?.[0]?.catalog.connection).toBe("pg");
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

// REQ-068 (docs/requirements.md): VSO is the one delivery path, so no rendered
// tree asks the Vault Agent injector for anything.
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
      new RegExp(`(\\n  ${alias}:\\n(?: {4}.*\\n)*? {4}gid: \\d+\\n)`),
      `$1    version: "${version}"\n`,
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
      "image.jorisjonkers.dev/karakeep": "0.33.2",
      "image.jorisjonkers.dev/meilisearch": "v1.41.0",
      "image.jorisjonkers.dev/vpn": "v3.40.0",
    });
  });

  it("annotates no container whose image the lock records no version for", () => {
    const tree = asTree(artifact(knowledgePlatform(), "knowledge-platform"));

    expect(
      Object.keys(
        deploymentTemplate(
          tree,
          "apps/knowledge-platform/karakeep/workload.yaml",
        ).metadata.annotations ?? {},
      ),
    ).not.toContain("image.jorisjonkers.dev/chrome");
    expect(
      deploymentTemplate(
        tree,
        "apps/knowledge-platform/hindsight/workload.yaml",
      ).metadata.annotations,
    ).toBeUndefined();
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
        "_estate",
      ),
    );

    expect(
      [
        ...jobTemplates(tree, "estate/vso-secrets/job.yaml"),
        cronJobTemplate(tree, "estate/vso-secrets/cronjob.yaml"),
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
      files({ [LOCK]: versioned("postgres", "14-vectorchord0.4.3") }),
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
