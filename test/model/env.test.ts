// REQ-037 (docs/requirements.md): the authored env files are read into the
// model, scoped by the directory that holds them, and merged onto the Processes
// that receive them.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lowerProject } from "../../src/domain/project-intent/lower.ts";
import type { EnvFile } from "../../src/domain/project-intent/model.ts";
import {
  readEnv,
  readEnvFile,
  scopeOf,
} from "../../src/wire/project-intent/env.ts";
import { parseProjectIntent } from "../../src/index.ts";

const KNOWLEDGE = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
  "knowledge",
);

/** Every env file of the knowledge example, by the path that scopes it. */
function sources(): { path: string; text: string }[] {
  const root = join(KNOWLEDGE, "env");
  const walk = (at: string): string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(at, entry.name)) : [join(at, entry.name)],
    );
  return walk(root).map((path) => ({
    path: path.slice(KNOWLEDGE.length + 1),
    text: readFileSync(path, "utf8"),
  }));
}

const read = (text: string) => readEnvFile({ path: "env/w/base.env", text });
const names = (file: EnvFile | undefined): string[] =>
  (file?.entries ?? []).map(({ name }) => name);

describe("the dotenv subset", () => {
  it("reads a literal, a placeholder, comments and blank lines", () => {
    const file = read(
      "# a comment\n\nMODE=lite\nDB_HOST=${dependency:platform-postgres.host}\n",
    );

    expect(file.ok && file.value).toStrictEqual({
      entries: [
        { name: "MODE", value: { text: "lite" } },
        {
          name: "DB_HOST",
          value: { kind: "dependency", source: "platform-postgres.host" },
        },
      ],
    });
  });

  it("refuses a line that is not an assignment, and a name a process cannot read", () => {
    expect(read("MODE\n").ok).toBe(false);
    expect(read("=lite\n").ok).toBe(false);
    expect(read("9LIVES=yes\n").ok).toBe(false);
    expect(read("A-B=yes\n").ok).toBe(false);
  });

  it("refuses a value that is half derived, and a placeholder that is not one", () => {
    expect(read("DSN=${secret:secret/data/p#u}/db\n").ok).toBe(false);
    expect(read("DSN=prefix-${secret:secret/data/p#u}\n").ok).toBe(false);
    expect(read("DSN=${unknown:x}\n").ok).toBe(false);
    expect(read("DSN=${secret}\n").ok).toBe(false);
    expect(read("DSN=${:x}\n").ok).toBe(false);
    expect(read("DSN=${secret:a}b}\n").ok).toBe(false);
    expect(read("DSN=${secret:}\n").ok).toBe(false);
    expect(read("DSN=\n").ok).toBe(false);
  });

  it("refuses a literal carrying a comment character, which is a comment anywhere", () => {
    expect(read("TOKEN=a#b\n").ok).toBe(false);
  });

  it("keeps an `=` inside a value, which a connection string needs", () => {
    const file = read("DSN=host=db;port=5432\n");

    expect(file.ok && file.value.entries[0]?.value).toStrictEqual({
      text: "host=db;port=5432",
    });
  });

  it("refuses one variable set twice in one file", () => {
    const file = read("MODE=lite\nMODE=full\n");

    expect(file.ok).toBe(false);
    expect(!file.ok && file.diagnostics[0]?.code).toBe(
      "E_SHARED_DECLARATION_DUPLICATED",
    );
  });

  it("names the Cluster Target an overlay carries, and none for base", () => {
    expect(readEnvFile({ path: "env/w/base.env", text: "" }).ok).toBe(true);
    const overlay = readEnvFile({
      path: "env/w/production.env",
      text: "A=1\n",
    });

    expect(overlay.ok && overlay.value.cluster).toBe("production");
  });
});

describe("the scope a directory names", () => {
  it("is the project, an Application or a Process, by the directory", () => {
    expect(scopeOf("platform/env/_project/base.env")).toStrictEqual({
      level: "project",
    });
    expect(
      scopeOf("platform/env/_applications/knowledge/base.env"),
    ).toStrictEqual({ level: "application", id: "knowledge" });
    expect(scopeOf("platform/env/knowledge-api/base.env")).toStrictEqual({
      level: "process",
      name: "knowledge-api",
    });
  });

  it("is nothing for a path that is not an env file in a scope", () => {
    expect(scopeOf("platform/knowledge.project.yml")).toBeUndefined();
    // A scope is a directory, so a file sitting directly in env/ names none,
    // and the Application scope has to say which Application.
    expect(scopeOf("platform/env/base.env")).toBeUndefined();
    expect(scopeOf("platform/env/_applications/base.env")).toBeUndefined();
    expect(scopeOf("platform/env/w/deep/base.env")).toBeUndefined();
    expect(readEnv([{ path: "notes.yml", text: "" }]).ok).toBe(false);
    // A file the scope accepts and the subset does not is refused by the subset.
    expect(readEnv([{ path: "env/w/base.env", text: "MODE\n" }]).ok).toBe(
      false,
    );
  });
});

describe("the worked knowledge example", () => {
  it("shares nine variables at the Application scope and none at the project", () => {
    const shared = sources().find(
      ({ path }) => path === "env/_applications/knowledge/base.env",
    );
    const file = shared === undefined ? undefined : readEnvFile(shared);

    expect(file?.ok === true && names(file.value)).toStrictEqual([
      "DB_HOST",
      "DB_PORT",
      "DB_NAME",
      "RABBITMQ_HOST",
      "RABBITMQ_PORT",
      "DB_USER",
      "DB_PASSWORD",
      "RABBITMQ_USER",
      "RABBITMQ_PASSWORD",
    ]);
  });

  it("gives each Process what it sets plus what its Application shares", () => {
    const parsed = parseProjectIntent(
      readFileSync(join(KNOWLEDGE, "knowledge.project.yml"), "utf8"),
      sources(),
    );
    const processes = parsed.ok
      ? lowerProject(parsed.value.project).applications[0]?.processes
      : undefined;
    const envOf = (name: string): string[] =>
      names(
        processes
          ?.find((process) => process.name === name)
          ?.env.find(({ cluster }) => cluster === undefined),
      );

    expect(envOf("knowledge-api")).toStrictEqual([
      "SPRING_PROFILES_ACTIVE",
      "KB_RECALL_DEFAULT_MODE",
      "KNOWLEDGE_MODE",
      "KNOWLEDGE_MCP_TOKENS_WORKSTATION",
      "DB_HOST",
      "DB_PORT",
      "DB_NAME",
      "RABBITMQ_HOST",
      "RABBITMQ_PORT",
      "DB_USER",
      "DB_PASSWORD",
      "RABBITMQ_USER",
      "RABBITMQ_PASSWORD",
    ]);
    // The worker holds fewer of its own and the same nine from above it.
    expect(envOf("knowledge-ingest-worker").slice(0, 3)).toStrictEqual([
      "INGEST_QUEUE",
      "INGEST_PREFETCH",
      "LOG_LEVEL",
    ]);
    expect(envOf("knowledge-ingest-worker")).toHaveLength(12);
  });
});

const DOCUMENT = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: p
owner: o
applications:
  - id: a
    processes:
      - name: w
        lifecycle: job
        image: w
        runtime: none
        placement: {memory: 64Mi, cpu: 10m}
        cutover: recreate
`;

/** The codes a document and the env files beside it are refused with. */
function refused(env: { path: string; text: string }[]): string[] {
  const result = parseProjectIntent(DOCUMENT, env);
  return result.ok ? [] : result.diagnostics.map(({ code }) => code);
}

describe("the scope a directory names, against the document beside it", () => {
  it("is refused where it names no Application and no Process", () => {
    expect(
      refused([{ path: "env/_applications/nope/base.env", text: "A=1\n" }]),
    ).toStrictEqual(["E_UNKNOWN_ENV_SCOPE"]);
    expect(
      refused([{ path: "env/nope/base.env", text: "A=1\n" }]),
    ).toStrictEqual(["E_UNKNOWN_ENV_SCOPE"]);
  });

  it("is accepted where it names one, at every level", () => {
    expect(
      refused([
        { path: "env/_project/base.env", text: "A=1\n" },
        { path: "env/_applications/a/base.env", text: "B=2\n" },
        { path: "env/w/base.env", text: "C=3\n" },
      ]),
    ).toStrictEqual([]);
  });

  it("refuses a narrower scope restating a variable unchanged", () => {
    expect(
      refused([
        { path: "env/_project/base.env", text: "A=1\n" },
        { path: "env/w/base.env", text: "A=1\n" },
      ]),
    ).toStrictEqual(["E_SHARED_DECLARATION_DUPLICATED"]);
    expect(
      refused([
        { path: "env/_project/base.env", text: "A=1\n" },
        { path: "env/_applications/a/base.env", text: "A=1\n" },
      ]),
    ).toStrictEqual(["E_SHARED_DECLARATION_DUPLICATED"]);
  });

  it("accepts a narrower scope setting it to something else, which is a replacement", () => {
    expect(
      refused([
        { path: "env/_project/base.env", text: "A=1\n" },
        { path: "env/w/base.env", text: "A=2\n" },
      ]),
    ).toStrictEqual([]);
    // The same name in a different Cluster Target is a different declaration.
    expect(
      refused([
        { path: "env/_project/base.env", text: "A=1\n" },
        { path: "env/w/production.env", text: "A=1\n" },
      ]),
    ).toStrictEqual([]);
  });
});
