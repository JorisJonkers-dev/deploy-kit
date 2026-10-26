// REQ-103 (docs/requirements.md): `deploy-kit generate identity` writes an
// Application's App Roles, Client id and Principal contract version in each of
// its five languages, byte for byte the worked example's committed files, from
// the project file and the Platform document alone; `--check` fails a stale or
// missing file; and a project with no client, a platform with no contract, or a
// call that names no one Application gets no file and says why.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main, USAGE_TEXT, type World } from "../../src/cli/main.ts";
import { temporary } from "../setup.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);
const example = (path: string): string => join(EXAMPLES, path);
const WORLD: World = {
  now: () => "2026-10-26T09:00:00.000Z",
  toolkitVersion: "0.32.0",
};
const run = (...argv: string[]) => main(argv, WORLD);

const PLATFORM = example("platform/platform.intent.yml");
const IDENTITY = example("identity/identity.project.yml");
const GRAFANA = ["--application", "grafana", PLATFORM, IDENTITY] as const;

/** A scratch directory of the test's own. */
const scratch = (): string => mkdtempSync(join(temporary(), "identity-"));

/** A file written into a scratch directory, by name. */
function file(name: string, text: string): string {
  const path = join(scratch(), name);
  writeFileSync(path, text);
  return path;
}

describe("deploy-kit generate identity", () => {
  it.each([
    ["go", "go"],
    ["kotlin", "kt"],
    ["typescript", "ts"],
    ["python", "py"],
    ["rust", "rs"],
  ])(
    "writes grafana's %s file byte for byte the committed one",
    (lang, ext) => {
      const outcome = run(
        "generate",
        "identity",
        "--lang",
        lang,
        "--package",
        "dev.jorisjonkers.grafana",
        ...GRAFANA,
      );

      expect(outcome).toStrictEqual({
        code: 0,
        stdout: readFileSync(
          example(`identity/generated/grafana.${ext}`),
          "utf8",
        ),
        stderr: "",
      });
    },
  );

  it("writes the file to --out, and --check then finds it current", () => {
    const out = join(scratch(), "identity.go");

    expect(
      run("generate", "identity", "--lang", "go", "--out", out, ...GRAFANA),
    ).toStrictEqual({
      code: 0,
      stdout: `wrote ${out}\n`,
      stderr: "",
    });
    expect(readFileSync(out, "utf8")).toBe(
      readFileSync(example("identity/generated/grafana.go"), "utf8"),
    );
    expect(
      run(
        "generate",
        "identity",
        "--lang",
        "go",
        "--out",
        out,
        "--check",
        ...GRAFANA,
      ),
    ).toStrictEqual({ code: 0, stdout: `${out} is current\n`, stderr: "" });
    // As JSON, an accepted run says nothing went wrong.
    expect(
      run(
        "generate",
        "identity",
        "--lang",
        "go",
        "--out",
        out,
        "--check",
        "--json",
        ...GRAFANA,
      ).stdout,
    ).toBe("[]\n");
  });

  it("fails --check on a stale file and on a missing one, and writes neither", () => {
    const stale = file("identity.go", "package identity\n");
    const missing = join(scratch(), "absent.go");

    expect(
      run(
        "generate",
        "identity",
        "--lang",
        "go",
        "--out",
        stale,
        "--check",
        ...GRAFANA,
      ),
    ).toStrictEqual({
      code: 1,
      stdout: "",
      stderr: `${stale} is stale: run deploy-kit generate identity without --check to write it\n`,
    });
    expect(readFileSync(stale, "utf8")).toBe("package identity\n");
    expect(
      run(
        "generate",
        "identity",
        "--lang",
        "go",
        "--out",
        missing,
        "--check",
        ...GRAFANA,
      ).stderr,
    ).toBe(
      `${missing} is missing: run deploy-kit generate identity without --check to write it\n`,
    );
    expect(existsSync(missing)).toBe(false);
  });

  it("gives no file, and says why, where it cannot name one Application's client", () => {
    const unwritable = (...argv: string[]) => {
      const outcome = run("generate", "identity", "--lang", "go", ...argv);
      expect(outcome.code).toBe(1);
      expect(outcome.stdout).toBe("");
      return outcome.stderr;
    };

    // The identity example declares three Clients.
    expect(unwritable(PLATFORM, IDENTITY)).toBe(
      "grafana, portal, whoami each declare a client: name one with --application\n",
    );
    expect(unwritable("--application", "identity", PLATFORM, IDENTITY)).toBe(
      "identity declares no client, so there are no App Roles to generate\n",
    );
    expect(unwritable(PLATFORM, example("minimal/notes.project.yml"))).toBe(
      "no Application declares a client, so there are no App Roles to generate\n",
    );
    expect(unwritable(IDENTITY)).toBe(
      "generate identity needs the Platform document, whose sign-in provider names the Principal contract version\n",
    );
    const uncontracted = file(
      "platform.intent.yml",
      readFileSync(PLATFORM, "utf8").replace(/\n {2}contract: "1\.2"\n/, "\n"),
    );
    expect(unwritable("--application", "grafana", uncontracted, IDENTITY)).toBe(
      "the Platform document's sign-in provider names no contract version: set signIn.contract\n",
    );
    const signless = file(
      "platform.intent.yml",
      readFileSync(PLATFORM, "utf8").replace(/\nsignIn:\n( {2}.*\n)+/, "\n"),
    );
    expect(unwritable("--application", "grafana", signless, IDENTITY)).toBe(
      "the Platform document's sign-in provider names no contract version: set signIn.contract\n",
    );
    expect(
      unwritable("--application", "grafana", PLATFORM, PLATFORM, IDENTITY),
    ).toBe(
      "generate identity reads one Platform document, and was given several\n",
    );
    expect(
      run("generate", "identity", "--lang", "kotlin", ...GRAFANA).stderr,
    ).toBe("a Kotlin identity file needs --package\n");
  });

  it("writes a Client that declares no roles with user alone", () => {
    const outcome = run(
      "generate",
      "identity",
      "--lang",
      "go",
      "--application",
      "portal",
      PLATFORM,
      IDENTITY,
    );

    expect(outcome.code).toBe(0);
    expect(outcome.stdout).toContain('const ClientID = "portal"');
    expect(outcome.stdout).toContain('\tRoleUser Role = "user"\n)\n');
    expect(outcome.stdout).toContain("var Roles = []Role{RoleUser}\n");
  });

  it("reads a flag given no value as not given", () => {
    // parseArgs reads a string option with nothing after it as a bare flag.
    expect(
      run(
        "generate",
        "identity",
        "--lang",
        "go",
        PLATFORM,
        IDENTITY,
        "--application",
      ).stderr,
    ).toBe(
      "grafana, portal, whoami each declare a client: name one with --application\n",
    );
    expect(
      run(
        "generate",
        "identity",
        "--lang",
        "kotlin",
        "--application",
        "grafana",
        PLATFORM,
        IDENTITY,
        "--package",
      ).stderr,
    ).toBe("a Kotlin identity file needs --package\n");
    expect(run("generate", "identity", IDENTITY, "--lang").code).toBe(2);
  });

  it("refuses a document that does not check, as validate does, and names it", () => {
    const broken = file(
      "identity.project.yml",
      readFileSync(IDENTITY, "utf8").replace(
        "roles: [viewer, editor, admin]",
        "roles: [viewer, viewer]",
      ),
    );
    const outcome = run(
      "generate",
      "identity",
      "--lang",
      "go",
      "--json",
      "--application",
      "grafana",
      PLATFORM,
      broken,
    );

    expect(outcome.code).toBe(1);
    expect(JSON.parse(outcome.stdout)).toContainEqual(
      expect.objectContaining({
        code: "E_DUPLICATE_APP_ROLE",
        document: broken,
      }),
    );
    const malformed = file(
      "platform.intent.yml",
      readFileSync(PLATFORM, "utf8").replace(
        'contract: "1.2"',
        'contract: "1.2.0"',
      ),
    );
    const platformRefused = run(
      "generate",
      "identity",
      "--lang",
      "go",
      "--json",
      "--application",
      "grafana",
      malformed,
      IDENTITY,
    );
    expect(platformRefused.code).toBe(1);
    // Each refusal names the document it is in: here the Platform document.
    const refusals = JSON.parse(platformRefused.stdout) as {
      document: string;
    }[];
    expect(refusals.length).toBeGreaterThan(0);
    for (const refusal of refusals) expect(refusal.document).toBe(malformed);
  });

  it.each([
    [["generate"], "generate: the one thing it generates is identity"],
    [
      ["generate", "roles", "--lang", "go", IDENTITY],
      "generate: the one thing it generates is identity",
    ],
    [
      ["generate", "identity", IDENTITY],
      "generate identity: --lang is one of go, kotlin, typescript, python, rust",
    ],
    [
      ["generate", "identity", "--lang", "java", IDENTITY],
      "generate identity: --lang is one of go, kotlin, typescript, python, rust",
    ],
    [
      ["generate", "identity", "--lang", "go"],
      "generate identity: name the project file and the Platform document",
    ],
    [
      ["generate", "identity", "--lang", "go", "--check", IDENTITY],
      "generate identity: --check compares against --out",
    ],
  ])("is a wrong call for %j", (argv, message) => {
    expect(run(...argv)).toStrictEqual({
      code: 2,
      stdout: "",
      stderr: `${message}\n${USAGE_TEXT}`,
    });
  });
});
