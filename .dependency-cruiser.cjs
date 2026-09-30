// Boundary enforcement for the compiler's layering.
//
// Read this file to learn what the hexagon is. ESLint's no-restricted-imports
// is the fast local signal; this is the authority, because it sees the module
// graph rather than one file at a time. Each rule below is a decision recorded
// in docs/architecture.md, not a style preference.
//
// The compiler is a chain of typed models
// (docs/adr/architecture/0056-the-compiler-is-a-chain-of-typed-models.md).
// Innermost first:
//
//   src/model/          every metamodel in the chain and its pure queries.
//                       Zod lives here: the schema is the authored metamodel.
//   src/read/           text in, the source model out. Step.
//   src/check/          the constraints, one function per code. Step.
//   src/lower/          Project Intent to the Effective Intent. Step.
//   src/resolve/        the Effective Intent to the Resolved Deployment. Step.
//   src/adapters/       the registered adapters. Step.
//   src/application/    the use-cases: run the steps in order, pass each model
//                       on, perform no IO of their own.
//   src/infrastructure/ port implementations: hashing, the serializer, the
//                       writer.
//   src/cli/            argument parsing, diagnostic rendering, exit codes.
//
// A step imports model/ and nothing else of the compiler, and never another
// step: the use-case hands it the previous model as a value.

/**
 * The roots of the module graph: the library entry and the CLI entry. Add a
 * second bin here and it becomes a root for reachability too.
 */
const ENTRY_POINTS = ["^src/index\\.ts$", "^src/cli/index\\.ts$"];

/** Node builtins that perform IO or read ambient state. */
const AMBIENT = [
  "fs",
  "fs/promises",
  "net",
  "dns",
  "http",
  "https",
  "child_process",
  "os",
  "process",
  "worker_threads",
  "crypto",
];
const ambientPattern = `^(node:)?(${AMBIENT.join("|")})$`;

/**
 * Packages an architecture decision already rejected, each with the record
 * that rejected it. A denylist is cheaper than the argument a second time.
 *
 *   @kubernetes/client-node  the compiler renders, it does not apply: adapters
 *                            build typed objects and one serializer owns the
 *                            bytes (0058).
 *   ajv                      Zod is the one validator; a second one means two
 *                            declarations of the same shape (0057).
 *   zod-to-json-schema       Zod generates JSON Schema itself, from the input
 *                            variant of each schema (0057).
 *   handlebars, ejs,         text templating is the generation this compiler
 *   mustache, nunjucks       replaces: objects in, one serializer out (0058).
 */
const DENIED = [
  "@kubernetes/client-node",
  "ajv",
  "zod-to-json-schema",
  "handlebars",
  "ejs",
  "mustache",
  "nunjucks",
];
// The resolved path, not the specifier: an installed package resolves under
// node_modules/, and one that is merely written resolves to itself.
const deniedPattern = `^(node_modules/)?(${DENIED.map((name) =>
  name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
).join("|")})(/|$)`;

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "A cycle means neither module can be understood, tested or deleted alone.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-circular-folders",
      severity: "error",
      scope: "folder",
      comment:
        "Two directories that import each other are one directory in two places: " +
        "a module-level cycle check passes them, because no single module closes " +
        "the loop.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "error",
      comment:
        "A module reachable from no entry point is the failure mode chapter 30 " +
        "records: 1,967 lines of dead renderer survived a coverage gate because " +
        "its own tests imported it. Entry points are exempt; nothing else is.",
      from: {
        orphan: true,
        // Only the entry points themselves. A barrel or a cli/ module that
        // nothing imports is caught here rather than exempted, and a dead
        // subtree (which has internal edges and is therefore never an orphan)
        // is caught by unreachable-from-an-entry-point below.
        pathNot: ENTRY_POINTS.concat("\\.d\\.ts$"),
      },
      to: {},
    },
    {
      name: "unreachable-from-an-entry-point",
      severity: "error",
      comment:
        "Reachability, which is the half coverage cannot do and the half an " +
        "orphan check misses: a dead subtree has internal edges, so it is never " +
        "an orphan. 1,967 lines of dead renderer across 14 modules passed a " +
        "--lines 90 gate because its own tests imported it.",
      from: { path: ENTRY_POINTS },
      to: {
        path: "^src/",
        // An entry point is a root: nothing imports it, so it is not reachable
        // from anything, itself included. Everything else must be.
        pathNot: ENTRY_POINTS.concat("\\.d\\.ts$"),
        reachable: false,
      },
    },
    {
      name: "model-is-pure",
      severity: "error",
      comment:
        "The metamodels are what every step shares, so they reach for nothing " +
        "else of the compiler.",
      from: { path: "^src/model/" },
      to: { path: "^src/(?!model/)" },
    },
    {
      name: "no-step-imports-another-step",
      severity: "error",
      comment:
        "A step receives the previous model as a value from the use-case. One " +
        "that imports another step turns evaluation order into semantics.",
      from: { path: "^src/(read|check|lower|resolve)/" },
      to: {
        path: "^src/(read|check|lower|resolve|adapters|application|infrastructure|cli)/",
        pathNot: "^src/$1/",
      },
    },
    {
      name: "the-chain-reads-nothing-ambient",
      severity: "error",
      comment:
        "No filesystem, network, clock, environment or crypto in a metamodel or " +
        "a step. Hashing arrives through a port, which is what keeps renderHash " +
        "a pure function of the pinned inputs.",
      from: { path: "^src/(model|read|check|lower|resolve)/" },
      to: { path: ambientPattern },
    },
    {
      name: "zod-is-the-metamodel-and-the-reader",
      severity: "error",
      comment:
        "Zod declares the authored metamodel and the reader applies it. A step " +
        "past the reader reads the model's types, never a schema.",
      from: { pathNot: "^src/(model|read)/" },
      // The resolved path, not the specifier: dependency-cruiser matches
      // to.path against what the module resolved to, which for an npm package
      // is node_modules/zod/... and never the bare name.
      to: { path: "^(node_modules/)?zod(/|$)" },
    },
    {
      name: "objects-are-data",
      severity: "error",
      comment:
        "The typed Kubernetes object model is a shape, not a participant. It " +
        "imports nothing from the compiler.",
      from: { path: "^src/objects/" },
      to: { path: "^src/(?!objects/)" },
    },
    {
      name: "adapters-do-not-read-each-other",
      severity: "error",
      comment:
        "An adapter that reads another adapter's output makes evaluation order " +
        "into semantics, and attribution and path-collision detection stop " +
        "being provable. Shared code goes to src/adapters/shared.",
      from: { path: "^src/adapters/(?!shared/)([^/]+)/" },
      to: {
        path: "^src/adapters/(?!shared/)([^/]+)/",
        pathNot: "^src/adapters/$1/",
      },
    },
    {
      name: "adapters-render-only",
      severity: "error",
      comment:
        "Documents in, attributed Fragments out. No ambient reads inside an " +
        "adapter: reading manifests from disk is the caller's job.",
      from: { path: "^src/adapters/" },
      to: {
        path: [
          ambientPattern,
          "^src/(application|cli|infrastructure|read|check|lower|resolve)/",
        ],
      },
    },
    {
      name: "application-takes-ports-not-adapters",
      severity: "error",
      comment:
        "A use-case receives its effects as ports. Wiring a concrete " +
        "implementation is the CLI's job, so a test can supply another.",
      from: { path: "^src/application/" },
      to: { path: "^src/infrastructure/" },
    },
    {
      name: "infrastructure-implements-ports-only",
      severity: "error",
      comment:
        "A port implementation satisfies an interface the model declares. It " +
        "does not orchestrate, and it does not render.",
      from: { path: "^src/infrastructure/" },
      to: { path: "^src/(application|adapters|read|check|lower|resolve)/" },
    },
    {
      name: "nothing-depends-on-the-cli",
      severity: "error",
      comment:
        "The CLI is the outermost ring: argument parsing, diagnostic rendering " +
        "and exit codes. Nothing inside may reach it.",
      from: { pathNot: "^src/cli/" },
      to: { path: "^src/cli/" },
    },
    {
      name: "shipped-code-imports-no-test-or-build-output",
      severity: "error",
      comment:
        "RULE-009: shipped code never imports a test file or anything under dist/.",
      from: { path: "^src/", pathNot: "\\.test\\.ts$" },
      to: { path: ["\\.test\\.ts$", "^test/", "^dist/"] },
    },
    {
      name: "no-dev-dependency-in-src",
      severity: "error",
      comment: "Shipped code may not import a devDependency.",
      from: { path: "^src/", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "no-denied-dependency",
      severity: "error",
      comment:
        "A package an architecture decision already rejected. See the DENIED " +
        "list above for which record rejected which, and " +
        "docs/architecture-rules.md RULE-022 for the ledger row.",
      from: { path: "^src/" },
      to: { path: deniedPattern },
    },
    {
      name: "no-unresolvable-import",
      severity: "error",
      comment:
        "A relative import that resolves to nothing is an edge no other rule " +
        "can check: the graph cannot tell which ring it crossed. Bare " +
        "specifiers are left to the package manager and the type checker, " +
        "which say something more useful about a missing package.",
      from: { path: "^src/" },
      to: { couldNotResolve: true, path: "^[.]" },
    },
    {
      name: "not-to-deprecated-core",
      severity: "error",
      comment: "A deprecated node builtin is a migration already overdue.",
      from: {},
      to: { dependencyTypes: ["core"], path: "^(punycode|domain|sys)$" },
    },
  ],
  options: {
    doNotFollow: { dependencyTypes: ["npm", "npm-dev", "npm-optional"] },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      mainFields: ["main"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
