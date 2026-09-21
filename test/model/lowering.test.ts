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
