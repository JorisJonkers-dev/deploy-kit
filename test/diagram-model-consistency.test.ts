// The drawings, the chapters and the worked examples say the same thing.
//
// Two defects this file exists to catch actually shipped and were found by
// hand: `data.domain.yml` authored an `onChange` key that 0094 deleted and no
// class carries, and four `PrometheusRule` fixtures stayed in the rendered
// trees after chapter 30 stopped rendering the kind. Both were invisible to
// every existing gate, because each artefact was internally consistent.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";
import { METAMODEL } from "../src/wire/service-intent/schema.ts";

const repo = join(import.meta.dirname, "..");
const spec = join(repo, "spec", "v1");
const read = (path: string): string => readFileSync(path, "utf8");

/** Every file under `dir`, at any depth. */
const walk = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((rel) => join(dir, rel))
    .filter((path) => statSync(path).isFile());

/** The first capture group of `pattern` in `text`, or a failure naming what did not parse. */
function capture(text: string, pattern: RegExp, what: string): string {
  const group = pattern.exec(text)?.[1];
  if (group === undefined) throw new Error(`${what} did not parse`);
  return group;
}

type Pair = readonly [string, string];

/** The `classDiagram` block of chapter 10: classes, their attributes, its edges. */
function mermaidModel(): {
  classes: Record<string, string[]>;
  comps: Pair[];
  deps: Pair[];
} {
  const md = read(join(spec, "10-service-intent.md"));
  const body = capture(
    md,
    /```mermaid\nclassDiagram\n([\s\S]*?)\n```/,
    "the class diagram in chapter 10",
  );
  const classes: Record<string, string[]> = {};
  for (const m of body.matchAll(/ {4}class (\w+) \{([\s\S]*?)\n {4}\}/g)) {
    classes[m[1] ?? ""] = (m[2] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => line.replace(/^\+\s*/, "").replace(/\s+/g, " "));
  }
  const comps = [...body.matchAll(/(\w+) "[^"]+" \*-- "[^"]+" (\w+) :/g)].map(
    (m): Pair => [m[1] ?? "", m[2] ?? ""],
  );
  const deps = [...body.matchAll(/(\w+) \.\.> (\w+) :/g)].map((m): Pair => [
    m[1] ?? "",
    m[2] ?? "",
  ]);
  return { classes, comps, deps };
}

/** The boxes of a committed SVG, read out of its embedded draw.io payload. */
function svgModel(name: string): {
  boxes: Record<string, string[]>;
  edges: number;
  xml: string;
} {
  const svg = read(join(spec, "diagrams", name));
  const xml = capture(
    svg,
    /content="([\s\S]*?)"\s/,
    `${name}: the draw.io payload`,
  )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&");
  const cells = [...xml.matchAll(/<mxCell ([^>]*?)\/?>/g)].map(
    (m) => m[1] ?? "",
  );
  const attr = (cell: string, key: string): string | undefined =>
    new RegExp(`${key}="([^"]*)"`).exec(cell)?.[1];
  const boxes: Record<string, string[]> = {};
  for (const cell of cells) {
    if (!/swimlane/.test(attr(cell, "style") ?? "")) continue;
    const id = attr(cell, "id");
    boxes[attr(cell, "value") ?? ""] = cells
      .filter((child) => attr(child, "parent") === id)
      .map((child) =>
        (attr(child, "value") ?? "").replace(/^\+\s*/, "").replace(/\s+/g, " "),
      );
  }
  const edges = cells.filter((cell) => attr(cell, "edge") === "1").length;
  return { boxes, edges, xml };
}

test("the class diagram draws exactly the mermaid's classes and attributes", () => {
  const { classes } = mermaidModel();
  const { boxes } = svgModel("10-service-intent-model.drawio.svg");
  expect(
    Object.keys(boxes).sort(),
    "the drawing and the mermaid disagree about which classes exist",
  ).toStrictEqual(Object.keys(classes).sort());
  for (const [name, rows] of Object.entries(classes))
    expect(boxes[name], `${name}: attributes differ`).toStrictEqual(rows);
});

test("only the relations that span layers are left undrawn", () => {
  const { comps, deps } = mermaidModel();
  const { edges } = svgModel("10-service-intent-model.drawio.svg");
  // Placeholder reaches Grant and Exposure across four layers. Those two are
  // stated in the chapter instead; everything else is on the drawing.
  const undrawn = deps.filter(([from]) => from === "Placeholder").length;
  expect(undrawn, "the set of undrawn relations changed").toBe(2);
  expect(edges).toBe(comps.length + deps.length - undrawn);
});

test("no drawing carries an enumeration box", () => {
  for (const file of readdirSync(join(spec, "diagrams")).filter((f) =>
    f.endsWith(".svg"),
  ))
    expect(
      read(join(spec, "diagrams", file)),
      `${file}: vocabularies belong in the chapter's table, not in a drawing`,
    ).not.toContain("«enumeration»");
});

test("every closed vocabulary names an attribute that exists", () => {
  const md = read(join(spec, "10-service-intent.md"));
  const table = capture(
    md,
    /## The closed vocabularies\n([\s\S]*?)\n## /,
    "the closed vocabularies table",
  );
  const { classes } = mermaidModel();
  let rows = 0;
  for (const m of table.matchAll(/^\| `(\w+)` \| ([^|]+) \|/gm)) {
    rows += 1;
    const vocab = m[1] ?? "";
    const used = Object.values(classes).some((attributes) =>
      attributes.some(
        (row) => (row.split(" ")[0] ?? "").replace(/\[\]$/, "") === vocab,
      ),
    );
    expect(used, `${vocab} is tabulated but types no attribute`).toBe(true);
    for (const ref of (m[2] ?? "").matchAll(/`(\w+)\.(\w+)`/g)) {
      const cls = ref[1] ?? "";
      const attribute = ref[2] ?? "";
      expect(
        classes[cls],
        `${vocab} names class ${cls}, which does not exist`,
      ).toBeDefined();
      expect(
        classes[cls]?.some((row) => row.endsWith(` ${attribute}`)),
        `${vocab} names ${cls}.${attribute}, which does not exist`,
      ).toBe(true);
    }
  }
  expect(rows, "the vocabulary table did not parse").toBeGreaterThan(10);
});

/**
 * Attributes the metamodel declares that the drawing deliberately does not draw
 * as a row, and why. The chapter says the diagram "carries the classes and how
 * they compose, and nothing else", so a composed child is an edge rather than a
 * row and is excluded by the edge set below. These are the ones left over, and
 * naming each with its reason is what stops a third joining them silently.
 */
const NOT_DRAWN_AS_A_ROW: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  Domain: {
    apiVersion: "the document's language tag, not something the model says",
    kind: "the same: which language this file is written in",
  },
  Workload: {
    probes:
      "drawn as two edges, readiness and liveness, because a Probe is a class " +
      "and the two are siblings that never fall back to one another",
  },
};

/** Every attribute name a Zod schema declares, unioning a union's arms. */
function declaredKeys(schema: unknown): string[] {
  const def = (schema as { _zod?: { def?: Record<string, unknown> } })._zod
    ?.def;
  if (def === undefined) return [];
  if (def["type"] === "object")
    return Object.keys(def["shape"] as Record<string, unknown>);
  if (Array.isArray(def["options"]))
    return [...new Set((def["options"] as unknown[]).flatMap(declaredKeys))];
  if (def["innerType"] !== undefined) return declaredKeys(def["innerType"]);
  return [];
}

/** The composition-edge labels the mermaid draws out of each parent class. */
function composedOut(): Record<string, Set<string>> {
  const body =
    /```mermaid\nclassDiagram\n([\s\S]*?)\n```/.exec(
      read(join(spec, "10-service-intent.md")),
    )?.[1] ?? "";
  const out: Record<string, Set<string>> = {};
  for (const m of body.matchAll(/(\w+) "[^"]+" \*-- "[^"]+" \w+ : (.+)/g))
    (out[m[1] ?? ""] ??= new Set()).add((m[2] ?? "").trim());
  return out;
}

test("the class diagram draws the classes and attributes the metamodel declares", () => {
  // What the old check did by reading YAML indentation ("a worked example
  // authors no key the model does not carry") the metamodel now does by
  // construction: every class is a strict object, so a key no class carries is
  // a document that does not parse, and test/intent-contract.test.ts proves it
  // over every example at once. What is left for this file is the half that is
  // genuinely two copies: the drawing and the declaration.
  const { classes } = mermaidModel();
  expect(
    Object.keys(classes).sort(),
    "the drawing and the metamodel disagree about which classes exist",
  ).toStrictEqual(Object.keys(METAMODEL.classes).sort());

  const edges = composedOut();
  const wrong: string[] = [];
  for (const [name, rows] of Object.entries(classes)) {
    const declared = new Set(
      declaredKeys(METAMODEL.classes[name as keyof typeof METAMODEL.classes]),
    );
    const drawn = new Set(rows.map((row) => row.split(" ").pop() ?? ""));
    for (const attribute of drawn)
      if (!declared.has(attribute))
        wrong.push(`${name}.${attribute}: drawn, and no class declares it`);
    for (const attribute of declared) {
      if (drawn.has(attribute)) continue;
      if (edges[name]?.has(attribute) === true) continue;
      if (attribute in (NOT_DRAWN_AS_A_ROW[name] ?? {})) continue;
      wrong.push(`${name}.${attribute}: declared, and the drawing omits it`);
    }
  }
  expect(wrong, "the drawing and the metamodel disagree").toStrictEqual([]);
});

test("every excluded attribute says why it is excluded", () => {
  for (const [name, entries] of Object.entries(NOT_DRAWN_AS_A_ROW))
    for (const [attribute, why] of Object.entries(entries))
      expect(why.length, `${name}.${attribute}`).toBeGreaterThan(20);
});

test("every rendered kind is a column of the deliverables matrix", () => {
  const { xml } = svgModel("16-derivation-map-deliverables.drawio.svg");
  // Namespace-scoped operator objects are rendered once per namespace, not per
  // Service, so the per-Service map does not carry a column for them.
  const perNamespace = new Set(["VaultAuth", "VaultConnection", "Namespace"]);
  const alias: Readonly<Record<string, string>> = {
    Kustomization: "kustomization",
    VaultDynamicSecret: "VaultDynami",
  };
  const kinds = new Set<string>();
  for (const file of walk(join(spec, "examples")).filter((f) =>
    f.endsWith(".yaml"),
  ))
    for (const m of read(file).matchAll(/^kind: (\w+)$/gm))
      kinds.add(m[1] ?? "");
  expect(kinds.size, "no rendered fixtures found").toBeGreaterThan(5);
  for (const kind of kinds) {
    if (perNamespace.has(kind)) continue;
    expect(
      xml.includes(alias[kind] ?? kind),
      `rendered kind ${kind} has no column`,
    ).toBe(true);
  }
});

test("no rendered fixture carries a kind the model stopped rendering", () => {
  const gone = ["PrometheusRule"];
  for (const file of walk(join(spec, "examples")).filter((f) =>
    f.endsWith(".yaml"),
  ))
    for (const kind of gone)
      expect(
        new RegExp(`^kind: ${kind}$`, "m").test(read(file)),
        `${relative(repo, file)}: renders ${kind}, which chapter 30 says nothing emits`,
      ).toBe(false);
});
