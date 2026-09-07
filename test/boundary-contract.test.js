// The layer boundaries, executed.
//
// .dependency-cruiser.cjs is where the hexagon is written down. A ruleset that
// has only ever run against a tree with no violations is untested: nothing
// proves it would fail. Each case builds a throwaway src/ tree that crosses
// exactly one boundary and asserts the named rule reports it.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const LINT = join(import.meta.dirname, "..", "scripts", "lint-boundaries.mjs");

/** A module exporting one value, importing each of `imports`. */
const mod = (imports = []) =>
  [
    ...imports.map((i, n) => `import { v as v${n} } from "${i}";`),
    `export const v = ${imports.length ? imports.map((_, n) => `v${n}`).join(" ?? ") : "1"};`,
    "",
  ].join("\n");

/** Build a src/ tree, cruise it, return {code, output}. */
function cruise(files) {
  const root = mkdtempSync(join(tmpdir(), "boundary-"));
  try {
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2023",
          strict: true,
        },
        include: ["src/**/*"],
      }),
    );
    for (const [rel, content] of Object.entries(files)) {
      const target = join(root, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    const r = spawnSync("node", [LINT, root], { encoding: "utf8" });
    return { code: r.status, output: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a tree with no src/ skips loudly rather than passing quietly", () => {
  const { code, output } = cruise({});
  assert.equal(code, 0);
  assert.match(output, /SKIPPED/);
});

test("a tree that respects every boundary passes", () => {
  const { code, output } = cruise({
    "src/domain/service.ts": mod(),
    "src/objects/deployment.ts": mod(),
    "src/wire/intent.ts": mod(["../domain/service.js"]),
    "src/adapters/kubernetes/render.ts": mod([
      "../../domain/service.js",
      "../../objects/deployment.js",
    ]),
    "src/application/compose.ts": mod([
      "../domain/service.js",
      "../adapters/kubernetes/render.js",
    ]),
    "src/infrastructure/serializer.ts": mod(["../objects/deployment.js"]),
    "src/cli/index.ts": mod([
      "../application/compose.js",
      "../infrastructure/serializer.js",
      "../wire/intent.js",
    ]),
  });
  assert.equal(code, 0, output);
});

test("the domain reaching the filesystem fails", () => {
  const { code, output } = cruise({
    "src/domain/service.ts": mod(["node:fs"]),
    "src/cli/index.ts": mod(["../domain/service.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /domain-reads-nothing-ambient/);
});

test("the domain reaching crypto fails, because hashing arrives through a port", () => {
  const { code, output } = cruise({
    "src/domain/render-hash.ts": mod(["node:crypto"]),
    "src/cli/index.ts": mod(["../domain/render-hash.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /domain-reads-nothing-ambient/);
});

test("the domain importing an infrastructure module fails", () => {
  const { code, output } = cruise({
    "src/infrastructure/writer.ts": mod(),
    "src/domain/service.ts": mod(["../infrastructure/writer.js"]),
    "src/cli/index.ts": mod(["../domain/service.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /domain-is-pure/);
});

test("one adapter reading another fails", () => {
  const { code, output } = cruise({
    "src/adapters/vso/render.ts": mod(),
    "src/adapters/kubernetes/render.ts": mod(["../vso/render.js"]),
    "src/cli/index.ts": mod(["../adapters/kubernetes/render.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /adapters-do-not-read-each-other/);
});

test("two adapters sharing src/adapters/shared passes", () => {
  const { code, output } = cruise({
    "src/adapters/shared/labels.ts": mod(),
    "src/adapters/vso/render.ts": mod(["../shared/labels.js"]),
    "src/adapters/kubernetes/render.ts": mod(["../shared/labels.js"]),
    "src/cli/index.ts": mod([
      "../adapters/kubernetes/render.js",
      "../adapters/vso/render.js",
    ]),
  });
  assert.equal(code, 0, output);
});

test("an adapter reading the filesystem fails", () => {
  const { code, output } = cruise({
    "src/adapters/kubernetes/render.ts": mod(["node:fs"]),
    "src/cli/index.ts": mod(["../adapters/kubernetes/render.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /adapters-render-only/);
});

test("a use-case wiring a concrete implementation fails", () => {
  const { code, output } = cruise({
    "src/infrastructure/oras.ts": mod(),
    "src/application/publish.ts": mod(["../infrastructure/oras.js"]),
    "src/cli/index.ts": mod(["../application/publish.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /application-takes-ports-not-adapters/);
});

test("anything reaching into the CLI fails", () => {
  const { code, output } = cruise({
    "src/cli/exit-codes.ts": mod(),
    "src/infrastructure/writer.ts": mod(["../cli/exit-codes.js"]),
    "src/cli/index.ts": mod(["../infrastructure/writer.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /nothing-depends-on-the-cli/);
});

test("the wire layer reaching an adapter fails", () => {
  const { code, output } = cruise({
    "src/adapters/kubernetes/render.ts": mod(),
    "src/wire/intent.ts": mod(["../adapters/kubernetes/render.js"]),
    "src/cli/index.ts": mod(["../wire/intent.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /wire-maps-inward-only/);
});

test("the object model importing the domain fails", () => {
  const { code, output } = cruise({
    "src/domain/service.ts": mod(),
    "src/objects/deployment.ts": mod(["../domain/service.js"]),
    "src/cli/index.ts": mod(["../objects/deployment.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /objects-are-data/);
});

test("a module reachable from no entry point fails", () => {
  const { code, output } = cruise({
    "src/domain/orphan.ts": "export const v = 1;\n",
    "src/cli/index.ts": mod(),
  });
  assert.equal(code, 1);
  assert.match(output, /no-orphans/);
});

test("a cycle fails", () => {
  const { code, output } = cruise({
    "src/domain/a.ts":
      'import { v as b } from "./b.js";\nexport const v = b;\n',
    "src/domain/b.ts":
      'import { v as a } from "./a.js";\nexport const v = a;\n',
    "src/cli/index.ts": mod(["../domain/a.js"]),
  });
  assert.equal(code, 1);
  assert.match(output, /no-circular/);
});
