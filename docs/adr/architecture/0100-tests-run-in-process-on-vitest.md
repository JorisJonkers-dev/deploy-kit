---
tier: decision
status: proposed
claim: settled
date: 2026-09-11
normative: docs/architecture.md#tooling
rests-on: ["0001"]
---

# Tests run in-process on Vitest, and the tooling is TypeScript that Node runs directly

> **Amended 2026-09-14.** Scoped to the repository root. The Java
> implementation under `emf/` is tested with JUnit through Maven, inside `emf/`
> ([0105](0105-two-implementations-meet-at-committed-oracles.md)); the root
> stays TypeScript, and this decision is unchanged for everything outside
> `emf/`.

## Rests on
Every gate this repository runs can be exercised in-process by one test runner
that also measures coverage and hosts mutation testing, so no gate needs a
separate process to be tested. False if: a gate's decisions can only be
observed from a child process, which keeps its lines out of coverage and its
mutants out of reach of every test. Settled by: `npm run test:coverage`
reporting every file under `scripts/` above zero, with each gate called
in-process by its own suite.

## Why
The gates are the code in this repository that must not be wrong, and until
now they were the only code with no types: five `.mjs` scripts, tested by
`node:test` suites that started each one as a child process.

That shape only worked for coverage because c8 hands `NODE_V8_COVERAGE` to every
child process. Mutation testing, which the estate wants over exactly this code
([0069](0069-boundaries-enforced-on-the-graph.md) records why a gate that has
never failed is untested), attributes a mutant to the tests that reach it
inside the runner's process; a gate the test starts as a child is outside that
attribution. Calling each gate in-process fixes both, and it wants one runner
for tests, coverage and mutation. Stryker's first-class runner for that is
Vitest's; `node:test` would go through its generic command runner, which reruns
the whole suite for every mutant and attributes nothing.

TypeScript follows from the same argument. A gate that misreads a frontmatter
field is a silent pass, which is the failure the ADR contract exists to
prevent, and `strictTypeChecked` catches that class of mistake before any test
runs. Node 24 strips types itself, so each gate stays one file with no build
step, and one typecheck covers the gates, their tests and, later, the compiler.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep `node:test`, c8 and the `.mjs` scripts | Nothing to migrate; child-process coverage already works | No dedicated Stryker runner, and the gates stay the one untyped code in the repository |
| Vitest, but keep starting each gate as a child process | The least change to the suites | Vitest's V8 coverage does not follow a child process, so every gate would read as uncovered, and its mutants as unreached |
| Compile the tooling with `tsc` into `dist/` | Runs on any Node, not only one that strips types | A build in front of every gate run, and a stale `dist/` is a gate that checks last week's rules |
| Jest | Mature and widely known | ESM and TypeScript need transform configuration, and it offers nothing Vitest lacks here |

## Reversibility
Undo cost today: an afternoon; eleven suites and five scripts, mechanical.
Becomes irreversible once: never, because nothing outside this repository runs
these scripts and the package does not ship them.

## Consequences
- Each gate is a library with a one-line guard at the bottom, so its decisions
  are covered and the guard is not; one process-level test per gate proves the
  guard still runs it. Paid by whoever adds a gate, in one exported function.
- The tooling needs Node 24 or newer, because type stripping is what runs it;
  `.nvmrc` pins the exact version and CI reads the same file. Paid by a
  contributor on an older Node, once, with `nvm use`.
- TypeScript is pinned to an exact 6.0 release, because typescript-eslint's
  type-aware rules support nothing newer; TypeScript 7 waits on them. Paid by
  whoever wants the newer compiler.
- `strictTypeChecked` is stricter than the rules the scripts were written
  under. The move found one real defect: an ADR with no `normative:` pointer
  crashed the ADR lint instead of being reported. Paid once, in this change.
