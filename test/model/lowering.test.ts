// REQ-036 (docs/requirements.md): Shared Intent declared at the Project or an
// Application reaches every Process below it, lists extend each other, and the
// lowest declaration of one thing holds.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lowerProject } from "../../src/lower/project.ts";
import type {
  ApplicationDocument,
  Grant,
  ProcessDocument,
  ProjectIntentDocument,
  SharedIntent,
} from "../../src/model/project-intent.ts";
import {
  parseProjectIntent,
  type EffectiveProcess,
  type ScopedEnv,
} from "../../src/index.ts";

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
  return Object.fromEntries(
    (parsed.value.effective.applications[0]?.processes ?? []).map((process) => [
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

    expect(paths(api?.secrets ?? [])).toStrictEqual([
      "secret/data/refusals/bearer",
      "secret/data/refusals/estate-ca",
      "secret/data/refusals/queue",
      "secret/data/refusals/telemetry",
    ]);
  });

  it("lets a sibling hold fewer, so the lists extend rather than have to match", () => {
    const { "shared-intent-merged-worker": worker } = processes();

    expect(paths(worker?.secrets ?? [])).toStrictEqual([
      "secret/data/refusals/estate-ca",
      "secret/data/refusals/queue",
      "secret/data/refusals/telemetry",
    ]);
  });

  it("keeps the lowest declaration of one path, with the terms that Process needs", () => {
    const { "shared-intent-merged-worker": worker } = processes();
    const telemetry = worker?.secrets?.find(
      (grant) =>
        "path" in grant && grant.path === "secret/data/refusals/telemetry",
    );

    expect(telemetry).toMatchObject({
      access: "custody",
      delivery: "self",
    });
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
      site: "enschede",
    });
    // The Process replaces `site` and inherits `arch`: each key merges on its own.
    expect(worker?.placement).toStrictEqual({
      memory: "64Mi",
      cpu: "10m",
      arch: ["arm64"],
      site: "frankfurt",
    });
  });

  it("answers the cutover question once, for the release unit that switches together", () => {
    const processesByName = processes();

    expect(
      Object.values(processesByName).map((process) => process.cutover),
    ).toStrictEqual(["interrupted", "interrupted"]);
  });

  it("extends the paths a Process may write, and the edges it may open", () => {
    const {
      "shared-intent-merged-api": api,
      "shared-intent-merged-worker": worker,
    } = processes();

    expect(api?.writablePaths).toStrictEqual(["/var/cache/api", "/tmp"]);
    expect(worker?.writablePaths).toStrictEqual(["/tmp"]);
    expect(api?.dependsOn?.map(({ application }) => application)).toStrictEqual(
      ["platform-postgres", "platform-rabbitmq"],
    );
    expect(
      worker?.dependsOn?.map(({ application }) => application),
    ).toStrictEqual(["platform-rabbitmq"]);
  });

  it("leaves the Project and the Application holding only what defines them", () => {
    const parsed = parseProjectIntent(MERGED);
    const lowered = parsed.ok ? parsed.value.effective : undefined;

    expect(Object.keys(lowered ?? {}).sort()).toStrictEqual([
      "applications",
      "owner",
      "project",
    ]);
    expect(Object.keys(lowered?.applications[0] ?? {}).sort()).toStrictEqual([
      "id",
      "processes",
    ]);
  });
});

// The families the worked fixture does not hold, built directly.
function document(
  header: SharedIntent,
  application: Partial<ApplicationDocument>,
  process: Partial<ProcessDocument>,
): ProjectIntentDocument {
  return {
    apiVersion: "intent.jorisjonkers.dev/v1",
    kind: "Project",
    schemaVersion: "1.0.0",
    project: "p",
    owner: "o",
    ...header,
    applications: [
      {
        id: "a",
        ...application,
        processes: [
          {
            name: "w",
            lifecycle: "job",
            image: "w",
            runtime: "none",
            ...process,
          },
        ],
      },
    ],
  };
}

function lowered(
  header: SharedIntent,
  application: Partial<ApplicationDocument>,
  process: Partial<ProcessDocument>,
  env: readonly ScopedEnv[] = [],
): EffectiveProcess {
  const result = lowerProject(document(header, application, process), env);
  const only = result.applications[0]?.processes[0];
  if (only === undefined) throw new Error("the lowering dropped the Process");
  return only;
}

describe("lowerProject, over the families a worked document does not hold", () => {
  it("identifies a database grant by its role and a transit grant by its key", () => {
    const merged = lowered(
      {
        secrets: [
          {
            engine: "database",
            role: "kb",
            delivery: "self",
            rotation: { tolerates: "reload" },
          },
          {
            engine: "transit",
            key: "jwt",
            operations: ["sign"],
            delivery: "self",
            rotation: { tolerates: "reload" },
          },
        ],
      },
      {},
      {
        secrets: [
          // The same role, so this replaces the header's rather than joining it.
          {
            engine: "database",
            role: "kb",
            delivery: "self",
            mountAt: "/run/db",
            rotation: { tolerates: "reload" },
          },
        ],
      },
    );

    expect(merged.secrets).toStrictEqual([
      {
        engine: "database",
        role: "kb",
        delivery: "self",
        mountAt: "/run/db",
        rotation: { tolerates: "reload" },
      },
      {
        engine: "transit",
        key: "jwt",
        operations: ["sign"],
        delivery: "self",
        rotation: { tolerates: "reload" },
      },
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
      { placement: { arch: ["arm64"], disk: { media: ["nvme"] } } },
      { placement: { memory: "64Mi", cpu: "10m", site: "enschede" } },
    );

    expect(merged.placement).toStrictEqual({
      memory: "64Mi",
      cpu: "10m",
      arch: ["arm64"],
      site: "enschede",
      capabilities: ["public-ingress"],
      disk: { media: ["nvme"] },
      gpu: { class: "transcode", memory: "4Gi" },
    });
  });

  it("writes no dimension no level declared, and no quantity the Process did not", () => {
    expect(lowered({}, {}, {}).placement).toStrictEqual({});
    expect(
      lowered({}, { placement: { arch: ["arm64"] } }, {}).placement,
    ).toStrictEqual({ arch: ["arm64"] });
  });

  it("holds a path a level names twice once, as the model-driven implementation does", () => {
    expect(
      lowered(
        { writablePaths: ["/tmp"] },
        {},
        { writablePaths: ["/tmp", "/cache", "/tmp"] },
      ).writablePaths,
    ).toStrictEqual(["/tmp", "/cache"]);
  });

  it("writes no key for a many-valued family no level declared", () => {
    expect(Object.keys(lowered({}, {}, {})).sort()).toStrictEqual([
      "image",
      "lifecycle",
      "name",
      "placement",
      "runtime",
    ]);
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

  it("carries an Application's observability and exposure onto the lowered Application", () => {
    const result = lowerProject(
      document(
        {},
        {
          observability: { alertClass: "urgent" },
          exposure: [
            {
              name: "public",
              host: "a.example",
              audience: "anonymous",
              routes: [
                { path: "/", match: "prefix", process: "w", surface: "http" },
              ],
            },
          ],
        },
        {},
      ),
      [],
    );

    expect(result.applications[0]?.observability).toStrictEqual({
      alertClass: "urgent",
    });
    expect(result.applications[0]?.exposure?.[0]?.routes[0]?.process).toBe("w");
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
        cutover: interrupted
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
        `${HEADER}cutover: interrupted\napplications:\n  - id: a\n    cutover: interrupted\n${PROCESS}`,
      ),
    ).toStrictEqual([
      ["E_SHARED_DECLARATION_DUPLICATED", "/applications/0"],
      // The Process restates it too: `PROCESS` carries `cutover: interrupted`.
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
        "{engine: transit, key: jwt, operations: [sign], delivery: self, rotation: {tolerates: reload}}",
      ),
    ).toStrictEqual([["E_SHARED_DECLARATION_DUPLICATED", at]]);
    expect(
      restated(
        "{engine: database, role: kb, delivery: self, rotation: {tolerates: reload}}",
      ),
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
    const document = `${HEADER}writablePaths: [/tmp]\ncutover: interrupted\nstartupBudget: 20s\napplications:\n  - id: a\n${PROCESS}        writablePaths: [/tmp]\n        startupBudget: 20s\n`;

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
      `[{path: secret/data/p/t, keys: [token], access: ${access}, delivery: self, rotation: {tolerates: reload}}]`;

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
        secrets: [
          {
            path: "x",
            keys: ["k"],
            access: "read",
            delivery: "env",
            rotation: { tolerates: "restart" },
          },
          {
            engine: "database",
            role: "x",
            delivery: "self",
            rotation: { tolerates: "reload" },
          },
          {
            engine: "transit",
            key: "x",
            operations: ["sign"],
            delivery: "self",
            rotation: { tolerates: "reload" },
          },
        ],
      },
      {},
      {},
    );

    // One identity each: `secret/data/x`, `database/creds/x` and `transit/x`.
    expect(merged.secrets).toHaveLength(3);
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
      `${HEADER}applications:\n  - id: a\n    processes:\n      - name: w\n        lifecycle: job\n        image: w\n        runtime: none\n        cutover: interrupted\n`,
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
      `${HEADER}cutover: interrupted\napplications:\n  - id: a\n    cutover: interrupted\n${PROCESS}`,
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
    expect(Object.keys(lowered({}, {}, {}))).not.toContain("startupBudget");
    expect(Object.keys(lowered({ startupBudget: "20s" }, {}, {}))).toContain(
      "startupBudget",
    );
  });

  it("writes a base file with no Cluster Target, and an overlay with one", () => {
    const process = lowered({}, {}, {}, [
      {
        path: "env/w/base.env",
        scope: { level: "process", name: "w" },
        file: { entries: [{ name: "A", value: { text: "1" } }] },
      },
      {
        path: "env/w/production.env",
        scope: { level: "process", name: "w" },
        file: {
          cluster: "production",
          entries: [{ name: "A", value: { text: "2" } }],
        },
      },
    ]);

    expect(process.env).toStrictEqual([
      { entries: [{ name: "A", value: { text: "1" } }] },
      {
        cluster: "production",
        entries: [{ name: "A", value: { text: "2" } }],
      },
    ]);
  });

  it("keeps an overlay's variables out of the base file, and the other way round", () => {
    const process = lowered({}, {}, {}, [
      {
        path: "env/_project/base.env",
        scope: { level: "project" },
        file: { entries: [{ name: "SHARED", value: { text: "1" } }] },
      },
      {
        path: "env/w/production.env",
        scope: { level: "process", name: "w" },
        file: {
          cluster: "production",
          entries: [{ name: "ONLY_THERE", value: { text: "2" } }],
        },
      },
    ]);

    expect(
      process.env?.map(({ cluster, entries }) => [
        cluster,
        entries.map(({ name }) => name),
      ]),
      // Lowest level first, so the Process's own overlay leads.
    ).toStrictEqual([
      ["production", ["ONLY_THERE"]],
      [undefined, ["SHARED"]],
    ]);
  });

  it("reaches an Application's own scope, and not a sibling Application's", () => {
    const process = lowered({}, {}, {}, [
      {
        path: "env/_applications/a/base.env",
        scope: { level: "application", id: "a" },
        file: { entries: [{ name: "OURS", value: { text: "1" } }] },
      },
      {
        path: "env/_applications/b/base.env",
        scope: { level: "application", id: "b" },
        file: { entries: [{ name: "THEIRS", value: { text: "1" } }] },
      },
      {
        path: "env/v/base.env",
        scope: { level: "process", name: "v" },
        file: { entries: [{ name: "SIBLING", value: { text: "1" } }] },
      },
    ]);

    expect(process.env).toStrictEqual([
      { entries: [{ name: "OURS", value: { text: "1" } }] },
    ]);
  });
});

describe("a refusal that reads the effective answer, not the written one", () => {
  it("refuses a continuous cutover declared above a Process holding a volume", () => {
    const document = `${HEADER}cutover: continuous\napplications:\n  - id: a\n    processes:\n      - name: w\n        lifecycle: application\n        image: w\n        runtime: none\n        engine: files\n        placement: {memory: 64Mi, cpu: 10m}\n        volumes:\n          - {claim: c, mountAt: /var/lib/c, size: 1Gi, durability: irreplaceable}\n`;

    expect(refusals(document)).toStrictEqual([
      ["E_CUTOVER_UNHONOURABLE", "/applications/0/processes/0"],
    ]);
  });

  it("refuses an Application whose members answer the cutover question differently", () => {
    // The Application's answer reaches `b`; `a` writes its own.
    const document = `${HEADER}applications:\n  - id: a\n    cutover: interrupted\n    processes:\n      - name: a\n        lifecycle: application\n        image: a\n        runtime: none\n        placement: {memory: 64Mi, cpu: 10m}\n        cutover: continuous\n      - name: b\n        lifecycle: application\n        image: b\n        runtime: none\n        placement: {memory: 64Mi, cpu: 10m}\n`;

    expect(refusals(document)).toStrictEqual([
      ["E_RELEASE_UNIT_MIXED_CUTOVER", "/applications/0"],
    ]);
  });

  it("does not count a job, or a member no level answers, as a second answer", () => {
    const withJob = `${HEADER}applications:\n  - id: a\n    processes:\n      - name: a\n        lifecycle: application\n        image: a\n        runtime: none\n        placement: {memory: 64Mi, cpu: 10m}\n        cutover: continuous\n      - name: j\n        lifecycle: job\n        image: j\n        runtime: none\n        placement: {memory: 64Mi, cpu: 10m}\n        cutover: interrupted\n`;
    const unanswered = `${HEADER}applications:\n  - id: a\n    processes:\n      - name: a\n        lifecycle: application\n        image: a\n        runtime: none\n        placement: {memory: 64Mi, cpu: 10m}\n        cutover: continuous\n      - name: b\n        lifecycle: application\n        image: b\n        runtime: none\n        placement: {memory: 64Mi, cpu: 10m}\n`;

    expect(refusals(withJob)).toStrictEqual([]);
    expect(refusals(unanswered)).toStrictEqual([
      ["E_CUTOVER_MISSING", "/applications/0/processes/1"],
    ]);
  });

  it("refuses the owner role granted by hand at every level, where it is written", () => {
    const owner =
      "[{engine: database, role: p-owner, delivery: self, rotation: {tolerates: reload}}]";
    const document = `${HEADER}secrets: ${owner}\napplications:\n  - id: a\n    secrets: ${owner}\n${PROCESS}        secrets: ${owner}\n`;

    expect(
      refusals(document).filter(([code]) => code === "E_OWNER_ROLE_GRANTED"),
    ).toStrictEqual([
      ["E_OWNER_ROLE_GRANTED", "/secrets/0"],
      ["E_OWNER_ROLE_GRANTED", "/applications/0/secrets/0"],
      ["E_OWNER_ROLE_GRANTED", "/applications/0/processes/0/secrets/0"],
    ]);
  });

  it("carries an Application's migration onto the effective Application", () => {
    const parsed = parseProjectIntent(
      `${HEADER}applications:\n  - id: a\n    migration: {changelog: db/changelog.yml}\n${PROCESS}  - id: b\n${PROCESS.replace("name: w", "name: v").replace("image: w", "image: v")}`,
    );

    expect(
      parsed.ok &&
        parsed.value.effective.applications.map((application) =>
          "migration" in application ? application.migration : "absent",
        ),
    ).toStrictEqual([{ changelog: "db/changelog.yml" }, "absent"]);
  });

  it("asks a prepare Process for no cutover, and names what a serving one has when it writes one", () => {
    const seed = `      - name: seed\n        lifecycle: prepare\n        image: seed\n        runtime: none\n        placement: {memory: 64Mi, cpu: 10m}\n`;
    const alone = `${HEADER}applications:\n  - id: a\n    processes:\n${seed}`;
    const serving = `${HEADER}applications:\n  - id: a\n    processes:\n${seed}        provides: {http: 8080}\n        replicas: {count: 2, reason: r}\n        cutover: continuous\n`;

    expect(refusals(alone)).toStrictEqual([]);
    const result = parseProjectIntent(serving);
    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, message }) => [code, message]),
    ).toStrictEqual([
      [
        "E_PREPARE_PROCESS_SERVES",
        "a prepare Process runs to completion before the new version starts, and declares provides, replicas, cutover, which only a serving Process has",
      ],
    ]);
  });

  it("does not hold a prepare Process's volume to a cutover it does not have", () => {
    const document = `${HEADER}cutover: continuous\napplications:\n  - id: a\n    processes:\n      - name: seed\n        lifecycle: prepare\n        image: seed\n        runtime: none\n        placement: {memory: 64Mi, cpu: 10m}\n        volumes:\n          - {claim: c, mountAt: /c, size: 1Gi, durability: reconstructible}\n`;

    expect(refusals(document)).toStrictEqual([]);
  });

  it("refuses a grant the project header states badly, at the header", () => {
    expect(
      refusals(
        `${HEADER}secrets: [{engine: transit, key: j, operations: [sign], delivery: env, rotation: {tolerates: restart}}]\napplications:\n  - id: a\n${PROCESS}`,
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
      "[{path: secret/data/p/t, keys: [k], access: read, delivery: env, rotation: {tolerates: restart}}]";
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
