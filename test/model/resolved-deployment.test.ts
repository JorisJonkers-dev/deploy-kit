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
