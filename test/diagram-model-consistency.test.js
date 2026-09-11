// The drawings, the chapters and the worked examples say the same thing.
//
// Two defects this file exists to catch actually shipped and were found by
// hand: `data.domain.yml` authored an `onChange` key that 0094 deleted and no
// class carries, and four `PrometheusRule` fixtures stayed in the rendered
// trees after chapter 30 stopped rendering the kind. Both were invisible to
// every existing gate, because each artefact was internally consistent.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repo = join(import.meta.dirname, "..");
const spec = join(repo, "spec", "v1");
const read = (p) => readFileSync(p, "utf8");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** The `classDiagram` block of chapter 10: classes, their attributes, its edges. */
function mermaidModel() {
  const md = read(join(spec, "10-service-intent.md"));
  const body = md.match(/```mermaid\nclassDiagram\n([\s\S]*?)\n```/)[1];
  const classes = {};
  for (const m of body.matchAll(/ {4}class (\w+) \{([\s\S]*?)\n {4}\}/g)) {
    classes[m[1]] = m[2]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^\+\s*/, "").replace(/\s+/g, " "));
  }
  const comps = [...body.matchAll(/(\w+) "[^"]+" \*-- "[^"]+" (\w+) :/g)].map(
    (m) => [m[1], m[2]],
  );
  const deps = [...body.matchAll(/(\w+) \.\.> (\w+) :/g)].map((m) => [
    m[1],
    m[2],
  ]);
  return { classes, comps, deps };
}

/** The boxes of a committed SVG, read out of its embedded draw.io payload. */
function svgModel(name) {
  const svg = read(join(spec, "diagrams", name));
  const payload = svg.match(/content="([\s\S]*?)"\s/)[1];
  const xml = payload
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&");
  const boxes = {};
  const cells = [...xml.matchAll(/<mxCell ([^>]*?)\/?>/g)].map((m) => m[1]);
  const attr = (s, k) => s.match(new RegExp(`${k}="([^"]*)"`))?.[1];
  const byId = {};
  for (const c of cells) byId[attr(c, "id")] = c;
  for (const c of cells) {
    if (!/swimlane/.test(attr(c, "style") ?? "")) continue;
    const id = attr(c, "id");
    boxes[attr(c, "value")] = cells
      .filter((k) => attr(k, "parent") === id)
      .map((k) =>
        (attr(k, "value") ?? "").replace(/^\+\s*/, "").replace(/\s+/g, " "),
      );
  }
  const edges = cells.filter((c) => attr(c, "edge") === "1").length;
  return { boxes, edges, xml };
}

test("the class diagram draws exactly the mermaid's classes and attributes", () => {
  const { classes } = mermaidModel();
  const { boxes } = svgModel("10-service-intent-model.drawio.svg");
  assert.deepEqual(
    Object.keys(boxes).sort(),
    Object.keys(classes).sort(),
    "the drawing and the mermaid disagree about which classes exist",
  );
  for (const [name, rows] of Object.entries(classes)) {
    assert.deepEqual(boxes[name], rows, `${name}: attributes differ`);
  }
});

test("only the relations that span layers are left undrawn", () => {
  const { comps, deps } = mermaidModel();
  const { edges } = svgModel("10-service-intent-model.drawio.svg");
  // Placeholder reaches Grant and Exposure across four layers. Those two are
  // stated in the chapter instead; everything else is on the drawing.
  const undrawn = deps.filter(([a]) => a === "Placeholder").length;
  assert.equal(undrawn, 2, "the set of undrawn relations changed");
  assert.equal(edges, comps.length + deps.length - undrawn);
});

test("no drawing carries an enumeration box", () => {
  for (const f of readdirSync(join(spec, "diagrams")).filter((f) =>
    f.endsWith(".svg"),
  )) {
    assert.ok(
      !read(join(spec, "diagrams", f)).includes("«enumeration»"),
      `${f}: vocabularies belong in the chapter's table, not in a drawing`,
    );
  }
});

test("every closed vocabulary names an attribute that exists", () => {
  const md = read(join(spec, "10-service-intent.md"));
  const table = md.match(/## The closed vocabularies\n([\s\S]*?)\n## /)[1];
  const { classes } = mermaidModel();
  let rows = 0;
  for (const m of table.matchAll(/^\| `(\w+)` \| ([^|]+) \|/gm)) {
    rows += 1;
    const [, vocab, owners] = m;
    const used = Object.values(classes).some((rs) =>
      rs.some((r) => r.split(" ")[0].replace(/\[\]$/, "") === vocab),
    );
    assert.ok(used, `${vocab} is tabulated but types no attribute`);
    for (const ref of owners.matchAll(/`(\w+)\.(\w+)`/g)) {
      const [, cls, attr] = ref;
      assert.ok(
        classes[cls],
        `${vocab} names class ${cls}, which does not exist`,
      );
      assert.ok(
        classes[cls].some((r) => r.endsWith(` ${attr}`)),
        `${vocab} names ${cls}.${attr}, which does not exist`,
      );
    }
  }
  assert.ok(rows > 10, "the vocabulary table did not parse");
});

test("a worked example authors no key the model does not carry", () => {
  const { classes } = mermaidModel();
  const attrs = new Set(
    Object.values(classes).flatMap((rs) => rs.map((r) => r.split(" ").pop())),
  );
  // Keys that structure the document rather than name an attribute, plus the
  // author-chosen surface names under `provides` and the two probe roles.
  const structural = new Set([
    "apiVersion",
    "kind",
    "schemaVersion",
    "domain",
    "owner",
    "services",
    "workloads",
    "provides",
    "probes",
    "placement",
    "volumes",
    "secrets",
    "assets",
    "exposure",
    "routes",
    "sidecars",
    "observability",
    "scrape",
    "replicas",
    "rotation",
    "disk",
    "gpu",
    "dependsOn",
    "env",
    "expect",
    "readiness",
    "liveness",
  ]);
  const surfaces = new Set();
  for (const f of walk(join(spec, "examples")).filter((f) =>
    f.endsWith(".domain.yml"),
  )) {
    const lines = read(f).split("\n");
    lines.forEach((line, i) => {
      if (/^ {8}provides:/.test(line)) {
        for (let j = i + 1; j < lines.length; j += 1) {
          const m = lines[j]
            .split("#")[0]
            .match(/^ {10}([a-zA-Z][\w-]*):\s*\d+/);
          if (!m) break;
          surfaces.add(m[1]);
        }
      }
    });
  }
  for (const f of walk(join(spec, "examples")).filter((f) =>
    f.endsWith(".domain.yml"),
  )) {
    // A folded scalar's body is prose, not keys: `reason: >-` is followed by
    // sentences, and one of them contains the word "availability:".
    let fold = -1;
    read(f)
      .split("\n")
      .forEach((line, i) => {
        const indent = line.search(/\S/);
        if (fold >= 0 && (indent === -1 || indent > fold)) return;
        fold = -1;
        const code = line.split("#")[0];
        if (/:\s*[|>][-+]?\s*$/.test(code)) fold = indent;
        for (const m of code.matchAll(/([a-zA-Z][a-zA-Z0-9_]*)\s*:/g)) {
          const k = m[1];
          if (attrs.has(k) || structural.has(k) || surfaces.has(k)) continue;
          assert.fail(
            `${relative(repo, f)}:${i + 1}: authors \`${k}\`, which no class carries`,
          );
        }
      });
  }
});

test("every rendered kind is a column of the deliverables matrix", () => {
  const { xml } = svgModel("16-derivation-map-deliverables.drawio.svg");
  // Namespace-scoped operator objects are rendered once per namespace, not per
  // Service, so the per-Service map does not carry a column for them.
  const perNamespace = new Set(["VaultAuth", "VaultConnection", "Namespace"]);
  const alias = {
    Kustomization: "kustomization",
    VaultDynamicSecret: "VaultDynami",
  };
  const kinds = new Set();
  for (const f of walk(join(spec, "examples")).filter((f) =>
    f.endsWith(".yaml"),
  )) {
    for (const m of read(f).matchAll(/^kind: (\w+)$/gm)) kinds.add(m[1]);
  }
  assert.ok(kinds.size > 5, "no rendered fixtures found");
  for (const k of kinds) {
    if (perNamespace.has(k)) continue;
    assert.ok(xml.includes(alias[k] ?? k), `rendered kind ${k} has no column`);
  }
});

test("no rendered fixture carries a kind the model stopped rendering", () => {
  const gone = ["PrometheusRule"];
  for (const f of walk(join(spec, "examples")).filter((f) =>
    f.endsWith(".yaml"),
  )) {
    for (const k of gone) {
      assert.ok(
        !new RegExp(`^kind: ${k}$`, "m").test(read(f)),
        `${relative(repo, f)}: renders ${k}, which chapter 30 says nothing emits`,
      );
    }
  }
});
