// REQ-036 (docs/requirements.md): Shared Intent declared at the Project or an
// Application reaches every Process below it, lists extend each other, and the
// lowest declaration of one thing holds.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lowerProject } from "../../src/domain/project-intent/lower.ts";
import type {
  EffectiveProcess,
  Grant,
  SharedIntent,
} from "../../src/domain/project-intent/model.ts";
import { parseProjectIntent } from "../../src/index.ts";

const MERGED = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "spec",
    "v1",
    "examples",
    "refusals",
    "shared-intent-merged.project.yml",
  ),
  "utf8",
);

function processes(): Record<string, EffectiveProcess> {
  const parsed = parseProjectIntent(MERGED);
  if (!parsed.ok)
    throw new Error(
      `the merged fixture is accepted input: ${parsed.diagnostics
        .map(({ code }) => code)
        .join(", ")}`,
    );
  const lowered = lowerProject(parsed.value.project);
  return Object.fromEntries(
    (lowered.applications[0]?.processes ?? []).map((process) => [
      process.name,
      process,
    ]),
  );
}

const paths = (grants: readonly Grant[]): string[] =>
  grants.map((grant) => ("path" in grant ? grant.path : "")).sort();

describe("lowerProject", () => {
  it("gives every Process the grants of every level above it, extended by its own", () => {
    const { "shared-intent-merged-api": api } = processes();

    expect(paths(api?.grants ?? [])).toStrictEqual([
      "secret/data/refusals/bearer",
      "secret/data/refusals/estate-ca",
      "secret/data/refusals/queue",
      "secret/data/refusals/telemetry",
    ]);
  });

  it("lets a sibling hold fewer, so the lists extend rather than have to match", () => {
    const { "shared-intent-merged-worker": worker } = processes();

    expect(paths(worker?.grants ?? [])).toStrictEqual([
      "secret/data/refusals/estate-ca",
      "secret/data/refusals/queue",
      "secret/data/refusals/telemetry",
    ]);
  });

  it("keeps the lowest declaration of one path, with the terms that Process needs", () => {
    const { "shared-intent-merged-worker": worker } = processes();
    const telemetry = worker?.grants.find(
      (grant) =>
        "path" in grant && grant.path === "secret/data/refusals/telemetry",
    );

    expect(telemetry).toMatchObject({ access: "custody", delivery: "self" });
  });

  it("takes each node dimension from the lowest level that set it, and the quantities from the Process", () => {
    const {
      "shared-intent-merged-api": api,
      "shared-intent-merged-worker": worker,
    } = processes();

    expect(api?.placement).toStrictEqual({
      memory: "128Mi",
      cpu: "25m",
      arch: ["arm64"],
      capabilities: [],
      site: "enschede",
    });
    // The Process replaces `site` and inherits `arch`: each key merges on its own.
    expect(worker?.placement).toStrictEqual({
      memory: "64Mi",
      cpu: "10m",
      arch: ["arm64"],
      capabilities: [],
      site: "frankfurt",
    });
  });

  it("answers the cutover question once, for the release unit that switches together", () => {
    const processesByName = processes();

    expect(
      Object.values(processesByName).map((process) => process.cutover),
    ).toStrictEqual(["recreate", "recreate"]);
  });

  it("extends the paths a Process may write, and the edges it may open", () => {
    const {
      "shared-intent-merged-api": api,
      "shared-intent-merged-worker": worker,
    } = processes();

    expect(api?.writablePaths).toStrictEqual(["/var/cache/api", "/tmp"]);
    expect(worker?.writablePaths).toStrictEqual(["/tmp"]);
    expect(
      api?.dependencies.map(({ application }) => application),
    ).toStrictEqual(["platform-postgres", "platform-rabbitmq"]);
    expect(
      worker?.dependencies.map(({ application }) => application),
    ).toStrictEqual(["platform-rabbitmq"]);
  });

  it("leaves the Project and the Application holding only what defines them", () => {
    const parsed = parseProjectIntent(MERGED);
    const lowered = parsed.ok ? lowerProject(parsed.value.project) : undefined;

    expect(Object.keys(lowered ?? {}).sort()).toStrictEqual([
      "applications",
      "name",
      "owner",
    ]);
    expect(Object.keys(lowered?.applications[0] ?? {}).sort()).toStrictEqual([
      "exposures",
      "id",
      "processes",
    ]);
  });
});

// The families the worked fixture does not hold, built directly.
const EMPTY: SharedIntent = {
  grants: [],
  dependencies: [],
  assets: [],
  writablePaths: [],
  env: [],
};

function lowered(
  header: Partial<SharedIntent>,
  application: Partial<SharedIntent>,
  process: Partial<SharedIntent>,
): EffectiveProcess {
  const result = lowerProject({
    name: "p",
    owner: "o",
    ...EMPTY,
    ...header,
    applications: [
      {
        id: "a",
        exposures: [],
        ...EMPTY,
        ...application,
        processes: [
          {
            name: "w",
            lifecycle: "job",
            image: "w",
            runtime: "none",
            surfaces: [],
            sidecars: [],
            probes: {},
            volumes: [],
            ...EMPTY,
            ...process,
          },
        ],
      },
    ],
  });
  const only = result.applications[0]?.processes[0];
  if (only === undefined) throw new Error("the lowering dropped the Process");
  return only;
}

describe("lowerProject, over the families a worked document does not hold", () => {
  it("identifies a database grant by its role and a transit grant by its key", () => {
    const merged = lowered(
      {
        grants: [
          { engine: "database", role: "kb", delivery: "self" },
          {
            engine: "transit",
            key: "jwt",
            operations: ["sign"],
            delivery: "self",
          },
        ],
      },
      {},
      {
        grants: [
          // The same role, so this replaces the header's rather than joining it.
          {
            engine: "database",
            role: "kb",
            delivery: "self",
            mountAt: "/run/db",
          },
        ],
      },
    );

    expect(merged.grants).toStrictEqual([
      { engine: "database", role: "kb", delivery: "self", mountAt: "/run/db" },
      { engine: "transit", key: "jwt", operations: ["sign"], delivery: "self" },
    ]);
  });

  it("gives one mount to one Asset, from the lowest level that names it", () => {
    const merged = lowered(
      { assets: [{ from: "ca/estate.pem", mountAt: "/etc/ssl/ca.pem" }] },
      { assets: [{ from: "ca/lan.pem", mountAt: "/etc/ssl/lan.pem" }] },
      { assets: [{ from: "ca/own.pem", mountAt: "/etc/ssl/ca.pem" }] },
    );

    expect(merged.assets).toStrictEqual([
      { from: "ca/own.pem", mountAt: "/etc/ssl/ca.pem" },
      { from: "ca/lan.pem", mountAt: "/etc/ssl/lan.pem" },
    ]);
  });

  it("takes disk, gpu, arch and capabilities from the lowest level that set each", () => {
    const merged = lowered(
      {
        placement: {
          arch: ["amd64"],
          capabilities: ["public-ingress"],
          disk: { media: ["hdd"] },
          gpu: { class: "transcode", memory: "4Gi" },
        },
      },
      {
        placement: {
          arch: ["arm64"],
          capabilities: [],
          disk: { media: ["nvme"] },
        },
      },
      { placement: { memory: "64Mi", cpu: "10m", arch: [], capabilities: [] } },
    );

    expect(merged.placement).toStrictEqual({
      memory: "64Mi",
      cpu: "10m",
      arch: ["arm64"],
      capabilities: ["public-ingress"],
      disk: { media: ["nvme"] },
      gpu: { class: "transcode", memory: "4Gi" },
    });
  });

  it("leaves the block absent where no level declared one, and a quantity absent where the Process did not", () => {
    expect(lowered({}, {}, {}).placement).toBeUndefined();
    expect(
      lowered({}, { placement: { arch: [], capabilities: [] } }, {}).placement,
    ).toStrictEqual({ arch: [], capabilities: [] });
  });

  it("takes the startupBudget from the lowest level that states one", () => {
    expect(lowered({ startupBudget: "600s" }, {}, {}).startupBudget).toBe(
      "600s",
    );
    expect(
      lowered({ startupBudget: "600s" }, { startupBudget: "120s" }, {})
        .startupBudget,
    ).toBe("120s");
    expect(lowered({}, {}, {}).startupBudget).toBeUndefined();
  });

  it("carries an Application's observability onto the lowered Application", () => {
    const result = lowerProject({
      name: "p",
      owner: "o",
      ...EMPTY,
      applications: [
        {
          id: "a",
          exposures: [],
          observability: { alertClass: "urgent" },
          ...EMPTY,
          processes: [],
        },
      ],
    });

    expect(result.applications[0]?.observability).toStrictEqual({
      alertClass: "urgent",
    });
  });
});

// Every shape of duplicate; the committed fixtures carry one case each.
const HEADER = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: p
owner: o
`;
const PROCESS = `    processes:
      - name: w
        lifecycle: job
        image: w
        runtime: none
        placement: {memory: 64Mi, cpu: 10m}
        cutover: recreate
`;

/** The codes and pointers a document is refused with, in reading order. */
function refusals(document: string): [string, string][] {
  const result = parseProjectIntent(document);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, path }) => [code, path]);
}

describe("the duplicate a lower level restates", () => {
  it("is refused for a path the Process may write, naming the Process", () => {
    expect(
      refusals(
        `${HEADER}writablePaths: [/tmp]\napplications:\n  - id: a\n${PROCESS}        writablePaths: [/tmp]\n`,
      ),
    ).toStrictEqual([
      ["E_SHARED_DECLARATION_DUPLICATED", "/applications/0/processes/0"],
    ]);
  });

  it("is refused for a restated startupBudget", () => {
    expect(
      refusals(
        `${HEADER}startupBudget: 20s\napplications:\n  - id: a\n    startupBudget: 20s\n${PROCESS}`,
      ),
    ).toStrictEqual([["E_SHARED_DECLARATION_DUPLICATED", "/applications/0"]]);
  });

  it("is refused at every level that restates the cutover", () => {
    expect(
      refusals(
        `${HEADER}cutover: recreate\napplications:\n  - id: a\n    cutover: recreate\n${PROCESS}`,
      ),
    ).toStrictEqual([
      ["E_SHARED_DECLARATION_DUPLICATED", "/applications/0"],
      // The Process restates it too: `PROCESS` carries `cutover: recreate`.
      ["E_SHARED_DECLARATION_DUPLICATED", "/applications/0/processes/0"],
    ]);
  });

  it("is refused for restated node dimensions, which is the whole block at once", () => {
    expect(
      refusals(
        `${HEADER}placement: {arch: [arm64]}\napplications:\n  - id: a\n    placement: {arch: [arm64]}\n${PROCESS}`,
      ),
    ).toStrictEqual([["E_SHARED_DECLARATION_DUPLICATED", "/applications/0"]]);
  });

  it("is not refused where the lower level differs, because that is a replacement", () => {
    expect(
      refusals(
        `${HEADER}placement: {site: enschede}\napplications:\n  - id: a\n    placement: {site: frankfurt}\n${PROCESS}`,
      ),
    ).toStrictEqual([]);
    expect(
      refusals(
        `${HEADER}startupBudget: 600s\napplications:\n  - id: a\n    startupBudget: 120s\n${PROCESS}`,
      ),
    ).toStrictEqual([]);
  });

  it("is a quantity above the Process, which is a different refusal from a duplicate", () => {
    expect(
      refusals(
        `${HEADER}placement: {cpu: 10m}\napplications:\n  - id: a\n${PROCESS}`,
      ),
    ).toStrictEqual([["E_SHARED_QUANTITY", "/placement"]]);
  });

  it("is refused for an edge and an asset the Process restates", () => {
    expect(
      refusals(
        `${HEADER}dependsOn: [{application: q, surface: amqp}]\napplications:\n  - id: a\n${PROCESS}        dependsOn: [{application: q, surface: amqp}]\n`,
      ),
    ).toStrictEqual([
      [
        "E_SHARED_DECLARATION_DUPLICATED",
        "/applications/0/processes/0/dependsOn/0",
      ],
    ]);
    expect(
      refusals(
        `${HEADER}assets: [{from: c.conf, mountAt: /etc/c.conf}]\napplications:\n  - id: a\n${PROCESS}        assets: [{from: c.conf, mountAt: /etc/c.conf}]\n`,
      ),
    ).toStrictEqual([
      [
        "E_SHARED_DECLARATION_DUPLICATED",
        "/applications/0/processes/0/assets/0",
      ],
    ]);
  });

  it("is refused for a grant of any engine the Process restates", () => {
    const at = "/applications/0/processes/0/secrets/0";
    const restated = (grant: string) =>
      refusals(
        `${HEADER}secrets: [${grant}]\napplications:\n  - id: a\n${PROCESS}        secrets: [${grant}]\n`,
      );

    expect(
      restated(
        "{engine: transit, key: jwt, operations: [sign], delivery: self}",
      ),
    ).toStrictEqual([["E_SHARED_DECLARATION_DUPLICATED", at]]);
    expect(
      restated("{engine: database, role: kb, delivery: self}"),
    ).toStrictEqual([["E_SHARED_DECLARATION_DUPLICATED", at]]);
  });
});

/** What a document's refusals say, which is where the families are named. */
function messages(document: string): string[] {
  const result = parseProjectIntent(document);
  return result.ok ? [] : result.diagnostics.map(({ message }) => message);
}

describe("the duplicate, per key and without a short circuit", () => {
  it("names every family the level restates, not one and then stops", () => {
    const document = `${HEADER}writablePaths: [/tmp]\ncutover: recreate\nstartupBudget: 20s\napplications:\n  - id: a\n${PROCESS}        writablePaths: [/tmp]\n        startupBudget: 20s\n`;

    expect(refusals(document)).toStrictEqual([
      ["E_SHARED_DECLARATION_DUPLICATED", "/applications/0/processes/0"],
    ]);
    expect(messages(document)[0]).toContain("/tmp, startupBudget, cutover");
  });

  it("refuses a restated placement key even where the rest of the block differs", () => {
    expect(
      refusals(
        `${HEADER}placement: {site: enschede, arch: [arm64]}\napplications:\n  - id: a\n    placement: {site: enschede}\n${PROCESS}`,
      ),
    ).toStrictEqual([["E_SHARED_DECLARATION_DUPLICATED", "/applications/0"]]);
  });

  it("accepts a key whose value differs, however much of the block matches", () => {
    expect(
      refusals(
        `${HEADER}placement: {disk: {media: [hdd]}}\napplications:\n  - id: a\n    placement: {disk: {media: [nvme]}}\n${PROCESS}`,
      ),
    ).toStrictEqual([]);
  });

  it("accepts a grant restated with different terms, which is a replacement", () => {
    const grant = (access: string) =>
      `[{path: secret/data/p/t, keys: [token], access: ${access}, delivery: self}]`;

    expect(
      refusals(
        `${HEADER}secrets: ${grant("read")}\napplications:\n  - id: a\n${PROCESS}        secrets: ${grant("custody")}\n`,
      ),
    ).toStrictEqual([]);
  });
});

// Each term a family's identity is built from has to matter on its own,
// otherwise a replacement reads as a duplicate or two declarations collide.

describe("what makes two declarations the same one", () => {
  it("keeps three engines apart even where they name the same string", () => {
    const merged = lowered(
      {
        grants: [
          { path: "x", keys: ["k"], access: "read", delivery: "env" },
          { engine: "database", role: "x", delivery: "self" },
          {
            engine: "transit",
            key: "x",
            operations: ["sign"],
            delivery: "self",
          },
        ],
      },
      {},
      {},
    );

    // One identity each: `secret/data/x`, `database/creds/x` and `transit/x`.
    expect(merged.grants).toHaveLength(3);
  });

  /** A complete `kv` grant, and the one term each case varies. */
  const grant = (change: Partial<Record<string, string>> = {}) => {
    const terms: Record<string, string> = {
      path: "secret/data/p/t",
      keys: "[k]",
      access: "read",
      delivery: "file",
      mountAt: "/run/t",
      fileMode: "'0400'",
      rotation: "{tolerates: restart, maxAge: 30d}",
      ...change,
    };
    const body = Object.entries(terms)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
    return `[{${body}}]`;
  };

  const twoLevels = (above: string, below: string) =>
    `${HEADER}secrets: ${above}\napplications:\n  - id: a\n${PROCESS}        secrets: ${below}\n`;

  it.each([
    ["keys", { keys: "[other]" }],
    ["access", { access: "self-roll" }],
    ["delivery", { delivery: "self" }],
    ["mountAt", { mountAt: "/run/other" }],
    ["fileMode", { fileMode: "'0444'" }],
    ["rotation.tolerates", { rotation: "{tolerates: reload, maxAge: 30d}" }],
    ["rotation.maxAge", { rotation: "{tolerates: restart, maxAge: 60d}" }],
  ])("reads a grant differing only in %s as a replacement", (_term, change) => {
    expect(refusals(twoLevels(grant(), grant(change)))).toStrictEqual([]);
  });

  it("reads a grant restated with every term unchanged as a duplicate", () => {
    expect(refusals(twoLevels(grant(), grant()))).toStrictEqual([
      [
        "E_SHARED_DECLARATION_DUPLICATED",
        "/applications/0/processes/0/secrets/0",
      ],
    ]);
  });

  it("reads an edge differing only in `required` as a replacement", () => {
    const edge = (required: string) =>
      `[{application: q, surface: amqp${required}}]`;

    expect(
      refusals(
        `${HEADER}dependsOn: ${edge("")}\napplications:\n  - id: a\n${PROCESS}        dependsOn: ${edge(", required: false")}\n`,
      ),
    ).toStrictEqual([]);
  });

  it("reads an Asset differing only in `from` as a replacement", () => {
    expect(
      refusals(
        `${HEADER}assets: [{from: a.conf, mountAt: /etc/c.conf}]\napplications:\n  - id: a\n${PROCESS}        assets: [{from: b.conf, mountAt: /etc/c.conf}]\n`,
      ),
    ).toStrictEqual([]);
  });

  it.each([
    ["arch", "arch: [arm64]", "arch: [amd64]"],
    ["site", "site: enschede", "site: frankfurt"],
    ["disk", "disk: {media: [nvme]}", "disk: {media: [ssd]}"],
    [
      "gpu",
      "gpu: {class: transcode, memory: 4Gi}",
      "gpu: {class: transcode, memory: 8Gi}",
    ],
    ["capabilities", "capabilities: [a]", "capabilities: [b]"],
  ])("counts `%s` on its own, by value", (_key, same, different) => {
    const at = (above: string, below: string) =>
      `${HEADER}placement: {${above}}\napplications:\n  - id: a\n    placement: {${below}}\n${PROCESS}`;

    expect(refusals(at(same, same))).toStrictEqual([
      ["E_SHARED_DECLARATION_DUPLICATED", "/applications/0"],
    ]);
    expect(refusals(at(same, different))).toStrictEqual([]);
  });
});

describe("what a refusal says", () => {
  const only = (document: string) => {
    const result = parseProjectIntent(document);
    if (result.ok) throw new Error("the document was accepted");
    return result.diagnostics[0];
  };

  it("names the quantity a level above the Process may not share", () => {
    const refusal = only(
      `${HEADER}placement: {memory: 64Mi, cpu: 10m}\napplications:\n  - id: a\n${PROCESS}`,
    );

    expect(refusal?.message).toBe(
      "memory and cpu is per container and cannot be shared",
    );
    expect(refusal?.hint).toBe(
      "Write the quantity on each Process: eligibility sums the Process and its sidecars.",
    );
  });

  it("names the quantities the merge did not produce", () => {
    const refusal = only(
      `${HEADER}applications:\n  - id: a\n    processes:\n      - name: w\n        lifecycle: job\n        image: w\n        runtime: none\n        cutover: recreate\n`,
    );

    expect(refusal?.message).toBe(
      "this Process declares no memory and no cpu, and a quantity is never shared",
    );
    expect(refusal?.hint).toBe(
      "Declare the quantities in the Process's own `placement` block: only the node dimensions can come from a level above.",
    );
  });

  it("names what a level restated, and how to fix it", () => {
    const refusal = only(
      `${HEADER}cutover: recreate\napplications:\n  - id: a\n    cutover: recreate\n${PROCESS}`,
    );

    expect(refusal?.message).toBe(
      "cutover is declared again, unchanged, at a level above this one",
    );
    expect(refusal?.hint).toBe(
      "Delete this copy, or change it: a lower declaration replaces the one above, and a restatement does nothing.",
    );
  });

  it("says which Process no level answers the cutover question for", () => {
    const refusal = only(
      `${HEADER}applications:\n  - id: a\n    processes:\n      - name: w\n        lifecycle: job\n        image: w\n        runtime: none\n        placement: {memory: 64Mi, cpu: 10m}\n`,
    );

    expect(refusal?.message).toBe(
      "no level answers whether this Process keeps serving as it cuts over",
    );
    expect(refusal?.hint).toBe(
      "Declare `cutover` on the Process, its Application or the project header.",
    );
  });
});

describe("what the lowered shape carries, and what it leaves out", () => {
  it("writes no key for a scalar family no level declared", () => {
    // `placement` and `cutover` are always keys of an effective Process, which
    // is what the type says; `startupBudget` is the one that may be absent.
    expect(Object.keys(lowered({}, {}, {}))).not.toContain("startupBudget");
    expect(Object.keys(lowered({ startupBudget: "20s" }, {}, {}))).toContain(
      "startupBudget",
    );
  });

  it("writes a base file with no Cluster Target, and an overlay with one", () => {
    const process = lowered(
      {},
      {},
      {
        env: [
          { entries: [{ name: "A", value: { text: "1" } }] },
          {
            cluster: "production",
            entries: [{ name: "A", value: { text: "2" } }],
          },
        ],
      },
    );

    expect(process.env).toStrictEqual([
      { entries: [{ name: "A", value: { text: "1" } }] },
      {
        cluster: "production",
        entries: [{ name: "A", value: { text: "2" } }],
      },
    ]);
  });

  it("keeps an overlay's variables out of the base file, and the other way round", () => {
    const process = lowered(
      { env: [{ entries: [{ name: "SHARED", value: { text: "1" } }] }] },
      {},
      {
        env: [
          {
            cluster: "production",
            entries: [{ name: "ONLY_THERE", value: { text: "2" } }],
          },
        ],
      },
    );

    expect(
      process.env.map(({ cluster, entries }) => [
        cluster,
        entries.map(({ name }) => name),
      ]),
      // Lowest level first, so the Process's own overlay leads.
    ).toStrictEqual([
      ["production", ["ONLY_THERE"]],
      [undefined, ["SHARED"]],
    ]);
  });
});

describe("a refusal that reads the effective answer, not the written one", () => {
  it("refuses a rolling cutover declared above a Process holding a volume", () => {
    const document = `${HEADER}cutover: rolling\napplications:\n  - id: a\n    processes:\n      - name: w\n        lifecycle: application\n        image: w\n        runtime: none\n        engine: files\n        placement: {memory: 64Mi, cpu: 10m}\n        volumes:\n          - {claim: c, mountAt: /var/lib/c, size: 1Gi, durability: irreplaceable}\n`;

    expect(refusals(document)).toStrictEqual([
      ["E_CUTOVER_UNHONOURABLE", "/applications/0/processes/0"],
    ]);
  });

  it("refuses a grant the project header states badly, at the header", () => {
    expect(
      refusals(
        `${HEADER}secrets: [{engine: transit, key: j, operations: [sign], delivery: env}]\napplications:\n  - id: a\n${PROCESS}`,
      ),
    ).toStrictEqual([["E_NON_KV_DELIVERY", "/secrets/0"]]);
  });

  it("reads a key stated by one level above and not the other", () => {
    // `.some`, not `.every`: the project states `site` and the Application
    // states nothing, and the Process restating it is still a duplicate.
    const process = PROCESS.replace(
      "        placement: {memory: 64Mi, cpu: 10m}\n",
      "        placement: {memory: 64Mi, cpu: 10m, site: enschede}\n",
    );

    expect(
      refusals(
        `${HEADER}placement: {site: enschede}\napplications:\n  - id: a\n${process}`,
      ),
    ).toStrictEqual([
      ["E_SHARED_DECLARATION_DUPLICATED", "/applications/0/processes/0"],
    ]);
  });
});

describe("what a duplicate of each family says", () => {
  const says = (document: string): string | undefined => {
    const result = parseProjectIntent(document);
    return result.ok ? undefined : result.diagnostics[0]?.message;
  };

  it("names the grant, the edge and the Asset it refused", () => {
    const grant =
      "[{path: secret/data/p/t, keys: [k], access: read, delivery: env}]";
    expect(
      says(
        `${HEADER}secrets: ${grant}\napplications:\n  - id: a\n${PROCESS}        secrets: ${grant}\n`,
      ),
    ).toBe(
      "this grant is declared again, unchanged, at a level above this one",
    );

    const edge = "[{application: q, surface: amqp}]";
    expect(
      says(
        `${HEADER}dependsOn: ${edge}\napplications:\n  - id: a\n${PROCESS}        dependsOn: ${edge}\n`,
      ),
    ).toBe("this edge is declared again, unchanged, at a level above this one");

    const asset = "[{from: c.conf, mountAt: /etc/c.conf}]";
    expect(
      says(
        `${HEADER}assets: ${asset}\napplications:\n  - id: a\n${PROCESS}        assets: ${asset}\n`,
      ),
    ).toBe(
      "this asset is declared again, unchanged, at a level above this one",
    );
  });
});
