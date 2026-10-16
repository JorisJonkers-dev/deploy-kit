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
        "documents",
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
      '# GENERATED. Never hand-edit.\n---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: a\n  namespace: n\n  labels: {}\ndata:\n  a.json: |\n    {"a":{"c":"30s","d":true},"b":[2,"it\'s"]}\n  b.conf: |\n    port = 1\n',
    );
    // The order a value's keys were built in decides nothing.
    expect(configMap({ a: { c: "30s", d: true }, b: [2, "it's"] })).toBe(
      configMap({ b: [2, "it's"], a: { d: true, c: "30s" } }),
    );
  });
});
