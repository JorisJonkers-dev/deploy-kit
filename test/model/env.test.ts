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
import { checkIntentSet, parseProjectIntent } from "../../src/index.ts";

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

  it("names the Cluster Target by the last `.env`, not the first", () => {
    const overlay = readEnvFile({
      path: "env/w/staging.env.env",
      text: "A=1\n",
    });

    expect(overlay.ok && overlay.value.cluster).toBe("staging.env");
  });

  it("refuses a placeholder that opens and never closes", () => {
    const refused = read("U=${dependency:queue.host\n");

    expect(!refused.ok && refused.diagnostics[0]?.message).toBe(
      "the value of U is outside the subset",
    );
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
    expect(
      scopeOf("platform/env/_applications/one/deep/base.env"),
    ).toBeUndefined();
    // An `env/` directory, and a file that is one.
    expect(scopeOf("knowledge-api/base.env")).toBeUndefined();
    expect(scopeOf("platform/env/knowledge-api/base.yml")).toBeUndefined();
    expect(readEnv([{ path: "notes.yml", text: "" }]).ok).toBe(false);
    // A file the scope accepts and the subset does not is refused by the subset.
    expect(readEnv([{ path: "env/w/base.env", text: "MODE\n" }]).ok).toBe(
      false,
    );
  });
});

describe("the worked knowledge example", () => {
  it("shares nine variables at the project scope, the one both Applications hold", () => {
    const shared = sources().find(
      ({ path }) => path === "env/_project/base.env",
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

  it("gives each Process what it sets plus what its project shares", () => {
    const parsed = parseProjectIntent(
      readFileSync(join(KNOWLEDGE, "knowledge.project.yml"), "utf8"),
      sources(),
    );
    const processes = parsed.ok
      ? lowerProject(parsed.value.project).applications.flatMap(
          (application) => application.processes,
        )
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
        cutover: interrupted
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

  it("is refused where the file breaks the subset, before any rule reads it", () => {
    expect(refused([{ path: "env/w/base.env", text: "MODE\n" }])).toStrictEqual(
      ["schema"],
    );
  });

  it("carries the variables onto the effective Process the parser returns", () => {
    const parsed = parseProjectIntent(DOCUMENT, [
      { path: "env/_project/base.env", text: "A=1\n" },
    ]);

    expect(
      parsed.ok &&
        parsed.value.effective.applications[0]?.processes[0]?.env.flatMap(
          ({ entries }) => entries.map(({ name }) => name),
        ),
    ).toStrictEqual(["A"]);
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

describe("what an env refusal says, and which line it names", () => {
  const only = (text: string) => {
    const file = readEnvFile({ path: "platform/env/w/base.env", text });
    if (file.ok) throw new Error("the file was accepted");
    return file.diagnostics[0];
  };

  it("names the file and the line, counting from one", () => {
    const refusal = only("A=1\n# a comment\nMODE\n");

    expect(refusal?.code).toBe("schema");
    expect(refusal?.path).toBe("platform/env/w/base.env:3");
    expect(refusal?.message).toBe("a line is not a NAME=value assignment");
    expect(refusal?.hint).toBe(
      "Write NAME=value, one per line, where a value is a literal or one ${kind:source} placeholder.",
    );
  });

  it("names the variable whose value is outside the subset", () => {
    expect(only("DSN=${secret:x}/db\n")?.message).toBe(
      "the value of DSN is outside the subset",
    );
  });

  it("names the variable a file sets twice", () => {
    const refusal = only("MODE=lite\nMODE=full\n");

    expect(refusal?.code).toBe("E_SHARED_DECLARATION_DUPLICATED");
    expect(refusal?.path).toBe("platform/env/w/base.env:2");
    expect(refusal?.message).toBe("MODE is set twice in one file");
    expect(refusal?.hint).toBe(
      "Delete one: which line holds would take evaluating the file.",
    );
  });

  it("names a path that is no env file at all", () => {
    const read = readEnv([{ path: "notes.yml", text: "" }]);

    expect(read.ok).toBe(false);
    expect(!read.ok && read.diagnostics[0]?.message).toBe(
      "this path names no env scope directory",
    );
  });

  it("says what a scope naming nothing the document declares should name", () => {
    const result = parseProjectIntent(DOCUMENT, [
      { path: "env/nope/base.env", text: "A=1\n" },
    ]);

    expect(!result.ok && result.diagnostics[0]?.path).toBe("env/nope/base.env");
    expect(!result.ok && result.diagnostics[0]?.message).toBe(
      "this scope directory names nothing the project file declares",
    );
    expect(!result.ok && result.diagnostics[0]?.hint).toBe(
      "A directory is how a variable reaches a level: name an Application or a Process the project file declares.",
    );
  });

  it("says which variable a narrower scope restated", () => {
    const result = parseProjectIntent(DOCUMENT, [
      { path: "env/_project/base.env", text: "A=1\n" },
      { path: "env/w/base.env", text: "A=1\n" },
    ]);

    expect(!result.ok && result.diagnostics[0]?.path).toBe("env/w/base.env");
    expect(!result.ok && result.diagnostics[0]?.message).toBe(
      "A is set again, to the same value, by a scope above this one",
    );
    expect(!result.ok && result.diagnostics[0]?.hint).toBe(
      "Delete this line, or change it: a narrower scope replaces a wider one, and a restatement does nothing.",
    );
  });
});

describe("a set of authored files read together", () => {
  it("gives each project file the env files its own `env/` directory holds", () => {
    const set = checkIntentSet([
      { name: "platform/p.project.yml", text: DOCUMENT },
      { name: "platform/env/w/base.env", text: "MODE=lite\n" },
    ]);
    const process = set.ok ? set.value.projects[0]?.applications[0] : undefined;

    expect(
      process?.processes[0]?.env.flatMap(({ entries }) =>
        entries.map(({ name }) => name),
      ),
    ).toStrictEqual(["MODE"]);
  });

  it("refuses the set where an env file beside a project names no scope of it", () => {
    const set = checkIntentSet([
      { name: "platform/p.project.yml", text: DOCUMENT },
      { name: "platform/env/nope/base.env", text: "MODE=lite\n" },
    ]);

    expect(set.ok).toBe(false);
    expect(!set.ok && set.diagnostics.map(({ code }) => code)).toStrictEqual([
      "E_UNKNOWN_ENV_SCOPE",
    ]);
  });

  it("leaves an env file belonging to no project in the set unread", () => {
    const set = checkIntentSet([
      { name: "platform/p.project.yml", text: DOCUMENT },
      { name: "elsewhere/env/nope/base.env", text: "MODE=lite\n" },
    ]);

    expect(set.ok).toBe(true);
  });
});

describe("which scope reaches which Process", () => {
  const TWO_APPLICATIONS = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: p
owner: o
applications:
  - id: one
    processes:
      - name: one-api
        lifecycle: job
        image: w
        runtime: none
        placement: {memory: 64Mi, cpu: 10m}
        cutover: interrupted
  - id: two
    processes:
      - name: two-api
        lifecycle: job
        image: w
        runtime: none
        placement: {memory: 64Mi, cpu: 10m}
        cutover: interrupted
`;

  it("gives a Process the project scope's variables", () => {
    const parsed = parseProjectIntent(DOCUMENT, [
      { path: "env/_project/base.env", text: "SHARED=1\n" },
    ]);
    const process = parsed.ok
      ? lowerProject(parsed.value.project).applications[0]?.processes[0]
      : undefined;

    expect(
      process?.env.flatMap(({ entries }) => entries.map(({ name }) => name)),
    ).toStrictEqual(["SHARED"]);
  });

  it("does not put one Application's scope above another Application's Process", () => {
    const refused = (path: string) => {
      const result = parseProjectIntent(TWO_APPLICATIONS, [
        { path: "env/_applications/one/base.env", text: "MODE=lite\n" },
        { path, text: "MODE=lite\n" },
      ]);
      return result.ok ? [] : result.diagnostics.map(({ code }) => code);
    };

    // `one`'s scope is above `one-api` and above nothing else.
    expect(refused("env/one-api/base.env")).toStrictEqual([
      "E_SHARED_DECLARATION_DUPLICATED",
    ]);
    expect(refused("env/two-api/base.env")).toStrictEqual([]);
    expect(refused("env/_applications/two/base.env")).toStrictEqual([]);
  });
});

describe("the dotenv subset, at its edges", () => {
  it("reads a literal that ends in a brace, which opens no placeholder", () => {
    const file = readEnvFile({ path: "env/w/base.env", text: "JSON=a}\n" });

    expect(file.ok && file.value.entries[0]?.value).toStrictEqual({
      text: "a}",
    });
  });

  it("reads a placeholder whose source holds a colon", () => {
    const file = readEnvFile({
      path: "env/w/base.env",
      text: "U=${dependency:q.host:port}\n",
    });

    expect(file.ok && file.value.entries[0]?.value).toStrictEqual({
      kind: "dependency",
      source: "q.host:port",
    });
  });

  it("reads a line the author indented, and one padded around the `=`", () => {
    const file = readEnvFile({
      path: "env/w/base.env",
      text: "   MODE=lite\n",
    });

    expect(file.ok && file.value.entries).toStrictEqual([
      { name: "MODE", value: { text: "lite" } },
    ]);
  });

  it("names a Cluster Target only where the file is not `base`", () => {
    const base = readEnvFile({ path: "env/w/base.env", text: "A=1\n" });

    expect(base.ok && Object.keys(base.value)).toStrictEqual(["entries"]);
  });
});

describe("which scope is above which Process", () => {
  const codes = (
    document: string,
    env: readonly { path: string; text: string }[],
  ): string[] => {
    const result = parseProjectIntent(document, env);
    return result.ok ? [] : result.diagnostics.map(({ code }) => code);
  };

  const ONE_EACH = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: p
owner: o
applications:
  - id: one
    processes:
      - name: one-api
        lifecycle: job
        image: w
        runtime: none
        placement: {memory: 64Mi, cpu: 10m}
        cutover: interrupted
  - id: two
    processes:
      - name: two-api
        lifecycle: job
        image: w
        runtime: none
        placement: {memory: 64Mi, cpu: 10m}
        cutover: interrupted
`;

  it("reads one Application's scope as above that Application's Processes only", () => {
    expect(
      codes(ONE_EACH, [
        { path: "env/_applications/two/base.env", text: "MODE=lite\n" },
        { path: "env/one-api/base.env", text: "MODE=lite\n" },
      ]),
    ).toStrictEqual([]);
    expect(
      codes(ONE_EACH, [
        { path: "env/_applications/one/base.env", text: "MODE=lite\n" },
        { path: "env/one-api/base.env", text: "MODE=lite\n" },
      ]),
    ).toStrictEqual(["E_SHARED_DECLARATION_DUPLICATED"]);
  });

  it("reads a Process scope against the levels above that Process alone", () => {
    expect(
      codes(ONE_EACH, [
        { path: "env/_project/base.env", text: "MODE=lite\n" },
        { path: "env/one-api/base.env", text: "MODE=lite\n" },
      ]),
    ).toStrictEqual(["E_SHARED_DECLARATION_DUPLICATED"]);
  });
});
