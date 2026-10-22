// REQ-039 (docs/requirements.md): the composed union and the pinned inputs
// beside it resolve at the use-case seam to every project's projections, and
// minimal's equal its committed resolved.json and dependencies.json byte for
// byte; a pinned input the render cannot trust is refused before resolution.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  parseProjectIntent,
  resolveIntentSet,
  sha256Hasher,
  type AuthoredFile,
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
const text = (path: string): string =>
  readFileSync(join(EXAMPLES, path), "utf8");

/** The integrity the worked projections record for the schema package. */
const INTEGRITY =
  "sha256:5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b";

/** minimal, the foundation it composes with, and the pinned inputs beside them. */
const MINIMAL_SET = [
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
  "identity/identity.project.yml",
  "identity/env/grafana/base.env",
];

/** The set, with `edit` applied to the file named `name`. */
function files(
  edits: Readonly<Record<string, (text: string) => string>> = {},
  extra: readonly AuthoredFile[] = [],
): AuthoredFile[] {
  return [
    ...MINIMAL_SET.map((name) => ({
      name,
      text: (edits[name] ?? ((same: string) => same))(text(name)),
    })),
    ...extra,
  ];
}

const options = { hash: sha256Hasher, schemaPackageIntegrity: INTEGRITY };

function resolved(
  edits?: Readonly<Record<string, (text: string) => string>>,
  extra?: readonly AuthoredFile[],
): ResolvedProject[] {
  const result = resolveIntentSet(files(edits, extra), options);
  if (!result.ok)
    throw new Error(JSON.stringify(result.diagnostics.map(({ code }) => code)));
  return [...result.value.projects];
}

const refusals = (
  edits?: Readonly<Record<string, (text: string) => string>>,
  extra?: readonly AuthoredFile[],
): { code: string; document?: string; path: string }[] => {
  const result = resolveIntentSet(files(edits, extra), options);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, document, path }) => ({
        code,
        ...(document === undefined ? {} : { document }),
        path,
      }));
};

const project = (
  projects: ResolvedProject[],
  name: string,
): ResolvedProject => {
  const found = projects.find((candidate) => candidate.project === name);
  if (found === undefined) throw new Error(`${name} did not resolve`);
  return found;
};

const notes = (edits?: Readonly<Record<string, (text: string) => string>>) => {
  const [application] = project(resolved(edits), "notes").applications;
  if (application === undefined) throw new Error("notes holds no Application");
  return application;
};

describe("resolveIntentSet", () => {
  it("resolves minimal to its committed projection, byte for byte", () => {
    expect(canonicalJson(notes())).toBe(text("minimal/expected/resolved.json"));
  });

  it("resolves the Release Gate, composed with the same foundation, to its committed projection", () => {
    const gate = project(resolved(), "delivery").applications.find(
      ({ id }) => id === "release-gate",
    );

    expect(canonicalJson(gate)).toBe(text("delivery/expected/resolved.json"));
  });

  // REQ-059 (docs/requirements.md): the set says where Flux's events go,
  // where the platform names a Reporter.
  it("derives where Flux's events go from the Reporter the platform names, and nothing where it names none", () => {
    const eventsOf = (
      edits?: Readonly<Record<string, (text: string) => string>>,
    ) => {
      const result = resolveIntentSet(files(edits), options);
      if (!result.ok)
        throw new Error(
          JSON.stringify(result.diagnostics.map(({ code }) => code)),
        );
      return result.value;
    };
    const PLATFORM = "platform/platform.intent.yml";

    expect(eventsOf().events).toStrictEqual({
      namespace: "flux-system",
      address: "http://reporter.delivery-system.svc.cluster.local:8080/flux",
    });
    expect(
      eventsOf({
        [PLATFORM]: (platform) =>
          platform.replace(
            "sourceRef: flux-system/platform",
            "sourceRef: gitops/platform",
          ),
      }).events?.namespace,
    ).toBe("gitops");
    expect(
      "events" in
        eventsOf({
          [PLATFORM]: (platform) =>
            platform.replace("  reporter: delivery/reporter\n", ""),
        }),
    ).toBe(false);
  });

  // REQ-058 (docs/requirements.md): Flux's notification controller is
  // admitted where the Provider sends its events, and nowhere else.
  describe("the Reporter's admission of Flux's events", () => {
    const DELIVERY = "delivery/delivery.project.yml";
    const PLATFORM = "platform/platform.intent.yml";
    /** Each Process of the delivery project, with the events peers its policy admits. */
    const admitted = (
      edits?: Readonly<Record<string, (text: string) => string>>,
    ) =>
      Object.fromEntries(
        project(resolved(edits), "delivery").applications.flatMap(
          ({ processes }) =>
            processes.map(({ name, ingress }) => [
              name,
              (ingress ?? []).filter(({ rule }) => rule === "flux-events"),
            ]),
        ),
      );
    const peer = {
      rule: "flux-events",
      namespace: "flux-system",
      process: "notification-controller",
      port: 8080,
    };
    const process = (name: string, provides: string): string =>
      [
        `      - name: ${name}`,
        "        lifecycle: application",
        "        image: reporter",
        "        runtime: none",
        provides,
        "        placement: { memory: 64Mi, cpu: 10m }",
        "        probes: none",
        "        startupBudget: 10s",
        "        cutover: interrupted",
        "",
      ].join("\n");

    it("admits the controller to the Reporter's Process alone, on its http port, from Flux's namespace", () => {
      expect(admitted()).toStrictEqual({
        flagger: [],
        "release-gate": [],
        collector: [],
        reporter: [peer],
      });
      expect(
        admitted({
          [PLATFORM]: (platform) =>
            platform.replace(
              "sourceRef: flux-system/platform",
              "sourceRef: gitops/platform",
            ),
        })["reporter"],
      ).toStrictEqual([{ ...peer, namespace: "gitops" }]);
    });

    it("admits nothing where the platform names no Reporter", () => {
      expect(
        admitted({
          [PLATFORM]: (platform) =>
            platform.replace("  reporter: delivery/reporter\n", ""),
        }),
      ).toStrictEqual({
        flagger: [],
        "release-gate": [],
        collector: [],
        reporter: [],
      });
    });

    it("admits it to the first Process that provides the surface, and to no other of the Reporter", () => {
      const reporter = admitted({
        [DELIVERY]: (delivery) =>
          delivery
            .replace(
              "      - name: reporter\n",
              // One that provides nothing at all, and one that provides another surface.
              `${process("reporter-idle", "        startupBudget: 10s").replace("        startupBudget: 10s\n        placement", "        placement")}${process("reporter-worker", "        provides: { metrics: 9090 }")}      - name: reporter\n`,
            )
            .concat(
              process("reporter-second", "        provides: { http: 8081 }"),
            ),
      });

      expect(reporter["reporter-idle"]).toStrictEqual([]);
      expect(reporter["reporter-worker"]).toStrictEqual([]);
      expect(reporter["reporter"]).toStrictEqual([peer]);
      expect(reporter["reporter-second"]).toStrictEqual([]);
    });
  });

  it.each([
    ["flagger", "delivery/expected/resolved.flagger.json"],
    ["collector", "delivery/expected/resolved.collector.json"],
    ["reporter", "delivery/expected/resolved.reporter.json"],
  ])(
    "resolves %s, which holds Kubernetes API access, to its committed projection",
    (id, oracle) => {
      const holder = project(resolved(), "delivery").applications.find(
        (application) => application.id === id,
      );

      expect(canonicalJson(holder)).toBe(text(oracle));
    },
  );

  describe("auth, composed with data, the same foundation and the files beside both", () => {
    const auth = () => {
      const result = resolveIntentSet(
        [
          ...files().filter(({ name }) => !name.startsWith("minimal/")),
          ...[
            "auth/auth.project.yml",
            "auth/env/auth-api/base.env",
            "auth/migration-proof.yml",
            "data/data.project.yml",
            "data/env/postgres/base.env",
            "data/config/postgresql.conf",
          ].map((name) => ({ name, text: text(name) })),
        ],
        options,
      );
      if (!result.ok)
        throw new Error(
          JSON.stringify(result.diagnostics.map(({ code }) => code)),
        );
      return project([...result.value.projects], "auth");
    };

    it("resolves auth to its committed projection, byte for byte", () => {
      expect(canonicalJson(auth().applications[0])).toBe(
        text("auth/expected/resolved.json"),
      );
    });

    it("resolves auth's dependency edges to its committed oracle, byte for byte", () => {
      expect(canonicalJson(auth().dependencies)).toBe(
        text("auth/expected/dependencies.json"),
      );
    });
  });

  describe("data, composed with the same foundation and the files beside it", () => {
    const data = () => {
      const result = resolveIntentSet(
        [
          ...files().filter(({ name }) => !name.startsWith("minimal/")),
          ...[
            "data/data.project.yml",
            "data/env/postgres/base.env",
            "data/config/postgresql.conf",
          ].map((name) => ({ name, text: text(name) })),
        ],
        options,
      );
      if (!result.ok)
        throw new Error(
          JSON.stringify(result.diagnostics.map(({ code }) => code)),
        );
      return project([...result.value.projects], "data");
    };

    it.each([
      ["platform-postgres", "resolved.json"],
      ["platform-rabbitmq", "resolved.platform-rabbitmq.json"],
      ["platform-valkey", "resolved.platform-valkey.json"],
    ])(
      "resolves %s to its committed projection, byte for byte",
      (id, oracle) => {
        expect(
          canonicalJson(
            data().applications.find((candidate) => candidate.id === id),
          ),
        ).toBe(text(`data/expected/${oracle}`));
      },
    );

    it("resolves data's dependency edges to its committed oracle, byte for byte", () => {
      expect(canonicalJson(data().dependencies)).toBe(
        text("data/expected/dependencies.json"),
      );
    });
  });

  describe("the knowledge platform, composed with data, the same foundation and the files beside both", () => {
    const knowledgePlatform = () => {
      const result = resolveIntentSet(
        [
          ...files().filter(({ name }) => !name.startsWith("minimal/")),
          ...[
            "data/data.project.yml",
            "data/env/postgres/base.env",
            "data/config/postgresql.conf",
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
          ].map((name) => ({ name, text: text(name) })),
        ],
        options,
      );
      if (!result.ok)
        throw new Error(
          JSON.stringify(result.diagnostics.map(({ code }) => code)),
        );
      return project([...result.value.projects], "knowledge-platform");
    };

    it("resolves hindsight, three Processes released together, to its committed projection, byte for byte", () => {
      expect(
        canonicalJson(
          knowledgePlatform().applications.find(({ id }) => id === "hindsight"),
        ),
      ).toBe(text("knowledge-platform/expected/resolved.hindsight.json"));
    });

    it("holds hindsight's API and worker until the embedding model, a stop-start Application of the same Project, has started", () => {
      const members = knowledgePlatform().applications.find(
        ({ id }) => id === "hindsight",
      )?.releaseGate?.members;

      expect(
        members?.map(({ process, waitsFor }) => [process, waitsFor]),
      ).toStrictEqual([
        [
          "hindsight-api",
          [
            {
              application: "hindsight-embedding",
              process: "hindsight-tei-embedding",
            },
          ],
        ],
        [
          "hindsight-worker",
          [
            {
              application: "hindsight-embedding",
              process: "hindsight-tei-embedding",
            },
          ],
        ],
        // Its edge reaches the API, in its own Application.
        ["hindsight-control-plane", undefined],
      ]);
    });

    it("carries a Process's internet egress with the reason its owner gave", () => {
      expect(
        knowledgePlatform()
          .applications.find(({ id }) => id === "karakeep")
          ?.processes.find(({ name }) => name === "karakeep")?.internetEgress,
      ).toStrictEqual({
        reason: "The browser fetches the pages it bookmarks.",
      });
    });

    it("resolves the knowledge platform's dependency edges, its in-project ones among them, to its committed oracle, byte for byte", () => {
      expect(canonicalJson(knowledgePlatform().dependencies)).toBe(
        text("knowledge-platform/expected/dependencies.json"),
      );
    });
  });

  it("resolves minimal's dependency edges to its committed oracle, byte for byte", () => {
    expect(canonicalJson(project(resolved(), "notes").dependencies)).toBe(
      text("minimal/expected/dependencies.json"),
    );
  });

  it.each(["delivery", "edge", "identity", "observability", "secrets"])(
    "resolves the foundation's %s dependency edges to its committed oracle, byte for byte",
    (name) => {
      expect(canonicalJson(project(resolved(), name).dependencies)).toBe(
        text(`${name}/expected/dependencies.json`),
      );
    },
  );

  // spec/v1/17-sign-in.md: the sign-in provider and the three Clients beside
  // it, one per way chapter 17 works through, each to its committed projection.
  it.each(["identity", "grafana", "portal", "whoami"])(
    "resolves identity's %s to its committed projection, byte for byte",
    (id) => {
      expect(
        canonicalJson(
          project(resolved(), "identity").applications.find(
            (application) => application.id === id,
          ),
        ),
      ).toBe(text(`identity/expected/resolved.${id}.json`));
    },
  );

  it("moves the projection, the revision and the render hash when one authored field moves", () => {
    const moved = notes({
      "minimal/notes.project.yml": (document) =>
        document.replace("memory: 256Mi", "memory: 512Mi"),
    });
    const committed = JSON.parse(text("minimal/expected/resolved.json")) as {
      revision: string;
      provenance: { renderHash: string };
    };

    expect(moved.revision).not.toBe(committed.revision);
    expect(moved.provenance.renderHash).not.toBe(
      committed.provenance.renderHash,
    );
  });

  it("resolves every project of the union, each with its own projections", () => {
    expect(resolved().map(({ project: name }) => name)).toStrictEqual([
      "notes",
      "delivery",
      "edge",
      "observability",
      "secrets",
      "identity",
    ]);
  });

  it("records one digest per pinned input, every fragment first and by name", () => {
    expect(
      notes().provenance.inputDigests.map(
        ({ input, name }) => `${input} ${name}`,
      ),
    ).toStrictEqual([
      "intent-fragment delivery",
      "intent-fragment edge",
      "intent-fragment identity",
      "intent-fragment notes",
      "intent-fragment observability",
      "intent-fragment secrets",
      "platform-intent jorisjonkers.dev",
      "node-contract production",
      "images-lock estate",
      "cluster-state production",
    ]);
  });

  it("digests a fragment's env files in path order, whatever order they are read in", () => {
    const shared = {
      name: "minimal/env/_project/base.env",
      text: "SHARED=1\n",
    };
    const digest = (reorder: boolean) => {
      const set = files({}, [shared]);
      const ordered = reorder
        ? [shared, ...set.filter((file) => file !== shared)]
        : set;
      const result = resolveIntentSet(ordered, options);
      return result.ok
        ? result.value.projects[0]?.applications[0]?.provenance.renderHash
        : undefined;
    };

    expect(digest(true)).toBe(digest(false));
    expect(digest(false)).toBeDefined();
  });

  it("digests a fragment as its document, its env files' scopes and contents, and its Asset files, in path order", () => {
    const shared = {
      name: "minimal/env/_project/base.env",
      text: "SHARED=1\n",
    };
    const result = resolveIntentSet(files({}, [shared]), options);
    const recorded = result.ok
      ? result.value.projects[0]?.applications[0]?.provenance.inputDigests.find(
          ({ name }) => name === "notes",
        )?.digest
      : undefined;
    const parsed = parseProjectIntent(text("minimal/notes.project.yml"), [
      { path: shared.name, text: shared.text },
      {
        path: "minimal/env/notes-api/base.env",
        text: text("minimal/env/notes-api/base.env"),
      },
    ]);
    if (!parsed.ok) throw new Error("minimal did not parse");

    expect(recorded).toBe(
      sha256Hasher({
        document: parsed.value.document,
        env: parsed.value.env.map(({ scope, file }) => ({ scope, file })),
        assets: [],
      }),
    );
  });

  it("moves a fragment's digest when only an env file beside it moves", () => {
    const digestOf = (projects: ResolvedProject[]) =>
      project(projects, "notes").applications[0]?.provenance.inputDigests.find(
        ({ name }) => name === "notes",
      )?.digest;
    const before = digestOf(resolved());
    const after = digestOf(
      resolved({
        "minimal/env/notes-api/base.env": (env) =>
          env.replace("NOTES_PAGE_SIZE=50", "NOTES_PAGE_SIZE=51"),
      }),
    );

    expect(after).not.toBe(before);
  });
});

describe("the pinned inputs a render cannot trust", () => {
  it("refuses a node contract other than the one the Platform document pins", () => {
    expect(
      refusals({
        "platform/node-contract.yml": (contract) =>
          contract.replace(
            "allocatable: { cpu: 5750m, memory: 7936Mi }",
            "allocatable: { cpu: 5751m, memory: 7936Mi }",
          ),
      }),
    ).toStrictEqual([
      {
        code: "E_NODE_CONTRACT_MISMATCH",
        document: "platform/platform.intent.yml",
        path: "/metadata/nodeContract",
      },
    ]);
  });

  it("refuses an image alias the images lock does not hold, on a Process and on a sidecar", () => {
    expect(
      refusals({
        "minimal/notes.project.yml": (document) =>
          document
            .replace("image: notes-api", "image: notes-unlocked")
            .replace(
              "    placement:",
              "    sidecars:\n          - {name: shipper, image: shipper, memory: 16Mi, cpu: 5m}\n        placement:",
            ),
      }),
    ).toStrictEqual([
      {
        code: "E_UNLOCKED_IMAGE",
        document: "minimal/notes.project.yml",
        path: "/applications/0/processes/0/image",
      },
      {
        code: "E_UNLOCKED_IMAGE",
        document: "minimal/notes.project.yml",
        path: "/applications/0/processes/0/sidecars/0/image",
      },
    ]);
  });

  // deploy-kit#586: auth-api and auth-ui locked uid 0 and rendered it beside
  // runAsNonRoot, and the kubelet refused both pods at start.
  it("refuses a Process whose image the lock records as root, naming the image, and says how to fix it", () => {
    const result = resolveIntentSet(
      files({
        "platform/images.lock.yml": (lock) =>
          lock.replace(
            /( {2}notes-api:\n(?: {4}.*\n)*? {4})uid: 1000\n {4}gid: 1000/,
            (_, head: string) => `${head}uid: 0\n    gid: 0`,
          ),
      }),
      options,
    );

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      {
        code: "E_IMAGE_RUNS_AS_ROOT",
        document: "minimal/notes.project.yml",
        path: "/applications/0/processes/0/image",
        message:
          "notes-api is locked to ghcr.io/jorisjonkers-dev/notes/notes-api@sha256:9c1e5a4b7d2f8e3a6b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a, which runs as uid 0, and the posture runs it with runAsNonRoot, so the kubelet refuses the pod",
        hint: "Build the image with a numeric non-root USER (USER 1000:1000, say) and lock the release that builds it.",
      },
    ]);
  });

  it("refuses no sidecar for the user its image records: a sidecar runs as its Process", () => {
    expect(
      refusals({
        "minimal/notes.project.yml": (document) =>
          document.replace(
            "    placement:",
            "    sidecars:\n          - {name: shipper, image: gluetun, memory: 16Mi, cpu: 5m}\n        placement:",
          ),
      }),
    ).toStrictEqual([]);
  });

  it("accepts a Process whose image runs as any user but root", () => {
    expect(
      refusals({
        "platform/images.lock.yml": (lock) =>
          lock.replace(
            /( {2}notes-api:\n(?: {4}.*\n)*? {4})uid: 1000/,
            (_, head: string) => `${head}uid: 1`,
          ),
      }),
    ).toStrictEqual([]);
  });

  it("refuses a Process no node can hold", () => {
    expect(
      refusals({
        "minimal/notes.project.yml": (document) =>
          document.replace("memory: 256Mi", "memory: 64Gi"),
      }),
    ).toStrictEqual([
      {
        code: "E_PLACEMENT_UNSATISFIABLE",
        document: "minimal/notes.project.yml",
        path: "/applications/0/processes/0/placement",
      },
    ]);
  });

  it("refuses a Vault policy job no node can hold", () => {
    expect(
      refusals({
        "platform/platform.intent.yml": (document) =>
          document.replace(
            /(\npolicyJob:\n(?: {2}.*\n)*? {2}memory: )64Mi/,
            (_, head: string) => `${head}64Gi`,
          ),
      }),
    ).toStrictEqual([
      {
        code: "E_PLACEMENT_UNSATISFIABLE",
        document: "platform/platform.intent.yml",
        path: "/policyJob",
      },
    ]);
  });

  it("refuses a Process whose other terms exclude the node its library is on", () => {
    expect(
      refusals({
        "minimal/notes.project.yml": (document) =>
          document.replace(
            "memory: 256Mi",
            "memory: 256Mi\n          site: frankfurt",
          ),
      }),
    ).toStrictEqual([
      {
        code: "E_PLACEMENT_UNSATISFIABLE",
        document: "minimal/notes.project.yml",
        path: "/applications/0/processes/0/placement",
      },
    ]);
  });

  it("names every pinned input the set is missing, and a Platform document before them", () => {
    const withoutPinned = files().filter(
      ({ name }) =>
        !name.startsWith("platform/") || name.endsWith("platform.intent.yml"),
    );
    const without = resolveIntentSet(withoutPinned, options);

    expect(
      without.ok ? [] : without.diagnostics.map(({ message }) => message),
    ).toStrictEqual([
      "a resolution reads a node-contract.yml, and the set holds none",
      "a resolution reads a images.lock.yml, and the set holds none",
      "a resolution reads a cluster-state.yml, and the set holds none",
    ]);

    const noPlatform = resolveIntentSet(
      files().filter(({ name }) => !name.endsWith("platform.intent.yml")),
      options,
    );

    expect(
      noPlatform.ok ? [] : noPlatform.diagnostics.map(({ message }) => message),
    ).toStrictEqual([
      "a resolution reads a Platform document, and the set holds none",
    ]);
  });

  it("refuses a pinned input that breaks its schema or the YAML subset, in that input", () => {
    expect(
      refusals({
        "platform/images.lock.yml": (lock) =>
          lock.replace("uid: 1000", "uid: -1"),
        "platform/cluster-state.yml": (state) => `${state}---\n${state}`,
      }).map(({ code, document }) => `${code} ${document ?? ""}`),
    ).toStrictEqual([
      "schema platform/images.lock.yml",
      "schema platform/cluster-state.yml",
    ]);
  });

  it("refuses the set before resolution where composition refuses it", () => {
    expect(
      refusals({
        "observability/observability.project.yml": (document) =>
          document.replace("otlp: 4317", "grpc: 4317"),
      }).map(({ code }) => code),
    ).toStrictEqual(["E_UNKNOWN_TELEMETRY_COLLECTOR"]);
  });
});

describe("what a refusal before resolution says", () => {
  const full = (edits: Readonly<Record<string, (text: string) => string>>) => {
    const result = resolveIntentSet(files(edits), options);
    return result.ok ? [] : result.diagnostics;
  };

  it("names the node contract read and what to do about it", () => {
    const [refusal] = full({
      "platform/platform.intent.yml": (platform) =>
        platform.replace(
          /nodeContract: "sha256:[a-f0-9]+"/,
          `nodeContract: "sha256:${"0".repeat(64)}"`,
        ),
    });

    expect(refusal?.message).toMatch(
      /^the node contract read is sha256:[a-f0-9]{64}, not the one this document pins$/,
    );
    expect(refusal?.hint).toBe(
      "Pin the digest of the node contract the render reads, or read the one pinned.",
    );
  });

  it("names the alias no lock holds and the Process nothing can hold", () => {
    expect(
      full({
        "minimal/notes.project.yml": (document) =>
          document
            .replace("image: notes-api", "image: notes-unlocked")
            .replace("memory: 256Mi", "memory: 64Gi"),
      }).map(({ message, hint }) => ({ message, hint })),
    ).toStrictEqual([
      {
        message: "the images lock holds no entry for notes-unlocked",
        hint: "Lock the alias, or name one the images lock holds.",
      },
      {
        message: "no node in the node contract can hold notes-api",
        hint: "Relax a placement dimension, or lower what the Process asks for.",
      },
    ]);
  });

  it("names the Vault policy job no node without an sdcard medium can hold", () => {
    expect(
      full({
        "platform/platform.intent.yml": (document) =>
          document.replace(
            /(\npolicyJob:\n(?: {2}.*\n)*? {2}memory: )64Mi/,
            (_, head: string) => `${head}64Gi`,
          ),
      }).map(({ message, hint }) => ({ message, hint })),
    ).toStrictEqual([
      {
        message:
          "no node in the node contract without an sdcard medium can hold the Vault policy job",
        hint: "Lower what the job asks for, or give the contract a node that boots from no SD card.",
      },
    ]);
  });

  it("says a missing input is the set's to supply, with nowhere in any document to point", () => {
    const [missing] = (() => {
      const result = resolveIntentSet(
        files().filter(({ name }) => !name.endsWith("images.lock.yml")),
        options,
      );
      return result.ok ? [] : result.diagnostics;
    })();

    expect(missing).toStrictEqual({
      code: "schema",
      path: "",
      message: "a resolution reads a images.lock.yml, and the set holds none",
      hint: "Read the set together with its Platform document, node contract, images lock and ClusterState snapshot.",
    });
  });

  it.each([
    ["platform/node-contract.yml", "labelPrefix:", "labelPrefixes:"],
    ["platform/images.lock.yml", "name: estate", "name: ''"],
    ["platform/cluster-state.yml", "bindings: []", "bindings: {}"],
  ])(
    "refuses %s alone when it alone breaks its schema, against chapter 20",
    (name, from, to) => {
      const refused = full({ [name]: (input) => input.replace(from, to) });

      expect([
        ...new Set(refused.map(({ document }) => document)),
      ]).toStrictEqual([name]);
      expect(refused[0]?.hint).toBe(
        "Correct the field against spec/v1/20-resolved-deployment.md.",
      );
    },
  );
});
