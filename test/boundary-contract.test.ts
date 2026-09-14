// The layer boundaries, executed.
//
// .dependency-cruiser.cjs is where the hexagon is written down. A ruleset that
// has only ever run against a tree with no violations is untested: nothing
// proves it would fail. Each case builds a throwaway src/ tree that crosses
// exactly one boundary and asserts the named rule reports it.
//
// REQ-004 (docs/requirements.md): layer boundaries and module reachability
// are enforced on the dependency graph, not on review alone.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintBoundaries, main } from "../scripts/lint-boundaries.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/** A module exporting one value, importing each of `imports`. */
const mod = (imports: readonly string[] = []): string =>
  [
    ...imports.map((i, n) => `import { v as v${n} } from "${i}";`),
    `export const v = ${imports.length > 0 ? imports.map((_, n) => `v${n}`).join(" ?? ") : "1"};`,
    "",
  ].join("\n");

/** A fixture repository holding `files`, and return its root. */
function fixture(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(temporary(), "boundary-"));
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
    join(REPOSITORY, "node_modules"),
    join(root, "node_modules"),
    "dir",
  );
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

/** Cruise a fixture, and return what the gate said and how it exited. */
function cruise(files: Readonly<Record<string, string>>): {
  code: number;
  output: string;
} {
  const output = collect();
  const code = lintBoundaries(fixture(files), output);
  return { code, output: output.text() };
}

describe("the boundary lint", () => {
  it("skips loudly, rather than passing quietly, when there is no src/", () => {
    const { code, output } = cruise({});
    expect(code).toBe(0);
    expect(output).toMatch(/SKIPPED/);
  });

  it("passes a tree that respects every boundary", () => {
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
    expect(code, output).toBe(0);
  });

  it("fails the domain reaching the filesystem", () => {
    const { code, output } = cruise({
      "src/domain/service.ts": mod(["node:fs"]),
      "src/cli/index.ts": mod(["../domain/service.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/domain-reads-nothing-ambient/);
  });

  it("fails the domain reaching crypto, because hashing arrives through a port", () => {
    const { code, output } = cruise({
      "src/domain/render-hash.ts": mod(["node:crypto"]),
      "src/cli/index.ts": mod(["../domain/render-hash.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/domain-reads-nothing-ambient/);
  });

  it("fails the domain importing an infrastructure module", () => {
    const { code, output } = cruise({
      "src/infrastructure/writer.ts": mod(),
      "src/domain/service.ts": mod(["../infrastructure/writer.js"]),
      "src/cli/index.ts": mod(["../domain/service.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/domain-is-pure/);
  });

  it("fails one adapter reading another", () => {
    const { code, output } = cruise({
      "src/adapters/vso/render.ts": mod(),
      "src/adapters/kubernetes/render.ts": mod(["../vso/render.js"]),
      "src/cli/index.ts": mod(["../adapters/kubernetes/render.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/adapters-do-not-read-each-other/);
  });

  it("passes two adapters sharing src/adapters/shared", () => {
    const { code, output } = cruise({
      "src/adapters/shared/labels.ts": mod(),
      "src/adapters/vso/render.ts": mod(["../shared/labels.js"]),
      "src/adapters/kubernetes/render.ts": mod(["../shared/labels.js"]),
      "src/cli/index.ts": mod([
        "../adapters/kubernetes/render.js",
        "../adapters/vso/render.js",
      ]),
    });
    expect(code, output).toBe(0);
  });

  it("fails an adapter reading the filesystem", () => {
    const { code, output } = cruise({
      "src/adapters/kubernetes/render.ts": mod(["node:fs"]),
      "src/cli/index.ts": mod(["../adapters/kubernetes/render.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/adapters-render-only/);
  });

  it("fails a use-case wiring a concrete implementation", () => {
    const { code, output } = cruise({
      "src/infrastructure/oras.ts": mod(),
      "src/application/publish.ts": mod(["../infrastructure/oras.js"]),
      "src/cli/index.ts": mod(["../application/publish.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/application-takes-ports-not-adapters/);
  });

  it("fails anything reaching into the CLI", () => {
    const { code, output } = cruise({
      "src/cli/exit-codes.ts": mod(),
      "src/infrastructure/writer.ts": mod(["../cli/exit-codes.js"]),
      "src/cli/index.ts": mod(["../infrastructure/writer.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/nothing-depends-on-the-cli/);
  });

  it("fails the wire layer reaching an adapter", () => {
    const { code, output } = cruise({
      "src/adapters/kubernetes/render.ts": mod(),
      "src/wire/intent.ts": mod(["../adapters/kubernetes/render.js"]),
      "src/cli/index.ts": mod(["../wire/intent.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/wire-maps-inward-only/);
  });

  it("fails the object model importing the domain", () => {
    const { code, output } = cruise({
      "src/domain/service.ts": mod(),
      "src/objects/deployment.ts": mod(["../domain/service.js"]),
      "src/cli/index.ts": mod(["../objects/deployment.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/objects-are-data/);
  });

  it("fails a module reachable from no entry point", () => {
    const { code, output } = cruise({
      "src/domain/orphan.ts": "export const v = 1;\n",
      "src/cli/index.ts": mod(),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/no-orphans/);
  });

  it("fails a cycle", () => {
    const { code, output } = cruise({
      "src/domain/a.ts":
        'import { v as b } from "./b.js";\nexport const v = b;\n',
      "src/domain/b.ts":
        'import { v as a } from "./a.js";\nexport const v = a;\n',
      "src/cli/index.ts": mod(["../domain/a.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/no-circular/);
  });

  it("fails the domain importing zod", () => {
    const { code, output } = cruise({
      "src/domain/service.ts": mod(["zod"]),
      "src/cli/index.ts": mod(["../domain/service.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/domain-does-not-know-the-wire/);
  });

  it("passes the wire layer importing zod", () => {
    const { code, output } = cruise({
      "src/wire/intent.ts": mod(["zod"]),
      "src/cli/index.ts": mod(["../wire/intent.js"]),
    });
    expect(code, output).toBe(0);
  });

  it("fails shipped code importing a devDependency", () => {
    const { code, output } = cruise({
      "src/infrastructure/serializer.ts": mod(["prettier"]),
      "src/cli/index.ts": mod(["../infrastructure/serializer.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/no-dev-dependency-in-src/);
  });

  it("fails a package an architecture decision already rejected", () => {
    const { code, output } = cruise({
      "src/infrastructure/render.ts": mod(["handlebars"]),
      "src/cli/index.ts": mod(["../infrastructure/render.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/no-denied-dependency/);
  });

  it("fails an import that resolves to nothing", () => {
    const { code, output } = cruise({
      "src/infrastructure/writer.ts": mod(["./gone.js"]),
      "src/cli/index.ts": mod(["../infrastructure/writer.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/no-unresolvable-import/);
  });

  it("fails a deprecated node builtin", () => {
    const { code, output } = cruise({
      "src/infrastructure/idna.ts": mod(["punycode"]),
      "src/cli/index.ts": mod(["../infrastructure/idna.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/not-to-deprecated-core/);
  });

  it("fails the domain importing the object model", () => {
    const { code, output } = cruise({
      "src/objects/deployment.ts": mod(),
      "src/domain/service.ts": mod(["../objects/deployment.js"]),
      "src/cli/index.ts": mod(["../domain/service.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/domain-is-pure/);
  });

  it("fails an adapter importing the wire layer", () => {
    const { code, output } = cruise({
      "src/wire/intent.ts": mod(),
      "src/adapters/kubernetes/render.ts": mod(["../../wire/intent.js"]),
      "src/cli/index.ts": mod(["../adapters/kubernetes/render.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/adapters-render-only/);
  });

  it("fails infrastructure importing a use-case", () => {
    const { code, output } = cruise({
      "src/application/compose.ts": mod(),
      "src/infrastructure/writer.ts": mod(["../application/compose.js"]),
      "src/cli/index.ts": mod(["../infrastructure/writer.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/infrastructure-implements-ports-only/);
  });
});

// The case ADR 0069 cites is not an orphan: a dead subtree has internal edges,
// so only a reachability rule anchored on the entry points catches it.
describe("reachability", () => {
  it("fails a dead subtree reachable from no entry point", () => {
    const { code, output } = cruise({
      "src/domain/dead-a.ts": mod(["./dead-b.js"]),
      "src/domain/dead-b.ts": mod(),
      "src/domain/live.ts": mod(),
      "src/cli/index.ts": mod(["../domain/live.js"]),
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/unreachable-from-an-entry-point/);
  });

  it("passes a module reached only through src/index.ts", () => {
    const { code, output } = cruise({
      "src/domain/service.ts": mod(),
      "src/index.ts": mod(["./domain/service.js"]),
      "src/cli/index.ts": mod(["../index.js"]),
    });
    expect(code, output).toBe(0);
  });
});

describe("the command", () => {
  it("lints the tree it is given", () => {
    const output = collect();
    expect(main([fixture({})], output)).toBe(0);
    expect(output.text()).toMatch(/SKIPPED/);
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "lint-boundaries.ts"), fixture({})],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/boundary lint: SKIPPED/);
  });
});
