// Boundary enforcement for the compiler's layering.
//
// Read this file to learn what the hexagon is. ESLint's no-restricted-imports
// is the fast local signal; this is the authority, because it sees the module
// graph rather than one file at a time. Each rule below is a decision recorded
// in docs/architecture.md, not a style preference.
//
// The layers, innermost first:
//
//   src/domain/         the model in code: layer 1 aggregates, layer 2
//                       derivation, the ports it needs. Pure.
//   src/objects/        the typed Kubernetes object model layer 3 builds.
//   src/wire/           Zod schemas per document family and per schemaVersion,
//                       plus the mappers from wire shape into the domain.
//   src/adapters/       the registered adapters. Documents in, Fragments out.
//   src/application/    the use-cases. Orders derivation, performs no IO of
//                       its own — every effect arrives through a port.
//   src/infrastructure/ port implementations: filesystem, oras, hashing, the
//                       serializer, the writer.
//   src/cli/            argument parsing, diagnostic rendering, exit codes.

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
        // subtree — which has internal edges and is therefore never an orphan
        // — is caught by unreachable-from-an-entry-point below.
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
      name: "domain-is-pure",
      severity: "error",
      comment:
        "The domain may not reach outward. Everything it needs from the world " +
        "arrives through a port it declares and the application supplies.",
      from: { path: "^src/domain/" },
      to: {
        path: "^src/(?!domain/)",
      },
    },
    {
      name: "domain-reads-nothing-ambient",
      severity: "error",
      comment:
        "No filesystem, network, clock, environment or crypto inside the " +
        "domain. Hashing arrives through a port, which is what keeps renderHash " +
        "a pure function of the pinned inputs.",
      from: { path: "^src/domain/" },
      to: { path: ambientPattern },
    },
    {
      name: "domain-does-not-know-the-wire",
      severity: "error",
      comment:
        "Zod declares the authoring shape. The domain is not that shape: a " +
        "schemaVersion may change without the core moving.",
      from: { path: "^src/domain/" },
      // The resolved path, not the specifier: dependency-cruiser matches
      // to.path against what the module resolved to, which for an npm package
      // is node_modules/zod/... and never the bare name.
      to: { path: "^(node_modules/)?zod(/|$)" },
    },
    {
      name: "wire-maps-inward-only",
      severity: "error",
      comment:
        "The wire layer parses documents and maps them into the domain. It " +
        "renders nothing and orchestrates nothing.",
      from: { path: "^src/wire/" },
      to: { path: "^src/(adapters|application|infrastructure|cli)/" },
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
        path: [ambientPattern, "^src/(application|cli|infrastructure|wire)/"],
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
        "A port implementation satisfies an interface the domain declares. It " +
        "does not orchestrate, and it does not render.",
      from: { path: "^src/infrastructure/" },
      to: { path: "^src/(application|adapters|wire)/" },
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
      name: "no-dev-dependency-in-src",
      severity: "error",
      comment: "Shipped code may not import a devDependency.",
      from: { path: "^src/", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["npm-dev"] },
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
