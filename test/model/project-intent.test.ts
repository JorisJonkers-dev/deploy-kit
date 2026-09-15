// REQ-021 (docs/requirements.md): an authored Project Intent file parses to its
// committed intent oracle, and YAML or fields outside the language are refused.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, parseProjectIntent } from "../../src/index.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);
const MINIMAL = readFileSync(
  join(EXAMPLES, "minimal", "notes.project.yml"),
  "utf8",
);
const ORACLE = readFileSync(
  join(EXAMPLES, "minimal", "expected", "intent.json"),
  "utf8",
);

const HEADER = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: p
owner: o
`;

const PROCESS = `      - name: worker
        lifecycle: job
        image: worker
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        cutover: recreate
`;

const withApplications = (applications: string): string =>
  `${HEADER}applications:\n${applications}`;

function refused(text: string) {
  const result = parseProjectIntent(text);
  if (result.ok) throw new Error("expected a refusal");
  return result.diagnostics.map(({ code, path, message }) => ({
    code,
    path,
    message,
  }));
}

const cases = readdirSync(EXAMPLES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => readdirSync(join(EXAMPLES, name)).includes("expected"))
  .filter((name) =>
    readdirSync(join(EXAMPLES, name)).some((file) =>
      file.endsWith(".project.yml"),
    ),
  )
  .sort();

const projectFile = (directory: string): string => {
  const file = readdirSync(join(EXAMPLES, directory)).find((name) =>
    name.endsWith(".project.yml"),
  );
  return readFileSync(join(EXAMPLES, directory, file ?? ""), "utf8");
};

describe("parseProjectIntent", () => {
  it.each(cases)(
    "parses %s to its committed intent oracle, byte for byte",
    (directory) => {
      const result = parseProjectIntent(projectFile(directory));

      expect(result.ok && canonicalJson(result.value.document)).toBe(
        readFileSync(
          join(EXAMPLES, directory, "expected", "intent.json"),
          "utf8",
        ),
      );
    },
  );

  it("covers every worked example", () => {
    expect(cases).toStrictEqual(["auth", "data", "knowledge", "minimal"]);
  });

  it("parses the minimal case to its committed intent oracle, byte for byte", () => {
    const result = parseProjectIntent(MINIMAL);

    expect(result.ok && canonicalJson(result.value.document)).toBe(ORACLE);
  });

  it("differs from the oracle when one authored field changes", () => {
    const result = parseProjectIntent(MINIMAL.replace("cpu: 50m", "cpu: 60m"));

    expect(result.ok && canonicalJson(result.value.document)).not.toBe(ORACLE);
  });

  it("maps the minimal case into the domain model, with its references resolved", () => {
    const result = parseProjectIntent(MINIMAL);
    const surface = { name: "http", port: 8080 };
    const process = {
      name: "notes-api",
      lifecycle: "application",
      image: "notes-api",
      runtime: "node",
      surfaces: [surface],
      placement: { memory: "256Mi", cpu: "50m", arch: [], capabilities: [] },
      writablePaths: [],
      sidecars: [],
      dependencies: [],
      assets: [],
      volumes: [],
      grants: [],
      probes: {
        readiness: { path: "/healthz/ready", port: 8080 },
        liveness: { path: "/healthz/live", port: 8080 },
      },
      startupBudget: "20s",
      cutover: "rolling",
    };

    expect(result.ok && result.value.project).toStrictEqual({
      name: "notes",
      owner: "joris",
      applications: [
        {
          id: "notes",
          observability: {
            alertClass: "business-hours",
            scrape: { process, surface, path: "/metrics" },
          },
          grants: [],
          exposures: [
            {
              name: "public",
              host: "notes.jorisjonkers.dev",
              audience: "anonymous",
              contentPolicy: "strict",
              routes: [{ path: "/", match: "prefix", process, surface }],
            },
          ],
          processes: [process],
        },
      ],
    });
  });

  it("links a route and a scrape to the very Process and surface the Application holds", () => {
    const result = parseProjectIntent(MINIMAL);
    const application = result.ok
      ? result.value.project.applications[0]
      : undefined;
    const process = application?.processes[0];

    expect(application?.exposures[0]?.routes[0]?.process).toBe(process);
    expect(application?.exposures[0]?.routes[0]?.surface).toBe(
      process?.surfaces[0],
    );
    expect(application?.observability?.scrape?.process).toBe(process);
    expect(application?.observability?.scrape?.surface).toBe(
      process?.surfaces[0],
    );
  });

  it("maps an absent block to an empty one, and leaves an absent optional field absent", () => {
    const result = parseProjectIntent(
      withApplications(`  - id: batch\n    processes:\n${PROCESS}`),
    );

    expect(result.ok && result.value.project.applications).toStrictEqual([
      {
        id: "batch",
        exposures: [],
        grants: [],
        processes: [
          {
            name: "worker",
            lifecycle: "job",
            image: "worker",
            runtime: "none",
            surfaces: [],
            placement: {
              memory: "64Mi",
              cpu: "10m",
              arch: [],
              capabilities: [],
            },
            writablePaths: [],
            sidecars: [],
            dependencies: [],
            assets: [],
            probes: {},
            volumes: [],
            grants: [],
            cutover: "recreate",
          },
        ],
      },
    ]);
    expect(result.ok && canonicalJson(result.value.document)).not.toContain(
      "startupBudget",
    );
  });

  it.each([
    ["no document", "", "expected one YAML document, found 0"],
    [
      "two documents",
      `${HEADER}---\n${HEADER}`,
      "expected one YAML document, found 2",
    ],
    ["an anchor", `${HEADER}applications: &a []\n`, "an anchor is not read"],
    ["an alias", `x: &a 1\ny: *a\n`, "an alias is not read"],
    [
      "an explicit tag",
      `${HEADER}applications: !!seq []\n`,
      "an explicit tag is not read",
    ],
  ])("refuses %s rather than interpreting it", (_name, text, message) => {
    expect(refused(text)).toContainEqual({ code: "schema", path: "", message });
  });

  it("refuses malformed YAML and a duplicated key at the document, before the schema runs", () => {
    const batch = `  - id: batch\n    processes:\n${PROCESS}`;

    expect(
      refused(withApplications(`${batch}  - [\n`)).map(({ path }) => path),
    ).toStrictEqual([""]);
    expect(refused(`owner: again\n${withApplications(batch)}`)).toStrictEqual([
      expect.objectContaining({ code: "schema", path: "" }),
    ]);
  });

  it.each([
    ["10.20.30", true],
    ["v1.0.0", false],
    ["1.0.0-rc.1", false],
    ["1.0", false],
  ])("reads schemaVersion %s as valid: %s", (version, valid) => {
    const text = withApplications(
      `  - id: batch\n    processes:\n${PROCESS}`,
    ).replace("schemaVersion: 1.0.0", `schemaVersion: "${version}"`);

    expect(parseProjectIntent(text).ok).toBe(valid);
  });

  it("accepts several processes and refuses an application with none or an exposure with no route", () => {
    expect(
      parseProjectIntent(
        withApplications(
          `  - id: batch\n    processes:\n${PROCESS}${PROCESS.replace("name: worker", "name: second")}`,
        ),
      ).ok,
    ).toBe(true);
    expect(
      refused(
        withApplications(
          `  - id: batch\n    processes: []\n  - id: web\n    exposure:\n      - { name: e, host: h, audience: lan, contentPolicy: admin, routes: [] }\n    processes:\n${PROCESS}`,
        ),
      ).map(({ path }) => path),
    ).toStrictEqual([
      "/applications/0/processes",
      "/applications/1/exposure/0/routes",
    ]);
  });

  it("refuses a field outside the language at its JSON Pointer", () => {
    const diagnostics = refused(
      withApplications(
        `  - id: batch\n    processes:\n${PROCESS.replace("runtime: none", "runtime: rust")}        stateful: true\n`,
      ),
    );

    expect(diagnostics.map(({ code, path }) => ({ code, path }))).toStrictEqual(
      [
        { code: "schema", path: "/applications/0/processes/0/runtime" },
        { code: "schema", path: "/applications/0/processes/0" },
      ],
    );
  });

  it("escapes a pointer segment and refuses a port that is not an integer", () => {
    const diagnostics = refused(
      withApplications(
        `  - id: batch\n    processes:\n${PROCESS}        provides: { "a/b~c": "8080" }\n`,
      ),
    );

    expect(diagnostics.map(({ path }) => path)).toStrictEqual([
      "/applications/0/processes/0/provides/a~1b~0c",
    ]);
  });

  it.each([
    ["required: false", false],
    ["required: true", true],
  ])("reads a dependency written %s as such", (line, required) => {
    const text = withApplications(
      `  - id: batch\n    processes:\n${PROCESS}        dependsOn:\n          - application: other\n            surface: http\n            ${line}\n`,
    );
    const result = parseProjectIntent(text);

    expect(
      result.ok &&
        result.value.project.applications[0]?.processes[0]?.dependencies,
    ).toStrictEqual([{ application: "other", surface: "http", required }]);
  });

  it("reads a dependency with no required field as required", () => {
    const text = withApplications(
      `  - id: batch\n    processes:\n${PROCESS}        dependsOn:\n          - { application: other, surface: http }\n`,
    );
    const result = parseProjectIntent(text);

    expect(
      result.ok &&
        result.value.project.applications[0]?.processes[0]?.dependencies,
    ).toStrictEqual([
      { application: "other", surface: "http", required: true },
    ]);
  });

  it("accepts a grant that declares no rotation", () => {
    const text = withApplications(
      `  - id: batch\n    processes:\n${PROCESS}        secrets:\n          - path: secret/data/batch\n            keys: [password]\n            access: read\n            delivery: env\n`,
    );

    expect(parseProjectIntent(text).ok).toBe(true);
  });

  it("points a schema failure at the chapter that defines the field", () => {
    const result = parseProjectIntent(`${HEADER}applications: []\n`);

    expect(!result.ok && result.diagnostics[0]?.hint).toBe(
      "Correct the field against spec/v1/10-project-intent.md.",
    );
  });

  it("gives every diagnostic a hint", () => {
    const diagnostics = ["", `${HEADER}applications: []\n`].flatMap((text) => {
      const result = parseProjectIntent(text);
      return result.ok ? [] : result.diagnostics;
    });

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every(({ hint }) => hint.length > 0)).toBe(true);
  });
});
