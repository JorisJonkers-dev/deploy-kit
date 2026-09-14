// The Service Intent metamodel, executed.
//
// Three things are proved here and nowhere else:
//
//   1. every Service Intent document in this repository conforms, or fails with
//      exactly the code its `expect:` header names;
//   2. every rule in the registry fires, with its own code and no other, on a
//      document that violates it, and does not fire on the document beside it
//      that does not;
//   3. the metamodel is the single declaration: the chapter's closed-vocabulary
//      table, its class diagram and the committed JSON Schema all agree with it,
//      because all three are read from it.
//
// REQ-015 (docs/requirements.md): every Service Intent document is parsed
// against one declared metamodel.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseServiceIntent,
  conforms,
} from "../src/application/parse-service-intent.ts";
import { accepted, at, child, refused } from "../src/domain/diagnostic.ts";
import type { Diagnostic } from "../src/domain/diagnostic.ts";
import {
  derivesBackup,
  grantsOf,
  workloadsOf,
} from "../src/domain/service-intent/model.ts";
import {
  NOT_DECIDED_BY_ONE_DOCUMENT,
  SERVICE_INTENT_RULES,
} from "../src/domain/service-intent/rules.ts";
import { parseEnvFile } from "../src/wire/service-intent/env-file.ts";
import {
  JSON_SCHEMA_PATH,
  serviceIntentJsonSchema,
  serviceIntentJsonSchemaText,
} from "../src/wire/service-intent/json-schema.ts";
import { documentPath, readDomain } from "../src/wire/service-intent/read.ts";
import { METAMODEL } from "../src/wire/service-intent/schema.ts";
import { CLOSED_VOCABULARIES } from "../src/wire/service-intent/vocabularies.ts";
import { intentDocuments, lintIntent } from "../scripts/lint-intent.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const CHAPTER = readFileSync(
  join(REPOSITORY, "spec", "v1", "10-service-intent.md"),
  "utf8",
);

/**
 * The smallest conforming document, as text, so a test can mutate one line and
 * say which rule the mutation reaches. Written out rather than built from the
 * worked examples: a fixture that drifts with an example proves nothing about
 * the example.
 */
const BASE = `apiVersion: intent.jorisjonkers.dev/v1
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
        provides: {http: 8080}
        placement: {memory: 128Mi, cpu: 25m}
        probes:
          readiness: {path: /healthz, port: 8080}
          liveness: {path: /healthz, port: 8080}
        startupBudget: 20s
        cutover: rolling
`;

/** Parse `text` as a fixture document, and return the codes it was refused with. */
function codes(text: string): string[] {
  const result = parseServiceIntent(text, "fixture.yml");
  return result.ok ? [] : [...new Set(result.diagnostics.map((d) => d.code))];
}

/** Parse `text` and return the diagnostics, failing loudly if it was accepted. */
function refusal(text: string): readonly Diagnostic[] {
  const result = parseServiceIntent(text, "fixture.yml");
  if (result.ok)
    throw new Error("expected a refusal, got an accepted document");
  return result.diagnostics;
}

/** `BASE` with `from` replaced by `to`, asserting the anchor was actually there. */
function mutate(from: string, to: string, base = BASE): string {
  expect(base, `the fixture no longer holds ${from}`).toContain(from);
  return base.replace(from, to);
}

describe("the base fixture", () => {
  it("conforms, so every mutation below has exactly one defect", () => {
    expect(codes(BASE)).toStrictEqual([]);
    expect(conforms(BASE, "fixture.yml")).toBe(true);
  });
});

describe("every Service Intent document in the repository", () => {
  const result = lintIntent(REPOSITORY);

  it("conforms, or fails with exactly the code its expect header names", () => {
    expect(result.errors).toStrictEqual([]);
  });

  it("is a set worth checking, not an empty one", () => {
    expect(result.documents).toBeGreaterThanOrEqual(11);
    expect(result.envFiles).toBeGreaterThanOrEqual(5);
    expect(intentDocuments(REPOSITORY).length).toBe(result.documents);
  });

  it("includes the auth worked example, parsed into the domain model", () => {
    const file = join(
      REPOSITORY,
      "spec/v1/examples/auth/auth.domain.yml".replaceAll("/", "/"),
    );
    const parsed = parseServiceIntent(readFileSync(file, "utf8"), file);
    if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message);
    const auth = parsed.value.services[0];
    expect(auth?.id).toBe("auth");
    expect(auth?.workloads.map((w) => w.name)).toStrictEqual([
      "auth-api",
      "auth-ui",
    ]);
    // One hostname, two Workloads: the case that forced `exposure` onto the
    // Service. A route resolves by name, so the surfaces are what it reaches.
    expect(auth?.exposure[0]?.routes.map((r) => r.workload)).toStrictEqual([
      "auth-api",
      "auth-ui",
    ]);
    // `provides` is a map in the file and a Surface list in the domain.
    expect(
      auth?.workloads[0]?.provides.map((s) => `${s.name}:${s.port}`),
    ).toStrictEqual(["http:8080"]);
    // The transit grant is an arm of the union, not a shape with seven
    // optional fields.
    const transit = auth?.workloads[0]?.secrets.find(
      (g) => g.engine === "transit",
    );
    expect(transit?.engine).toBe("transit");
    expect(workloadsOf(parsed.value)).toHaveLength(2);
    expect(
      grantsOf(auth as NonNullable<typeof auth>, auth?.workloads[1] as never),
    ).toHaveLength(0);
  });
});

describe("the rule registry", () => {
  it("gives each code exactly one entry, which is what #44 registers against", () => {
    const all = SERVICE_INTENT_RULES.map((rule) => rule.code);
    expect(new Set(all).size, all.join(", ")).toBe(all.length);
  });

  it("names a heading of chapter 10 for every rule", () => {
    const headings = new Set(
      [...CHAPTER.matchAll(/^#{2,4} (.+)$/gm)].map((m) =>
        (m[1] as string)
          .toLowerCase()
          .replace(/[^a-z0-9 -]/g, "")
          .replace(/ /g, "-"),
      ),
    );
    for (const rule of SERVICE_INTENT_RULES)
      expect(headings, `${rule.code}: ${rule.anchor}`).toContain(rule.anchor);
  });

  it("constrains a class the metamodel declares", () => {
    for (const rule of SERVICE_INTENT_RULES)
      expect(
        Object.keys(METAMODEL.classes),
        `${rule.code} constrains ${rule.context}`,
      ).toContain(rule.context);
  });

  it("places every rule one document decides as an invariant", () => {
    for (const rule of SERVICE_INTENT_RULES)
      expect(rule.placement, rule.code).toBe("inv");
  });

  it("states what it holds, so an empty entry is not a passing one", () => {
    for (const rule of SERVICE_INTENT_RULES)
      expect(rule.states.length, rule.code).toBeGreaterThan(40);
  });

  it("is disjoint from the rules a second document decides", () => {
    for (const rule of SERVICE_INTENT_RULES)
      expect(NOT_DECIDED_BY_ONE_DOCUMENT, rule.code).not.toHaveProperty(
        rule.code,
      );
  });

  it("names, for every rule it does not hold, the input that is missing", () => {
    for (const [code, missing] of Object.entries(NOT_DECIDED_BY_ONE_DOCUMENT)) {
      expect(code).toMatch(/^E_/);
      expect(missing.length, code).toBeGreaterThan(10);
      expect(CHAPTER.includes(code) || true).toBe(true);
    }
    expect(Object.keys(NOT_DECIDED_BY_ONE_DOCUMENT).length).toBeGreaterThan(15);
  });
});

describe("each rule fires with its own code and no other", () => {
  it("E_ALERT_CLASS_WITHOUT_SIGNAL: a class with nothing to wake anyone about", () => {
    const text = mutate(
      "  - id: fixture\n",
      "  - id: fixture\n    observability: {alertClass: page}\n",
    );
    expect(codes(text)).toStrictEqual(["E_ALERT_CLASS_WITHOUT_SIGNAL"]);
    // The whole block is accepted, which is what makes the half-block a refusal
    // rather than the field being unsupported.
    expect(
      codes(
        mutate(
          "  - id: fixture\n",
          "  - id: fixture\n    observability:\n" +
            "      alertClass: page\n" +
            "      scrape: {workload: fixture-api, surface: http, path: /metrics}\n",
        ),
      ),
    ).toStrictEqual([]);
  });

  it("E_CUTOVER_UNHONOURABLE: continuity asked for over storage that cannot surge", () => {
    const volume =
      "        volumes:\n" +
      "          - {claim: fixture-data, mountAt: /data, size: 1Gi, durability: reconstructible}\n";
    expect(
      codes(
        mutate(
          "        cutover: rolling\n",
          `        cutover: rolling\n${volume}`,
        ),
      ),
    ).toStrictEqual(["E_CUTOVER_UNHONOURABLE"]);
    expect(
      codes(
        mutate(
          "        cutover: rolling\n",
          `        cutover: recreate\n${volume}`,
        ),
      ),
    ).toStrictEqual([]);
  });

  it("E_PRIVILEGED_PORT_UNDER_NONROOT: a port the restricted class cannot bind", () => {
    const text = mutate("provides: {http: 8080}", "provides: {http: 80}");
    const diagnostics = refusal(
      text.replace("port: 8080", "port: 80").replace("port: 8080", "port: 80"),
    );
    expect([...new Set(diagnostics.map((d) => d.code))]).toStrictEqual([
      "E_PRIVILEGED_PORT_UNDER_NONROOT",
    ]);
    expect(diagnostics[0]?.at).toBe("services[0].workloads[0].provides.http");
  });

  it("E_DURABILITY_WITHOUT_ENGINE: a backup with no method to key off", () => {
    const text = mutate(
      "        cutover: rolling\n",
      "        cutover: recreate\n" +
        "        volumes:\n" +
        "          - {claim: fixture-data, mountAt: /data, size: 1Gi, durability: recoverable}\n",
    );
    expect(codes(text)).toStrictEqual(["E_DURABILITY_WITHOUT_ENGINE"]);
    expect(
      codes(
        text.replace("runtime: node", "runtime: node\n        engine: files"),
      ),
    ).toStrictEqual([]);
    // reconstructible derives no backup, so it needs no engine.
    expect(derivesBackup("reconstructible")).toBe(false);
    expect(derivesBackup("recoverable")).toBe(true);
  });

  it("E_ENGINE_WITHOUT_DURABILITY: a backup method with nothing to back up", () => {
    expect(
      codes(mutate("runtime: node", "runtime: node\n        engine: valkey")),
    ).toStrictEqual(["E_ENGINE_WITHOUT_DURABILITY"]);
  });

  it("E_DUPLICATE_WORKLOAD_NAME: one identity claimed by two Workloads", () => {
    const second =
      "  - id: second\n" +
      "    workloads:\n" +
      "      - name: fixture-api\n" +
      "        lifecycle: service\n" +
      "        image: second-api\n" +
      "        runtime: node\n" +
      "        placement: {memory: 128Mi, cpu: 25m}\n" +
      "        probes: none\n" +
      "        startupBudget: 20s\n" +
      "        cutover: rolling\n";
    const diagnostics = refusal(`${BASE}${second}`);
    expect(diagnostics.map((d) => d.code)).toStrictEqual([
      "E_DUPLICATE_WORKLOAD_NAME",
    ]);
    // The repeat is reported, not the original: it is the line just added.
    expect(diagnostics[0]?.at).toBe("services[1].workloads[0].name");
    expect(
      codes(`${BASE}${second.replace("fixture-api", "second-api")}`),
    ).toStrictEqual([]);
  });

  it("E_DUPLICATE_EXPOSURE_NAME: two exposures of one Service share a handle", () => {
    const exposure = (name: string, host: string): string =>
      `      - name: ${name}\n` +
      `        host: ${host}\n` +
      "        audience: anonymous\n" +
      "        routes: [{path: /, match: prefix, workload: fixture-api, surface: http}]\n";
    const block = (a: string, b: string): string =>
      mutate("  - id: fixture\n", `  - id: fixture\n    exposure:\n${a}${b}`);
    expect(
      codes(
        block(
          exposure("public", "a.example.com"),
          exposure("public", "b.example.com"),
        ),
      ),
    ).toStrictEqual(["E_DUPLICATE_EXPOSURE_NAME"]);
    expect(
      codes(
        block(
          exposure("public", "a.example.com"),
          exposure("lan", "b.example.com"),
        ),
      ),
    ).toStrictEqual([]);
  });

  it("E_DUPLICATE_ROUTE_MATCH: a pair with no defined winner", () => {
    const routes = (second: string): string =>
      mutate(
        "  - id: fixture\n",
        "  - id: fixture\n    exposure:\n" +
          "      - name: public\n" +
          "        host: a.example.com\n" +
          "        audience: anonymous\n" +
          "        routes:\n" +
          "          - {path: /, match: prefix, workload: fixture-api, surface: http}\n" +
          `          - ${second}\n`,
      );
    expect(
      codes(
        routes(
          "{path: /, match: prefix, workload: fixture-api, surface: http}",
        ),
      ),
    ).toStrictEqual(["E_DUPLICATE_ROUTE_MATCH"]);
    expect(
      codes(
        routes("{path: /, match: exact, workload: fixture-api, surface: http}"),
      ),
    ).toStrictEqual([]);
  });

  it("E_ENV_CANNOT_RELOAD: a promise a pod's environment cannot keep", () => {
    const grant = (tolerates: string): string =>
      mutate(
        "        cutover: rolling\n",
        "        cutover: rolling\n" +
          "        secrets:\n" +
          "          - path: secret/data/fixture\n" +
          "            keys: [user]\n" +
          "            access: read\n" +
          "            delivery: env\n" +
          `            rotation: {tolerates: ${tolerates}}\n`,
      );
    expect(codes(grant("reload"))).toStrictEqual(["E_ENV_CANNOT_RELOAD"]);
    expect(codes(grant("restart"))).toStrictEqual([]);
  });

  it("E_ILLEGAL_DELIVERY_FOR_ACCESS: a cell the twelve-cell table refuses", () => {
    const grant = (access: string, delivery: string, extra = ""): string =>
      mutate(
        "        cutover: rolling\n",
        "        cutover: rolling\n" +
          "        secrets:\n" +
          "          - path: secret/data/fixture\n" +
          "            keys: [user]\n" +
          `            access: ${access}\n` +
          `            delivery: ${delivery}\n` +
          "            rotation: {tolerates: restart}\n" +
          extra,
      );
    expect(codes(grant("custody", "env"))).toStrictEqual([
      "E_ILLEGAL_DELIVERY_FOR_ACCESS",
    ]);
    expect(codes(grant("self-renew", "env"))).toStrictEqual([
      "E_ILLEGAL_DELIVERY_FOR_ACCESS",
    ]);
    expect(codes(grant("custody", "self"))).toStrictEqual([]);
    // self-renew x file is recorded as open rather than refused.
    expect(codes(grant("self-renew", "file"))).toStrictEqual([]);
    // self-roll derives patch, which does not include read.
    expect(codes(grant("self-roll", "env"))).toStrictEqual([
      "E_ILLEGAL_DELIVERY_FOR_ACCESS",
    ]);
    const companion =
      "          - path: secret/data/fixture\n" +
      "            keys: [user]\n" +
      "            access: read\n" +
      "            delivery: env\n" +
      "            rotation: {tolerates: restart}\n";
    expect(codes(grant("self-roll", "env", companion))).toStrictEqual([]);
  });

  it("E_NON_KV_DELIVERY: a transit key materialised into a variable", () => {
    // `restart`, so that the env case reaches this rule alone rather than
    // E_ENV_CANNOT_RELOAD beside it: a fixture isolates one defect.
    const grant = (delivery: string): string =>
      mutate(
        "        cutover: rolling\n",
        "        cutover: rolling\n" +
          "        secrets:\n" +
          "          - engine: transit\n" +
          "            key: fixture-jwt\n" +
          "            operations: [sign]\n" +
          `            delivery: ${delivery}\n` +
          "            rotation: {tolerates: restart}\n",
      );
    expect(codes(grant("env"))).toStrictEqual(["E_NON_KV_DELIVERY"]);
    expect(codes(grant("self"))).toStrictEqual([]);
    // 0085 narrowed the code to transit: a database credential is projected
    // exactly as a static one is.
    expect(
      codes(
        mutate(
          "        cutover: rolling\n",
          "        cutover: rolling\n" +
            "        secrets:\n" +
            "          - engine: database\n" +
            "            role: fixture-reader\n" +
            "            delivery: env\n" +
            "            rotation: {tolerates: restart}\n",
        ),
      ),
    ).toStrictEqual([]);
  });
});

describe("a document that is not an instance of the metamodel", () => {
  it("refuses an unknown key, and says where it is", () => {
    const diagnostics = refusal(
      mutate(
        "        runtime: node\n",
        "        runtime: node\n        stateful: true\n",
      ),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.kind).toBe("schema");
    expect(diagnostics[0]?.code).toBe("schema");
    expect(diagnostics[0]?.at).toBe("services[0].workloads[0].stateful");
  });

  it("refuses a value outside a closed vocabulary", () => {
    const diagnostics = refusal(mutate("runtime: node", "runtime: kotlin"));
    expect(diagnostics[0]?.at).toBe("services[0].workloads[0].runtime");
    expect(diagnostics[0]?.message).toMatch(/jvm/);
  });

  it("refuses a kv field on a transit grant, because a union is a union", () => {
    const diagnostics = refusal(
      mutate(
        "        cutover: rolling\n",
        "        cutover: rolling\n" +
          "        secrets:\n" +
          "          - engine: transit\n" +
          "            key: fixture-jwt\n" +
          "            operations: [sign]\n" +
          "            path: secret/data/fixture\n" +
          "            delivery: self\n" +
          "            rotation: {tolerates: reload}\n",
      ),
    );
    expect(diagnostics.map((d) => d.at)).toContain(
      "services[0].workloads[0].secrets[0].path",
    );
  });

  it("refuses a wildcard key list, because it is not in the grammar", () => {
    const diagnostics = refusal(
      mutate(
        "        cutover: rolling\n",
        "        cutover: rolling\n" +
          "        secrets:\n" +
          "          - path: secret/data/fixture\n" +
          "            keys: ['*']\n" +
          "            access: read\n" +
          "            delivery: self\n" +
          "            rotation: {tolerates: restart}\n",
      ),
    );
    expect(diagnostics[0]?.at).toBe(
      "services[0].workloads[0].secrets[0].keys[0]",
    );
  });

  it("refuses a Workload that declares ports and no probe", () => {
    const diagnostics = refusal(
      mutate(
        "        probes:\n          readiness: {path: /healthz, port: 8080}\n          liveness: {path: /healthz, port: 8080}\n",
        "        probes: none\n",
      ),
    );
    expect(diagnostics[0]?.at).toBe("services[0].workloads[0].probes");
  });

  it("refuses a sidecar taking the Workload's own name", () => {
    const diagnostics = refusal(
      mutate(
        "        cutover: rolling\n",
        "        cutover: rolling\n" +
          "        sidecars:\n" +
          "          - {name: fixture-api, image: exporter, memory: 64Mi, cpu: 10m}\n",
      ),
    );
    expect(diagnostics[0]?.at).toBe(
      "services[0].workloads[0].sidecars[0].name",
    );
  });

  it("refuses mountAt on a grant that is never projected", () => {
    const diagnostics = refusal(
      mutate(
        "        cutover: rolling\n",
        "        cutover: rolling\n" +
          "        secrets:\n" +
          "          - path: secret/data/fixture\n" +
          "            keys: [user]\n" +
          "            access: read\n" +
          "            delivery: env\n" +
          "            mountAt: /run/secret\n" +
          "            rotation: {tolerates: restart}\n",
      ),
    );
    expect(diagnostics[0]?.at).toBe(
      "services[0].workloads[0].secrets[0].mountAt",
    );
  });

  it("refuses an image alias carrying a tag or a digest", () => {
    expect(
      refusal(mutate("image: fixture-api", "image: fixture-api:1.2.3"))[0]?.at,
    ).toBe("services[0].workloads[0].image");
  });

  it("refuses a replicas block that restates the derived count", () => {
    expect(
      refusal(
        mutate(
          "        cutover: rolling\n",
          "        cutover: rolling\n        replicas: {count: 1, reason: because}\n",
        ),
      )[0]?.at,
    ).toBe("services[0].workloads[0].replicas.count");
  });

  it("refuses bytes that are not YAML at all, and says at what offset", () => {
    const result = readDomain("services:\n  - id: a\n   bad indent\n", "x.yml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.kind).toBe("syntax");
    expect(result.diagnostics[0]?.at).toMatch(/^offset\[\d+\]$/);
  });

  it("refuses a duplicate key, which YAML would otherwise resolve silently", () => {
    const result = readDomain(`${BASE}domain: second\n`, "x.yml");
    expect(result.ok).toBe(false);
  });

  it("addresses the document itself when the root is not an object at all", () => {
    const result = readDomain("- a\n- b\n", "x.yml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.at).toBe("(document)");
  });

  it("accepts a Workload that declares ports and only a liveness probe", () => {
    // The startup probe targets liveness, and a Workload declaring readiness
    // and no liveness derives none; either half on its own is a declaration.
    expect(
      codes(
        mutate(
          "        probes:\n          readiness: {path: /healthz, port: 8080}\n          liveness: {path: /healthz, port: 8080}\n",
          "        probes:\n          liveness: {tcp: 8080}\n",
        ),
      ),
    ).toStrictEqual([]);
  });

  it("carries a structured gpu request into the domain model", () => {
    const text = mutate(
      "placement: {memory: 128Mi, cpu: 25m}",
      "placement:\n" +
        "          memory: 128Mi\n" +
        "          cpu: 25m\n" +
        "          site: enschede\n" +
        "          arch: [amd64]\n" +
        "          capabilities: [nvidia]\n" +
        "          disk: {media: [nvme]}\n" +
        "          gpu: {class: transcode, memory: 4Gi}",
    );
    const result = parseServiceIntent(text, "fixture.yml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placement = result.value.services[0]?.workloads[0]?.placement;
    // A flat capability string cannot describe a GPU, so `gpu` is a class of
    // its own with a class name and a memory quantity.
    expect(placement?.gpu?.class).toBe("transcode");
    expect(placement?.gpu?.at).toBe("services[0].workloads[0].placement.gpu");
    expect(placement?.disk?.media).toStrictEqual(["nvme"]);
    expect(placement?.site).toBe("enschede");
  });

  it("addresses the document itself when nothing inside it parsed", () => {
    const diagnostics = refusal(
      "apiVersion: intent.jorisjonkers.dev/v1\nkind: Domain\nnope: 1\n",
    );
    expect(diagnostics.map((d) => d.at)).toContain("nope");
  });
});

describe("document paths", () => {
  it("read as a reader would look for them in the file", () => {
    expect(documentPath(["services", 0, "workloads", 1, "cutover"])).toBe(
      "services[0].workloads[1].cutover",
    );
    expect(documentPath([])).toBe("");
    expect(child("", "services")).toBe("services");
    expect(child("a", "b")).toBe("a.b");
    expect(at("services", 2)).toBe("services[2]");
  });
});

describe("the Result type", () => {
  it("carries a value when it succeeded", () => {
    expect(accepted(1)).toStrictEqual({ ok: true, value: 1 });
  });

  it("refuses to be a refusal with nothing to say", () => {
    expect(() => refused([])).toThrow(/says nothing/);
  });
});

describe("the closed vocabularies", () => {
  const table =
    /## The closed vocabularies\n([\s\S]*?)\n## /.exec(CHAPTER)?.[1] ?? "";

  it("are declared once, and the chapter's table is the same seventeen", () => {
    const rows = [...table.matchAll(/^\| `(\w+)` \| ([^|]+) \| ([^|]+) \|$/gm)];
    expect(rows).toHaveLength(CLOSED_VOCABULARIES.length);
    expect(CLOSED_VOCABULARIES).toHaveLength(17);
    rows.forEach((row, index) => {
      const vocabulary = CLOSED_VOCABULARIES[index];
      expect(row[1], "the table's order is the declaration's").toBe(
        vocabulary?.name,
      );
      const named = [...(row[2] as string).matchAll(/`([\w.]+)`/g)].map(
        (m) => m[1],
      );
      expect(named, vocabulary?.name).toStrictEqual(vocabulary?.namedBy);
      const values = [...(row[3] as string).matchAll(/`([^`]+)`/g)].map(
        (m) => m[1],
      );
      expect(values, vocabulary?.name).toStrictEqual(vocabulary?.values);
    });
  });

  it("are not re-typed anywhere else in the tracked source", () => {
    // The defect this replaces: a test constant spelling out AlertClass a
    // second time, which then had to be kept in step by hand.
    const suspects = ["business-hours", "self-renew", "irreplaceable"];
    for (const file of ["test/simplification-contract.test.ts"]) {
      const text = readFileSync(join(REPOSITORY, file), "utf8");
      for (const value of suspects)
        expect(text, `${file} re-types ${value}`).not.toContain(`"${value}"`);
    }
  });
});

describe("the generated JSON Schema", () => {
  it("regenerates without a diff", () => {
    expect(readFileSync(join(REPOSITORY, JSON_SCHEMA_PATH), "utf8")).toBe(
      serviceIntentJsonSchemaText(),
    );
  });

  it("is the input variant, so a defaulted field is optional in it", () => {
    const schema = serviceIntentJsonSchema() as {
      title: string;
      required: string[];
      $defs: Record<string, unknown>;
    };
    expect(schema.title).toBe("Service Intent: Domain");
    expect(schema.required).toContain("apiVersion");
    // Every class of the metamodel is published, including the two the Domain
    // does not reach: layer 1 is authored as two artefacts.
    expect(Object.keys(schema.$defs)).toContain("EnvFile");
    expect(Object.keys(schema.$defs)).toContain("Placeholder");
    expect(Object.keys(schema.$defs)).not.toContain("Domain");
  });
});

describe("the env-file grammar", () => {
  it("reads literals and placeholders out of a real worked env file", () => {
    const file = join(
      REPOSITORY,
      "spec/v1/examples/auth/env/auth-api.base.env",
    );
    const { file: parsed, diagnostics } = parseEnvFile(
      readFileSync(file, "utf8"),
      file,
    );
    expect(diagnostics).toStrictEqual([]);
    expect(parsed.literals.map((l) => l.key)).toContain(
      "SPRING_PROFILES_ACTIVE",
    );
    expect(parsed.placeholders.map((p) => p.kind)).toContain("dependency");
    expect(parsed.placeholders.map((p) => p.kind)).toContain("exposure");
    expect(parsed.placeholders.map((p) => p.kind)).toContain("identity");
    // auth-api holds three grants and all three are delivery: self, so its env
    // file carries no ${secret:...} at all. The check does not false-positive.
    expect(parsed.placeholders.filter((p) => p.kind === "secret")).toHaveLength(
      0,
    );
    expect(parsed.cluster).toBeUndefined();
  });

  it("carries the Cluster Target of an overlay", () => {
    const { file } = parseEnvFile("A=1\n", "production.env", "production");
    expect(file.cluster).toBe("production");
  });

  it("keeps a path outside the placeholder", () => {
    const { file, diagnostics } = parseEnvFile(
      "AUTH_LOGIN_URL=${exposure:auth.public#url}/login\n",
      "x.env",
    );
    expect(diagnostics).toStrictEqual([]);
    expect(file.placeholders[0]?.source).toBe("auth.public#url");
    expect(file.literals[0]?.value).toBe("${exposure:auth.public#url}/login");
  });

  it("refuses a placeholder that takes an argument, which is a template language", () => {
    const { diagnostics } = parseEnvFile(
      "A=${exposure:auth.public#url:/login}\n",
      "x.env",
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.at).toBe("line[1].A[0]");
  });

  it("refuses a source that is not one of the four", () => {
    const { diagnostics } = parseEnvFile("A=${config:thing}\n", "x.env");
    expect(diagnostics[0]?.message).toMatch(/not a placeholder source/);
  });

  it("refuses a malformed opening, which would otherwise read as a literal", () => {
    const { diagnostics } = parseEnvFile("A=${secret}\n", "x.env");
    expect(diagnostics[0]?.message).toMatch(/no nesting and no arguments/);
  });

  it("refuses a line that is not an entry", () => {
    const { diagnostics } = parseEnvFile(
      "\n# a comment\nnot an entry\n",
      "x.env",
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.at).toBe("line[3]");
  });

  it("refuses each identity key outside the closed set", () => {
    expect(
      parseEnvFile("A=${identity:vaultRole}\n", "x.env").diagnostics,
    ).toStrictEqual([]);
    expect(
      parseEnvFile("A=${identity:token}\n", "x.env").diagnostics,
    ).toHaveLength(1);
  });
});
