// The layer boundaries, executed.
//
// .dependency-cruiser.cjs is where the hexagon is written down. A ruleset that
// has only ever run against a tree with no violations is untested: nothing
// proves it would fail. Each case builds a throwaway src/ tree that crosses
// exactly one boundary and asserts the named rule reports it.
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
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
    // A manifest, so dependency-cruiser can tell a dependency from a
    // devDependency: without one, npm-dev is unclassifiable and
    // no-dev-dependency-in-src cannot fire.
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "boundary-fixture",
        type: "module",
        dependencies: { zod: "*" },
        devDependencies: { prettier: "*" },
      }),
    );
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
    // The repository's own node_modules, so a fixture can import a real
    // package: dependency-cruiser matches the resolved path, and an
    // unresolvable specifier resolves to itself rather than to node_modules/.
    symlinkSync(
      join(import.meta.dirname, "..", "node_modules"),
      join(root, "node_modules"),
      "dir",
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
  assert.notEqual(code, 0);
  assert.match(output, /domain-reads-nothing-ambient/);
});

test("the domain reaching crypto fails, because hashing arrives through a port", () => {
  const { code, output } = cruise({
    "src/domain/render-hash.ts": mod(["node:crypto"]),
    "src/cli/index.ts": mod(["../domain/render-hash.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /domain-reads-nothing-ambient/);
});

test("the domain importing an infrastructure module fails", () => {
  const { code, output } = cruise({
    "src/infrastructure/writer.ts": mod(),
    "src/domain/service.ts": mod(["../infrastructure/writer.js"]),
    "src/cli/index.ts": mod(["../domain/service.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /domain-is-pure/);
});

test("one adapter reading another fails", () => {
  const { code, output } = cruise({
    "src/adapters/vso/render.ts": mod(),
    "src/adapters/kubernetes/render.ts": mod(["../vso/render.js"]),
    "src/cli/index.ts": mod(["../adapters/kubernetes/render.js"]),
  });
  assert.notEqual(code, 0);
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
  assert.notEqual(code, 0);
  assert.match(output, /adapters-render-only/);
});

test("a use-case wiring a concrete implementation fails", () => {
  const { code, output } = cruise({
    "src/infrastructure/oras.ts": mod(),
    "src/application/publish.ts": mod(["../infrastructure/oras.js"]),
    "src/cli/index.ts": mod(["../application/publish.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /application-takes-ports-not-adapters/);
});

test("anything reaching into the CLI fails", () => {
  const { code, output } = cruise({
    "src/cli/exit-codes.ts": mod(),
    "src/infrastructure/writer.ts": mod(["../cli/exit-codes.js"]),
    "src/cli/index.ts": mod(["../infrastructure/writer.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /nothing-depends-on-the-cli/);
});

test("the wire layer reaching an adapter fails", () => {
  const { code, output } = cruise({
    "src/adapters/kubernetes/render.ts": mod(),
    "src/wire/intent.ts": mod(["../adapters/kubernetes/render.js"]),
    "src/cli/index.ts": mod(["../wire/intent.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /wire-maps-inward-only/);
});

test("the object model importing the domain fails", () => {
  const { code, output } = cruise({
    "src/domain/service.ts": mod(),
    "src/objects/deployment.ts": mod(["../domain/service.js"]),
    "src/cli/index.ts": mod(["../objects/deployment.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /objects-are-data/);
});

test("a module reachable from no entry point fails", () => {
  const { code, output } = cruise({
    "src/domain/orphan.ts": "export const v = 1;\n",
    "src/cli/index.ts": mod(),
  });
  assert.notEqual(code, 0);
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
  assert.notEqual(code, 0);
  assert.match(output, /no-circular/);
});

test("the domain importing zod fails", () => {
  const { code, output } = cruise({
    "src/domain/service.ts": mod(["zod"]),
    "src/cli/index.ts": mod(["../domain/service.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /domain-does-not-know-the-wire/);
});

test("the wire layer importing zod passes", () => {
  const { code, output } = cruise({
    "src/wire/intent.ts": mod(["zod"]),
    "src/cli/index.ts": mod(["../wire/intent.js"]),
  });
  assert.equal(code, 0, output);
});

test("shipped code importing a devDependency fails", () => {
  const { code, output } = cruise({
    "src/infrastructure/serializer.ts": mod(["prettier"]),
    "src/cli/index.ts": mod(["../infrastructure/serializer.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /no-dev-dependency-in-src/);
});

test("a deprecated node builtin fails", () => {
  const { code, output } = cruise({
    "src/infrastructure/idna.ts": mod(["punycode"]),
    "src/cli/index.ts": mod(["../infrastructure/idna.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /not-to-deprecated-core/);
});

test("the domain importing the object model fails", () => {
  const { code, output } = cruise({
    "src/objects/deployment.ts": mod(),
    "src/domain/service.ts": mod(["../objects/deployment.js"]),
    "src/cli/index.ts": mod(["../domain/service.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /domain-is-pure/);
});

test("an adapter importing the wire layer fails", () => {
  const { code, output } = cruise({
    "src/wire/intent.ts": mod(),
    "src/adapters/kubernetes/render.ts": mod(["../../wire/intent.js"]),
    "src/cli/index.ts": mod(["../adapters/kubernetes/render.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /adapters-render-only/);
});

test("infrastructure importing a use-case fails", () => {
  const { code, output } = cruise({
    "src/application/compose.ts": mod(),
    "src/infrastructure/writer.ts": mod(["../application/compose.js"]),
    "src/cli/index.ts": mod(["../infrastructure/writer.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /infrastructure-implements-ports-only/);
});

// -- reachability -------------------------------------------------------------
// The case ADR 0069 cites is not an orphan: a dead subtree has internal edges,
// so only a reachability rule anchored on the entry points catches it.

test("a dead subtree reachable from no entry point fails", () => {
  const { code, output } = cruise({
    "src/domain/dead-a.ts": mod(["./dead-b.js"]),
    "src/domain/dead-b.ts": mod(),
    "src/domain/live.ts": mod(),
    "src/cli/index.ts": mod(["../domain/live.js"]),
  });
  assert.notEqual(code, 0);
  assert.match(output, /unreachable-from-an-entry-point/);
});

test("a module reached only through src/index.ts passes", () => {
  const { code, output } = cruise({
    "src/domain/service.ts": mod(),
    "src/index.ts": mod(["./domain/service.js"]),
    "src/cli/index.ts": mod(["../index.js"]),
  });
  assert.equal(code, 0, output);
});
