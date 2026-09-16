// REQ-033 (docs/requirements.md): the Resolved Deployment metamodel, and the
// chapter that is normative for it.
//
// The worked projection in spec/v1/20-resolved-deployment.md is the chapter's
// own example of the shape, so it is validated against the schema rather than
// read by eye. Four defects it carried until 2026-09-16 each get a test that
// reintroduces them, because a check that has only ever passed is untested.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  resolvedApplicationDocument,
  resolvedDeployment,
} from "../../src/wire/resolved-deployment/schema.ts";

const CHAPTER = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "20-resolved-deployment.md",
);

/**
 * The chapter writes a digest as `sha256:…`, which reads better than sixty-four
 * hex characters in a document a human is meant to follow. The ellipsis is the
 * only thing substituted; every other key and value is the chapter's own.
 */
const DIGEST =
  "sha256:1ad39d5c2b8e4f7a0913d6c5b4a29e8f7d6c5b4a39281706f5e4d3c2b1a09876";

function workedProjection(): unknown {
  const chapter = readFileSync(CHAPTER, "utf8");
  const at = chapter.indexOf("## Worked example: knowledge's projection");
  expect(at, "the worked example moved").toBeGreaterThan(-1);
  const open = chapter.indexOf("```yaml", at) + "```yaml\n".length;
  const close = chapter.indexOf("\n```\n", open);
  const yaml = chapter
    .slice(open, close)
    .replaceAll(/sha256:…/g, DIGEST)
    .replaceAll(/@sha256:[0-9a-f]+…/g, `@${DIGEST}`);
  return parse(yaml);
}

/** The projection, with one of its defects put back. */
function withDefect(
  mutate: (document: Record<string, unknown>) => void,
): unknown {
  const document = workedProjection() as Record<string, unknown>;
  mutate(document);
  return document;
}

describe("the worked projection", () => {
  it("validates against the metamodel", () => {
    const result = resolvedApplicationDocument.safeParse(workedProjection());

    expect(result.error?.issues ?? []).toStrictEqual([]);
    expect(result.success).toBe(true);
  });

  it("is a ResolvedApplication, the kind 0116 renamed it to", () => {
    const document = workedProjection() as { kind: string };

    expect(document.kind).toBe("ResolvedApplication");
  });
});

describe("the four defects it carried", () => {
  it("refuses a health timeout class beside the release gate", () => {
    // 0071 deleted the concept: it was a second derivation over the same
    // startupBudget the deadline already derives from, and the two disagreed.
    const document = withDefect((it) => {
      Object.assign(it, { healthTimeoutClass: "stateful" });
    });

    expect(resolvedApplicationDocument.safeParse(document).success).toBe(false);
  });

  it("refuses provenance that folds every fragment into one intent digest", () => {
    const document = withDefect((it) => {
      Object.assign(it, {
        provenance: {
          renderHash: DIGEST,
          schemaPackageIntegrity: DIGEST,
          inputDigests: { intent: DIGEST, imagesLock: DIGEST },
        },
      });
    });

    expect(resolvedApplicationDocument.safeParse(document).success).toBe(false);
  });

  it("refuses contextRef and adapterCompat, which 0098 deleted", () => {
    for (const field of ["contextRef", "adapterCompat"]) {
      const document = withDefect((it) => {
        Object.assign(it["provenance"] as object, { [field]: DIGEST });
      });

      expect(
        resolvedApplicationDocument.safeParse(document).success,
        `${field} is not a field of the provenance`,
      ).toBe(false);
    }
  });

  it("refuses a placement that authors a disk size", () => {
    // A placement disk dimension filters which nodes may hold a claim; how
    // large the claim is, is the volume's own authored size.
    const document = withDefect((it) => {
      const [, worker] = it["processes"] as {
        placement: Record<string, unknown>;
      }[];
      if (worker === undefined) throw new Error("the worker left the example");
      worker.placement["disk"] = { media: ["nvme"], size: "100Gi" };
    });

    expect(resolvedApplicationDocument.safeParse(document).success).toBe(false);
  });

  it("states volumes[].durability once in the authority table", () => {
    const chapter = readFileSync(CHAPTER, "utf8");
    const rows = chapter
      .split("\n")
      .filter((line) => line.startsWith("| `volumes[].durability` |"));

    expect(rows).toHaveLength(1);
  });
});

/** A committed projection oracle. */
const oracleOf = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "spec",
        "v1",
        "examples",
        name,
        "expected",
        "resolved.json",
      ),
      "utf8",
    ),
  );

/** Every key a document writes, at any depth. */
function written(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const entry of node) written(entry, found);
    return found;
  }
  if (typeof node !== "object" || node === null) return found;
  for (const [key, value] of Object.entries(node)) {
    found.add(key);
    written(value, found);
  }
  return found;
}

describe("the metamodel's own keys", () => {
  /** Every property name the schema declares, at any depth. */
  function keysOf(node: unknown, found = new Set<string>()): Set<string> {
    if (typeof node !== "object" || node === null) return found;
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties" && typeof value === "object" && value !== null)
        for (const name of Object.keys(value as object)) found.add(name);
      keysOf(value, found);
    }
    return found;
  }

  it("names no Kubernetes or Traefik field", () => {
    // The spellings the worked projection carried until it was rewritten, plus
    // the ones the authority table names as the kubernetes adapter's
    // (docs/adr/model/0097-authored-values-name-model-concepts.md).
    const target = [
      "objectKind",
      "strategy",
      "maxSurge",
      "maxUnavailable",
      "securityContext",
      "runAsNonRoot",
      "runAsUser",
      "runAsGroup",
      "readOnlyRootFilesystem",
      "seccompProfile",
      "fsGroup",
      "capabilities",
      "nodeSelector",
      "affinity",
      "resources",
      "requests",
      "limits",
      "emptyDir",
      "sizeLimit",
      "periodSeconds",
      "timeoutSeconds",
      "failureThreshold",
      "initialDelaySeconds",
      "progressDeadlineSeconds",
      "automountServiceAccountToken",
      "serviceAccount",
      "serviceAccountName",
      "secretObjects",
      "middlewares",
      "entryPoints",
      "routes.services",
    ];
    const declared = new Set([
      ...keysOf(z.toJSONSchema(resolvedDeployment, { io: "input" })),
      ...keysOf(z.toJSONSchema(resolvedApplicationDocument, { io: "input" })),
      // The committed oracles too, so the check covers what was written and
      // not only what the schema would have allowed.
      ...written(oracleOf("minimal")),
      ...written(oracleOf("knowledge")),
    ]);

    expect([...declared].filter((key) => target.includes(key))).toStrictEqual(
      [],
    );
  });
});

describe("the committed oracles", () => {
  const ORACLES = ["minimal", "knowledge"] as const;
  const oracle = (name: string): unknown =>
    JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          "..",
          "..",
          "spec",
          "v1",
          "examples",
          name,
          "expected",
          "resolved.json",
        ),
        "utf8",
      ),
    );

  it.each(ORACLES)("%s validates against the metamodel", (name) => {
    const result = resolvedApplicationDocument.safeParse(oracle(name));

    expect(result.error?.issues ?? []).toStrictEqual([]);
  });

  /** Everything `part` states, `whole` states too. An array may hold more. */
  function states(part: unknown, whole: unknown, at = ""): string[] {
    if (Array.isArray(part))
      return Array.isArray(whole)
        ? part.flatMap((entry, index) =>
            whole.some((candidate) => states(entry, candidate).length === 0)
              ? []
              : [
                  `${at}/${String(index)} is in the chapter and in no oracle entry`,
                ],
          )
        : [`${at} is a list in the chapter and not in the oracle`];
    if (typeof part === "object" && part !== null) {
      if (typeof whole !== "object" || whole === null)
        return [`${at} is an object in the chapter and not in the oracle`];
      const held = whole as Record<string, unknown>;
      return Object.entries(part).flatMap(([key, value]) =>
        key in held
          ? states(value, held[key], `${at}/${key}`)
          : [`${at}/${key} is in the chapter and not in the oracle`],
      );
    }
    // A digest the chapter elides stands for whatever the oracle records: the
    // ellipsis is the chapter being readable, not the two disagreeing.
    if (typeof part === "string" && part.includes(DIGEST))
      return typeof whole === "string"
        ? []
        : [`${at} is a digest in the chapter and not in the oracle`];
    return part === whole ? [] : [`${at}: ${String(part)} != ${String(whole)}`];
  }

  it("says the same thing as chapter 20's worked projection", () => {
    // The chapter shows two of five routes and elides its digests, so it is a
    // subset of the oracle rather than a copy of it. Everything it does show
    // must agree, which is what stops the two drifting.
    const { provenance: _, ...chapter } = workedProjection() as Record<
      string,
      unknown
    >;
    const { provenance: __, ...committed } = oracle("knowledge") as Record<
      string,
      unknown
    >;

    expect(states(chapter, committed)).toStrictEqual([]);
  });

  it("exports the resolved edges knowledge's dependency oracle carries", () => {
    const edges = JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          "..",
          "..",
          "spec",
          "v1",
          "examples",
          "knowledge",
          "expected",
          "dependencies.json",
        ),
        "utf8",
      ),
    ) as { applications: { id: string; edges: { consumer: string }[] }[] };
    const processes = (
      oracle("knowledge") as {
        processes: { name: string; dependencies?: unknown[] }[];
      }
    ).processes;

    expect(edges.applications.map(({ id }) => id)).toStrictEqual(["knowledge"]);
    expect(edges.applications[0]?.edges).toHaveLength(
      processes.reduce((total, p) => total + (p.dependencies?.length ?? 0), 0),
    );
    expect(
      new Set(edges.applications[0]?.edges.map((e) => e.consumer)),
    ).toStrictEqual(new Set(processes.map((p) => p.name)));
  });
});

describe("the metamodel names every class the chapter draws", () => {
  const defsOf = (schema: z.ZodType): string[] =>
    Object.keys(
      (z.toJSONSchema(schema, { io: "input" }) as { $defs?: object })[
        "$defs"
      ] ?? {},
    ).sort();

  /** Every class the chapter's mermaid block declares. */
  function drawn(): string[] {
    const chapter = readFileSync(CHAPTER, "utf8");
    const body = /```mermaid\nclassDiagram\n([\s\S]*?)\n```/.exec(chapter)?.[1];
    expect(body, "the class diagram moved").toBeDefined();
    return [...(body ?? "").matchAll(/ {4}class (\w+) \{/g)]
      .map((match) => match[1] ?? "")
      .sort();
  }

  it("declares an id for every class chapter 20 draws", () => {
    // The drawing and the schema are two statements of one structure. A class
    // renamed in one and not the other is the drift this pair exists to catch.
    const declared = new Set(defsOf(resolvedDeployment));

    expect(drawn().filter((name) => !declared.has(name))).toStrictEqual([]);
  });

  it("names the classes the drawing leaves out, and nothing else", () => {
    // A probe is one box on the drawing and a union of two shapes here; the
    // closed vocabularies are not drawn at all, per the diagram conventions.
    const extra = defsOf(resolvedDeployment).filter(
      (name) => !drawn().includes(name),
    );

    expect(extra).toStrictEqual([
      "AccessTier",
      "AdapterName",
      "AlertClass",
      "Audience",
      "ContentPolicy",
      "Cutover",
      "Delivery",
      "DurabilityClass",
      "HardeningClass",
      "Match",
      "MiddlewareKind",
      "PathScope",
      "PinnedInput",
      "ResolvedHttpProbe",
      "ResolvedTcpProbe",
    ]);
  });

  it("gives the published projection its own id", () => {
    expect(defsOf(resolvedApplicationDocument)).toContain(
      "ResolvedApplicationDocument",
    );
  });
});

describe("the metamodel refuses", () => {
  const withProcess = (change: Record<string, unknown>): unknown => {
    const document = workedProjection() as {
      processes: Record<string, unknown>[];
    };
    Object.assign(document.processes[0] as object, change);
    return document;
  };
  const refused = (document: unknown): boolean =>
    !resolvedApplicationDocument.safeParse(document).success;

  it.each([
    ["a digest with no algorithm", "1ad39d5c"],
    ["a digest whose hex is not hex", "sha256:ZZZZ"],
    ["a digest with something before it", "see sha256:1ad39d5c"],
    ["a digest with something after it", "sha256:1ad39d5c and more"],
  ])("%s", (_name, renderHash) => {
    const document = withDefect((it) => {
      Object.assign(it["provenance"] as object, { renderHash });
    });

    expect(refused(document)).toBe(true);
  });

  it.each([
    ["1800s", true],
    ["30ms", true],
    ["2h", true],
    ["1800", false],
    ["30x", false],
    ["s", false],
    ["x30s", false],
    ["30s later", false],
  ])("reads the duration %s as valid: %s", (deadline, valid) => {
    expect(refused(withProcess({ deadline }))).toBe(!valid);
  });

  it("a replica count below one", () => {
    expect(refused(withProcess({ replicas: 0 }))).toBe(true);
  });

  it("a release gate with no members", () => {
    const document = withDefect((it) => {
      Object.assign(it["releaseGate"] as object, { members: [] });
    });

    expect(refused(document)).toBe(true);
  });
});

describe("the estate-wide document", () => {
  /** Two applications, two units and two path assignments: the shape of an estate. */
  function estate(): unknown {
    const {
      apiVersion: _a,
      kind: _k,
      provenance,
      ...one
    } = workedProjection() as Record<string, unknown>;
    return {
      apiVersion: "resolved.jorisjonkers.dev/v1",
      kind: "ResolvedDeployment",
      provenance,
      pathPlan: [
        {
          path: "apps/knowledge/workload.yaml",
          adapter: "kubernetes",
          scope: "application",
        },
        { path: "namespace.yaml", adapter: "kubernetes", scope: "project" },
      ],
      reconcileUnits: [
        { name: "apps-core" },
        { name: "apps-knowledge", after: ["apps-core"] },
      ],
      applications: [one, { ...one, id: "knowledge-two" }],
    };
  }

  it("holds more than one application, unit and path", () => {
    const result = resolvedDeployment.safeParse(estate());

    expect(result.error?.issues ?? []).toStrictEqual([]);
  });

  it("holds at least one of each", () => {
    for (const empty of ["pathPlan", "reconcileUnits", "applications"]) {
      const document = estate() as Record<string, unknown>;
      document[empty] = [];

      expect(
        resolvedDeployment.safeParse(document).success,
        `${empty} may not be empty`,
      ).toBe(false);
    }
  });

  it("is not a projection, and a projection is not it", () => {
    expect(resolvedApplicationDocument.safeParse(estate()).success).toBe(false);
    expect(resolvedDeployment.safeParse(workedProjection()).success).toBe(
      false,
    );
  });
});

describe("a Process answering on a port rather than a path", () => {
  it("carries a tcp probe wherever an http one may go", () => {
    // Both worked examples answer readiness on a path, so the other half of
    // the probe union would otherwise never be exercised.
    const document = workedProjection() as {
      releaseGate: { members: { readiness: unknown }[] };
      processes: Record<string, unknown>[];
    };
    const process = document.processes[0] as Record<string, unknown>;
    process["readiness"] = {
      tcp: 5432,
      period: "10s",
      timeout: "5s",
      failures: 3,
    };
    process["liveness"] = {
      tcp: 5432,
      period: "10s",
      timeout: "5s",
      failures: 3,
    };
    process["startup"] = { tcp: 5432, period: "5s", failures: 120 };
    const member = document.releaseGate.members[0];
    if (member !== undefined) member.readiness = { tcp: 5432 };

    const result = resolvedApplicationDocument.safeParse(document);

    expect(result.error?.issues ?? []).toStrictEqual([]);
  });

  it("refuses a probe that names both a port and a path", () => {
    const document = withDefect((it) => {
      const process = (it["processes"] as Record<string, unknown>[])[0];
      if (process !== undefined)
        process["readiness"] = {
          tcp: 5432,
          path: "/healthz",
          port: 8080,
          period: "10s",
          timeout: "5s",
          failures: 3,
        };
    });

    expect(resolvedApplicationDocument.safeParse(document).success).toBe(false);
  });
});
