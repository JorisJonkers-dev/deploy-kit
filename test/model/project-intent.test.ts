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
        cutover: interrupted
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
    expect(cases).toStrictEqual([
      "auth",
      "data",
      "delivery",
      "edge",
      "knowledge",
      "knowledge-platform",
      "minimal",
      "observability",
      "secrets",
    ]);
  });

  it("parses the minimal case to its committed intent oracle, byte for byte", () => {
    const result = parseProjectIntent(MINIMAL);

    expect(result.ok && canonicalJson(result.value.document)).toBe(ORACLE);
  });

  it("differs from the oracle when one authored field changes", () => {
    const result = parseProjectIntent(MINIMAL.replace("cpu: 50m", "cpu: 60m"));

    expect(result.ok && canonicalJson(result.value.document)).not.toBe(ORACLE);
  });

  it("lowers the minimal case to its committed effective oracle, byte for byte", () => {
    const result = parseProjectIntent(MINIMAL, [
      {
        path: "minimal/env/notes-api/base.env",
        text: readFileSync(
          join(EXAMPLES, "minimal", "env", "notes-api", "base.env"),
          "utf8",
        ),
      },
    ]);

    expect(result.ok && canonicalJson(result.value.effective)).toBe(
      readFileSync(
        join(EXAMPLES, "minimal", "expected", "effective.json"),
        "utf8",
      ),
    );
  });

  it("lowers auth to its committed effective oracle, byte for byte, a placeholder's text after it kept", () => {
    const result = parseProjectIntent(
      readFileSync(join(EXAMPLES, "auth", "auth.project.yml"), "utf8"),
      [
        {
          path: "auth/env/auth-api/base.env",
          text: readFileSync(
            join(EXAMPLES, "auth", "env", "auth-api", "base.env"),
            "utf8",
          ),
        },
      ],
    );

    expect(result.ok && canonicalJson(result.value.effective)).toBe(
      readFileSync(
        join(EXAMPLES, "auth", "expected", "effective.json"),
        "utf8",
      ),
    );
  });

  it("lowers data to its committed effective oracle, byte for byte", () => {
    const result = parseProjectIntent(
      readFileSync(join(EXAMPLES, "data", "data.project.yml"), "utf8"),
      [
        {
          path: "data/env/postgres/base.env",
          text: readFileSync(
            join(EXAMPLES, "data", "env", "postgres", "base.env"),
            "utf8",
          ),
        },
      ],
    );

    expect(result.ok && canonicalJson(result.value.effective)).toBe(
      readFileSync(
        join(EXAMPLES, "data", "expected", "effective.json"),
        "utf8",
      ),
    );
  });

  it("lowers the knowledge platform to its committed effective oracle, byte for byte, the header's cutover and an Application's site held by every Process below them", () => {
    const directory = join(EXAMPLES, "knowledge-platform");
    const result = parseProjectIntent(
      readFileSync(join(directory, "knowledge-platform.project.yml"), "utf8"),
      readdirSync(join(directory, "env"))
        .sort()
        .map((process) => ({
          path: `knowledge-platform/env/${process}/base.env`,
          text: readFileSync(
            join(directory, "env", process, "base.env"),
            "utf8",
          ),
        })),
    );

    expect(result.ok && canonicalJson(result.value.effective)).toBe(
      readFileSync(join(directory, "expected", "effective.json"), "utf8"),
    );
  });

  it("names a route's and a scrape's Process and surface as written, each one the lowered Application holds", () => {
    const result = parseProjectIntent(MINIMAL);
    const application = result.ok
      ? result.value.effective.applications[0]
      : undefined;
    const names = application?.processes.map(({ name }) => name);
    const route = application?.exposure?.[0]?.routes[0];
    const scrape = application?.observability?.scrape;

    expect(names).toContain(route?.process);
    expect(names).toContain(scrape?.process);
    expect(application?.processes[0]?.provides).toHaveProperty(
      route?.surface ?? "",
    );
  });

  it("writes no key that no level declared, and leaves the Application and Project holding only what defines them", () => {
    const result = parseProjectIntent(
      withApplications(`  - id: batch\n    processes:\n${PROCESS}`),
    );

    expect(result.ok && result.value.effective).toStrictEqual({
      project: "p",
      owner: "o",
      applications: [
        {
          id: "batch",
          processes: [
            {
              name: "worker",
              lifecycle: "job",
              image: "worker",
              runtime: "none",
              placement: { memory: "64Mi", cpu: "10m" },
              cutover: "interrupted",
            },
          ],
        },
      ],
    });
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
    const [refusal, ...rest] = refused(text);

    expect(rest).toStrictEqual([]);
    expect(refusal?.code).toBe("schema");
    expect(refusal?.path).toBe("");
    expect(refusal?.message).toContain(message);
  });

  it("refuses a file outside the YAML subset once, at the root, however often it breaks it", () => {
    const [refusal, ...rest] = refused(
      `${HEADER}applications: &a []\nother: *a\nmore: !!str x\n`,
    );

    expect(rest).toStrictEqual([]);
    expect(refusal).toStrictEqual({
      code: "schema",
      path: "",
      message:
        "an anchor is not read; an alias is not read; an explicit tag is not read",
    });
  });

  it.each(["rolling", "recreate"])(
    "refuses the retired cutover value %s as outside the vocabulary",
    (retired) => {
      const codes = refused(
        withApplications(
          `  - id: a\n    processes:\n${PROCESS.replace("cutover: interrupted", `cutover: ${retired}`)}`,
        ),
      ).map(({ code }) => code);

      expect(codes).toContain("schema");
    },
  );

  it("refuses malformed YAML and a duplicated key at the document, before the schema runs", () => {
    const batch = `  - id: batch\n    processes:\n${PROCESS}`;

    const [malformed, ...more] = refused(withApplications(`${batch}  - [\n`));
    expect(more).toStrictEqual([]);
    expect(malformed?.path).toBe("");
    // The parser's own words, not an empty or undefined reason.
    expect(malformed?.message).toMatch(/flow sequence|\]/i);
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
        { code: "schema", path: "/applications/0/processes/0/stateful" },
      ],
    );
  });

  it("refuses every unknown field at its own pointer, and a value once however much of it is wrong", () => {
    const diagnostics = refused(
      withApplications(
        `  - id: batch\n    colour: blue\n    size: 3\n    processes:\n${PROCESS}        provides: { http: 0.5 }\n`,
      ),
    );

    expect(
      diagnostics.sort((a, b) => (a.path < b.path ? -1 : 1)),
    ).toStrictEqual([
      {
        code: "schema",
        path: "/applications/0/colour",
        message: '"colour" is not a field of the model',
      },
      expect.objectContaining({
        path: "/applications/0/processes/0/provides/http",
      }),
      {
        code: "schema",
        path: "/applications/0/size",
        message: '"size" is not a field of the model',
      },
    ]);
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

  it.each(["required: false", "required: true", ""])(
    "carries a dependency's %s onto the lowered Process as written",
    (line) => {
      const text = withApplications(
        `  - id: batch\n    processes:\n${PROCESS}        dependsOn:\n          - application: other\n            surface: http\n            ${line}\n`,
      );
      const result = parseProjectIntent(text);
      const required = line === "" ? {} : { required: line.endsWith("true") };

      expect(
        result.ok &&
          result.value.effective.applications[0]?.processes[0]?.dependsOn,
      ).toStrictEqual([{ application: "other", surface: "http", ...required }]);
    },
  );

  it("refuses a grant that declares no rotation, at the grant it does not complete", () => {
    const text = withApplications(
      `  - id: batch\n    processes:\n${PROCESS}        secrets:\n          - path: secret/data/batch\n            keys: [password]\n            access: read\n            delivery: env\n`,
    );

    expect(refused(text)).toContainEqual(
      expect.objectContaining({
        code: "schema",
        path: "/applications/0/processes/0/secrets/0",
      }),
    );
  });

  it("refuses a volume that declares no size, at the volume", () => {
    const text = withApplications(
      `  - id: batch\n    processes:\n${PROCESS}        volumes:\n          - {claim: c, mountAt: /data, durability: reconstructible}\n`,
    );

    expect(refused(text)).toContainEqual(
      expect.objectContaining({
        code: "schema",
        path: "/applications/0/processes/0/volumes/0/size",
      }),
    );
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
