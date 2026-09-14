// The intent gate, made to fail.
//
// A gate that has only ever run against a clean tree is untested: nothing
// proves it would fail (docs/architecture.md#gates). Every branch that can
// refuse a tree is exercised here against a fixture tree of its own, and the
// two that a green repository can never reach, a document that stops parsing
// and a refusal fixture that stops isolating its defect, are the two this gate
// exists for.
//
// REQ-015 (docs/requirements.md): every Service Intent document is parsed
// against one declared metamodel.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  expectationOf,
  intentEnvFiles,
  lintIntent,
  main,
  withoutExpectation,
  writeJsonSchema,
} from "../scripts/lint-intent.ts";
import { serviceIntentJsonSchemaText } from "../src/wire/service-intent/json-schema.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

const DOCUMENT = `apiVersion: intent.jorisjonkers.dev/v1
kind: Domain
schemaVersion: 1.0.0
domain: fixture
owner: joris
services:
  - id: fixture
    workloads:
      - name: fixture-api
        lifecycle: service
        image: fixture-api
        runtime: node
        placement: {memory: 128Mi, cpu: 25m}
        probes: none
        startupBudget: 20s
        cutover: rolling
`;

/** A tree whose worked examples hold `files`, relative to spec/v1/examples. */
function tree(
  files: Readonly<Record<string, string>> = { "a/a.domain.yml": DOCUMENT },
  schema: string | null = serviceIntentJsonSchemaText(),
): string {
  const root = mkdtempSync(join(temporary(), "intent-lint-"));
  const examples = join(root, "spec", "v1", "examples");
  mkdirSync(examples, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(examples, rel)), { recursive: true });
    writeFileSync(join(examples, rel), content);
  }
  if (schema !== null) {
    const target = join(root, "spec", "v1", "schemas");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "service-intent.schema.json"), schema);
  }
  return root;
}

describe("the intent lint", () => {
  it("passes a tree whose documents conform", () => {
    expect(lintIntent(tree()).errors).toStrictEqual([]);
  });

  it("fails loudly when there is no examples directory at all", () => {
    const empty = mkdtempSync(join(temporary(), "empty-"));
    expect(lintIntent(empty).errors[0]).toMatch(/no Service Intent documents/);
  });

  it("fails when a document that should conform no longer does", () => {
    const { errors } = lintIntent(
      tree({
        "a/a.domain.yml": DOCUMENT.replace("runtime: node", "runtime: go"),
      }),
    );
    expect(errors[0]).toMatch(/expected accepted, got schema/);
    expect(errors[1]).toMatch(/services\[0\]\.workloads\[0\]\.runtime/);
  });

  it("fails when a refusal fixture stops emitting the code it names", () => {
    const { errors } = lintIntent(
      tree({
        "refuse/r.domain.yml": DOCUMENT.replace(
          "domain: fixture",
          "expect: E_CUTOVER_UNHONOURABLE\ndomain: fixture",
        ),
      }),
    );
    expect(errors[0]).toMatch(/expected E_CUTOVER_UNHONOURABLE, got accepted/);
  });

  it("fails when a refusal fixture stops isolating one defect", () => {
    // Two codes at once: the fixture no longer proves which rule refused it.
    const both = DOCUMENT.replace(
      "domain: fixture",
      "expect: E_ENGINE_WITHOUT_DURABILITY\ndomain: fixture",
    )
      .replace("runtime: node", "runtime: node\n        engine: valkey")
      .replace("provides", "provides")
      .replace(
        "        cutover: rolling\n",
        "        cutover: rolling\n        provides: {http: 80}\n" +
          "        probes: {readiness: {tcp: 80}}\n",
      )
      .replace("        probes: none\n", "");
    const { errors } = lintIntent(tree({ "refuse/r.domain.yml": both }));
    expect(errors[0]).toMatch(/got .+ \+ .+/);
  });

  it("fails when the JSON Schema was never committed", () => {
    const { errors } = lintIntent(tree(undefined, null));
    expect(errors[0]).toMatch(/not committed/);
  });

  it("fails when the committed JSON Schema has drifted from the metamodel", () => {
    const { errors } = lintIntent(tree(undefined, "{}\n"));
    expect(errors[0]).toMatch(/differs from what the metamodel generates/);
  });

  it("fails when an env file carries a placeholder outside the grammar", () => {
    const { errors } = lintIntent(
      tree({
        "a/a.domain.yml": DOCUMENT,
        "a/env/fixture-api/base.env": "A=${exposure:auth.public#url:/login}\n",
      }),
    );
    expect(errors[0]).toMatch(/does not address an? exposure/);
  });

  it("reads intent from the examples and never from a rendered tree", () => {
    const root = tree({
      "a/a.domain.yml": DOCUMENT,
      // A rendered Deliverable is not Service Intent, and neither is the
      // Platform document: #41 gives that one its own metamodel.
      "a/rendered/x.yml": "kind: Deployment\n",
      "platform/platform.intent.yml": "kind: Platform\n",
      "workflows/compose.yml": "name: compose\n",
    });
    expect(lintIntent(root).documents).toBe(1);
    expect(intentEnvFiles(root)).toStrictEqual([]);
  });
});

describe("the expect header", () => {
  it("reads the outcome before the comma, and defaults to accepted", () => {
    expect(expectationOf("expect: schema, alertClass is not a member\n")).toBe(
      "schema",
    );
    expect(expectationOf("expect: E_CUTOVER_UNHONOURABLE\n")).toBe(
      "E_CUTOVER_UNHONOURABLE",
    );
    expect(expectationOf("domain: a\n")).toBe("accepted");
  });

  it("is removed before the document is parsed, leaving every other line put", () => {
    const stripped = withoutExpectation("a: 1\nexpect: schema\nb: 2\n");
    expect(stripped.split("\n")).toHaveLength(4);
    expect(stripped).not.toMatch(/expect:/);
  });
});

describe("the command", () => {
  it("prints what it checked and passes on a clean tree", () => {
    const output = collect();
    expect(main([tree()], output)).toBe(0);
    expect(output.text()).toMatch(/1 Service Intent document\(s\)/);
  });

  it("prints every failure and returns non-zero", () => {
    const output = collect();
    const root = tree(undefined, "{}\n");
    expect(main([root], output)).toBe(1);
    expect(output.text()).toMatch(/differs from what the metamodel generates/);
  });

  it("regenerates the committed schema under --write", () => {
    const root = tree(undefined, "{}\n");
    const output = collect();
    expect(main(["--write", root], output)).toBe(0);
    expect(output.text()).toMatch(/wrote spec\/v1\/schemas/);
    expect(
      readFileSync(
        join(root, "spec/v1/schemas/service-intent.schema.json"),
        "utf8",
      ),
    ).toBe(serviceIntentJsonSchemaText());
  });

  it("creates the schemas directory when it is not there yet", () => {
    const root = tree(undefined, null);
    rmSync(join(root, "spec", "v1", "schemas"), {
      recursive: true,
      force: true,
    });
    expect(writeJsonSchema(root)).toMatch(/service-intent\.schema\.json$/);
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "lint-intent.ts"), tree()],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/intent lint: 1 Service Intent document\(s\)/);
  });

  it("exits non-zero when Node starts it against a tree that fails", () => {
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "lint-intent.ts"), tree(undefined, "{}\n")],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(1);
  });
});
